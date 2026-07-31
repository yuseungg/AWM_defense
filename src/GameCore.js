/**
 * GameCore.js — B ↔ A 유일한 인터페이스 구현체 (CLAUDE.md §6-2)
 *
 * ⚠️ 【공용】 파일. 함수 시그니처·getState() 키 이름 변경은 SYNC.md §3 절차를 탄다.
 *
 * 타워 인스턴스 레지스트리는 따로 안 둔다 — WaveManager.getTowers()가 이미
 * 살아있는 타워 배열의 단일 소스라, instanceId로 찾을 땐 그걸 그대로 검색한다.
 */

import towersData from '../data/towers.json';
import GridSystem from './game/GridSystem.js';
import Tower from './game/Tower.js';
import WaveManager from './game/WaveManager.js';
import Economy from './game/Economy.js';
import { EventBus, EV, REJECT } from './EventBus.js';

// LevelSystem(P2) 붙기 전까지 고정값. unlockedTowers 계산도 이 값을 기준으로 한다.
const CURRENT_LEVEL = 1;

const seqByType = {};

function findTower(instanceId) {
  return WaveManager.getTowers().find(t => t.instanceId === instanceId);
}

function reject(action, reason) {
  EventBus.emit(EV.actionRejected, { action, reason, message: REJECT[reason] });
  return { ok: false, reason };
}

function canBuild(id, cellX, cellY) {
  const def = towersData[id];
  if (!def) return { ok: false, reason: 'locked' };

  const gridResult = GridSystem.canPlace('tower', cellX, cellY);
  if (!gridResult.ok) return gridResult;

  if (def.unlockLevel > CURRENT_LEVEL) return { ok: false, reason: 'locked' };

  const alreadyBuilt = WaveManager.getTowers().some(t => t.id === id);
  if (alreadyBuilt) return { ok: false, reason: 'unique' };

  return { ok: true };
}

function buildTower(towerId, cellX, cellY) {
  const check = canBuild(towerId, cellX, cellY);
  if (!check.ok) return reject('build', check.reason);

  seqByType[towerId] = (seqByType[towerId] ?? 0) + 1;
  const instanceId = `${towerId}#${seqByType[towerId]}`;

  const tower = new Tower(towerId, instanceId, cellX, cellY);
  WaveManager.addTower(tower);
  GridSystem.occupy(cellX, cellY, { instanceId });

  EventBus.emit(EV.objectBuilt, {
    kind: 'tower', id: towerId, instanceId, cellX, cellY, x: tower.x, y: tower.y,
  });

  return { ok: true, instanceId };
}

function upgrade(instanceId) {
  const tower = findTower(instanceId);
  if (!tower || !tower.canUpgrade()) return reject('upgrade', 'locked');

  const spend = Economy.trySpend(tower.upgradeCost());
  if (!spend.ok) return reject('upgrade', spend.reason);

  tower.upgrade();
  EventBus.emit(EV.objectChanged, { instanceId, action: 'upgraded', level: tower.level });
  return { ok: true };
}

function relocate(instanceId, cellX, cellY) {
  const tower = findTower(instanceId);
  if (!tower) return reject('relocate', 'locked');

  const check = GridSystem.canPlace('tower', cellX, cellY);
  if (!check.ok) return reject('relocate', check.reason);

  GridSystem.release(tower.cellX, tower.cellY);
  GridSystem.occupy(cellX, cellY, { instanceId });
  tower.relocate(cellX, cellY);

  EventBus.emit(EV.objectChanged, { instanceId, action: 'relocated', level: tower.level });
  return { ok: true };
}

function getState() {
  const wm = WaveManager.getState();
  return {
    gold: Economy.getGold(),
    xp: 0,
    level: CURRENT_LEVEL,
    xpToNext: 20,
    wave: wm.wave,
    season: wm.season,
    cityLight: wm.cityLight,
    towers: WaveManager.getTowers(),
    supports: [],
    obstacles: [],
    perks: { globalCrit: 0, globalDamage: 0, globalPierce: 0 },
    policies: [],
    unlockedTowers: Object.values(towersData)
      .filter(t => t.unlockLevel <= CURRENT_LEVEL)
      .map(t => t.id),
    kills: wm.kills,
    bestWave: wm.bestWave,
    isPrepPhase: wm.isPrepPhase,
  };
}

export const GameCore = {
  update(deltaMs) {
    // WaveManager.update()가 내부에서 이미 활성 타워를 tower.update()로 돌린다 — 여기서 또 돌리지 않는다.
    WaveManager.update(deltaMs / 1000);
  },

  canBuild,
  buildTower,
  upgrade,
  relocate,

  startNextWave: () => WaveManager.startNextWave(),
  setSpeed: n => WaveManager.setSpeed(n),
  setPaused: b => WaveManager.setPaused(b),

  getState,

  // 스텁 — 각 시스템(P3) 붙으면 구현
  buildSupport: () => ({ ok: false, reason: 'notImplemented' }),
  buildObstacle: () => ({ ok: false, reason: 'notImplemented' }),
  pickDraftCard: () => ({ ok: false, reason: 'notImplemented' }),
  pickPolicy: () => ({ ok: false, reason: 'notImplemented' }),
};

export default GameCore;
