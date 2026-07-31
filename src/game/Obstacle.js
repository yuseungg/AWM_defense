/**
 * Obstacle.js — 장애물 1개의 배치 상태 (경로 위 격자, Tower.js와 비슷한 뼈대)
 *
 * 발동(반경 내 적 탐색·effect 적용)은 여기서 하지 않는다 — 활성 적 목록(EnemyPool)이 필요한
 * 조율이라 WaveManager.js의 프레임 루프 몫이다. 여기선 "쿨다운 상태"와 "레벨에 맞는 효과치
 * 페이로드"만 갖고 있는다.
 *
 * obstacles.json의 stun/dot은 레벨 스케일 필드 이름이 다르다(duration vs dps) — dps는
 * Enemy.applyEffect가 기대하는 amount 키로 바꿔서 돌려준다.
 */

import obstaclesData from '../../data/obstacles.json';
import GridSystem from './GridSystem.js';

export class Obstacle {
  constructor(obstacleId, instanceId, cellX, cellY) {
    this.id = obstacleId;
    this.instanceId = instanceId;
    this.def = obstaclesData[obstacleId];

    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY);
    this.x = p.x;
    this.y = p.y;

    this.level = 0;
    this.cooldownRemaining = 0;
  }

  relocate(cellX, cellY) {
    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY);
    this.x = p.x;
    this.y = p.y;
  }

  get maxLevel() {
    return this.def.levels.length - 1;
  }

  canUpgrade() {
    return this.level < this.maxLevel;
  }

  upgradeCost() {
    if (!this.canUpgrade()) return null;
    return Math.round(this.def.upgradeBaseCost * this.def.levels[this.level + 1].costMul);
  }

  upgrade() {
    if (!this.canUpgrade()) return false;
    this.level++;
    return true;
  }

  /** Enemy.applyEffect()에 바로 넘길 수 있는 형태로 변환한 현재 레벨의 효과치. */
  get effectivePayload() {
    const lvl = this.def.levels[this.level];
    if (this.def.effect.type === 'stun') {
      return { type: 'stun', duration: lvl.duration };
    }
    if (this.def.effect.type === 'dot') {
      return { type: 'dot', amount: lvl.dps, duration: this.def.effect.duration };
    }
    return this.def.effect;
  }
}

export default Obstacle;
