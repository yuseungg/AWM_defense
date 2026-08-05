/**
 * UpgradeUI.js — 건물 클릭 → 강화 패널 / 건물 드래그 → 재배치 (골드 = 수직 파워 채널의 유일한 출구, CLAUDE.md §1-4)
 *
 * 맵의 타워·서포터를 클릭하면 좌상단 HUD 아래 고정 패널이 뜬다. BuildUI가 배치 모드 중이면
 * (selectedId 존재) 이 컴포넌트는 관여하지 않는다 — 클릭은 그대로 배치 시도로 간다.
 *
 * ★ 재배치는 드래그다(판매 없음, 무료 유지 — CLAUDE.md §1-5). pointerdown이 건물에 맞아도
 *   바로 패널을 열거나 드래그를 시작하지 않는다 — pointerdown~pointerup 사이 이동 거리가
 *   DRAG_THRESHOLD를 넘기면 드래그, 안 넘기면 클릭(패널 열기)으로 판정한다. 이 구분이 없으면
 *   패널을 열려는 클릭이 전부 "제자리 드래그"로 오인되거나, 반대로 드래그 시작이 클릭으로
 *   씹힌다. 드래그 중엔 `GameCore.canRelocate()`(자기 자신 제외 판정 — canBuild와 다름, 아래
 *   참고)로 매 셀마다 초록/빨강을 계산하고, `TowerView`의 고스트가 커서를 따라간다. 드롭 시
 *   `GameCore.relocate()`를 호출 — 실패해도 안전하다(고스트가 원위치로 자동 복귀, TowerView
 *   참고). 터치도 Phaser Pointer가 마우스와 동일 이벤트로 통합돼서 별도 분기가 필요 없다.
 *
 * ★ canRelocate ≠ canBuild: canBuild의 점유 검사는 "옮기는 그 건물 자신"이 서 있던 칸도 여전히
 *   점유된 것으로 본다 — 그래서 옛 자리와 조금이라도 겹치는 칸으로 옮기면 자기 자신과 충돌한
 *   걸로 오판해 항상 실패한다. GameCore.canRelocate/relocate는 GridSystem.canPlace에
 *   excludeInstanceId를 넘겨 이 오판을 막는다(GameCore.js 참고).
 *
 * ★ N서울타워는 클릭(패널 열기)은 되지만 드래그(재배치)는 handlePointerMove에서 id로 막는다
 *   — map.json 고정 좌표의 상시 지형물이라 옮기면 좌표만 바뀌고 SeoulTowerLight가 그리는 조명
 *   원은 원래 자리에 그대로 남아 어긋난다. hitTest 자체는 이제 N서울타워도 후보에 포함한다
 *   (TowerView가 씬 진입 시 getState로 보정 생성해줘서 드래그할 실체 자체는 생겼다 — 다만
 *   "생겼다고 옮겨도 되는 건 아니다"라 승격만 별도로 막는다).
 *
 * ★ ESC 우선순위: DraftOverlay가 열려 있으면(this.scene.draft.current) 이 컴포넌트는 ESC에
 *   반응하지 않는다 — 드래프트가 항상 우선이다(HANDOFF.md §5에 근거 기록). 드래그 중엔 ESC/우클릭이
 *   드래그만 취소한다(relocate 호출 없이 고스트만 원위치 복귀).
 *
 * ★ 강화는 damage(타워)/effect.value(서포터)에만 적용된다 — range·aoeRadius·effects·strongAgainst는
 *   레벨과 무관한 고정값이라 화살표 없이 정보성으로만 보여준다(Tower.js 자체 문서화와 동일 원칙).
 *
 * 판매 버튼은 만들지 않는다 — CLAUDE.md §8 절대 금지(재배치만 있다).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, BUILD, UPGRADE, EASE } from './UITheme.js';
import { CELL, W, H, setGridVisible } from './mapView.js';
import { FOOTPRINT } from '../game/GridSystem.js';
import towersData from '../../data/towers.json';
import supportsData from '../../data/supports.json';
import enemiesData from '../../data/enemies.json';

const FXTEST = new URLSearchParams(location.search).get('fxtest') === '1';
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const MAX_CX = W / CELL - 1;
const MAX_CY = H / CELL - 1;
// 타워·서포터는 2×2(80×80) — 건물 절반(40px)보다 살짝 여유를 둔다(기존엔 40px 1×1 기준 20px였음)
const HIT_RADIUS = (CELL * FOOTPRINT.tower) / 2 + 4;
// 재배치 대상은 늘 tower/support뿐이라(장애물은 relocate 대상 아님) 클램프는 이 footprint 하나로 충분하다
function maxAnchor(max) {
  return max - (FOOTPRINT.tower - 1);
}
// pointerdown~pointerup 사이 이 거리(px)를 넘기면 클릭이 아니라 드래그로 판정한다.
const DRAG_THRESHOLD = 6;

export class UpgradeUI {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.current = null;      // { instanceId, kind: 'tower'|'support' }
    this.locked = false;      // DraftOverlay가 열려 있는 동안 true
    this.panelGroup = [];
    this.panelBounds = null;  // 실제 렌더된 패널 크기(내용에 따라 가변) — 밖 클릭 판정에 씀

    this.dragCandidate = null; // { instanceId, kind, downX, downY } — pointerdown 직후, 클릭/드래그 미정
    this.dragging = null;      // { instanceId, kind } — DRAG_THRESHOLD를 넘겨 드래그로 확정된 후
    this._lastDragCx = null;
    this._lastDragCy = null;

    this.rangeGfx = scene.add.graphics().setDepth(45);
    this.relocateGfx = scene.add.graphics().setDepth(50);
    this.toast = scene.add.text(0, 0, '', {
      fontSize: '13px', color: '#f2f4f8',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 0).setDepth(70).setAlpha(0);

    this.onRejected = ({ action, message }) => {
      if (action === 'upgrade' || action === 'relocate' || action === 'clone') this.showToast(message);
    };
    this.onBuffsRecalculated = () => this.refreshRangeCircle();
    EventBus.on(EV.actionRejected, this.onRejected, this);
    EventBus.on(EV.buffsRecalculated, this.onBuffsRecalculated, this);

    this.onPointerMove = p => this.handlePointerMove(p);
    this.onPointerDown = p => this.handlePointerDown(p);
    this.onPointerUp = p => this.handlePointerUp(p);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointerup', this.onPointerUp);

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
      if (this.dragging) this.cancelDrag();
      this.dragCandidate = null;
      this.relocateGfx.clear();
      this.rangeGfx.clear();
      this.clearPanel();
    }
  }

  handleEsc() {
    if (this.locked) return;
    if (this.scene.draft?.current) return; // 드래프트가 떠 있으면 그쪽이 우선 — 반응 안 함
    if (this.dragging) { this.cancelDrag(); return; }
    if (this.current) this.close();
  }

  // ────────────────────────────────────────── 클릭/드래그 감지
  handlePointerDown(pointer) {
    if (this.locked) return;

    if (this.dragging) {
      if (pointer.rightButtonDown()) this.cancelDrag(); // 우클릭 = 드래그 취소
      return;
    }

    if (this.scene.buildUI?.selectedId) return; // 배치 모드 중엔 관여하지 않는다
    if (pointer.y >= BUILD.barY - BUILD.barHeight / 2) return; // 건설 바 영역

    const hit = this.hitTest(pointer.x, pointer.y);
    if (hit) {
      // 클릭(패널 열기)인지 드래그(재배치)인지는 여기서 정하지 않는다 — pointerup/pointermove가 가른다.
      this.dragCandidate = { instanceId: hit.instanceId, kind: hit.kind, id: hit.id, downX: pointer.x, downY: pointer.y };
      return;
    }

    if (this.current && !this.isInsidePanel(pointer.x, pointer.y)) this.close();
  }

  handlePointerMove(pointer) {
    if (this.dragging) { this.updateDragPreview(pointer); return; }

    if (this.dragCandidate) {
      const d = Math.hypot(pointer.x - this.dragCandidate.downX, pointer.y - this.dragCandidate.downY);
      // N서울타워는 아무리 끌어도 드래그로 승격하지 않는다 — pointerup 시 자연히 "클릭"으로
      // 처리돼 패널만 열린다(상시 지형물이라 옮기면 조명 위치와 어긋난다, § 상단 주석).
      if (d > DRAG_THRESHOLD && this.dragCandidate.id !== 'nseoulTower') this.beginDrag();
    }
  }

  /** DRAG_THRESHOLD를 넘긴 순간 클릭 후보를 드래그로 승격 — 패널을 닫고 고스트를 반투명으로 전환한다. */
  beginDrag() {
    const { instanceId, kind } = this.dragCandidate;
    this.dragCandidate = null;
    this.dragging = { instanceId, kind };
    this._lastDragCx = null;
    this._lastDragCy = null;
    if (this.current) this.close();
    this.scene.towerView?.beginDrag(instanceId);
    setGridVisible(true);
  }

  updateDragPreview(pointer) {
    const { instanceId, kind } = this.dragging;
    this.scene.towerView?.updateDragPosition(instanceId, pointer.x, pointer.y); // 고스트는 픽셀 단위로 커서를 그대로 따라간다

    const overBar = pointer.y >= BUILD.barY - BUILD.barHeight / 2;
    if (overBar) {
      this.relocateGfx.clear();
      this.rangeGfx.clear();
      this._lastDragCx = null;
      this._lastDragCy = null;
      return;
    }

    const cx = Phaser.Math.Clamp(Math.floor(pointer.x / CELL), 0, maxAnchor(MAX_CX));
    const cy = Phaser.Math.Clamp(Math.floor(pointer.y / CELL), 0, maxAnchor(MAX_CY));
    if (cx === this._lastDragCx && cy === this._lastDragCy) return; // ★ 셀이 안 바뀌면 재조회 안 함
    this._lastDragCx = cx;
    this._lastDragCy = cy;

    const ok = this.core.canRelocate(instanceId, cx, cy).ok;
    const size = FOOTPRINT[kind] ?? 1;
    const px = cx * CELL + (CELL * size) / 2;
    const py = cy * CELL + (CELL * size) / 2;

    this.relocateGfx.clear();
    this.relocateGfx.fillStyle(ok ? COLOR.ok : COLOR.ng, BUILD.previewAlpha);
    this.relocateGfx.fillRect(cx * CELL, cy * CELL, CELL * size, CELL * size);

    // 사거리(타워)/오라(서포터) 원을 목표 위치(px,py)로 옮겨 그린다 — 실시간 거리 계산이 아니라
    // 셀이 바뀔 때만(위 가드) 1회 재계산하므로 §5-2 "매 프레임 금지" 취지에 어긋나지 않는다.
    const state = this.core.getState();
    const obj = (kind === 'tower' ? state.towers : state.supports).find(o => o.instanceId === instanceId);
    if (obj) this.drawRangeCircle(obj, kind, px, py);
  }

  handlePointerUp(pointer) {
    if (this.locked) return;

    if (this.dragging) { this.finishDrag(pointer); return; }

    if (this.dragCandidate) {
      const { instanceId, kind } = this.dragCandidate;
      this.dragCandidate = null;
      this.open(instanceId, kind);
    }
  }

  finishDrag(pointer) {
    const { instanceId, kind } = this.dragging;
    const overBar = pointer.y >= BUILD.barY - BUILD.barHeight / 2;

    if (!overBar) {
      const cx = Phaser.Math.Clamp(Math.floor(pointer.x / CELL), 0, maxAnchor(MAX_CX));
      const cy = Phaser.Math.Clamp(Math.floor(pointer.y / CELL), 0, maxAnchor(MAX_CY));
      this.core.relocate(instanceId, cx, cy); // 실패해도 안전 — actionRejected 토스트만 뜨고 고스트는 아래서 원위치로 복귀
    }

    this.scene.towerView?.endDrag(instanceId);
    this.dragging = null;
    this.relocateGfx.clear();
    this.rangeGfx.clear();
    setGridVisible(false);
  }

  cancelDrag() {
    if (!this.dragging) return;
    this.scene.towerView?.endDrag(this.dragging.instanceId);
    this.dragging = null;
    this.relocateGfx.clear();
    this.rangeGfx.clear();
    setGridVisible(false);
  }

  /**
   * N서울타워도 이제 후보에 포함한다 — TowerView가 씬 진입 시 getState로 보정 생성해줘서
   * 실체가 생겼다(TowerView.js 생성자 참고). 클릭(패널 열기)은 허용하되, 드래그 승격은
   * handlePointerMove에서 id로 따로 막는다(§ 상단 주석 — 조명 위치와 어긋나는 문제 방지).
   */
  hitTest(x, y) {
    const state = this.core.getState();
    const candidates = [
      ...state.towers.map(t => ({ instanceId: t.instanceId, kind: 'tower', id: t.id, x: t.x, y: t.y })),
      ...state.supports.map(s => ({ instanceId: s.instanceId, kind: 'support', id: s.id, x: s.x, y: s.y })),
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
    this.relocateGfx.clear();
    this.scene.buildUI?.setInputEnabled(false);
    this.render();
  }

  close() {
    this.current = null;
    this.relocateGfx.clear();
    this.rangeGfx.clear();
    this.clearPanel();
    this.scene.buildUI?.setInputEnabled(true);
    setGridVisible(false);
  }

  clearPanel() {
    this.panelGroup.forEach(o => o.destroy());
    this.panelGroup = [];
    this.panelBounds = null;
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

    this.infoLines(kind, def, obj).forEach(line => addLine(line, '#8a919e'));

    cy += 6;

    if (!obj.canUpgrade() && obj.id === 'nseoulTower') {
      // N서울타워는 §5-7 타워 추가 대상에서 제외(상시 지형물 — 재배치와 같은 이유, 위 주석 참고)
      addLine('최대 강화 완료', UPGRADE.maxLevelColor);
    } else if (!obj.canUpgrade() && kind === 'tower' && !this.core.canClone(instanceId).ok) {
      // 타워는 인스턴스당 평생 1회만 "타워 추가"에 쓸 수 있다(2026-08-03 사용자 요청) — 이미 쓴
      // 인스턴스는 버튼 대신 안내만 보여준다. 새 타워를 지어 최대 강화해야 다시 쓸 수 있다.
      addLine('이 타워로는 이미 타워를 추가했습니다', UPGRADE.maxLevelColor);
      addLine('새 타워를 지어 최대 강화하면 다시 추가할 수 있습니다', '#8a919e', UPGRADE.statFontSize);
    } else if (!obj.canUpgrade()) {
      // §5-7 타워 추가(구 "복제") — 4번째 강화 단계. 골드로 이 종류의 추가 설치권을 산다.
      const cost = this.core.cloneCost(instanceId);
      const afford = state.gold >= cost;
      addLine(
        afford ? `타워 추가 비용 ${cost}G` : `타워 추가 비용 ${cost}G / 보유 ${state.gold}G`,
        afford ? '#f2f4f8' : UPGRADE.costShortColor,
      );
      cy += 4;
      this.makeButton(x + w / 2, cy + UPGRADE.buttonHeight / 2, UPGRADE.buttonWidth, '타워 추가', afford, () => this.clone());
      cy += UPGRADE.buttonHeight + UPGRADE.buttonGap;
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

    // 재배치는 이제 버튼이 아니라 드래그다(맵 위 건물을 직접 잡아서 옮긴다, § 상단 주석) — 여기선
    // 안내 한 줄만 보여준다. N서울타워는 handlePointerMove에서 드래그 승격 자체를 막는다.
    if (obj.id !== 'nseoulTower') {
      addLine('맵 위 건물을 드래그하면 옮길 수 있습니다', UPGRADE.relocateHintColor, UPGRADE.statFontSize);
    }

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

  /**
   * 레벨과 무관한 고정 정보. 서포터는 카드와 같은 desc(효과+실제 근거)를 그대로 재사용한다.
   * 사거리는 세운상가 오라·정책(towerRangeMul)으로 버프될 수 있어서 `def.range`(고정값)만 보여주면
   * "범위 안에 있는데도 안 늘어난다"는 오해가 생긴다 — `obj.effectiveRange`(Tower.js §5-2)와 다르면
   * 버프 후 값을 화살표로 같이 보여준다.
   */
  infoLines(kind, def, obj) {
    if (kind === 'support') return [def.desc];

    const buffed = Math.round(obj.effectiveRange) !== def.range;
    const lines = [buffed ? `사거리 ${def.range} → ${Math.round(obj.effectiveRange)}` : `사거리 ${def.range}`];
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

  /** §5-7 타워 추가 — 성공해도 이 인스턴스 자체는 안 바뀐다(여전히 최대 레벨, 이제 추가는 못 씀). 재렌더하면 반영된다. */
  clone() {
    if (!this.current) return;
    this.core.clone(this.current.instanceId);
    this.render();
  }

  // ────────────────────────────────────────── 사거리/오라 원
  /** x,y 생략 시 obj의 실제 현재 위치 — 드래그 미리보기는 목표 셀 중심을 명시로 넘겨서 재사용한다. */
  drawRangeCircle(obj, kind, x = obj.x, y = obj.y) {
    this.rangeGfx.clear();
    if (kind === 'tower') {
      this.rangeGfx.lineStyle(BUILD.rangeLineWidth, BUILD.rangeColor, BUILD.rangeAlpha);
      this.rangeGfx.strokeCircle(x, y, obj.effectiveRange);
      return;
    }
    const def = supportsData[obj.id];
    if (def.effect.radius > 0) {
      this.rangeGfx.fillStyle(BUILD.auraColor, BUILD.auraFillAlpha);
      this.rangeGfx.lineStyle(BUILD.auraLineWidth, BUILD.auraColor, BUILD.auraLineAlpha);
      this.rangeGfx.fillCircle(x, y, def.effect.radius);
      this.rangeGfx.strokeCircle(x, y, def.effect.radius);
    }
  }

  refreshRangeCircle() {
    if (!this.current || this.dragging) return;
    const state = this.core.getState();
    const obj = (this.current.kind === 'tower' ? state.towers : state.supports)
      .find(o => o.instanceId === this.current.instanceId);
    if (obj) this.drawRangeCircle(obj, this.current.kind);
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
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.keyboard.off('keydown-ESC', this.onEsc);

    this.rangeGfx.destroy();
    this.relocateGfx.destroy();
    this.toast.destroy();
    this.clearPanel();
  }
}
