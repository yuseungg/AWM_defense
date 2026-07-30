/**
 * PathSystem.js — 경로 위 이동 거리 ↔ 좌표/진행도 변환
 *
 * map.json의 paths[0]은 화면 밖 진입구에서 코어 쪽 끝점 방향으로 나열되어 있다.
 * 즉 이동 거리 d가 커질수록 코어에 가까워지므로 progress = d / totalLength로 바로 쓸 수 있다.
 *
 * paths가 배열의 배열인 이유(후반 분기 경로 확장 대비, CLAUDE.md §4)에 맞춰
 * 팩토리 함수로 만든다 — 지금은 paths[0] 하나만 인스턴스화해서 쓴다.
 */

import mapData from '../../data/map.json';

export function createPathSystem(waypoints) {
  const cumLength = [0];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    cumLength.push(cumLength[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalLength = cumLength[cumLength.length - 1];

  /** 경로를 따라 d(px)만큼 이동했을 때의 좌표. d는 [0, totalLength]로 클램프된다. */
  function getPointAtDistance(d) {
    const dist = Math.max(0, Math.min(d, totalLength));
    let i = 0;
    while (i < cumLength.length - 2 && cumLength[i + 1] < dist) i++;
    const segStart = cumLength[i];
    const segLen = cumLength[i + 1] - segStart;
    const t = segLen === 0 ? 0 : (dist - segStart) / segLen;
    const a = waypoints[i], b = waypoints[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** 0(진입구) ~ 1(코어 도착). First 타겟팅에서 값이 가장 큰 적을 고른다. */
  function getProgress(d) {
    return totalLength === 0 ? 1 : Math.max(0, Math.min(d / totalLength, 1));
  }

  return { waypoints, totalLength, getPointAtDistance, getProgress };
}

export const PathSystem = createPathSystem(mapData.paths[0]);

export default PathSystem;
