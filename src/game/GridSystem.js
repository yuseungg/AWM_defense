/**
 * GridSystem.js — 격자 좌표 변환 · 경로 위 판정 · 셀 점유 추적
 *
 * towerGrid.cell === obstacleGrid.cell(둘 다 40)이라 좌표계는 하나만 두고,
 * "경로 위 셀인가"로 용도(타워·서포터 / 장애물)를 구분한다(CLAUDE.md §5-3).
 * 유효성 검사는 "그 셀이 비었나?" 불린 하나 — 나머지(유니크·해금·골드)는 GameCore 몫이다.
 */

import mapData from '../../data/map.json';

function key(cellX, cellY) {
  return `${cellX},${cellY}`;
}

/** 경로를 따라 걸으며 지나가는 격자 셀을 수집한다(중복 제거). main.js와 동일한 샘플링 방식. */
function collectPathCells(path, cell) {
  const seen = new Set();
  const step = cell / 4; // 셀을 건너뛰지 않도록 촘촘히 샘플링
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * (k / n);
      const y = a.y + (b.y - a.y) * (k / n);
      seen.add(key(Math.floor(x / cell), Math.floor(y / cell)));
    }
  }
  return seen;
}

export function createGridSystem(map) {
  const cell = map.obstacleGrid.cell;
  const pathCells = collectPathCells(map.paths[0], cell);
  const occupancy = new Map();

  function toCell(px, py) {
    return { cellX: Math.floor(px / cell), cellY: Math.floor(py / cell) };
  }

  function toPixel(cellX, cellY) {
    return { x: cellX * cell + cell / 2, y: cellY * cell + cell / 2 };
  }

  function isPathCell(cellX, cellY) {
    return pathCells.has(key(cellX, cellY));
  }

  function isOccupied(cellX, cellY) {
    return occupancy.has(key(cellX, cellY));
  }

  function getOccupant(cellX, cellY) {
    return occupancy.get(key(cellX, cellY)) ?? null;
  }

  function occupy(cellX, cellY, occupant) {
    occupancy.set(key(cellX, cellY), occupant);
  }

  function release(cellX, cellY) {
    occupancy.delete(key(cellX, cellY));
  }

  /** kind: 'tower' | 'support' → 경로 밖 빈 셀만 / 'obstacle' → 경로 위 빈 셀만 */
  function canPlace(kind, cellX, cellY) {
    const onPath = isPathCell(cellX, cellY);
    if (kind === 'obstacle') {
      if (!onPath) return { ok: false, reason: 'notOnPath' };
    } else if (onPath) {
      return { ok: false, reason: 'onPath' };
    }
    if (isOccupied(cellX, cellY)) return { ok: false, reason: 'occupied' };
    return { ok: true };
  }

  return {
    cell, toCell, toPixel, isPathCell,
    isOccupied, getOccupant, occupy, release,
    canPlace,
  };
}

export const GridSystem = createGridSystem(mapData);

export default GridSystem;
