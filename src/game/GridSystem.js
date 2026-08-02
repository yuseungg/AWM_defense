/**
 * GridSystem.js — 격자 좌표 변환 · 경로 위 판정 · 셀 점유 추적
 *
 * towerGrid.cell === obstacleGrid.cell(둘 다 40)이라 좌표계는 하나만 두고,
 * "경로 위 셀인가"로 용도(타워·서포터 / 장애물)를 구분한다(CLAUDE.md §5-3).
 * 유효성 검사는 "그 셀이 비었나?" 불린 하나 — 나머지(유니크·해금·골드)는 GameCore 몫이다.
 *
 * 타워·서포터는 2×2(4칸), 장애물은 1×1을 유지한다 — 경로 폭이 1칸짜리라 장애물이 커지면
 * 대부분 자리에서 canPlace가 항상 실패하고, §5-3의 "한 칸 1개"(무한 스턴 방지) 규칙과도
 * 충돌한다. FOOTPRINT를 A(/src/game)·UI(/src/ui,/src/fx) 양쪽이 같이 import해서 쓴다 —
 * 크기 숫자를 여기 한 곳에만 둔다.
 */

import mapData from '../../data/map.json';

export const FOOTPRINT = { tower: 2, support: 2, obstacle: 1 };

// map.json엔 화면 크기 필드가 없다 — mapView.js/main.js가 이미 1280×720을 각자 상수로
// 갖고 있는 것과 같은 방식으로 둔다(이 프로젝트의 기존 관례). 2×2부터는 앵커가 격자 끝이면
// 나머지 칸이 화면 밖으로 나갈 수 있어서 경계 체크가 필요해졌다(1×1일 땐 필요 없었음).
const MAP_W = 1280;
const MAP_H = 720;

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

  /** size = FOOTPRINT[kind](기본 1). 앵커 셀(좌상단) 기준 size×size 블록의 중심 픽셀. */
  function toPixel(cellX, cellY, size = 1) {
    return { x: cellX * cell + (cell * size) / 2, y: cellY * cell + (cell * size) / 2 };
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

  /** 앵커(좌상단) 기준 kind의 footprint가 덮는 모든 셀 좌표를 나열한다. */
  function footprintCells(kind, cellX, cellY) {
    const size = FOOTPRINT[kind] ?? 1;
    const cells = [];
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        cells.push({ cellX: cellX + dx, cellY: cellY + dy });
      }
    }
    return cells;
  }

  function occupy(cellX, cellY, occupant, kind) {
    for (const c of footprintCells(kind, cellX, cellY)) {
      occupancy.set(key(c.cellX, c.cellY), occupant);
    }
  }

  function release(cellX, cellY, kind) {
    for (const c of footprintCells(kind, cellX, cellY)) {
      occupancy.delete(key(c.cellX, c.cellY));
    }
  }

  /**
   * kind: 'tower' | 'support' → 경로 밖 빈 셀만 / 'obstacle' → 경로 위 빈 셀만. footprint 전 칸을 검사한다.
   * excludeInstanceId: 재배치 검사용 — 그 칸의 점유자가 바로 "옮기는 자기 자신"이면 점유로 안 친다.
   * (release 먼저 하고 검사하면 되지 않냐 할 수 있지만, 실패했을 때 release만 되고 occupy가 안 된 채
   * 남는 경우를 막으려면 "검사 → 성공 시에만 release+occupy" 순서가 안전하다 — 그래서 검사 쪽에서 제외한다)
   */
  function canPlace(kind, cellX, cellY, excludeInstanceId) {
    for (const c of footprintCells(kind, cellX, cellY)) {
      if (c.cellX < 0 || c.cellY < 0 || c.cellX * cell >= MAP_W || c.cellY * cell >= MAP_H) {
        return { ok: false, reason: 'outOfBounds' };
      }
      const onPath = isPathCell(c.cellX, c.cellY);
      if (kind === 'obstacle') {
        if (!onPath) return { ok: false, reason: 'notOnPath' };
      } else if (onPath) {
        return { ok: false, reason: 'onPath' };
      }
      if (isOccupied(c.cellX, c.cellY)) {
        const occupant = getOccupant(c.cellX, c.cellY);
        if (!excludeInstanceId || occupant?.instanceId !== excludeInstanceId) {
          return { ok: false, reason: 'occupied' };
        }
      }
    }
    return { ok: true };
  }

  return {
    cell, toCell, toPixel, isPathCell,
    isOccupied, getOccupant, occupy, release,
    canPlace, footprintCells,
  };
}

export const GridSystem = createGridSystem(mapData);

export default GridSystem;
