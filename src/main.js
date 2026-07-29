/**
 * main.js — Phaser 부트
 *
 * ⚠️ 이 파일은 CLAUDE.md §3상 【공용】이다. 구조 변경은 SYNC.md §3에 올린다.
 *
 * 두 가지 모드가 있다.
 *   (기본)    경로 검증 화면 — map.json 좌표가 격자에 정확히 앉는지 눈으로 확인
 *   ?mock=1   Mock 이벤트 모니터 — MockGameCore가 쏘는 이벤트를 실시간으로 확인
 *             → B가 HUD·조명·드래프트를 붙일 때 여기서 시작한다
 *   ?debug=1  격자를 진하게
 */

import Phaser from 'phaser';
import mapData from '../data/map.json';
import { COLOR, HUD as HUDT } from './ui/UITheme.js';
import { EventBus, EV } from './EventBus.js';
import { SeoulTowerLight } from './fx/SeoulTowerLight.js';

const W = 1280;
const H = 720;
const CELL = mapData.obstacleGrid.cell;

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const MOCK = params.get('mock') === '1';

/* ══════════════════════════════════ 경로 · 격자 유틸 ══════════════════════════════════ */

/** 경로를 따라 걸으며 지나가는 격자 셀을 수집한다 (중복 제거) */
function collectPathCells(path, cell) {
  const seen = new Set();
  const out = [];
  const step = cell / 4; // 셀을 건너뛰지 않도록 촘촘히 샘플링
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * (k / n);
      const y = a.y + (b.y - a.y) * (k / n);
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      if (cx < 0 || cy < 0 || cx * cell >= W || cy * cell >= H) continue;
      const key = `${cx},${cy}`;
      if (!seen.has(key)) { seen.add(key); out.push([cx, cy]); }
    }
  }
  return out;
}

function pathLength(path) {
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) {
    s += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  }
  return s;
}

/** 모든 좌표가 40k+20(셀 중심)인지 검사. 경로 시작점의 x는 화면 밖 진입구라 예외 */
function isAligned(path, core, tower, cell) {
  const ok = v => ((v % cell) + cell) % cell === cell / 2;
  const pts = [...path.slice(1), core, tower];
  return ok(path[0].y) && pts.every(p => ok(p.x) && ok(p.y));
}

