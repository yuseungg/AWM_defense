/**
 * VerifyScene.js — 경로 검증 화면 (?verify=1)
 *
 * 지도 그림이 아니라 자동 검사가 본체다: 경로 총 길이 · 격자 정렬(40k+20) · 완주 시간.
 * D16(경로 685→3,300px 재조정)처럼 B 부재 중 A가 map.json/enemies.json speed를
 * 튜닝할 때 유일한 회귀 검증 화면이라 삭제하지 않는다.
 */

import Phaser from 'phaser';
import { COLOR } from './UITheme.js';
import { drawMap } from './mapView.js';

const CELL = 40;

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

export class VerifyScene extends Phaser.Scene {
  constructor() { super('Verify'); }

  create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    const { path, cells, core, tower } = drawMap(this);

    this.add.circle(tower.x, tower.y, 11, 0x2196f3);
    this.add.text(tower.x, tower.y - 28, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    const len = pathLength(path);
    const aligned = isAligned(path, core, tower, CELL);

    const lines = [
      '서울 디펜스 — 경로 검증 화면 (?verify=1)',
      `경로 총 길이 : ${Math.round(len)} px`,
      `장애물 셀 수 : ${cells.length} 칸`,
      `격자 정렬     : ${aligned ? '✅ 전부 셀 중심(40k+20)' : '❌ 경계에 걸린 좌표 있음'}`,
      `기본 적 완주 : speed 120 기준 ${(len / 120).toFixed(1)}초  (목표 25~30초)`,
    ];
    this.add.text(20, 20, lines.join('\n'), {
      fontSize: '15px', color: '#f2f4f8', lineSpacing: 6,
      backgroundColor: 'rgba(0,0,0,0.45)', padding: { x: 12, y: 10 },
    });
  }
}
