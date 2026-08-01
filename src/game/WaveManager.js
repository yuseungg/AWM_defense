/**
 * WaveManager.js — 웨이브 스폰·전투 루프·조명 체력·웨이브 생명주기 (P1 코어 루프의 중심)
 *
 * 지금까지 만든 부품(EnemyPool·Tower·Projectile·Combat·Economy)을 실제로 묶어 돌리는 곳.
 * GameCore.js(P2)가 아직 없어서 타워 레지스트리도 여기서 자체 소유한다(EnemyPool/ProjectilePool과
 * 같은 "active 배열을 스스로 갖는다" 패턴).
 *
 * 웨이브는 겹치지 않는다: "즉시 웨이브"는 현재 웨이브가 다 정리된 뒤의 대기시간(prep phase)을
 * 건너뛰는 것이지, 진행 중인 웨이브에 끼어드는 게 아니다(MockGameCore.js의 isPrepPhase와 동일 모델).
 *
 * getLevel/perksProvider는 LevelSystem/PerkSystem이 생겼으니 기본 싱글턴 생성 시 바로 연결한다.
 * 그래도 인자 자체는 계속 선택적으로 남겨둔다(단위 테스트 등에서 다른 값을 주입할 수 있게).
 */

import wavesData from '../../data/waves.json';
import enemiesData from '../../data/enemies.json';
import policiesData from '../../data/policies.json';
import { EventBus, EV } from '../EventBus.js';
import EnemyPool from './EnemyPool.js';
import ProjectilePool from './Projectile.js';
import applyHits from './Combat.js';
import Economy from './Economy.js';
import LevelSystem from './LevelSystem.js';
import PerkSystem from './PerkSystem.js';
import PolicySystem from './PolicySystem.js';
import GridSystem from './GridSystem.js';

const ENEMY_TYPES = ['dust', 'car', 'trash'];
const SEASON_CYCLE_LENGTH = 40; // seasons 배열이 덮는 웨이브 범위(1~40)
const OBSTACLE_HIT_RADIUS = GridSystem.cell / 2;

