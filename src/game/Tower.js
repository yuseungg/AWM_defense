/**
 * Tower.js — 타워 1개의 배치 상태 · First 타겟팅 · 발사 타이밍
 *
 * 실제 데미지 계산(CLAUDE.md §5-1)과 투사체 생성은 Combat.js/Projectile.js 몫이다.
 * 여기선 "쿨다운이 찼을 때 누구를 쏠지"만 판단해서 대상 Enemy(또는 null)를 돌려준다.
 *
 * 강화 레벨은 damage에만 적용된다(§5-1 공식이 tower.damage * levels[lv].statMul만 명시).
 * range·attackSpeed·aoeRadius는 레벨과 무관한 def 고정값이고, range만 오라 버프로 바뀐다.
 * damage에 statMul을 곱하는 건 Combat.js가 계산 시점에 def.levels[level].statMul을 읽어서 한다.
 *
 * 격자 점유(GridSystem.occupy/release)는 여기서 호출하지 않는다 — 타워·서포터·장애물을
 * 아우르는 전역 점유 상태 조율은 GameCore.js 몫이고, Tower는 자기 좌표만 안다.
 *
 * instanceIndex(§5-7 복제 시스템) — 같은 id로 이 인스턴스보다 먼저 지어진 개수(0부터).
 * 판매가 없어 나중에 재계산할 일이 없으므로 생성 시점에 고정한다. 강화 비용에만 영향을
 * 주고(upgradeCost), 스탯·레벨 진행 자체는 인스턴스마다 완전히 독립이다.
 */

import towersData from '../../data/towers.json';
import wavesData from '../../data/waves.json';
import GridSystem, { FOOTPRINT } from './GridSystem.js';
import EnemyPool from './EnemyPool.js';

export class Tower {
  constructor(towerId, instanceId, cellX, cellY, instanceIndex = 0) {
    this.id = towerId;
    this.instanceId = instanceId;
    this.def = towersData[towerId];
    this.instanceIndex = instanceIndex;

    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY, FOOTPRINT.tower);
    this.x = p.x;
    this.y = p.y;

    this.level = 0;
    this.rangeMul = 1;
    this.cooldownRemaining = 0;
  }

  relocate(cellX, cellY) {
    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY, FOOTPRINT.tower);
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

  /** 골드 차감은 Economy.js 몫. 성공 여부만 돌려준다. */
  upgrade() {
    if (!this.canUpgrade()) return false;
    this.level++;
    return true;
  }

  // ── 오라 버프 훅 (CLAUDE.md §5-2 recalculateBuffs 계약)
  // 전역 효과(퍼크·정책)는 Combat.js의 데미지 계산 시점에 반영되므로 여기선 다루지 않는다.
  resetToBase() {
    this.rangeMul = 1;
  }

  applyBuff(effect) {
    if (effect.type === 'auraRange') this.rangeMul += effect.value;
  }

  get effectiveRange() {
    return this.def.range * this.rangeMul;
  }

  /** First 타겟팅: 사거리 내 적 중 pathProgress가 가장 큰(코어에 가장 가까운) 적. */
  findTarget() {
    let best = null;
    let bestProgress = -1;
    for (const enemy of EnemyPool.getActive()) {
      if (!enemy.alive) continue;
      const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (dist > this.effectiveRange) continue;
      if (enemy.pathProgress > bestProgress) {
        bestProgress = enemy.pathProgress;
        best = enemy;
      }
    }
    return best;
  }

  /**
   * 쿨다운이 찼고 사거리 내 대상이 있으면 대상을 돌려주고 쿨다운을 리셋한다. 없으면 null.
   * EV.towerFired는 여기서 쏘지 않는다 — WaveManager.fireTower(tower, dt)가 이 update()의
   * 반환값(target)을 받는 그 자리에서 towerId까지 포함해 발행한다(SYNC.md §3 C8, CLAUDE.md
   * §6-1 문서화된 계약). 여기서 한 번 더 쏘면 같은 발사에 이벤트가 두 번 뜬다.
   */
  update(dt) {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    if (this.cooldownRemaining > 0) return null;

    const target = this.findTarget();
    if (!target) return null;

    this.cooldownRemaining = this.def.attackSpeed;
    return target;
  }
}

export default Tower;
