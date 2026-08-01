/**
 * mapView.js — 지도 배경(격자 + 도로 + 차선 + 진행 방향 화살표 + 코어)을 그린다.
 * GameScene · VerifyScene · MockScene이 공유한다.
 *
 * ⚠️ collectPathCells는 경로 셀을 "그리기 용도"로만 근사 수집한다. A가
 *    GridSystem.js에 정식 경로 셀 판정(장애물 배치 유효성 검사용)을 만들면
 *    이 함수는 그쪽으로 교체한다 — 지금은 시각화 전용 임시 구현이다. (SYNC.md §2)
 *
 * ★ 컨셉이 "적이 서울 도로를 타고 온다"라서 경로를 실제 도로처럼 그린다 —
 *   중앙 점선 차선 + 진행 방향 화살표(양방향 도로가 아니라 방향 표시 목적).
 *   ROAD 상수는 UITheme.js에 있다.
 */

import mapData from '../../data/map.json';
import { COLOR, ROAD } from './UITheme.js';

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

  drawDashedCenterline(scene, path);
  drawDirectionArrows(scene, path);

  const core = mapData.core, tower = mapData.nseoulTower;
  scene.add.circle(core.x, core.y, 14, COLOR.ng).setStrokeStyle(2, 0xffffff, 0.7);
  scene.add.text(core.x, core.y - 30, '코어', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

  return { path, cells, core, tower };
}

/** 중앙 점선 차선 — 실선 대신 끊어 그려서 "도로" 느낌을 준다. 세그먼트별로 독립 계산해서 꺾이는 지점에서도 자연스럽다. */
function drawDashedCenterline(scene, path) {
  const g = scene.add.graphics();
  g.lineStyle(ROAD.laneWidth, ROAD.laneColor, ROAD.laneAlpha);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1) continue;
    const dx = (b.x - a.x) / segLen, dy = (b.y - a.y) / segLen;
    let d = 0;
    while (d < segLen) {
      const dashEnd = Math.min(d + ROAD.dashLen, segLen);
      g.lineBetween(a.x + dx * d, a.y + dy * d, a.x + dx * dashEnd, a.y + dy * dashEnd);
      d += ROAD.dashLen + ROAD.gapLen;
    }
  }
}

/** 진행 방향 화살표 — 양방향 차선 표시가 아니라 "적이 이쪽으로 온다"는 흐름을 보여주는 목적. */
function drawDirectionArrows(scene, path) {
  const g = scene.add.graphics();
  g.fillStyle(ROAD.arrowColor, ROAD.arrowAlpha);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1) continue;
    const dx = (b.x - a.x) / segLen, dy = (b.y - a.y) / segLen;
    const count = Math.floor(segLen / ROAD.arrowSpacing);
    for (let k = 1; k <= count; k++) {
      const d = k * ROAD.arrowSpacing;
      if (d >= segLen) break;
      drawArrow(g, a.x + dx * d, a.y + dy * d, dx, dy, ROAD.arrowSize);
    }
  }
}

/** (cx,cy)를 중심으로 (dx,dy) 방향을 가리키는 화살촉 삼각형 하나. */
function drawArrow(g, cx, cy, dx, dy, size) {
  const px = -dy, py = dx; // dx,dy에 수직인 방향(화살 밑변 폭 방향)
  const tipX = cx + dx * size, tipY = cy + dy * size;
  const backX = cx - dx * size * 0.6, backY = cy - dy * size * 0.6;
  g.fillTriangle(
    tipX, tipY,
    backX + px * size * 0.5, backY + py * size * 0.5,
    backX - px * size * 0.5, backY - py * size * 0.5,
  );
}
