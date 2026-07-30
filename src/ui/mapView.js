/**
 * mapView.js — 지도 배경(격자 + 경로 띠 + 중심선 + 코어)을 그린다.
 * GameScene · VerifyScene · MockScene이 공유한다.
 *
 * ⚠️ collectPathCells는 경로 셀을 "그리기 용도"로만 근사 수집한다. A가
 *    GridSystem.js에 정식 경로 셀 판정(장애물 배치 유효성 검사용)을 만들면
 *    이 함수는 그쪽으로 교체한다 — 지금은 시각화 전용 임시 구현이다. (SYNC.md §2)
 */

import mapData from '../../data/map.json';
import { COLOR } from './UITheme.js';

export const W = 1280;
export const H = 720;
export const CELL = mapData.obstacleGrid.cell;

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

/** 경로를 따라 걸으며 지나가는 격자 셀을 수집한다 (중복 제거) */
export function collectPathCells(path, cell) {
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

/** 맵 배경을 그린다. { path, cells, core, tower }를 돌려준다. */
export function drawMap(scene) {
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
