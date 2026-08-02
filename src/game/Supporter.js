/**
 * Supporter.js — 서포터 건물 1개의 배치 상태 (Tower.js와 같은 뼈대, 타겟팅·발사는 없음)
 *
 * 효과치는 레벨로 스케일된다 — supports.json의 levels[lv].statMul을 effect.value에 곱한다.
 * (세운상가 +25%→+35%→+50% = 0.25 × 1.0/1.4/2.0, 서울시청도 동일한 방식)
 *
 * 오라 적용 자체(반경 내 타워 찾기·Tower.applyBuff 호출)는 여기서 하지 않는다 — 전체 타워·
 * 서포터를 다 알아야 하는 조율이라 WaveManager.recalculateBuffs()(§5-2) 몫이다.
 *
 * instanceIndex(§5-7 복제 시스템) — Tower.js와 동일한 용도(강화 비용 배율).
 */

import supportsData from '../../data/supports.json';
import wavesData from '../../data/waves.json';
import GridSystem, { FOOTPRINT } from './GridSystem.js';

export class Supporter {
  constructor(supportId, instanceId, cellX, cellY, instanceIndex = 0) {
    this.id = supportId;
    this.instanceId = instanceId;
    this.def = supportsData[supportId];
    this.instanceIndex = instanceIndex;

    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY, FOOTPRINT.support);
    this.x = p.x;
    this.y = p.y;

    this.level = 0;
  }

  relocate(cellX, cellY) {
    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY, FOOTPRINT.support);
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
    const base = this.def.upgradeBaseCost * this.def.levels[this.level + 1].costMul;
    const perInstanceMul = wavesData.cloneScale?.upgradeCostMulPerInstance ?? 1;
    return Math.round(base * perInstanceMul ** this.instanceIndex);
  }

  upgrade() {
    if (!this.canUpgrade()) return false;
    this.level++;
    return true;
  }

  /** 현재 레벨로 스케일된 실제 효과치 (예: 세운상가 0.25 → 0.35 → 0.5) */
  get effectiveValue() {
    return this.def.effect.value * this.def.levels[this.level].statMul;
  }
}

export default Supporter;
