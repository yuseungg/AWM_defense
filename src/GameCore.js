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
import wavesData from '../data/waves.json';
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
// §5-7 복제 시스템 — 최대 레벨 건물을 골드로 복제하면 여기 쌓인다. id당 카운트라 kind
// 구분이 없다(타워 id·서포터 id는 겹치지 않는다). obstaclePicks와 달리 종류별로 따로 센다 —
// 장애물은 카드가 반복 등장해서 "그 카드를 뽑은 횟수"라 전역 총량이면 충분했지만, 복제는
// "어느 종류를 복제했는지"가 canBuild의 유니크 예외 판정에 그대로 필요하다.
const clonePicksById = new Map();
// 타워 추가(§5-7)는 인스턴스당 평생 1회 — 사용자 요청(2026-08-03)으로 "같은 타워로 계속 눌러서
// 티켓만 쌓이는" 문제를 막는다. 한 번 쓴 인스턴스는 여기 영구히 남고, 그 인스턴스로는 다시 못 쓴다
// — 새 타워를 지어 최대 강화해야 그 새 인스턴스로 다시 쓸 수 있다. 서포터는 대상 밖(요청 범위가
// 타워 한정이라 기존 반복 사용 방식 그대로 둠).
const clonedTowerInstances = new Set();

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

/** 이미 1개 이상 있어도 그 id의 복제 설치권이 남아있으면 통과 — §5-7. */
function hasCloneRoom(id, existingCount) {
  return existingCount === 0 || (clonePicksById.get(id) || 0) > 0;
}

