/**
 * MockGameCore.js — B가 A를 기다리지 않기 위한 더미 코어
 *
 * ⚠️ 근거: SYNC.md §6-4 "Mock이 스펙이다"
 *    B에게 필요한 이벤트가 아직 A에게 없으면 B가 Mock에 먼저 정의한다.
 *    Mock은 B도 수정 가능하다. A는 다음 세션에 Mock에 맞춰 실제 구현한다.
 *
 * ⚠️ 실제 로직은 하나도 없다. 타이머로 가짜 이벤트만 발행한다.
 *    Mock과 실제 동작이 다르면 실제 코어가 정답이다. Mock을 고친다. (CLAUDE.md §6-3)
 *
 * 사용법: ?mock=1
 */

import { EventBus, EV, REJECT } from './EventBus.js';
import GridSystem from './game/GridSystem.js';
import waves from '../data/waves.json';
import towersData from '../data/towers.json';
import enemiesData from '../data/enemies.json';
import supportsData from '../data/supports.json';
import obstaclesData from '../data/obstacles.json';
import perksData from '../data/perks.json';
import policiesData from '../data/policies.json';

const ENEMY_IDS = ['dust', 'car', 'trash'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/** XP 곡선: round(20 * 1.3^(N-1))  — CLAUDE.md §5-5 */
const xpToNext = lv =>
  Math.round(waves.xp.levelBase * Math.pow(waves.xp.levelGrowth, lv - 1));

class Mock {
  constructor() {
    this.state = {
      gold: waves.startGold,
      xp: 0,
      level: 1,
      xpToNext: xpToNext(1),
      wave: 0,
      season: '봄',
      cityLight: 4,
      towers: [],
      supports: [],
      obstacles: [],
      perks: { globalCrit: 0, globalDamage: 0, globalPierce: 0 },
      policies: [],
      // 실제 GameCore는 unlockedTowers를 매번 `unlockLevel <= CURRENT_LEVEL`로 재계산한다 —
      // 시작 레벨(1)의 청계천도 처음부터 포함돼야 한다. levelUp 이벤트만으로 채우면
      // "레벨 1로 시작하는데 레벨 1 해금 타워가 안 보이는" 불일치가 생긴다 [발견·수정: BuildUI 검증 중]
      unlockedTowers: Object.values(towersData).filter(t => t.unlockLevel <= 1).map(t => t.id),
      kills: 0,
      bestWave: Number(localStorage.getItem('bestWave') || 0),
      isPrepPhase: true,
    };
    this.seq = 0;
    this.enemySeq = 0;
    this.paused = false;
    this.speed = 1;
    this.ownedSupportIds = new Set();     // 드래프트로 얻었지만 아직 안 지은 서포터(유니크, id당 1개)
    this.obstaclePicksById = new Map();   // 드래프트로 얻었지만 아직 안 지은 장애물 설치 횟수(id별)
    this.clonePicksById = new Map();      // §5-7 복제로 얻었지만 아직 안 지은 설치권(id별)
    this.timers = [];
    this.started = false;
  }

  // ────────────────────────────────────────── 시작 / 루프
  start() {
    if (this.started) return;
    this.started = true;
    this.loop(2500, () => this.nextWave());
    this.loop(700, () => this.fakeCombat());
    this.loop(9000, () => this.fakeLeak());
  }

  loop(ms, fn) {
    const id = setInterval(() => { if (!this.paused) fn(); }, ms / this.speed);
    this.timers.push({ id, ms, fn });
  }

  reloop() {
    this.timers.forEach(t => clearInterval(t.id));
    const defs = this.timers.map(({ ms, fn }) => ({ ms, fn }));
    this.timers = [];
    defs.forEach(({ ms, fn }) => this.loop(ms, fn));
  }

  stop() { this.timers.forEach(t => clearInterval(t.id)); this.timers = []; }

  // ────────────────────────────────────────── 가짜 웨이브
  nextWave() {
    const s = this.state;
    if (s.cityLight <= 0) return;

    // 이전 웨이브 정리
    if (s.wave > 0) {
      const perfect = Math.random() < 0.5;
      EventBus.emit(EV.waveCleared, { wave: s.wave, perfect });
      if (perfect && s.cityLight < 4) {
        s.cityLight++;
        EventBus.emit(EV.cityHealed, { level: s.cityLight });
      }
    }

    s.wave++;
    s.isPrepPhase = false;

    // 계절 전환
    const season = waves.seasons.find(x => s.wave >= x.from && s.wave <= x.to);
    if (season && season.name !== s.season) {
      s.season = season.name;
      EventBus.emit(EV.seasonChanged, { season: s.season });
    }
    EventBus.emit(EV.waveStarted, { wave: s.wave, season: s.season });

    // 스폰
    const n = 4 + Math.floor(s.wave / 3);
    for (let i = 0; i < n; i++) {
      const type = pick(ENEMY_IDS);
      EventBus.emit(EV.enemySpawned, {
        id: `e${++this.enemySeq}`, type, x: 0, y: 140,
      });
    }

    // 보스
    if (s.wave % waves.boss.everyWaves === 0) {
      const bossNo = s.wave / waves.boss.everyWaves - 1;
      this.bossMaxHp = Math.round(waves.boss.baseHp * Math.pow(waves.boss.hpMulPerBoss, bossNo));
      this.bossHp = this.bossMaxHp;
      EventBus.emit(EV.bossSpawned, { hp: this.bossMaxHp, wave: s.wave });
      setTimeout(() => this.resolveBoss(), 5000 / this.speed);
    }
  }

  resolveBoss() {
    if (Math.random() < 0.7) {
      // 처치 → 정책 3장
      EventBus.emit(EV.bossKilled, { policyCards: this.drawPolicies() });
      this.addXp(enemiesData.boss.xp);
      this.addGold(enemiesData.boss.reward);
    } else {
      // 코어 도달 → 조명 2단계 하강, 정책 보상 없음 (CLAUDE.md §5-4)
      const c = this.core();
      EventBus.emit(EV.bossLeaked, { x: c.x, y: c.y });
      this.damageCity(enemiesData.boss.pierceDamage);
    }
  }

  // ────────────────────────────────────────── 가짜 전투
  fakeCombat() {
    const s = this.state;
    if (s.wave === 0 || s.cityLight <= 0) return;

    const type = pick(ENEMY_IDS);
    const e = enemiesData[type];
    const isEffective = Math.random() < 0.3;
    const isCrit = Math.random() < Math.min(1, s.perks.globalCrit + 0.1);
    let amount = Math.round(rnd(4, 40) * (isEffective ? 2 : 1) * (isCrit ? 2 : 1));

    const x = rnd(100, 1100), y = pick([140, 340, 540]);
    EventBus.emit(EV.enemyDamaged, { id: `e${this.enemySeq}`, amount, x, y, isEffective, isCrit });

    // 보스 체력바
    if (this.bossHp > 0) {
      this.bossHp = Math.max(0, this.bossHp - amount);
      EventBus.emit(EV.bossHpChanged, { hp: this.bossHp, maxHp: this.bossMaxHp });
    }

    // 상태이상
    if (Math.random() < 0.25) {
      EventBus.emit(EV.statusApplied, {
        enemyId: `e${this.enemySeq}`, type: pick(['stun', 'dot', 'slow']), duration: rnd(1, 3),
      });
    }

    // 장애물 발동
    if (this.state.obstacles.length && Math.random() < 0.2) {
      const o = pick(this.state.obstacles);
      EventBus.emit(EV.obstacleTriggered, {
        instanceId: o.instanceId, type: o.id, x: o.x, y: o.y,
        cooldown: obstaclesData[o.id].effect.cooldown,
      });
    }

    // 처치
    if (Math.random() < 0.5) {
      s.kills++;
      EventBus.emit(EV.enemyKilled, { id: `e${this.enemySeq}`, type, reward: e.reward, xp: e.xp, x, y });
      this.addGold(e.reward);
      this.addXp(e.xp);
    }
  }

  fakeLeak() {
    const s = this.state;
    if (s.wave === 0 || s.cityLight <= 0) return;
    if (Math.random() < 0.35) this.damageCity(1);
  }

  // ────────────────────────────────────────── 상태 변경 헬퍼
  core() { return { x: 1180, y: 540 }; }

  addGold(d) {
    this.state.gold += d;
    EventBus.emit(EV.goldChanged, { gold: this.state.gold, delta: d });
  }

  addXp(d) {
    const s = this.state;
    s.xp += d;
    while (s.xp >= s.xpToNext) {
      s.xp -= s.xpToNext;
      s.level++;
      s.xpToNext = xpToNext(s.level);

      // unlockLevel 자동 해금
      const unlocked = Object.values(towersData)
        .find(t => t.unlockLevel === s.level && !s.unlockedTowers.includes(t.id));
      if (unlocked) s.unlockedTowers.push(unlocked.id);

      EventBus.emit(EV.levelUp, {
        level: s.level,
        unlockedTower: unlocked ? unlocked.id : null,
        draftCards: this.drawDraft(),
      });
    }
    EventBus.emit(EV.xpChanged, { xp: s.xp, level: s.level, xpToNext: s.xpToNext });
  }

  damageCity(n) {
    const s = this.state;
    s.cityLight -= n;
    if (s.cityLight <= 0) {
      s.cityLight = 0;
      EventBus.emit(EV.cityDamaged, { level: 0 });
      const isNewRecord = s.wave > s.bestWave;
      if (isNewRecord) localStorage.setItem('bestWave', String(s.wave));
      EventBus.emit(EV.gameOver, { wave: s.wave, kills: s.kills, level: s.level, isNewRecord });
      this.stop();
      return;
    }
    EventBus.emit(EV.cityDamaged, { level: s.cityLight });
  }

  // ────────────────────────────────────────── 드래프트 추첨
  /** 풀 = 서포터(유니크, 획득 시 제거) + 장애물(반복) + 퍼크(누적). 3장 제시 [가정] */
  drawDraft() {
    const owned = [...this.ownedSupportIds]; // 픽한 순간 풀에서 빠진다(배치 여부와 무관 — 유니크는 "한 번만 뽑힘")
    const pool = [
      ...Object.values(supportsData).filter(s => !owned.includes(s.id))
        .map(s => ({ cardId: s.id, kind: 'support', name: s.name, desc: s.desc })),
      ...Object.values(obstaclesData)
        .map(o => ({ cardId: o.id, kind: 'obstacle', name: o.name, desc: o.desc })),
      ...Object.values(perksData)
        .map(p => ({ cardId: p.id, kind: 'perk', name: p.name, desc: p.desc })),
    ];
    return this.sample(pool, waves.draftCardCount);
  }

  drawPolicies() {
    const owned = this.state.policies;
    const pool = Object.values(policiesData)
      .filter(p => !owned.includes(p.id))
      .map(p => ({ cardId: p.id, kind: 'policy', name: p.name, desc: p.desc }));
    return this.sample(pool, waves.policyCardCount);
  }

  sample(arr, n) {
    const a = [...arr];
    const out = [];
    while (a.length && out.length < n) out.push(...a.splice(Math.floor(Math.random() * a.length), 1));
    return out;
  }
}

const mock = new Mock();

// ────────────────────────────────────────── GameCore 인터페이스 구현
// 반환 규약: { ok, reason?, instanceId? }   좌표 규약: cellX/cellY = 셀 인덱스  [가정]
const CELL = 40;

/** kind별 배치 격자 규칙(CLAUDE.md §5-3): tower/support = 경로 밖 슬롯 / obstacle = 경로 위. GridSystem 재사용. */
function checkGrid(kind, cellX, cellY) {
  const onPath = GridSystem.isPathCell(cellX, cellY);
  if (kind === 'obstacle') return onPath ? { ok: true } : { ok: false, reason: 'notOnPath' };
  return onPath ? { ok: false, reason: 'onPath' } : { ok: true };
}

function place(kind, dataset, id, cellX, cellY) {
  const s = mock.state;
  const list = kind === 'tower' ? s.towers : kind === 'support' ? s.supports : s.obstacles;
  const def = dataset[id];
  if (!def) return reject('build', 'locked');

  // §5-7 복제 — 이미 있어도 복제 설치권이 남아있으면 통과(없으면 기존처럼 unique 거부)
  const hasClonePick = (mock.clonePicksById.get(id) || 0) > 0;
  if (kind === 'tower' && !s.unlockedTowers.includes(id)) return reject('build', 'locked');
  if (kind === 'support' && !mock.ownedSupportIds.has(id)) return reject('build', 'noPick');
  if (kind === 'support' && s.supports.some(o => o.id === id) && !hasClonePick) return reject('build', 'unique');
  if (kind === 'obstacle' && !(mock.obstaclePicksById.get(id) > 0)) return reject('build', 'noPick');

  const gridCheck = checkGrid(kind, cellX, cellY);
  if (!gridCheck.ok) return reject('build', gridCheck.reason);

  if ([...s.towers, ...s.supports, ...s.obstacles].some(o => o.cellX === cellX && o.cellY === cellY))
    return reject('build', 'occupied');

  const instanceId = `${id}#${++mock.seq}`;
  const x = cellX * CELL + CELL / 2;
  const y = cellY * CELL + CELL / 2;
  list.push({ instanceId, id, kind, cellX, cellY, x, y, level: 0 });

  if (kind === 'obstacle') {
    mock.obstaclePicksById.set(id, mock.obstaclePicksById.get(id) - 1);
  }
  if (hasClonePick) {
    const remaining = mock.clonePicksById.get(id) - 1;
    if (remaining > 0) mock.clonePicksById.set(id, remaining);
    else mock.clonePicksById.delete(id);
  }

  EventBus.emit(EV.objectBuilt, { kind, id, instanceId, cellX, cellY, x, y });
  mock.addXp(waves.buildXp[kind] ?? 2);
  EventBus.emit(EV.buffsRecalculated, { towerStats: s.towers });
  return { ok: true, instanceId };
}

function reject(action, reason) {
  EventBus.emit(EV.actionRejected, { action, reason, message: REJECT[reason] });
  return { ok: false, reason };
}

function findInstance(instanceId) {
  const s = mock.state;
  return [...s.towers, ...s.supports, ...s.obstacles].find(o => o.instanceId === instanceId);
}

export const GameCore = {
  buildTower:    (id, cx, cy) => place('tower', towersData, id, cx, cy),
  buildSupport:  (id, cx, cy) => place('support', supportsData, id, cx, cy),
  buildObstacle: (id, cx, cy) => place('obstacle', obstaclesData, id, cx, cy),

  relocate(instanceId, cellX, cellY) {
    const o = findInstance(instanceId);
    if (!o) return reject('relocate', 'locked');
    const check = this.canRelocate(instanceId, cellX, cellY);
    if (!check.ok) return reject('relocate', check.reason);
    const s = mock.state;
    o.cellX = cellX; o.cellY = cellY;
    o.x = cellX * CELL + CELL / 2; o.y = cellY * CELL + CELL / 2;
    EventBus.emit(EV.objectChanged, { instanceId, action: 'relocated', level: o.level });
    EventBus.emit(EV.buffsRecalculated, { towerStats: s.towers });
    return { ok: true };
  },

  /**
   * 실제 코어의 GameCore.canRelocate와 동일한 용도(드래그 미리보기 초록/빨강) — Mock은 아직
   * FOOTPRINT 2×2 모델을 안 써서(기존 1×1 갭, 이번 작업 범위 밖) 자기 자신 제외 + 경로 판정만 맞춘다.
   */
  canRelocate(instanceId, cellX, cellY) {
    const o = findInstance(instanceId);
    if (!o) return { ok: false, reason: 'locked' };
    const gridCheck = checkGrid(o.kind, cellX, cellY);
    if (!gridCheck.ok) return gridCheck;
    const s = mock.state;
    if ([...s.towers, ...s.supports, ...s.obstacles]
        .some(t => t !== o && t.cellX === cellX && t.cellY === cellY))
      return { ok: false, reason: 'occupied' };
    return { ok: true };
  },

  upgrade(instanceId) {
    const o = findInstance(instanceId);
    if (!o) return reject('upgrade', 'locked');
    if (o.level >= 2) return reject('upgrade', 'locked');
    const cost = 80 * (o.level === 0 ? 1.5 : 2.5);
    if (mock.state.gold < cost) return reject('upgrade', 'noGold');
    mock.addGold(-Math.round(cost));
    o.level++;
    EventBus.emit(EV.objectChanged, { instanceId, action: 'upgraded', level: o.level });
    EventBus.emit(EV.buffsRecalculated, { towerStats: mock.state.towers });
    return { ok: true };
  },

  /**
   * §5-7 복제 — 실제 코어와 동일한 인터페이스만 맞춘다. Mock은 instanceIndex별 강화비 스케일까지는
   * 안 흉내낸다(기존 upgrade()도 80 * 고정배율로 근사하는 것과 같은 수준의 단순화, 범위 밖).
   */
  cloneCost(instanceId) {
    const o = findInstance(instanceId);
    if (!o || o.id === 'nseoulTower' || o.level < 2) return null;
    const def = o.kind === 'tower' ? towersData[o.id] : o.kind === 'support' ? supportsData[o.id] : null;
    if (!def) return null;
    const list = o.kind === 'tower' ? mock.state.towers : mock.state.supports;
    const existingCount = list.filter(x => x.id === o.id).length;
    const scale = waves.cloneScale;
    return Math.round(def.upgradeBaseCost * scale.cloneBaseCostMul * scale.cloneCostMulPerInstance ** (existingCount - 1));
  },

  clone(instanceId) {
    const o = findInstance(instanceId);
    if (!o) return reject('clone', 'locked');
    if (o.id === 'nseoulTower') return reject('clone', 'locked');
    if (o.level < 2) return reject('clone', 'notMaxLevel');
    const cost = this.cloneCost(instanceId);
    if (mock.state.gold < cost) return reject('clone', 'noGold');
    mock.addGold(-cost);
    mock.clonePicksById.set(o.id, (mock.clonePicksById.get(o.id) || 0) + 1);
    EventBus.emit(EV.cloneAcquired, { kind: o.kind, id: o.id });
    return { ok: true };
  },

  pickDraftCard(cardId) {
    const s = mock.state;
    if (perksData[cardId]) {
      const e = perksData[cardId].effect;
      s.perks[e.type] = Math.min(e.cap ?? Infinity, (s.perks[e.type] || 0) + e.value);
    } else if (supportsData[cardId]) {
      // 여기서 s.supports에 미리 넣지 않는다 — place()의 유니크 검사가 자기 자신의 pending
      // 마커에 걸려 실제 배치를 영원히 거부하는 사고가 났었다(BuildUI 배치 흐름 구현 중 발견).
      mock.ownedSupportIds.add(cardId);
    } else if (obstaclesData[cardId]) {
      mock.obstaclePicksById.set(cardId, (mock.obstaclePicksById.get(cardId) || 0) + 1);
    }
    EventBus.emit(EV.cardPicked, { cardId });
    EventBus.emit(EV.buffsRecalculated, { towerStats: s.towers });
    return { ok: true };
  },

  pickPolicy(policyId) {
    mock.state.policies.push(policyId);
    EventBus.emit(EV.cardPicked, { cardId: policyId });
    return { ok: true };
  },

  startNextWave() {
    mock.addGold(waves.instantWaveBonusGold);
    mock.nextWave();
    return { ok: true };
  },

  setSpeed(n) { mock.speed = n; mock.reloop(); return { ok: true }; },
  setPaused(b) { mock.paused = !!b; return { ok: true }; },

  /** boolean 아님 — UI가 실패 이유를 표시할 수 있어야 한다 [가정] */
  canBuild(id, cellX, cellY) {
    const s = mock.state;
    const kind = towersData[id] ? 'tower' : supportsData[id] ? 'support' : obstaclesData[id] ? 'obstacle' : null;
    if (!kind) return { ok: false, reason: 'locked' };
    const hasClonePick = (mock.clonePicksById.get(id) || 0) > 0;
    if (kind === 'tower' && !s.unlockedTowers.includes(id)) return { ok: false, reason: 'locked' };
    if (kind === 'support' && !mock.ownedSupportIds.has(id)) return { ok: false, reason: 'noPick' };
    if (kind === 'support' && s.supports.some(o => o.id === id) && !hasClonePick) return { ok: false, reason: 'unique' };
    if (kind === 'obstacle' && !(mock.obstaclePicksById.get(id) > 0)) return { ok: false, reason: 'noPick' };
    const gridCheck = checkGrid(kind, cellX, cellY);
    if (!gridCheck.ok) return gridCheck;
    if ([...s.towers, ...s.supports, ...s.obstacles].some(o => o.cellX === cellX && o.cellY === cellY))
      return { ok: false, reason: 'occupied' };
    return { ok: true, reason: null };
  },

  /** 매 프레임 호출 금지. 씬 진입 · 오버레이 열 때만. [가정] */
  getState() { return mock.state; },

  // Mock 전용 (실제 코어에는 없다)
  __startMock() { mock.start(); },
  __isMock: true,
};

export default GameCore;
