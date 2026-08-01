/**
 * BuildUI.js — 건물 선택 바 + 배치 미리보기 + 사거리/오라 원 (절대 사수 6개 중 마지막)
 *
 * 사거리 원이 없으면 타워의 유효 범위를, 오라 원이 없으면 세운상가의 버프 범위를
 * 플레이어가 알 방법이 없다 — 둘 다 CLAUDE.md §1 절대 규칙과 직결된다.
 *
 * ★ canBuild()는 마우스가 이동한 "셀"이 바뀔 때만 호출한다. pointermove는 초당 60~120회
 *   발생하는데 셀 하나가 40px이라 그 안에서 픽셀이 움직일 때마다 GridSystem 조회가 돌면 낭비다.
 * ★ 사거리 원(테두리만) / 오라 원(채움+낮은 알파) — 색이 아니라 형태로 구분한다 (UITheme.js BUILD 참고).
 *
 * N서울타워는 목록에서 제외한다 — map.json에 고정 좌표로 존재하는 상시 지형물이지
 * 플레이어가 격자에 배치하는 대상이 아니다(SeoulTowerLight가 이미 그 위치에 항상 그린다).
 *
 * 슬롯은 Panel.js의 drawPanel만 쓴다(직접 rectangle을 그리지 않는다) — 44×44 슬롯 하나가
 * Container 하나(원점=슬롯 중심)라서, 선택중 확대는 container.setScale() 한 줄로 끝난다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, BUILD, CONTROLS, VIEW, PANEL } from './UITheme.js';
import { CELL, W, H } from './mapView.js';
import { drawPanel } from './Panel.js';
import towersData from '../../data/towers.json';
import supportsData from '../../data/supports.json';
import obstaclesData from '../../data/obstacles.json';

const FXTEST = new URLSearchParams(location.search).get('fxtest') === '1';
const MAX_CX = W / CELL - 1;
const MAX_CY = H / CELL - 1;

export class BuildUI {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.selectedId = null;
    this.selectedKind = null; // 'tower' | 'support' | 'obstacle' — selectedId만으론 종류가 안 구분됨
    this.builtIds = new Set();
    this.pendingSupports = new Set();     // 드래프트로 얻었지만 아직 안 지은 서포터 id (유니크 — id당 1개)
    this.pendingObstacles = new Map();    // 드래프트로 얻었지만 아직 안 지은 장애물 설치 가능 횟수 (id별)
    this.builtSupportIds = new Set();     // 이미 지어진 서포터 — 유니크라 바에서 완전히 사라진다
    this.currentLevel = 1;
    this.forceUnlockAll = false;          // ?fxtest=1 L 키 — 잠금 UI QA용
    this.lastCx = null;
    this.lastCy = null;
    this.auraSupports = new Map(); // instanceId → { x, y, radius }
    this.locked = false; // DraftOverlay가 열려 있는 동안 true (Controls.setInputEnabled와 동일한 패턴)

    this.previewGfx = scene.add.graphics().setDepth(50);
    this.auraGfx = scene.add.graphics().setDepth(49);
    this.toast = scene.add.text(0, 0, '', {
      fontSize: '14px', color: '#f2f4f8',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    const initial = core.getState(); // 씬 진입 시 1회만 — CLAUDE.md D18
    this.currentLevel = initial.level;
    this.builtSupportIds = new Set((initial.supports || []).map(s => s.id));
    (initial.supports || []).forEach(s => this.trackAuraSupport(s));

    this.panel = null;
    this.dividers = [];
    this.barButtons = [];
    this.buildBar();
    this.refreshAuraLayer();

    this.onLevelUp = ({ level, unlockedTower }) => {
      this.currentLevel = level;
      this.buildBar();
      if (unlockedTower && unlockedTower !== 'nseoulTower') this.flashUnlock(unlockedTower, 'tower');
    };
    this.onObjectBuilt = payload => this.handleObjectBuilt(payload);
    this.onObjectChanged = payload => this.handleObjectChanged(payload);
    this.onRejected = ({ action, message }) => { if (action === 'build') this.showToast(message); };
    this.onCardPicked = ({ cardId }) => this.handleCardPicked(cardId);

    EventBus.on(EV.levelUp, this.onLevelUp, this);
    EventBus.on(EV.objectBuilt, this.onObjectBuilt, this);
    EventBus.on(EV.objectChanged, this.onObjectChanged, this);
    EventBus.on(EV.actionRejected, this.onRejected, this);
    EventBus.on(EV.cardPicked, this.onCardPicked, this);

    this.onPointerMove = pointer => this.handlePointerMove(pointer);
    this.onPointerDown = pointer => this.handlePointerDown(pointer);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerdown', this.onPointerDown);

    if (FXTEST) this.setupFxTestKeys();

    scene.events.once('shutdown', () => this.destroy());
  }

  // ────────────────────────────────────────── 선택 바
  /**
   * 타워는 미해금도 전부 보여준다 — "앞으로 뭐가 나올지" 모르면 레벨업 동기가 안 생긴다
   * (로그라이트 성장의 핵심). 서포터는 규칙이 다르다: 해금이 아니라 드래프트 "획득" 여부라서,
   * 아직 못 뽑았으면 같은 잠금 스타일이되 "드래프트에서 획득"으로 표시한다(레벨 배지 대신).
   * 장애물은 기존 그대로 — 픽당 설치권이 있을 때만 등장, 남은 횟수를 뱃지로 보여준다.
   */
  buildItems() {
    const items = Object.keys(towersData)
      .filter(id => id !== 'nseoulTower')
      .map(id => {
        const def = towersData[id];
        const locked = !this.forceUnlockAll && def.unlockLevel > this.currentLevel;
        return {
          id, kind: 'tower', name: def.name, count: null, locked,
          lockLabel: `L${def.unlockLevel}`, lockMessage: `레벨 ${def.unlockLevel}에 해금됩니다`,
        };
      });

    Object.keys(supportsData).forEach(id => {
      if (this.builtSupportIds.has(id)) return; // 유니크 — 이미 지었으면 바에서 완전히 사라진다
      const owned = this.pendingSupports.has(id);
      items.push({
        id, kind: 'support', name: supportsData[id].name, count: null, locked: !owned,
        lockLabel: '드래프트', lockMessage: '레벨업 드래프트에서 먼저 획득해야 합니다',
      });
    });

    this.pendingObstacles.forEach((count, id) => {
      if (count > 0) items.push({ id, kind: 'obstacle', name: obstaclesData[id].name, count, locked: false });
    });

    return items;
  }

  buildBar() {
    this.barButtons.forEach(b => b.container.destroy());
    this.barButtons = [];
    this.dividers.forEach(d => d.destroy());
    this.dividers = [];
    this.panel?.destroy();

    const items = this.buildItems();
    if (items.length === 0) { this.panel = null; return; }

    // 슬롯 사이 간격 — 타워 그룹 → 서포터/장애물 그룹으로 넘어가는 지점만 groupGap, 나머지는 slotGap
    const gaps = items.map((item, i) => {
      if (i === items.length - 1) return 0;
      return item.kind === 'tower' && items[i + 1].kind !== 'tower' ? BUILD.groupGap : BUILD.slotGap;
    });
    const contentW = items.length * BUILD.slotSize + gaps.reduce((a, b) => a + b, 0);
    const panelW = contentW + BUILD.slotGap * 2;
    const panelX = W / 2 - panelW / 2;
    const panelY = BUILD.barY - BUILD.barHeight / 2;

    this.panel = drawPanel(this.scene, panelX, panelY, panelW, BUILD.barHeight, {});

    let x = panelX + BUILD.slotGap;
    items.forEach((item, i) => {
      this.barButtons.push({ id: item.id, kind: item.kind, container: this.buildSlot(x, panelY, item) });
      if (gaps[i] === BUILD.groupGap) {
        const dx = x + BUILD.slotSize + BUILD.groupGap / 2;
        this.dividers.push(
          this.scene.add.line(0, 0, dx, panelY + 10, dx, panelY + BUILD.barHeight - 10, PANEL.borderColor, BUILD.dividerAlpha)
            .setOrigin(0, 0).setLineWidth(1),
        );
      }
      x += BUILD.slotSize + gaps[i];
    });
  }

  /**
   * 44×44 슬롯 하나 = Container(원점이 슬롯 중심, 자식은 전부 로컬 좌표). drawPanel(테두리) +
   * 4px 안쪽 이미지 영역(텍스처 있으면 이미지, 없으면 실루엣) + 우하단 뱃지 + 아래쪽 이름 라벨.
   */
  buildSlot(x, panelY, item) {
    const { id, kind, name, count, locked, lockLabel, lockMessage } = item;
    const built = kind === 'tower' && this.builtIds.has(id);
    const selected = id === this.selectedId && kind === this.selectedKind;
    const disabled = built || locked || this.locked;
    const half = BUILD.slotSize / 2;

    const cx = x + half;
    const cy = panelY + BUILD.slotTopPad + half;
    const container = this.scene.add.container(cx, cy);

    const borderColor = locked ? BUILD.slotBorderLocked
      : selected ? BUILD.slotBorderSelected
      : built ? BUILD.slotBorderBuilt
      : BUILD.slotBorderSelectable;

    const frame = drawPanel(this.scene, -half, -half, BUILD.slotSize, BUILD.slotSize, {
      corners: ['tl', 'br'], chamfer: BUILD.slotChamfer,
      borderColor, borderWidth: selected ? 2 : 1.5,
    });
    container.add(frame);

    // 4px 안쪽 이미지 영역 — 텍스처 있으면 이미지, 없으면 실루엣(색 스와치). 잠김이면 자물쇠로 대체.
    const innerSize = BUILD.slotSize - BUILD.slotInset * 2;
    if (locked) {
      container.add(this.drawLockIcon(0, -2));
    } else {
      const texKey = `${kind}_${id}`;
      if (this.scene.textures.exists(texKey)) {
        container.add(this.scene.add.image(0, 0, texKey).setDisplaySize(innerSize, innerSize));
      } else {
        const swatchColor = kind === 'tower'
          ? Phaser.Display.Color.HexStringToColor(towersData[id].levels[0].tint).color
          : (VIEW.objectColor[id] ?? COLOR.accent);
        container.add(this.scene.add.rectangle(0, 0, innerSize, innerSize, swatchColor));
      }
    }

    // 우하단 뱃지 — 건설됨(✓) / 잠김(레벨·드래프트) / 장애물 남은 개수. 셋은 서로 배타적이다.
    if (built) {
      container.add(this.scene.add.text(half - 2, half - 2, '✓', { fontSize: '13px', color: BUILD.checkColor }).setOrigin(1));
    } else if (locked) {
      container.add(this.scene.add.text(half - 2, half - 2, lockLabel, { fontSize: '9px', color: BUILD.badgeColor }).setOrigin(1));
    } else if (count != null) {
      container.add(this.scene.add.text(half - 2, half - 2, `x${count}`, { fontSize: '9px', color: BUILD.badgeColor }).setOrigin(1));
    }

    container.add(this.scene.add.text(0, half + BUILD.labelGap, name, {
      fontSize: `${BUILD.labelFontSize}px`, color: '#f2f4f8',
    }).setOrigin(0.5, 0));

    if (disabled) container.setAlpha(built ? BUILD.builtAlpha : locked ? BUILD.lockedAlpha : CONTROLS.disabledAlpha);
    if (selected) container.setScale(BUILD.slotSelectedScale);

    if (built || this.locked) {
      // 클릭 불가 — 핸들러 없음
    } else {
      container.setSize(BUILD.slotSize, BUILD.slotSize);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-half, -half, BUILD.slotSize, BUILD.slotSize), Phaser.Geom.Rectangle.Contains,
      );
      if (locked) {
        container.on('pointerdown', (_p, _lx, _ly, event) => { event.stopPropagation(); this.showToast(lockMessage); });
      } else {
        container.on('pointerdown', (_p, _lx, _ly, event) => { event.stopPropagation(); this.select(id, kind); });
      }
    }

    return container;
  }

  /** 원점(cx,cy) 기준 자물쇠 실루엣 — 이미지 없이 몸통(사각)+고리(반원 호)만으로 표현한다. */
  drawLockIcon(cx, cy) {
    const g = this.scene.add.graphics();
    g.fillStyle(BUILD.lockIconColor, 1);
    g.fillRoundedRect(cx - 7, cy - 1, 14, 10, 2);
    g.lineStyle(2, BUILD.lockIconColor, 1);
    g.beginPath();
    g.arc(cx, cy - 1, 5, Math.PI, 0, false);
    g.strokePath();
    return g;
  }

  /** 해금되는 순간 그 슬롯을 짧게 확대/원복(팝)해서 "지금 여기가 열렸다"는 인과를 보여준다. */
  flashUnlock(id, kind) {
    const entry = this.barButtons.find(b => b.id === id && b.kind === kind);
    if (!entry) return;
    this.scene.tweens.add({
      targets: entry.container,
      scaleX: { from: 1, to: BUILD.unlockScalePunch },
      scaleY: { from: 1, to: BUILD.unlockScalePunch },
      yoyo: true,
      duration: BUILD.unlockFlashMs,
      ease: 'Back.easeOut',
    });
  }

  select(id, kind) {
    const same = this.selectedId === id && this.selectedKind === kind;
    this.selectedId = same ? null : id;
    this.selectedKind = same ? null : kind;
    this.lastCx = null;
    this.lastCy = null;
    this.previewGfx.clear();
    this.buildBar();
  }

  /** 픽 직후엔 아직 화면에 없는 카드 종류(서포터/장애물)를 바로 배치 대기열에 추가한다. 퍼크는 배치 불필요(즉시 적용). */
  handleCardPicked(cardId) {
    if (supportsData[cardId]) {
      this.pendingSupports.add(cardId);
      this.buildBar();
    } else if (obstaclesData[cardId]) {
      this.pendingObstacles.set(cardId, (this.pendingObstacles.get(cardId) || 0) + 1);
      this.buildBar();
    }
  }

  /**
   * DraftOverlay가 열리고 닫힐 때 호출한다 (Controls.setInputEnabled와 동일한 패턴 — HANDOFF.md §5).
   * 잠그는 동안 선택은 유지하되(오버레이 닫히면 이어서 배치 가능) 미리보기만 지운다 — 잠긴 사이
   * 마우스가 움직여도 좌표가 갱신되지 않으므로 낡은 미리보기가 남는 걸 막는다.
   */
  setInputEnabled(enabled) {
    this.locked = !enabled;
    if (this.locked) {
      this.lastCx = null;
      this.lastCy = null;
      this.previewGfx.clear();
    }
    this.buildBar();
  }

  // ────────────────────────────────────────── 미리보기 (사거리 원 포함)
  handlePointerMove(pointer) {
    if (this.forceAuraFollow) this.drawFollowAura(pointer.x, pointer.y);
    if (this.locked) return;

    const overBar = pointer.y >= BUILD.barY - BUILD.barHeight / 2;
    if (!this.selectedId || overBar) {
      if (this.lastCx !== null) { this.lastCx = null; this.lastCy = null; this.previewGfx.clear(); }
      return;
    }

    const cx = Phaser.Math.Clamp(Math.floor(pointer.x / CELL), 0, MAX_CX);
    const cy = Phaser.Math.Clamp(Math.floor(pointer.y / CELL), 0, MAX_CY);
    if (cx === this.lastCx && cy === this.lastCy) return; // ★ 셀이 안 바뀌면 재조회 안 함
    this.lastCx = cx;
    this.lastCy = cy;

    const check = this.core.canBuild(this.selectedId, cx, cy);
    this.drawPreview(cx, cy, check.ok, this.selectedKind);
  }

  /** 사거리 원(타워, 테두리) / 오라 원(오라형 서포터, 채움) / 셀 하이라이트만(장애물·전역형 서포터) — 형태로 구분(BUILD 절대 사수) */
  drawPreview(cx, cy, ok, kind) {
    const px = cx * CELL + CELL / 2;
    const py = cy * CELL + CELL / 2;
    const color = ok ? COLOR.ok : COLOR.ng;

    this.previewGfx.clear();
    this.previewGfx.fillStyle(color, BUILD.previewAlpha);
    this.previewGfx.fillRect(cx * CELL, cy * CELL, CELL, CELL);

    if (kind === 'tower') {
      const def = towersData[this.selectedId];
      this.previewGfx.lineStyle(BUILD.rangeLineWidth, BUILD.rangeColor, BUILD.rangeAlpha);
      this.previewGfx.strokeCircle(px, py, def.range);
    } else if (kind === 'support') {
      const def = supportsData[this.selectedId];
      if (def.effect.radius > 0) {
        this.previewGfx.fillStyle(BUILD.auraColor, BUILD.auraFillAlpha);
        this.previewGfx.lineStyle(BUILD.auraLineWidth, BUILD.auraColor, BUILD.auraLineAlpha);
        this.previewGfx.fillCircle(px, py, def.effect.radius);
        this.previewGfx.strokeCircle(px, py, def.effect.radius);
      }
    }
    // obstacle: 경로 위 셀 하이라이트만 — 반경 개념이 없다
  }

  handlePointerDown(pointer) {
    if (this.locked || !this.selectedId || this.lastCx === null) return;
    if (pointer.y >= BUILD.barY - BUILD.barHeight / 2) return;
    // 성공/실패 후처리는 objectBuilt/actionRejected 이벤트가 전담한다(단일 소스 유지).
    // GameCore가 스텁이어도({ok:false} 등) 이 호출 자체는 안전하다 — 미리보기는 이미 렌더링을 마쳤다.
    if (this.selectedKind === 'tower') this.core.buildTower(this.selectedId, this.lastCx, this.lastCy);
    else if (this.selectedKind === 'support') this.core.buildSupport(this.selectedId, this.lastCx, this.lastCy);
    else if (this.selectedKind === 'obstacle') this.core.buildObstacle(this.selectedId, this.lastCx, this.lastCy);
  }

  // ────────────────────────────────────────── 오라 원 (기존 세운상가)
  trackAuraSupport(s) {
    const def = supportsData[s.id];
    if (def?.effect?.type === 'auraRange' && Number.isFinite(s.x)) {
      this.auraSupports.set(s.instanceId, { x: s.x, y: s.y, radius: def.effect.radius });
    }
  }

  handleObjectBuilt({ kind, id, x, y, instanceId }) {
    if (kind === 'tower') {
      this.builtIds.add(id);
      if (this.selectedId === id && this.selectedKind === 'tower') this.clearSelection();
      this.buildBar();
    } else if (kind === 'support') {
      this.pendingSupports.delete(id);
      this.builtSupportIds.add(id); // 유니크 — 배치 완료 후엔 건설 바에서 완전히 사라진다
      if (this.selectedId === id && this.selectedKind === 'support') this.clearSelection();
      this.trackAuraSupport({ id, x, y, instanceId });
      this.refreshAuraLayer();
      this.buildBar();
    } else if (kind === 'obstacle') {
      // 같은 종류가 더 남아 있으면 재선택 없이 이어서 놓을 수 있게 선택은 유지한다
      const remaining = (this.pendingObstacles.get(id) || 1) - 1;
      if (remaining > 0) this.pendingObstacles.set(id, remaining);
      else {
        this.pendingObstacles.delete(id);
        if (this.selectedId === id && this.selectedKind === 'obstacle') this.clearSelection();
      }
      this.buildBar();
    }
  }

  clearSelection() {
    this.selectedId = null;
    this.selectedKind = null;
    this.previewGfx.clear();
  }

  handleObjectChanged({ instanceId, action }) {
    if (action !== 'relocated' || !this.auraSupports.has(instanceId)) return;
    // objectChanged 페이로드엔 좌표가 없다(EventBus.js 계약) — 재배치는 드문 이벤트라
    // 이때만 getState()로 1회 재동기화한다 (D18의 "매 프레임 금지" 취지에 어긋나지 않는다)
    const state = this.core.getState();
    this.auraSupports.clear();
    (state.supports || []).forEach(s => this.trackAuraSupport(s));
    this.refreshAuraLayer();
  }

  refreshAuraLayer() {
    this.auraGfx.clear();
    if (this.auraSupports.size === 0) return;
    this.auraGfx.fillStyle(BUILD.auraColor, BUILD.auraFillAlpha);
    this.auraGfx.lineStyle(BUILD.auraLineWidth, BUILD.auraColor, BUILD.auraLineAlpha);
    this.auraSupports.forEach(({ x, y, radius }) => {
      this.auraGfx.fillCircle(x, y, radius);
      this.auraGfx.strokeCircle(x, y, radius);
    });
  }

  // ────────────────────────────────────────── 실패 토스트
  showToast(message) {
    if (!message) return;
    this.toast.setText(message)
      .setPosition(W / 2, BUILD.barY - BUILD.barHeight / 2 - BUILD.rejectToastOffsetY)
      .setAlpha(1);
    this.scene.tweens.killTweensOf(this.toast);
    this.scene.tweens.add({ targets: this.toast, alpha: 0, delay: BUILD.rejectToastMs, duration: 200 });
  }

  // ────────────────────────────────────────── ?fxtest=1 검증 키 (기존 키와 안 겹침: 1~4·0·B·R·S·P·Q·W·E·T·Y·D·F·Z·ESC·O)
  /**
   *   V: 현재 지어진 모든 타워의 사거리 원을 동시 표시 토글 (여러 랜드마크의 사거리 차이를 한눈에 비교)
   *   C: 세운상가 오라 원을 마우스에 붙여 이동 — 중앙 고정이 아니라 따라다녀야 "어느 타워가
   *      버프 범위 안에 들어오는가"를 실제로 검증할 수 있다(반지름 크기만 보는 것보다 검증 가치가 크다)
   *   L: 모든 타워 강제 해금 토글 — 잠금 UI(자물쇠/Lv.뱃지)를 실제 레벨업 없이 바로 확인
   */
  setupFxTestKeys() {
    const kb = this.scene.input.keyboard;
    this.forceAuraFollow = false;
    this.fxAuraGfx = this.scene.add.graphics().setDepth(51);
    this.rangeAllGfx = this.scene.add.graphics().setDepth(48);

    kb.on('keydown-V', () => {
      this.rangeAllOn = !this.rangeAllOn;
      this.drawAllRanges();
    });
    kb.on('keydown-C', () => {
      this.forceAuraFollow = !this.forceAuraFollow;
      if (!this.forceAuraFollow) this.fxAuraGfx.clear();
    });
    kb.on('keydown-L', () => {
      this.forceUnlockAll = !this.forceUnlockAll;
      this.buildBar();
    });

    this.scene.add.text(20, H - 160, 'BuildUI 검증(?fxtest=1): V=전체 사거리 원 · C=오라 원 마우스 추적 · L=전체 강제 해금', {
      fontSize: '12px', color: '#8a919e',
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);
  }

  drawAllRanges() {
    this.rangeAllGfx.clear();
    if (!this.rangeAllOn) return;
    const state = this.core.getState(); // 토글 시 1회성 스냅샷(매 프레임 아님)
    this.rangeAllGfx.lineStyle(BUILD.rangeLineWidth, BUILD.rangeColor, BUILD.rangeAlpha);
    (state.towers || []).forEach(t => {
      const def = towersData[t.id];
      if (def) this.rangeAllGfx.strokeCircle(t.x, t.y, def.range);
    });
  }

  drawFollowAura(x, y) {
    const def = supportsData.sewoon;
    this.fxAuraGfx.clear();
    this.fxAuraGfx.fillStyle(BUILD.auraColor, BUILD.auraFillAlpha);
    this.fxAuraGfx.lineStyle(BUILD.auraLineWidth, BUILD.auraColor, BUILD.auraLineAlpha);
    this.fxAuraGfx.fillCircle(x, y, def.effect.radius);
    this.fxAuraGfx.strokeCircle(x, y, def.effect.radius);
  }

  destroy() {
    EventBus.off(EV.levelUp, this.onLevelUp, this);
    EventBus.off(EV.objectBuilt, this.onObjectBuilt, this);
    EventBus.off(EV.objectChanged, this.onObjectChanged, this);
    EventBus.off(EV.actionRejected, this.onRejected, this);
    EventBus.off(EV.cardPicked, this.onCardPicked, this);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerdown', this.onPointerDown);

    this.previewGfx.destroy();
    this.auraGfx.destroy();
    this.toast.destroy();
    this.panel?.destroy();
    this.dividers.forEach(d => d.destroy());
    this.barButtons.forEach(b => b.container.destroy());
    this.fxAuraGfx?.destroy();
    this.rangeAllGfx?.destroy();
  }
}
