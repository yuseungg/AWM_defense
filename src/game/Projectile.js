/**
 * Projectile.js — 투사체 이동·명중 판정 (오브젝트 풀링, EnemyPool과 동일 패턴)
 *
 * 데미지 계산·상성·크리티컬·상태이상 적용은 Combat.js 몫이다. 여기선 "어디서 출발해
 * 어디로 날아가 누구에게 닿았는지"만 계산해서 onHit 콜백으로 알려준다.
 *
 * towers.json엔 투사체 이동속도 필드가 없어서 고정 상수 하나로 둔다 — 밸런스 수치라기보단
 * 타격감 성격이라 판단했다. 타워별로 다르게 하려면 나중에 towers.json에 필드 추가를 합의한다.
 */

import EnemyPool from './EnemyPool.js';

const PROJECTILE_SPEED_PX_S = 900;
const DEFAULT_INITIAL_SIZE = 60; // 웨이브 40+ 구간 다중 타워 동시 발사 대비 여유분

class Projectile {
  constructor() {
    this.active = false;
    this.onHit = null;
  }

  /**
   * target(살아있는 Enemy)을 주면 호밍, x/y(고정 좌표)를 주면 그 지점으로 직진한다.
   * aoeRadius > 0이면 광역, 0이면 단일 타겟으로 명중 판정한다.
   */
  reset({ originX, originY, target, x, y, aoeRadius = 0, projectileType }) {
    this.active = true;
    this.x = originX;
    this.y = originY;
    this.aoeRadius = aoeRadius;
    this.projectileType = projectileType;

    if (target) {
      this.target = target;
      this.targetId = target.id;
      this.destX = target.x;
      this.destY = target.y;
    } else {
      this.target = null;
      this.targetId = null;
      this.destX = x;
      this.destY = y;
    }

    this.onHit = null; // 풀이 launch() 직후 걸어준다
  }

  /**
   * 호밍 타겟이 죽으면 EnemyPool이 그 인스턴스를 즉시 재활용할 수 있다.
   * target.id가 스폰 당시 targetId와 같고 target.alive일 때만 좌표를 갱신해서,
   * 재활용된 엉뚱한 다른 적을 쫓아가지 않게 막는다. 조건이 깨지면 마지막으로
   * 확인한 좌표를 향해 그대로 직진해서 그 자리에서 명중 판정한다.
   */
  update(dt) {
    if (!this.active) return;

    if (this.target && this.target.id === this.targetId && this.target.alive) {
      this.destX = this.target.x;
      this.destY = this.target.y;
    }

    const dx = this.destX - this.x;
    const dy = this.destY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = PROJECTILE_SPEED_PX_S * dt;

    if (step >= dist) {
      this.x = this.destX;
      this.y = this.destY;
      this._resolveHit();
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  _resolveHit() {
    this.active = false;

    let hits;
    if (this.aoeRadius > 0) {
      hits = EnemyPool.getActive().filter(
        e => e.alive && Math.hypot(e.x - this.x, e.y - this.y) <= this.aoeRadius
      );
    } else {
      const stillValid = this.target && this.target.id === this.targetId && this.target.alive;
      hits = stillValid ? [this.target] : [];
    }

    this.onHit?.({ x: this.x, y: this.y, hits, projectileType: this.projectileType });
  }
}

export function createProjectilePool(initialSize = DEFAULT_INITIAL_SIZE) {
  const free = [];
  const active = [];

  for (let i = 0; i < initialSize; i++) free.push(new Projectile());

  function release(p) {
    const idx = active.indexOf(p);
    if (idx === -1) return; // 이미 회수됨(방어적 가드)
    active[idx] = active[active.length - 1];
    active.pop();
    free.push(p);
  }

  function launch(opts) {
    const p = free.pop() ?? new Projectile(); // 풀 고갈 시에만 확장
    p.reset(opts);
    p.onHit = payload => { opts.onHit?.(payload); release(p); };
    active.push(p);
    return p;
  }

  return {
    launch,

    /**
     * 활성 투사체 배열 참조를 그대로 반환한다(매 프레임 새 배열 생성 금지).
     * 명중한 투사체는 즉시 이 배열에서 스왑-팝으로 빠지므로, EnemyPool.getActive()와
     * 동일하게 반드시 뒤에서 앞으로 순회한다:
     *   const list = pool.getActive();
     *   for (let i = list.length - 1; i >= 0; i--) list[i].update(dt);
     */
    getActive: () => active,

    get activeCount() { return active.length; },
    get freeCount() { return free.length; },
  };
}

export const ProjectilePool = createProjectilePool();

export default ProjectilePool;
