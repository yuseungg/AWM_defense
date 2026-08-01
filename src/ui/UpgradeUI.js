/**
 * UpgradeUI.js — 건물 클릭 → 강화 패널 (골드 = 수직 파워 채널의 유일한 출구, CLAUDE.md §1-4)
 *
 * 맵의 타워·서포터를 클릭하면 좌상단 HUD 아래 고정 패널이 뜬다. BuildUI가 배치 모드 중이면
 * (selectedId 존재) 이 컴포넌트는 관여하지 않는다 — 클릭은 그대로 배치 시도로 간다.
 *
 * ★ 재배치는 드래그가 아니라 "선택→셀 클릭"이다. GameCore.relocate()·GridSystem.canPlace()를
 *   그대로 재사용해서 새 UI를 안 만든다 — 모바일 터치에서도 드래그보다 훨씬 안정적이다(무료, CLAUDE.md §1-5).
 *
 * ★ ESC 우선순위: DraftOverlay가 열려 있으면(this.scene.draft.current) 이 컴포넌트는 ESC에
 *   반응하지 않는다 — 드래프트가 항상 우선이다(HANDOFF.md §5에 근거 기록).
 *
 * ★ 강화는 damage(타워)/effect.value(서포터)에만 적용된다 — range·aoeRadius·effects·strongAgainst는
 *   레벨과 무관한 고정값이라 화살표 없이 정보성으로만 보여준다(Tower.js 자체 문서화와 동일 원칙).
 *
 * 판매 버튼은 만들지 않는다 — CLAUDE.md §8 절대 금지(재배치만 있다).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, BUILD, UPGRADE, EASE } from './UITheme.js';
import { CELL, W, H } from './mapView.js';
import GridSystem from '../game/GridSystem.js';
import towersData from '../../data/towers.json';
import supportsData from '../../data/supports.json';
import enemiesData from '../../data/enemies.json';

const FXTEST = new URLSearchParams(location.search).get('fxtest') === '1';
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const MAX_CX = W / CELL - 1;
const MAX_CY = H / CELL - 1;
const HIT_RADIUS = 20; // 건물 클릭 판정 반경(VIEW.towerSize 절반보다 살짝 여유를 둠)

export class UpgradeUI {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.current = null;      // { instanceId, kind: 'tower'|'support' }
    this.relocateMode = false;
    this.locked = false;      // DraftOverlay가 열려 있는 동안 true
    this.panelGroup = [];
    this.panelBounds = null;  // 실제 렌더된 패널 크기(내용에 따라 가변) — 밖 클릭 판정에 씀
    this._lastRelocateCx = null;
    this._lastRelocateCy = null;

    this.rangeGfx = scene.add.graphics().setDepth(45);
    this.relocateGfx = scene.add.graphics().setDepth(50);
    this.toast = scene.add.text(0, 0, '', {
      fontSize: '13px', color: '#f2f4f8',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0).setDepth(70).setAlpha(0);

    this.onRejected = ({ action, message }) => {
      if (action === 'upgrade' || action === 'relocate') this.showToast(message);
    };
    this.onBuffsRecalculated = () => this.refreshRangeCircle();
    EventBus.on(EV.actionRejected, this.onRejected, this);
    EventBus.on(EV.buffsRecalculated, this.onBuffsRecalculated, this);

    this.onPointerMove = p => this.handlePointerMove(p);
    this.onPointerDown = p => this.handlePointerDown(p);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerdown', this.onPointerDown);

    this.onEsc = () => this.handleEsc();
    scene.input.keyboard.on('keydown-ESC', this.onEsc);
    scene.input.mouse.disableContextMenu(); // 재배치 취소용 우클릭이 브라우저 메뉴를 띄우면 안 된다

    if (FXTEST) this.setupFxTestKeys();

    scene.events.once('shutdown', () => this.destroy());
  }

  /** DraftOverlay가 열리고 닫힐 때 호출한다 (BuildUI/Controls와 동일 패턴, HANDOFF.md §5). */
  setInputEnabled(enabled) {
    this.locked = !enabled;
    if (this.locked) {
      // buildUI 잠금/해제는 DraftOverlay가 직접 소유한다 — 여긴 내 패널 표시만 지운다.
      this.current = null;
      this.relocateMode = false;
      this.relocateGfx.clear();
      this.rangeGfx.clear();
      this.clearPanel();
    }
  }

  handleEsc() {
    if (this.locked) return;
    if (this.scene.draft?.current) return; // 드래프트가 떠 있으면 그쪽이 우선 — 반응 안 함
    if (this.relocateMode) { this.cancelRelocate(); return; }
    if (this.current) this.close();
  }

  // ────────────────────────────────────────── 클릭 감지
  handlePointerDown(pointer) {
    if (this.locked) return;

    if (this.relocateMode) {
      if (pointer.rightButtonDown()) { this.cancelRelocate(); return; }
      this.attemptRelocateClick(pointer);
      return;
    }

    if (this.scene.buildUI?.selectedId) return; // 배치 모드 중엔 관여하지 않는다
    if (pointer.y >= BUILD.barY - BUILD.barHeight / 2) return; // 건설 바 영역

    const hit = this.hitTest(pointer.x, pointer.y);
    if (hit) { this.open(hit.instanceId, hit.kind); return; }

    if (this.current && !this.isInsidePanel(pointer.x, pointer.y)) this.close();
  }

  handlePointerMove(pointer) {
    if (!this.relocateMode) return;
    if (pointer.y >= BUILD.barY - BUILD.barHeight / 2) { this.relocateGfx.clear(); return; }

    const cx = Phaser.Math.Clamp(Math.floor(pointer.x / CELL), 0, MAX_CX);
    const cy = Phaser.Math.Clamp(Math.floor(pointer.y / CELL), 0, MAX_CY);
    if (cx === this._lastRelocateCx && cy === this._lastRelocateCy) return;
    this._lastRelocateCx = cx;
    this._lastRelocateCy = cy;

    const ok = GridSystem.canPlace(this.current.kind, cx, cy).ok;
    this.relocateGfx.clear();
    this.relocateGfx.fillStyle(ok ? COLOR.ok : COLOR.ng, BUILD.previewAlpha);
    this.relocateGfx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
  }

  hitTest(x, y) {
    const state = this.core.getState();
    const candidates = [
      ...state.towers.map(t => ({ instanceId: t.instanceId, kind: 'tower', x: t.x, y: t.y })),
      ...state.supports.map(s => ({ instanceId: s.instanceId, kind: 'support', x: s.x, y: s.y })),
    ];
    return candidates.find(c => Math.hypot(c.x - x, c.y - y) <= HIT_RADIUS) ?? null;
  }

  isInsidePanel(px, py) {
    const b = this.panelBounds ?? { x: UPGRADE.panelX, y: UPGRADE.panelY, w: UPGRADE.panelWidth, h: UPGRADE.panelHeight };
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
  }

  // ────────────────────────────────────────── 열기/닫기
  open(instanceId, kind) {
    this.current = { instanceId, kind };
    this.relocateMode = false;
    this.relocateGfx.clear();
    this.scene.buildUI?.setInputEnabled(false);
    this.render();
  }

  close() {
    this.current = null;
    this.relocateMode = false;
    this.relocateGfx.clear();
    this.rangeGfx.clear();
    this.clearPanel();
    this.scene.buildUI?.setInputEnabled(true);
  }

  clearPanel() {
    this.panelGroup.forEach(o => o.destroy());
    this.panelGroup = [];
    this.panelBounds = null;
    this.hintText?.destroy();
    this.hintText = null;
  }

  // ────────────────────────────────────────── 렌더링
  render() {
    this.clearPanel();
    const { instanceId, kind } = this.current;
    const state = this.core.getState();
    const obj = (kind === 'tower' ? state.towers : state.supports).find(o => o.instanceId === instanceId);
    if (!obj) { this.close(); return; }

    const def = kind === 'tower' ? towersData[obj.id] : supportsData[obj.id];
    const lvl = def.levels[obj.level];
    const x = UPGRADE.panelX, w = UPGRADE.panelWidth;
    let cy = UPGRADE.panelY + UPGRADE.padding;

    const addLine = (text, color, fontSize = UPGRADE.statFontSize) => {
      const t = this.scene.add.text(x + UPGRADE.padding, cy, text, {
        fontSize: `${fontSize}px`, color,
        wordWrap: { width: w - UPGRADE.padding * 2 }, lineSpacing: 4,
      }).setDepth(61);
      this.panelGroup.push(t);
      cy += Math.max(UPGRADE.lineHeight, t.height + 6);
    };

    addLine(`${def.name} · ${lvl.label}`, '#f2f4f8', UPGRADE.titleFontSize);

    const stat = this.statLine(kind, def, obj.level);
    addLine(
      stat.next ? `${stat.label} ${stat.cur} → ${stat.next}` : `${stat.label} ${stat.cur} (최대)`,
      stat.next ? '#f2f4f8' : UPGRADE.maxLevelColor,
    );

    this.infoLines(kind, def).forEach(line => addLine(line, '#8a919e'));

    cy += 6;

    if (!obj.canUpgrade()) {
      addLine('최대 강화 완료', UPGRADE.maxLevelColor);
    } else {
      const cost = obj.upgradeCost();
      const afford = state.gold >= cost;
      addLine(
        afford ? `강화 비용 ${cost}G` : `강화 비용 ${cost}G / 보유 ${state.gold}G`,
        afford ? '#f2f4f8' : UPGRADE.costShortColor,
      );
      cy += 4;
      this.makeButton(x + w / 2, cy + UPGRADE.buttonHeight / 2, UPGRADE.buttonWidth, '강화', afford, () => this.upgrade());
      cy += UPGRADE.buttonHeight + UPGRADE.buttonGap;
    }

    this.makeButton(x + w / 2, cy + UPGRADE.buttonHeight / 2, UPGRADE.buttonWidth, '재배치', true, () => this.startRelocate());
    cy += UPGRADE.buttonHeight;

    const panelH = cy - UPGRADE.panelY + UPGRADE.padding;
    const bg = this.scene.add.rectangle(x + w / 2, UPGRADE.panelY + panelH / 2, w, panelH, COLOR.slot, 0.95)
      .setStrokeStyle(2, COLOR.accent, 0.8).setDepth(59);
    this.panelGroup.unshift(bg);
    this.panelBounds = { x, y: UPGRADE.panelY, w, h: panelH };

    // 열림/갱신마다 살짝 페이드인 — 매번 새로 만들고 지우는 패널이라 EASE.ui로 딱딱함을 덜어낸다
    this.panelGroup.forEach(o => { o.alpha = 0; });
    this.scene.tweens.add({ targets: this.panelGroup, alpha: 1, duration: 160, ease: EASE.ui });

    this.drawRangeCircle(obj, kind);
  }

  /** 타워는 damage(statMul), 서포터는 effect.value(statMul)만 레벨에 반영된다 — 그 외 고정값. */
  statLine(kind, def, level) {
    const hasNext = level < def.levels.length - 1;
    if (kind === 'tower') {
      const cur = Math.round(def.damage * def.levels[level].statMul);
      const next = hasNext ? Math.round(def.damage * def.levels[level + 1].statMul) : null;
      return { label: '피해', cur: String(cur), next: next != null ? String(next) : null };
    }
    const fmt = v => `+${Math.round(v * 100)}%`;
    const label = def.effect.type === 'auraRange' ? '사거리 버프' : def.effect.type === 'globalGold' ? '처치 골드' : '효과';
    const cur = def.effect.value * def.levels[level].statMul;
    const next = hasNext ? def.effect.value * def.levels[level + 1].statMul : null;
    return { label, cur: fmt(cur), next: next != null ? fmt(next) : null };
  }

  /** 레벨과 무관한 고정 정보. 서포터는 카드와 같은 desc(효과+실제 근거)를 그대로 재사용한다. */
  infoLines(kind, def) {
    if (kind === 'support') return [def.desc];

    const lines = [`사거리 ${def.range}`];
    if (def.aoeRadius > 0) lines.push(`광역 반경 ${def.aoeRadius}`);
    (def.effects || []).forEach(e => {
      if (e.type === 'slow') lines.push(`슬로우 ${Math.round(e.amount * 100)}%, ${e.duration}초`);
    });
    const strong = Object.entries(def.strongAgainst || {});
    if (strong.length) lines.push('상성: ' + strong.map(([k, v]) => `${enemiesData[k]?.name ?? k} ×${v}`).join(', '));
    return lines;
  }

  makeButton(cx, cy, width, label, enabled, onClick) {
    const rect = this.scene.add.rectangle(cx, cy, width, UPGRADE.buttonHeight, COLOR.slot)
      .setStrokeStyle(2, COLOR.accent, 0.7).setDepth(61);
    const text = this.scene.add.text(cx, cy, label, {
      fontSize: `${UPGRADE.buttonFontSize}px`, color: '#f2f4f8',
    }).setOrigin(0.5).setDepth(62);
    const group = [rect, text];
    if (!enabled) {
      group.forEach(o => o.setAlpha(0.35));
    } else {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', (_p, _lx, _ly, event) => { event.stopPropagation(); onClick(); });
    }
    this.panelGroup.push(...group);
  }

  upgrade() {
    if (!this.current) return;
    this.core.upgrade(this.current.instanceId);
    this.render(); // 성공하면 새 레벨로, 실패하면 actionRejected 토스트가 별도로 뜬다
  }

  // ────────────────────────────────────────── 사거리/오라 원
  drawRangeCircle(obj, kind) {
    this.rangeGfx.clear();
    if (kind === 'tower') {
      this.rangeGfx.lineStyle(BUILD.rangeLineWidth, BUILD.rangeColor, BUILD.rangeAlpha);
      this.rangeGfx.strokeCircle(obj.x, obj.y, obj.effectiveRange);
      return;
    }
    const def = supportsData[obj.id];
    if (def.effect.radius > 0) {
      this.rangeGfx.fillStyle(BUILD.auraColor, BUILD.auraFillAlpha);
      this.rangeGfx.lineStyle(BUILD.auraLineWidth, BUILD.auraColor, BUILD.auraLineAlpha);
      this.rangeGfx.fillCircle(obj.x, obj.y, def.effect.radius);
      this.rangeGfx.strokeCircle(obj.x, obj.y, def.effect.radius);
    }
  }

  refreshRangeCircle() {
    if (!this.current || this.relocateMode) return;
    const state = this.core.getState();
    const obj = (this.current.kind === 'tower' ? state.towers : state.supports)
      .find(o => o.instanceId === this.current.instanceId);
    if (obj) this.drawRangeCircle(obj, this.current.kind);
  }

  // ────────────────────────────────────────── 재배치 (드래그 대신 "선택→셀 클릭", CLAUDE.md §1-5 무료)
  startRelocate() {
    if (!this.current) return;
    this.relocateMode = true;
    this._lastRelocateCx = null;
    this._lastRelocateCy = null;
    this.clearPanel();
    this.rangeGfx.clear();
    this.hintText = this.scene.add.text(UPGRADE.panelX, UPGRADE.panelY, '이동할 위치를 고르세요 (ESC/우클릭 취소)', {
      fontSize: `${UPGRADE.statFontSize}px`, color: UPGRADE.relocateHintColor,
      wordWrap: { width: UPGRADE.panelWidth },
    }).setDepth(61);
  }

  cancelRelocate() {
    this.relocateMode = false;
    this.relocateGfx.clear();
    this.render();
  }

  attemptRelocateClick(pointer) {
    if (pointer.y >= BUILD.barY - BUILD.barHeight / 2) return; // 건설 바 영역은 무시
    const cx = Phaser.Math.Clamp(Math.floor(pointer.x / CELL), 0, MAX_CX);
    const cy = Phaser.Math.Clamp(Math.floor(pointer.y / CELL), 0, MAX_CY);
    const res = this.core.relocate(this.current.instanceId, cx, cy);
    if (res.ok) {
      this.relocateMode = false;
      this.relocateGfx.clear();
      this.render();
    }
    // 실패 시엔 actionRejected 토스트만 뜨고 relocateMode 유지 — 바로 다시 시도할 수 있다
  }

  // ────────────────────────────────────────── 실패 토스트
  showToast(message) {
    if (!message) return;
    this.toast.setText(message)
      .setPosition(UPGRADE.panelX, UPGRADE.panelY + (this.panelBounds?.h ?? UPGRADE.panelHeight) + 12)
      .setAlpha(1);
    this.scene.tweens.killTweensOf(this.toast);
    this.scene.tweens.add({ targets: this.toast, alpha: 0, delay: UPGRADE.rejectToastMs, duration: 200 });
  }

  // ────────────────────────────────────────── ?fxtest=1 검증 키
  setupFxTestKeys() {
    const kb = this.scene.input.keyboard;
    kb.on('keydown-U', () => {
      const state = this.core.getState();
      const target = state.towers[0]
        ? { instanceId: state.towers[0].instanceId, kind: 'tower' }
        : state.supports[0] ? { instanceId: state.supports[0].instanceId, kind: 'support' } : null;
      if (!target) { if (DEBUG) console.warn('[UpgradeUI] U — 지어진 건물이 없다'); return; }
      this.open(target.instanceId, target.kind);
    });
    this.scene.add.text(20, H - 200, 'UpgradeUI 검증(?fxtest=1): U=강제 패널 열기(첫 건물)', {
      fontSize: '12px', color: '#8a919e',
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);
  }

  destroy() {
    EventBus.off(EV.actionRejected, this.onRejected, this);
    EventBus.off(EV.buffsRecalculated, this.onBuffsRecalculated, this);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.keyboard.off('keydown-ESC', this.onEsc);

    this.rangeGfx.destroy();
    this.relocateGfx.destroy();
    this.toast.destroy();
    this.clearPanel();
  }
}
