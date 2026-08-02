/**
 * GameCore.js — B ↔ A 유일한 인터페이스 구현체 (CLAUDE.md §6-2)
 *
 * ⚠️ 【공용】 파일. 함수 시그니처·getState() 키 이름 변경은 SYNC.md §3 절차를 탄다.
 *
 * 타워 인스턴스 레지스트리는 따로 안 둔다 — WaveManager.getTowers()가 이미
 * 살아있는 타워 배열의 단일 소스라, instanceId로 찾을 땐 그걸 그대로 검색한다.
 */

import towersData from '../data/towers.json';
import perksData from '../data/perks.json';
import supportsData from '../data/supports.json';
import obstaclesData from '../data/obstacles.json';
import policiesData from '../data/policies.json';
import mapData from '../data/map.json';
import GridSystem from './game/GridSystem.js';
import Tower from './game/Tower.js';
import Supporter from './game/Supporter.js';
import Obstacle from './game/Obstacle.js';
import WaveManager from './game/WaveManager.js';
import Economy from './game/Economy.js';
import LevelSystem from './game/LevelSystem.js';
import DraftSystem from './game/DraftSystem.js';
import PerkSystem from './game/PerkSystem.js';
import PolicySystem from './game/PolicySystem.js';
import { EventBus, EV, REJECT } from './EventBus.js';

const seqByType = {};

// 드래프트로 획득한 서포터·장애물 설치권.
let obstaclePicks = 0;
const supportsOwned = new Set();

function nextInstanceId(id) {
  seqByType[id] = (seqByType[id] ?? 0) + 1;
  return `${id}#${seqByType[id]}`;
}

/** 타워 또는 서포터에서 instanceId로 찾는다(장애물은 upgrade/relocate 대상이 아직 아님). */
function findBuildable(instanceId) {
  const tower = WaveManager.getTowers().find(t => t.instanceId === instanceId);
  if (tower) return tower;
  return WaveManager.getSupports().find(s => s.instanceId === instanceId);
}

function reject(action, reason) {
  EventBus.emit(EV.actionRejected, { action, reason, message: REJECT[reason] });
  return { ok: false, reason };
}

function canBuild(id, cellX, cellY) {
  if (towersData[id]) return canBuildTower(id, cellX, cellY);
  if (supportsData[id]) return canBuildSupport(id, cellX, cellY);
  if (obstaclesData[id]) return canBuildObstacle(id, cellX, cellY);
  return { ok: false, reason: 'locked' };
}