function canBuildTower(id, cellX, cellY) {
  const def = towersData[id];
  const gridResult = GridSystem.canPlace('tower', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (def.unlockLevel > LevelSystem.getLevel()) return { ok: false, reason: 'locked' };

  const existingCount = WaveManager.getTowers().filter(t => t.id === id).length;
  if (!hasCloneRoom(id, existingCount)) return { ok: false, reason: 'unique' };

  return { ok: true };
}

function canBuildSupport(id, cellX, cellY) {
  const gridResult = GridSystem.canPlace('support', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (!supportsOwned.has(id)) return { ok: false, reason: 'locked' };

  const existingCount = WaveManager.getSupports().filter(s => s.id === id).length;
  if (!hasCloneRoom(id, existingCount)) return { ok: false, reason: 'unique' };

  return { ok: true };
}

function canBuildObstacle(id, cellX, cellY) {
  const gridResult = GridSystem.canPlace('obstacle', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (obstaclePicks <= 0) return { ok: false, reason: 'noPick' };

  return { ok: true };
}

/** 이미 있던 개수만큼 복제 설치권을 소모한다(existingCount>0이면 canBuild가 이미 재고 있음을 확인했다). */
function consumeClonePick(id, existingCount) {
  if (existingCount === 0) return;
  const remaining = (clonePicksById.get(id) || 0) - 1;
  if (remaining > 0) clonePicksById.set(id, remaining);
  else clonePicksById.delete(id);
}

function buildTower(towerId, cellX, cellY) {
  const check = canBuild(towerId, cellX, cellY);
  if (!check.ok) return reject('build', check.reason);

  const existingCount = WaveManager.getTowers().filter(t => t.id === towerId).length;
  consumeClonePick(towerId, existingCount);

  const instanceId = nextInstanceId(towerId);
  const tower = new Tower(towerId, instanceId, cellX, cellY, existingCount);
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

  const existingCount = WaveManager.getSupports().filter(s => s.id === supportId).length;
  consumeClonePick(supportId, existingCount);

  const instanceId = nextInstanceId(supportId);
  const support = new Supporter(supportId, instanceId, cellX, cellY, existingCount);
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

function targetKind(target) {
  return WaveManager.getTowers().includes(target) ? 'tower' : 'support';
}

/**
 * 재배치 전용 유효성 검사 — canBuild와 다르다. canBuild의 점유 검사는 "옮기는 자기 자신"이 서
 * 있던 칸도 그대로 점유된 것으로 보기 때문에, 옛 자리와 조금이라도 겹치는 칸으로 옮기려 하면
 * 자기 자신과 충돌한 걸로 오판해 항상 실패한다. GridSystem.canPlace의 excludeInstanceId로
 * 그 오판을 막는다. UI가 드래그 중 매 칸마다(셀이 바뀔 때만) 호출해 초록/빨강을 판단하는 용도.
 */
function canRelocate(instanceId, cellX, cellY) {
  const target = findBuildable(instanceId);
  if (!target) return { ok: false, reason: 'locked' };
  return GridSystem.canPlace(targetKind(target), cellX, cellY, instanceId);
}

function relocate(instanceId, cellX, cellY) {
  const target = findBuildable(instanceId);
  if (!target) return reject('relocate', 'locked');

  const kind = targetKind(target);
  const check = GridSystem.canPlace(kind, cellX, cellY, instanceId);
  if (!check.ok) return reject('relocate', check.reason);

  GridSystem.release(target.cellX, target.cellY, kind);
  GridSystem.occupy(cellX, cellY, { instanceId }, kind);
  target.relocate(cellX, cellY);
  WaveManager.recalculateBuffs();

  EventBus.emit(EV.objectChanged, { instanceId, action: 'relocated', level: target.level });
  return { ok: true };
}

/**
 * §5-7 타워 추가(구 "복제") — 최대 레벨 건물을 지으면 그 종류의 추가 설치권을 파는 4번째 강화 단계.
 * N서울타워는 대상에서 뺀다(재배치와 같은 이유 — 상시 지형물이라 추가되면 "조명=체력바" 가정이
 * 깨진다). 비용은 그 건물의 upgradeBaseCost에 waves.json의 cloneScale을 곱해서 구한다 —
 * existingCount(현재 그 종류 인스턴스 수)가 늘수록 다음 타워 추가가 기하급수로 비싸진다.
 *
 * 타워는 인스턴스당 평생 1회로 제한한다(2026-08-03 사용자 요청) — canClone()이 그 판정을 한다.
 * 같은 인스턴스를 다시 쓰려는 클릭은 cloneCost()가 null을 돌려줘서 UI가 버튼 자체를 안 보여준다.
 */
function canClone(instanceId) {
  const target = findBuildable(instanceId);
  if (!target) return { ok: false, reason: 'locked' };
  if (target.id === 'nseoulTower') return { ok: false, reason: 'locked' };
  if (target.canUpgrade()) return { ok: false, reason: 'notMaxLevel' };
  if (targetKind(target) === 'tower' && clonedTowerInstances.has(instanceId)) {
    return { ok: false, reason: 'cloneUsed' };
  }
  return { ok: true };
}

function cloneCost(instanceId) {
  if (!canClone(instanceId).ok) return null;

  const target = findBuildable(instanceId);
  const kind = targetKind(target);
  const def = kind === 'tower' ? towersData[target.id] : supportsData[target.id];
  const existingCount = (kind === 'tower' ? WaveManager.getTowers() : WaveManager.getSupports())
    .filter(o => o.id === target.id).length;
  const scale = wavesData.cloneScale;
  return Math.round(def.upgradeBaseCost * scale.cloneBaseCostMul * scale.cloneCostMulPerInstance ** (existingCount - 1));
}

function clone(instanceId) {
  const check = canClone(instanceId);
  if (!check.ok) return reject('clone', check.reason);

  const target = findBuildable(instanceId);
  const kind = targetKind(target);
  const cost = cloneCost(instanceId);
  const spend = Economy.trySpend(cost);
  if (!spend.ok) return reject('clone', spend.reason);

  if (kind === 'tower') clonedTowerInstances.add(instanceId);

  const id = target.id;
  clonePicksById.set(id, (clonePicksById.get(id) || 0) + 1);
  EventBus.emit(EV.cloneAcquired, { kind, id });
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
  canRelocate,
  canClone,
  cloneCost,
  clone,
  pickDraftCard,
  pickPolicy,

  startNextWave: () => WaveManager.startNextWave(),
  setSpeed: n => WaveManager.setSpeed(n),
  setPaused: b => WaveManager.setPaused(b),

  getState,
};

export default GameCore;
