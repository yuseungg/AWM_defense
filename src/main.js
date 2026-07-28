/**
 * main.js — Phaser 부트 + 경로 검증 화면
 *
 * ⚠️ 이 파일은 CLAUDE.md §3상 【공용】이다. 구조를 바꿀 때는 SYNC.md §3에 올린다.
 *
 * 지금 단계의 목적은 게임이 아니다. 두 가지를 **눈으로 확인**하는 것이다.
 *   1) 배포 파이프라인이 살아 있는가 (하얀 화면이 아닌가)
 *   2) map.json 좌표가 격자에 정확히 앉는가 (경로 띠가 1칸 두께로 나오는가)
 *
 * 경로 띠가 2칸 두께로 보이면 좌표가 셀 경계에 걸린 것이다 → CLAUDE.md §4 좌표 규칙 위반.
 */

import Phaser from 'phaser';
import mapData from '../data/map.json';
import { COLOR } from './ui/UITheme.js';

const W = 1280;
const H = 720;

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    const path = mapData.paths[0];
    const cell = mapData.obstacleGrid.cell;

    this.cameras.main.setBackgroundColor(COLOR.bg);

    // ── 1. 경로 밖 슬롯 격자 (타워·서포터가 앉을 자리)
    const grid = this.add.graphics();
    grid.lineStyle(1, COLOR.slot, DEBUG ? 0.9 : 0.35);
    for (let x = 0; x <= W; x += cell) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += cell) grid.lineBetween(0, y, W, y);

    // ── 2. 경로 위 격자 (장애물이 앉을 자리) — 정렬 검증의 핵심
    const pathCells = collectPathCells(path, cell);
    const cellGfx = this.add.graphics();
    cellGfx.fillStyle(COLOR.path, 1);
    pathCells.forEach(([cx, cy]) => {
      cellGfx.fillRect(cx * cell, cy * cell, cell, cell);
    });

    // ── 3. 경로 중심선
    const line = this.add.graphics();
    line.lineStyle(3, COLOR.accent, 0.9);
    line.beginPath();
    line.moveTo(path[0].x, path[0].y);
    path.slice(1).forEach(p => line.lineTo(p.x, p.y));
    line.strokePath();

    // ── 4. 코어 · N서울타워
    const core = mapData.core;
    const tower = mapData.nseoulTower;
    this.add.circle(core.x, core.y, 14, COLOR.ng).setStrokeStyle(2, 0xffffff, 0.7);
    this.add.text(core.x, core.y - 30, '코어', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);
    this.add.circle(tower.x, tower.y, 11, 0x2196f3);
    this.add.text(tower.x, tower.y - 28, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    // ── 5. 검증 수치 표시
    const len = pathLength(path);
    const rows = new Set(pathCells.map(([, cy]) => cy)).size;
    const aligned = isAligned(path, core, tower, cell);

    const lines = [
      '서울 디펜스 — 경로 검증 화면',
      `경로 총 길이 : ${Math.round(len)} px`,
      `장애물 셀 수 : ${pathCells.length} 칸`,
      `격자 정렬     : ${aligned ? '✅ 전부 셀 중심(40k+20)' : '❌ 경계에 걸린 좌표 있음'}`,
      `기본 적 완주 : speed 120 기준 ${(len / 120).toFixed(1)}초  (목표 25~30초)`,
      '',
      DEBUG ? '?debug=1 ON' : '?debug=1 을 붙이면 격자가 진해진다',
    ];
    this.add.text(20, 20, lines.join('\n'), {
      fontSize: '15px', color: '#f2f4f8', lineSpacing: 6,
      backgroundColor: 'rgba(0,0,0,0.45)', padding: { x: 12, y: 10 },
    });

    if (DEBUG) console.log('[map] cells=', pathCells.length, 'rows=', rows, 'len=', len);
  }
}

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
      if (cx < 0 || cy < 0 || cx * cell >= 1280 || cy * cell >= 720) continue;
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

/** 모든 좌표가 40k+20(셀 중심)인지 검사. 단 경로 시작점의 x는 화면 밖 진입구라 예외 */
function isAligned(path, core, tower, cell) {
  const ok = v => ((v % cell) + cell) % cell === cell / 2;
  const pts = [...path.slice(1), core, tower];
  const startYOk = ok(path[0].y);
  return startYOk && pts.every(p => ok(p.x) && ok(p.y));
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: COLOR.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
});