function canBuildTower(id, cellX, cellY) {
  const def = towersData[id];
  const gridResult = GridSystem.canPlace('tower', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (def.unlockLevel > LevelSystem.getLevel()) return { ok: false, reason: 'locked' };

  const alreadyBuilt = WaveManager.getTowers().some(t => t.id === id);
  if (alreadyBuilt) return { ok: false, reason: 'unique' };

  return { ok: true };
}

function canBuildSupport(id, cellX, cellY) {
  const gridResult = GridSystem.canPlace('support', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (!supportsOwned.has(id)) return { ok: false, reason: 'locked' };

  const alreadyBuilt = WaveManager.getSupports().some(s => s.id === id);
  if (alreadyBuilt) return { ok: false, reason: 'unique' };

  return { ok: true };
}

function canBuildObstacle(id, cellX, cellY) {
  const gridResult = GridSystem.canPlace('obstacle', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (obstaclePicks <= 0) return { ok: false, reason: 'noPick' };

  return { ok: true };
}

function buildTower(towerId, cellX, cellY) {
  const check = canBuild(towerId, cellX, cellY);
  if (!check.ok) return reject('build', check.reason);

  const instanceId = nextInstanceId(towerId);
  const tower = new Tower(towerId, instanceId, cellX, cellY);
  WaveManager.addTower(tower);
  GridSystem.occupy(cellX, cellY, { instanceId }, 'tower');
  LevelSystem.addBuildXp('tower');
  WaveManager.recalculateBuffs(); // 기존 서포터 오라 범위 안에 지어졌을 수 있다

  EventBus.emit(EV.objectBuilt, {
    kind: 'tower', id: towerId, instanceId, cellX, cellY, x: tower.x, y: tower.y,
  });

  return { ok: true, instanceId };
}

function buildSupport(supportId, cellX, cellY) {
  const check = canBuild(supportId, cellX, cellY);
  if (!check.ok) return reject('build', check.reason);

  const instanceId = nextInstanceId(supportId);
  const support = new Supporter(supportId, instanceId, cellX, cellY);
  WaveManager.addSupport(support);
  GridSystem.occupy(cellX, cellY, { instanceId }, 'support');
  LevelSystem.addBuildXp('support');
  WaveManager.recalculateBuffs();

  EventBus.emit(EV.objectBuilt, {
    kind: 'support', id: supportId, instanceId, cellX, cellY, x: support.x, y: support.y,
  });

  return { ok: true, instanceId };
}

function buildObstacle(obstacleId, cellX, cellY) {
  const check = canBuild(obstacleId, cellX, cellY);
  if (!check.ok) return reject('build', check.reason);

  obstaclePicks--;
  const instanceId = nextInstanceId(obstacleId);
  const obstacle = new Obstacle(obstacleId, instanceId, cellX, cellY);
  WaveManager.addObstacle(obstacle);
  GridSystem.occupy(cellX, cellY, { instanceId }, 'obstacle');
  LevelSystem.addBuildXp('obstacle');

  EventBus.emit(EV.objectBuilt, {
    kind: 'obstacle', id: obstacleId, instanceId, cellX, cellY, x: obstacle.x, y: obstacle.y,
  });

  return { ok: true, instanceId };
}

function upgrade(instanceId) {
  const target = findBuildable(instanceId);
  if (!target || !target.canUpgrade()) return reject('upgrade', 'locked');

  const spend = Economy.trySpend(target.upgradeCost());
  if (!spend.ok) return reject('upgrade', spend.reason);

  target.upgrade();
  WaveManager.recalculateBuffs();
  EventBus.emit(EV.objectChanged, { instanceId, action: 'upgraded', level: target.level });
  return { ok: true };
}

function relocate(instanceId, cellX, cellY) {
  const target = findBuildable(instanceId);
  if (!target) return reject('relocate', 'locked');

  const kind = WaveManager.getTowers().includes(target) ? 'tower' : 'support';
  const check = GridSystem.canPlace(kind, cellX, cellY);
  if (!check.ok) return reject('relocate', check.reason);

  GridSystem.release(target.cellX, target.cellY, kind);
  GridSystem.occupy(cellX, cellY, { instanceId }, kind);
  target.relocate(cellX, cellY);
  WaveManager.recalculateBuffs();

  EventBus.emit(EV.objectChanged, { instanceId, action: 'relocated', level: target.level });
  return { ok: true };
}

function pickDraftCard(cardId) {
  if (perksData[cardId]) {
    PerkSystem.addPerk(cardId);
  } else if (supportsData[cardId]) {
    supportsOwned.add(cardId);
    DraftSystem.markSupportTaken(cardId);
  } else if (obstaclesData[cardId]) {
    obstaclePicks++;
  } else {
    return { ok: false, reason: 'locked' };
  }

  EventBus.emit(EV.cardPicked, { cardId });
  return { ok: true };
}

/**
 * N서울타워(unlockLevel 0)는 플레이어 액션이 아니라 처음부터 있는 것이라 buildTower()를
 * 안 거친다 — 건설 XP도 안 주고 objectBuilt도 안 쏜다(방금 지은 게 아니라 초기 상태라서).
 * 함수로 분리해둔 이유: 지금은 모듈 로드 시 1회만 부르지만, GameCore.reset()이 생기면
 * (SYNC.md C5, B 요청 대기 중) 그 안에서 다시 불러도 안전하도록(이미 있으면 스킵).
 */
function ensureNSeoulTower() {
  if (WaveManager.getTowers().some(t => t.id === 'nseoulTower')) return;

  const pos = mapData.nseoulTower;
  const { cellX, cellY } = GridSystem.toCell(pos.x, pos.y);
  const instanceId = nextInstanceId('nseoulTower');

  const tower = new Tower('nseoulTower', instanceId, cellX, cellY);
  WaveManager.addTower(tower);
  GridSystem.occupy(cellX, cellY, { instanceId }, 'tower');
  WaveManager.recalculateBuffs();
}

function pickPolicy(policyId) {
  if (!policiesData[policyId]) return { ok: false, reason: 'locked' };

  PolicySystem.pickPolicy(policyId);
  // towerRangeMul류는 즉시 반영/해제돼야 하니 여기서도 재계산한다(사용자 요청).
  WaveManager.recalculateBuffs();
  EventBus.emit(EV.cardPicked, { cardId: policyId });
  return { ok: true };
}

function getState() {
  const wm = WaveManager.getState();
  return {
    gold: Economy.getGold(),
    xp: LevelSystem.getXp(),
    level: LevelSystem.getLevel(),
    xpToNext: LevelSystem.getXpToNext(),
    wave: wm.wave,
    season: wm.season,
    cityLight: wm.cityLight,
    towers: WaveManager.getTowers(),
    supports: WaveManager.getSupports(),
    obstacles: WaveManager.getObstacles(),
    perks: PerkSystem.get(),
    policies: PolicySystem.getActivePolicies(),
    unlockedTowers: LevelSystem.getUnlockedTowers(),
    kills: wm.kills,
    bestWave: wm.bestWave,
    isPrepPhase: wm.isPrepPhase,
  };
}

ensureNSeoulTower(); // 모듈 로드 시 1회 — 웨이브1부터 조준·발사하려면 여기서 미리 있어야 한다

export const GameCore = {
  update(deltaMs) {
    // WaveManager.update()가 내부에서 이미 활성 타워를 tower.update()로 돌린다 — 여기서 또 돌리지 않는다.
    WaveManager.update(deltaMs / 1000);
  },

  canBuild,
  buildTower,
  buildSupport,
  buildObstacle,
  upgrade,
  relocate,
  pickDraftCard,
  pickPolicy,

  startNextWave: () => WaveManager.startNextWave(),
  setSpeed: n => WaveManager.setSpeed(n),
  setPaused: b => WaveManager.setPaused(b),

  getState,
};

export default GameCore;