/** 맵 배경(격자 + 경로 띠 + 중심선 + 코어/타워)을 그린다. 두 모드가 공유한다. */
function drawMap(scene) {
  const path = mapData.paths[0];

  const grid = scene.add.graphics();
  grid.lineStyle(1, COLOR.slot, DEBUG ? 0.9 : 0.35);
  for (let x = 0; x <= W; x += CELL) grid.lineBetween(x, 0, x, H);
  for (let y = 0; y <= H; y += CELL) grid.lineBetween(0, y, W, y);

  const cells = collectPathCells(path, CELL);
  const cellGfx = scene.add.graphics();
  cellGfx.fillStyle(COLOR.path, 1);
  cells.forEach(([cx, cy]) => cellGfx.fillRect(cx * CELL, cy * CELL, CELL, CELL));

  const line = scene.add.graphics();
  line.lineStyle(3, COLOR.accent, 0.9);
  line.beginPath();
  line.moveTo(path[0].x, path[0].y);
  path.slice(1).forEach(p => line.lineTo(p.x, p.y));
  line.strokePath();

  const core = mapData.core, tower = mapData.nseoulTower;
  scene.add.circle(core.x, core.y, 14, COLOR.ng).setStrokeStyle(2, 0xffffff, 0.7);
  scene.add.text(core.x, core.y - 30, '코어', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

  return { path, cells, core, tower };
}

/* ══════════════════════════════════ 경로 검증 화면 ══════════════════════════════════ */

class VerifyScene extends Phaser.Scene {
  constructor() { super('Verify'); }

  create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    const { path, cells, core, tower } = drawMap(this);

    this.add.circle(tower.x, tower.y, 11, 0x2196f3);
    this.add.text(tower.x, tower.y - 28, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    const len = pathLength(path);
    const aligned = isAligned(path, core, tower, CELL);

    const lines = [
      '서울 디펜스 — 경로 검증 화면',
      `경로 총 길이 : ${Math.round(len)} px`,
      `장애물 셀 수 : ${cells.length} 칸`,
      `격자 정렬     : ${aligned ? '✅ 전부 셀 중심(40k+20)' : '❌ 경계에 걸린 좌표 있음'}`,
      `기본 적 완주 : speed 120 기준 ${(len / 120).toFixed(1)}초  (목표 25~30초)`,
      '',
      '?mock=1  → Mock 이벤트 모니터',
      '?debug=1 → 격자 진하게',
    ];
    this.add.text(20, 20, lines.join('\n'), {
      fontSize: '15px', color: '#f2f4f8', lineSpacing: 6,
      backgroundColor: 'rgba(0,0,0,0.45)', padding: { x: 12, y: 10 },
    });
  }
}

/* ══════════════════════════════════ Mock 이벤트 모니터 ══════════════════════════════════ */

class MockScene extends Phaser.Scene {
  constructor() { super('Mock'); }

  async create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    drawMap(this);

    // 조명 = 체력바. SeoulTowerLight가 cityDamaged/cityHealed를 알아서 구독한다
    const t = mapData.nseoulTower;
    this.light = new SeoulTowerLight(this, t.x, t.y, 13);
    this.add.text(t.x, t.y - 30, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    this.statusText = this.add.text(20, 20, '', {
      fontSize: '15px', color: '#f2f4f8', lineSpacing: 6,
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 12, y: 10 },
    });

    this.logText = this.add.text(20, H - 24, '', {
      fontSize: '12px', color: '#8a919e', lineSpacing: 3,
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);

    this.log = [];
    this.counts = {};
    this.st = null;

    const { GameCore } = await import('./MockGameCore.js');
    this.core = GameCore;

    // 모든 이벤트를 구독해서 로그로 흘린다 (조명 자체는 SeoulTowerLight가 알아서 반영)
    // 핸들러 참조를 보관했다가 shutdown 훅에서 off() — SeoulTowerLight와 동일한 패턴.
    // 안 하면 씬 재시작(디버그 S 키)마다 리스너가 쌓여 로그가 중복 표시된다.
    this.eventLogHandlers = Object.values(EV).map(name => {
      const handler = payload => this.onEvent(name, payload);
      EventBus.on(name, handler);
      return { name, handler };
    });
    this.events.once('shutdown', () => {
      this.eventLogHandlers.forEach(({ name, handler }) => EventBus.off(name, handler));
    });

    GameCore.__startMock();
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.refresh() });

    this.setupLightDebugKeys();
  }

  /**
   * 조명 검증용 디버그 키. ?mock=1(=이 씬 자체가 mock 전용)에서만 존재한다.
   * cityDamaged/cityHealed를 GameCore를 거치지 않고 EventBus에 직접 emit해서
   * SeoulTowerLight의 반응만 독립적으로 테스트한다.
   *
   *   1~4  해당 레벨로 강제   0  소등   B  2단계 하강(보스 시뮬)   R  1단계 회복
   *   S  씬 재시작(재시작 시 리스너 누수 여부 확인용)
   *   P  MockGameCore 시뮬레이션 일시정지/재개 — 배경 이벤트가 섞이면 위 키 테스트가
   *      헷갈리니 검증 중엔 꺼두는 걸 권장 (요청엔 없던 보조 키. 필요 없으면 지워도 됨)
   */
  setupLightDebugKeys() {
    this.debugLevel = 4;

    const jumpTo = (target) => {
      if (target === this.debugLevel) return;
      const isDamage = target < this.debugLevel;
      this.debugLevel = target;
      EventBus.emit(isDamage ? EV.cityDamaged : EV.cityHealed, { level: target });
    };

    const kb = this.input.keyboard;
    kb.on('keydown-ZERO', () => jumpTo(0));
    kb.on('keydown-ONE', () => jumpTo(1));
    kb.on('keydown-TWO', () => jumpTo(2));
    kb.on('keydown-THREE', () => jumpTo(3));
    kb.on('keydown-FOUR', () => jumpTo(4));
    kb.on('keydown-B', () => jumpTo(Math.max(0, this.debugLevel - 2)));
    kb.on('keydown-R', () => jumpTo(Math.min(4, this.debugLevel + 1)));
    kb.on('keydown-S', () => this.scene.restart());

    let paused = false;
    kb.on('keydown-P', () => {
      paused = !paused;
      this.core.setPaused(paused);
    });

    this.add.text(20, H - 100, '조명 디버그: 1~4 레벨 · 0 소등 · B 보스하강 · R 회복 · S 씬재시작 · P Mock일시정지', {
      fontSize: '12px', color: '#8a919e',
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);
  }

  onEvent(name, payload) {
    this.counts[name] = (this.counts[name] || 0) + 1;
    const brief = JSON.stringify(payload ?? {});
    this.log.unshift(`${name}  ${brief.length > 90 ? brief.slice(0, 90) + '…' : brief}`);
    if (this.log.length > 12) this.log.pop();
  }

  refresh() {
    const s = this.core.getState();
    const seen = Object.keys(this.counts).length;
    const total = Object.keys(EV).length;
    this.statusText.setText([
      'MockGameCore 모니터  (?mock=1)',
      `웨이브 ${s.wave} · ${s.season}   조명 ${s.cityLight}/4`,
      `골드 ${s.gold}   Lv.${s.level}  XP ${s.xp}/${s.xpToNext}`,
      `처치 ${s.kills}   해금 타워 ${s.unlockedTowers.length}/6`,
      `수신한 이벤트 종류 ${seen}/${total}`,
    ].join('\n'));
    this.logText.setText(this.log.join('\n'));
  }
}

/* ══════════════════════════════════ 부트 ══════════════════════════════════ */

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: COLOR.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: MOCK ? [MockScene] : [VerifyScene],
});
