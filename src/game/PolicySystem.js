/**
 * PolicySystem.js — 보스 정책 5종 활성 관리 (GAME_DESIGN §10, CLAUDE.md §4 policies.json)
 *
 * 정책마다 effect.target이 다른데(특정 종/타워 id, 또는 "all") 타입별 함수를 따로 안 만들고
 * getMul/getSum 두 개로 통일한다 — target === 'all'을 와일드카드로 취급해서, 어디서 조회하든
 * (특정 대상이든 전역이든) 같은 함수로 처리된다.
 *
 * duration은 waves 단위(-1=영구). onWaveCleared()가 WaveManager의 웨이브 클리어마다
 * 호출돼서 임시 정책을 감소·만료시킨다.
 */

import policiesData from '../../data/policies.json';

export function createPolicySystem() {
  const active = new Map(); // policyId -> remainingWaves(-1=영구)

  function pickPolicy(id) {
    const def = policiesData[id];
    if (!def) return;
    active.set(id, def.effect.duration);
  }

  function isActive(id) {
    return active.has(id);
  }

  /** 임시 정책의 남은 웨이브를 깎고, 0이 되면 제거한다. 영구(-1)는 건드리지 않는다. */
  function onWaveCleared() {
    for (const [id, remaining] of active) {
      if (remaining === -1) continue;
      const next = remaining - 1;
      if (next <= 0) active.delete(id);
      else active.set(id, next);
    }
  }

  function activeEffects() {
    return [...active.keys()].map(id => policiesData[id].effect);
  }

  /** 배수형 정책 조회(enemySpawnMul/enemyHpMul/towerRangeMul/slowEffectMul). 없으면 1. */
  function getMul(type, target) {
    return activeEffects()
      .filter(e => e.type === type && (e.target === target || e.target === 'all'))
      .reduce((acc, e) => acc * e.value, 1);
  }

  /** 가산형 정책 조회(goldPerWave). 없으면 0. */
  function getSum(type, target) {
    return activeEffects()
      .filter(e => e.type === type && (e.target === target || e.target === 'all'))
      .reduce((acc, e) => acc + e.value, 0);
  }

  function getActivePolicies() {
    return [...active.entries()].map(([id, remainingWaves]) => ({ id, remainingWaves }));
  }

  return { pickPolicy, isActive, onWaveCleared, getMul, getSum, getActivePolicies };
}

export const PolicySystem = createPolicySystem();

export default PolicySystem;
