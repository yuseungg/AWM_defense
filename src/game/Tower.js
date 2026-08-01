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
 */

import towersData from '../../data/towers.json';
import GridSystem from './GridSystem.js';
import EnemyPool from './EnemyPool.js';

export class Tower {
  constructor(towerId, instanceId, cellX, cellY) {
    this.id = towerId;
    this.instanceId = instanceId;
    this.def = towersData[towerId];

    this.cellX = cellX;
    this.cellY = cellY;
    const p = GridSystem.toPixel(cellX, cellY);
    this.x = p.x;
    this.y = p.y;

    this.level = 0;
    this.rangeMul = 1;
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

  /** 쿨다운이 찼고 사거리 내 대상이 있으면 대상을 돌려주고 쿨다운을 리셋한다. 없으면 null. */
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
