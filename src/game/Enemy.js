/**
 * Enemy.js — 적 1마리의 상태 컨테이너
 *
 * 풀링 대상(EnemyPool.js)이라 constructor()는 빈 뼈대만 두고,
 * 실제 초기화는 spawn()에서 한다 — 매 스폰마다 new 하지 않기 위해서다(CLAUDE.md §2).
 *
 * 이벤트 발행(enemyKilled·cityDamaged 등)은 여기서 하지 않는다.
 * onReachCore/onDeath 훅만 노출하고, 실제 발행 책임은 WaveManager/Combat.js가 진다.
 */

import PathSystem from './PathSystem.js';

export class Enemy {
  constructor() {
    this.alive = false;
    this.reachedCore = false;
    this.onReachCore = null;
    this.onDeath = null;
  }

  /** 풀에서 꺼낼 때 호출. enemies.json의 한 항목(dust/car/trash/boss)을 그대로 받는다. */
  spawn(def, id) {
    this.id = id;
    this.type = def.id;
    this.maxHp = def.baseHp;
    this.hp = def.baseHp;
    this.armor = def.armor;
    this.speed = def.speed;
    this.pierceDamage = def.pierceDamage;
    this.reward = def.reward;
    this.xp = def.xp;

    this.distance = 0;
    const start = PathSystem.getPointAtDistance(0);
    this.x = start.x;
    this.y = start.y;
    this.pathProgress = 0;

    this.stunRemaining = 0;
    this.slowRemaining = 0;
    this.slowAmount = 0;
    this.dotRemaining = 0;
    this.dotDps = 0;

    this.alive = true;
    this.reachedCore = false;
    this.onReachCore = null;
    this.onDeath = null;
  }

  /**
   * 상태이상 적용. towers.json/obstacles.json의 effects 항목({type, amount, duration})을
   * 그대로 받는 공통 진입점 — 타워/장애물마다 별도 메서드를 두지 않는다.
   * 남은 시간이 더 긴 기존 효과를 짧은 새 효과가 덮어쓰지 않도록 Math.max로 갱신한다.
   */
  applyEffect(effect) {
    if (!effect) return;
    switch (effect.type) {
      case 'stun':
        this.stunRemaining = Math.max(this.stunRemaining, effect.duration);
        break;
      case 'slow':
        this.slowRemaining = Math.max(this.slowRemaining, effect.duration);
        this.slowAmount = Math.max(this.slowAmount, effect.amount);
        break;
      case 'dot':
        this.dotRemaining = Math.max(this.dotRemaining, effect.duration);
        this.dotDps = Math.max(this.dotDps, effect.amount);
        break;
    }
  }

  /** Combat.js가 데미지 공식(CLAUDE.md §5-1) 계산을 끝낸 최종값만 넘긴다. */
  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath?.(this);
    }
  }

  update(dt) {
    if (!this.alive) return;

    if (this.stunRemaining > 0) this.stunRemaining = Math.max(0, this.stunRemaining - dt);

    if (this.slowRemaining > 0) {
      this.slowRemaining = Math.max(0, this.slowRemaining - dt);
      if (this.slowRemaining === 0) this.slowAmount = 0;
    }

    if (this.dotRemaining > 0) {
      this.dotRemaining = Math.max(0, this.dotRemaining - dt);
      this.takeDamage(this.dotDps * dt);
      if (this.dotRemaining === 0) this.dotDps = 0;
      if (!this.alive) return;
    }

    if (this.stunRemaining <= 0) {
      const speedMul = this.slowRemaining > 0 ? 1 - this.slowAmount : 1;
      this.distance += this.speed * speedMul * dt;
    }

    const p = PathSystem.getPointAtDistance(this.distance);
    this.x = p.x;
    this.y = p.y;
    this.pathProgress = PathSystem.getProgress(this.distance);

    if (!this.reachedCore && this.pathProgress >= 1) {
      this.reachedCore = true;
      this.onReachCore?.(this);
    }
  }
}

export default Enemy;