export function createWaveManager({ perksProvider, getLevel } = {}) {
  const getPerks = perksProvider ?? (() => ({ globalDamage: 0, globalCrit: 0, globalPierce: 0 }));
  const readLevel = getLevel ?? (() => 1);

  const towers = [];
  const supports = [];
  const obstacles = [];
  let enemySeq = 0;

  const state = {
    cityLight: 4,
    wave: 0,
    season: null,
    kills: 0,
    bestWave: Number(localStorage.getItem('bestWave') || 0),
    isPrepPhase: true,
    paused: false,
    speedMul: 1,
    gameOver: false,
  };

  let prepTimer = wavesData.spawn.prepSeconds;
  let spawnQueue = []; // [{ t, type, def, isBoss? }] — t = 웨이브 시작 후 경과초
  let elapsedInWave = 0;
  let waveRecord = { total: 0, resolved: 0, hadLeak: false };
  let currentBoss = null;
  let invincible = false; // Debug.js(H) 전용

  EnemyPool.setOnEnemyDeath(onEnemyDeath);
  EnemyPool.setOnEnemyReachCore(onEnemyReachCore);

  // ── 타워·서포터·장애물 레지스트리
  function addTower(tower) { towers.push(tower); }
  function removeTower(tower) {
    const idx = towers.indexOf(tower);
    if (idx !== -1) towers.splice(idx, 1);
  }
  function getTowers() { return towers; }

  function addSupport(support) { supports.push(support); }
  function removeSupport(support) {
    const idx = supports.indexOf(support);
    if (idx !== -1) supports.splice(idx, 1);
  }
  function getSupports() { return supports; }

  function addObstacle(obstacle) { obstacles.push(obstacle); }
  function removeObstacle(obstacle) {
    const idx = obstacles.indexOf(obstacle);
    if (idx !== -1) obstacles.splice(idx, 1);
  }
  function getObstacles() { return obstacles; }

  /**
   * 오라 재계산 (CLAUDE.md §5-2, 이벤트 기반 — 매 프레임 거리 계산 금지).
   * 호출 시점: 타워/서포터 건설·재배치·강화(GameCore가 호출).
   */
  function recalculateBuffs() {
    towers.forEach(t => t.resetToBase());

    supports
      .filter(s => s.def.effect.type.startsWith('aura'))
      .forEach(support => {
        towers
          .filter(t => Math.hypot(t.x - support.x, t.y - support.y) <= support.def.effect.radius)
          .forEach(t => t.applyBuff({ type: support.def.effect.type, value: support.effectiveValue }));
      });

    applyGlobalEffects();
    EventBus.emit(EV.buffsRecalculated, { towerStats: towers });
  }

  /** 퍼크는 Combat.js가 매 히트 PerkSystem.get()을 직접 읽어서 캐싱이 필요 없다. */
  function applyGlobalEffects() {
    const cityHall = supports.find(s => s.def.effect.type === 'globalGold');
    Economy.setGoldMul(cityHall ? 1 + cityHall.effectiveValue : 1);

    // 도심 녹지(towerRangeMul)는 "반경 무제한 오라"와 수학적으로 같아서 기존 applyBuff를 재사용한다.
    const rangeMul = PolicySystem.getMul('towerRangeMul', 'all');
    if (rangeMul !== 1) towers.forEach(t => t.applyBuff({ type: 'auraRange', value: rangeMul - 1 }));
  }

  // ── 계절 결정. wave>40이면 seasonLoopFrom 기준 40주기로 순환(난이도 스케일은 원래 wave로 계속 오름)
  function resolveSeason(wave) {
    let w = wave;
    if (w >= wavesData.seasonLoopFrom) {
      w = ((wave - wavesData.seasonLoopFrom) % SEASON_CYCLE_LENGTH) + 1;
    }
    return wavesData.seasons.find(s => w >= s.from && w <= s.to) ?? wavesData.seasons[0];
  }

  // ── 웨이브 구성: 계절 믹스 + hp/수량 스케일링 + 보스 여부 → 스폰 큐
  function composeWave(n) {
    const season = resolveSeason(n);
    const extra = Math.floor(n / wavesData.countScalePerWaves);
    const hpMul = Math.pow(wavesData.hpScale, n - 1);

    // 웨이브 총 스폰 수 풀: 타입별 spawnCount 범위를 전부 합쳐 하나의 총량으로 쓰고,
    // mix 비율로 타입에 배분한다(mix=0 → 자연히 0마리, 게이트 없이 산수로 해결).
    const totalMin = ENEMY_TYPES.reduce((s, t) => s + enemiesData[t].spawnCount[0], 0);
    const totalMax = ENEMY_TYPES.reduce((s, t) => s + enemiesData[t].spawnCount[1], 0);
    const total = Math.floor(totalMin + Math.random() * (totalMax - totalMin + 1)) + extra;
    const mixSum = ENEMY_TYPES.reduce((s, t) => s + (season.mix[t] ?? 0), 0) || 1;

    const entries = [];
    ENEMY_TYPES.forEach(type => {
      const ratio = season.mix[type] ?? 0;
      const share = Math.round((total * ratio) / mixSum);
      const count = Math.round(share * PolicySystem.getMul('enemySpawnMul', type));
      if (count <= 0) return;

      const base = enemiesData[type];
      const interval = wavesData.spawn.intervalByType[type] ?? 0.3;
      const hpPolicyMul = PolicySystem.getMul('enemyHpMul', type);
      const scaledDef = { ...base, baseHp: Math.round(base.baseHp * hpMul * hpPolicyMul) };

      for (let i = 0; i < count; i++) entries.push({ t: i * interval, type, def: scaledDef });
    });

    if (n % wavesData.boss.everyWaves === 0) {
      const bossNo = n / wavesData.boss.everyWaves - 1;
      const bossHp = Math.round(wavesData.boss.baseHp * Math.pow(wavesData.boss.hpMulPerBoss, bossNo));
      const bossDef = { ...enemiesData.boss, baseHp: bossHp };
      // 미세먼지 러시 뒤에 보스가 등장하도록 맨 뒤에 배치(GAME_DESIGN §11 연출 의도)
      const lastT = entries.length ? Math.max(...entries.map(e => e.t)) : 0;
      entries.push({ t: lastT + 1, type: 'boss', def: bossDef, isBoss: true });
    }

    entries.sort((a, b) => a.t - b.t);
    return { season, entries };
  }

  function startWave(n) {
    const { season, entries } = composeWave(n);
    state.wave = n;
    state.isPrepPhase = false;
    spawnQueue = entries;
    elapsedInWave = 0;
    waveRecord = { total: entries.length, resolved: 0, hadLeak: false };
    currentBoss = null;

    if (season.name !== state.season) {
      state.season = season.name;
      EventBus.emit(EV.seasonChanged, { season: state.season });
    }
    EventBus.emit(EV.waveStarted, { wave: state.wave, season: state.season });
  }

  function dispatchDueSpawns() {
    while (spawnQueue.length && spawnQueue[0].t <= elapsedInWave) {
      const entry = spawnQueue.shift();
      const enemy = EnemyPool.spawn(entry.def, `e${++enemySeq}`);
      if (entry.isBoss) {
        currentBoss = enemy;
        EventBus.emit(EV.bossSpawned, { hp: enemy.hp, wave: state.wave });
      } else {
        EventBus.emit(EV.enemySpawned, { id: enemy.id, type: enemy.type, x: enemy.x, y: enemy.y });
      }
    }
  }

  // ── 프레임 루프
  function update(dt) {
    if (state.paused || state.gameOver) return;
    const scaledDt = dt * state.speedMul;

    if (state.isPrepPhase) {
      prepTimer -= scaledDt;
      if (prepTimer <= 0) startWave(state.wave + 1);
    } else {
      elapsedInWave += scaledDt;
      dispatchDueSpawns();
    }

    const enemies = EnemyPool.getActive();
    for (let i = enemies.length - 1; i >= 0; i--) enemies[i].update(scaledDt);

    updateObstacles(scaledDt, enemies);

    // 스폰/발사는 prep phase엔 멈추지만, 이미 날아가던 투사체는 계속 처리해서
    // 이전 웨이브의 유탄이 prep phase 내내 허공에 멈춰있지 않게 한다.
    if (!state.isPrepPhase) towers.forEach(tower => fireTower(tower, scaledDt));

    const projectiles = ProjectilePool.getActive();
    for (let i = projectiles.length - 1; i >= 0; i--) projectiles[i].update(scaledDt);
  }

  /**
   * 쿨다운이 찬 장애물마다 반경 내 "전부"의 적에게 효과를 적용한다(스웜 대응).
   * 반경(칸 절반)·쿨다운으로 이미 제한되므로 밸런스는 P4에서 obstacles.json 수치만 조정하면 된다.
   */
  function updateObstacles(dt, enemies) {
    obstacles.forEach(obstacle => {
      obstacle.cooldownRemaining = Math.max(0, obstacle.cooldownRemaining - dt);
      if (obstacle.cooldownRemaining > 0) return;

      const targets = enemies.filter(
        e => e.alive && Math.hypot(e.x - obstacle.x, e.y - obstacle.y) <= OBSTACLE_HIT_RADIUS
      );
      if (!targets.length) return;

      const payload = obstacle.effectivePayload;
      targets.forEach(enemy => {
        enemy.applyEffect(payload);
        EventBus.emit(EV.statusApplied, { enemyId: enemy.id, type: payload.type, duration: payload.duration });
      });

      obstacle.cooldownRemaining = obstacle.def.effect.cooldown;
      EventBus.emit(EV.obstacleTriggered, {
        instanceId: obstacle.instanceId, type: obstacle.id, x: obstacle.x, y: obstacle.y,
        cooldown: obstacle.def.effect.cooldown,
      });
    });
  }

  function fireTower(tower, dt) {
    const target = tower.update(dt);
    if (!target) return;

    ProjectilePool.launch({
      originX: tower.x,
      originY: tower.y,
      target,
      aoeRadius: tower.def.aoeRadius,
      projectileType: tower.def.projectileType,
      onHit: ({ hits }) => resolveHit(tower, hits),
    });
  }

  function resolveHit(tower, hits) {
    applyHits(tower, hits, getPerks());
    if (currentBoss && hits.includes(currentBoss)) {
      EventBus.emit(EV.bossHpChanged, { hp: currentBoss.hp, maxHp: currentBoss.maxHp });
    }
  }

  // ── EnemyPool 콜백: 죽음/코어도달
  function onEnemyDeath(enemy) {
    Economy.addKillReward(enemy);
    LevelSystem.addKillXp(enemy);
    state.kills++;
    EventBus.emit(EV.enemyKilled, {
      id: enemy.id, type: enemy.type, reward: enemy.reward, xp: enemy.xp, x: enemy.x, y: enemy.y,
    });
    waveRecord.resolved++;

    if (enemy === currentBoss) {
      EventBus.emit(EV.bossKilled, { policyCards: drawPolicies() });
      currentBoss = null;
    }

    checkWaveClear();
  }

  function onEnemyReachCore(enemy) {
    // pierceDamage가 몹/보스 조명 하강폭을 이미 데이터로 갖고 있다(enemies.json) — 여기선 그대로 씀
    damageCity(enemy.pierceDamage);
    waveRecord.hadLeak = true;
    waveRecord.resolved++;

    if (enemy === currentBoss) {
      EventBus.emit(EV.bossLeaked, { x: enemy.x, y: enemy.y });
      currentBoss = null;
    }

    checkWaveClear();
  }

  function damageCity(n) {
    if (state.gameOver) return;
    if (invincible) return; // 코어 도달 자체(웨이브 집계 등)는 그대로, 조명 차감만 억제
    state.cityLight = Math.max(0, state.cityLight - n);
    if (state.cityLight <= 0) {
      EventBus.emit(EV.cityDamaged, { level: 0 });
      triggerGameOver();
      return;
    }
    EventBus.emit(EV.cityDamaged, { level: state.cityLight });
  }

  function triggerGameOver() {
    state.gameOver = true;
    const isNewRecord = state.wave > state.bestWave;
    if (isNewRecord) {
      state.bestWave = state.wave;
      localStorage.setItem('bestWave', String(state.wave));
    }
    EventBus.emit(EV.gameOver, { wave: state.wave, kills: state.kills, level: readLevel(), isNewRecord });
  }

  function checkWaveClear() {
    if (state.gameOver) return;
    if (waveRecord.resolved < waveRecord.total || spawnQueue.length > 0) return;

    const perfect = !waveRecord.hadLeak;
    EventBus.emit(EV.waveCleared, { wave: state.wave, perfect });

    if (perfect && state.cityLight < 4) {
      state.cityLight++;
      EventBus.emit(EV.cityHealed, { level: state.cityLight });
    }

    Economy.addWaveClearBonus(state.wave);

    const policyGold = PolicySystem.getSum('goldPerWave', 'all');
    if (policyGold > 0) Economy.add(policyGold);

    // 임시 정책 만료 처리. towerRangeMul류가 방금 풀렸을 수 있어 즉시 재계산한다(사용자 요청).
    PolicySystem.onWaveCleared();
    recalculateBuffs();

    state.isPrepPhase = true;
    prepTimer = wavesData.spawn.prepSeconds;
  }

  function startNextWave() {
    if (!state.isPrepPhase || state.gameOver) return { ok: false };
    Economy.addInstantWaveBonus(Math.max(0, prepTimer));
    startWave(state.wave + 1);
    return { ok: true };
  }

  function setPaused(paused) { state.paused = !!paused; }
  function setSpeed(n) { state.speedMul = n; }

  // ── Debug.js(?debug=1) 전용
  /** 진행 중이던 웨이브를 버리고 n으로 강제 점프한다. 이미 화면에 있는 적은 안 건드림(K가 담당). */
  function jumpToWave(n) {
    spawnQueue = [];
    startWave(n);
  }

  /** 활성 적 전부를 정상 처치 경로(takeDamage)로 죽인다 — 보상·XP·집계가 평소처럼 반영된다. */
  function killAllEnemies() {
    [...EnemyPool.getActive()].forEach(e => e.takeDamage(e.hp));
  }

  function setInvincible(v) { invincible = !!v; }
  function isInvincible() { return invincible; }

  /**
   * 지금 활성인 정책은 풀에서 뺀다 — 서포터(DraftSystem)와 달리 영구 제외가 아니라
   * "켜져 있는 동안만" 제외다. 임시 정책(예: 차량 2부제)은 만료되면 다시 뽑힐 수 있다.
   */
  function drawPolicies() {
    const pool = Object.values(policiesData)
      .filter(p => !PolicySystem.isActive(p.id))
      .map(p => ({ cardId: p.id, kind: 'policy', name: p.name, desc: p.desc }));
    return sample(pool, wavesData.policyCardCount);
  }

  function sample(arr, n) {
    const a = [...arr];
    const out = [];
    while (a.length && out.length < n) out.push(...a.splice(Math.floor(Math.random() * a.length), 1));
    return out;
  }

  return {
    addTower,
    removeTower,
    getTowers,
    addSupport,
    removeSupport,
    getSupports,
    addObstacle,
    removeObstacle,
    getObstacles,
    recalculateBuffs,
    update,
    startNextWave,
    setPaused,
    setSpeed,
    getState: () => state,
    jumpToWave,
    killAllEnemies,
    setInvincible,
    isInvincible,
  };
}

export const WaveManager = createWaveManager({
  getLevel: () => LevelSystem.getLevel(),
  perksProvider: () => PerkSystem.get(),
});

export default WaveManager;
