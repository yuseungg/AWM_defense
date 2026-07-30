/**
 * EnemyPool.js — Enemy 인스턴스 재사용 (CLAUDE.md §2: 매 프레임 new 금지)
 *
 * free(비활성) / active(활성) 두 배열로만 관리한다.
 * 죽거나(onDeath) 코어에 도달(onReachCore)한 적은 자동으로 free에 반환된다 —
 * spawn()에서 그때그때 이 훅을 걸어주므로 소비자가 release()를 직접 호출할 필요가 없다.
 *
 * WaveManager/Combat.js도 죽음·코어도달 자체에 반응해야 한다(보상 지급, cityDamaged
 * 발행 등). Enemy는 훅을 하나씩만 담을 수 있어서, EnemyPool이 개별 적의 훅을 감싸
 * "풀 전체 콜백 먼저 호출 → 그다음 회수" 순서로 만든다. 소비자는 setOnEnemyDeath /
 * setOnEnemyReachCore로 풀 전체에 콜백 하나씩만 등록하면 된다.
 */

import { Enemy } from './Enemy.js';

const DEFAULT_INITIAL_SIZE = 120; // 웨이브 40+ 구간 100기 동시 존재 대비 여유분

export function createEnemyPool(initialSize = DEFAULT_INITIAL_SIZE) {
  const free = [];
  const active = [];
  let onEnemyDeath = null;
  let onEnemyReachCore = null;

  for (let i = 0; i < initialSize; i++) free.push(new Enemy());

  function release(enemy) {
    const idx = active.indexOf(enemy);
    if (idx === -1) return; // 이미 회수됨(방어적 가드)
    active[idx] = active[active.length - 1];
    active.pop();
    free.push(enemy);
  }

  function spawn(def, id) {
    const enemy = free.pop() ?? new Enemy(); // 풀 고갈 시에만 확장
    enemy.spawn(def, id);
    enemy.onDeath = e => { onEnemyDeath?.(e); release(e); };
    enemy.onReachCore = e => { onEnemyReachCore?.(e); release(e); };
    active.push(enemy);
    return enemy;
  }

  return {
    spawn,

    /**
     * 활성 적 배열 참조를 그대로 반환한다(매 프레임 새 배열 생성 금지).
     * update 루프에서 이 배열을 순회하며 enemy.update(dt)를 부르면, 그 안에서
     * 스왑-팝 회수가 즉시 일어날 수 있다. 안전하려면 뒤에서 앞으로 순회한다:
     *   const list = pool.getActive();
     *   for (let i = list.length - 1; i >= 0; i--) list[i].update(dt);
     * 타겟팅처럼 읽기만 할 때는 순서 상관없다.
     */
    getActive: () => active,

    setOnEnemyDeath: cb => { onEnemyDeath = cb; },
    setOnEnemyReachCore: cb => { onEnemyReachCore = cb; },

    get activeCount() { return active.length; },
    get freeCount() { return free.length; },
  };
}

export const EnemyPool = createEnemyPool();

export default EnemyPool;
