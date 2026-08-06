/**
 * Economy.js — 골드 획득·지출 (GAME_DESIGN.md §5-2, CLAUDE.md §1 규칙5: 건설 무료·골드는 강화 전용)
 *
 * XP·레벨은 다루지 않는다(LevelSystem.js, P2).
 *
 * waves.json의 instantWaveBonusGold(고정값)는 안 쓴다 — GAME_DESIGN.md §5-2의 실제 공식은
 * "남은 대기 1초당 +3골드"로 동적이라, 호출 시점 남은 시간을 인자로 받아 계산한다.
 */

import waves from '../../data/waves.json';
import { EventBus, EV } from '../EventBus.js';

const DEFAULT_START_GOLD = 200;

export function createEconomy(startGold = waves.startGold ?? DEFAULT_START_GOLD) {
  let gold = startGold;
  let goldMul = 1; // 서울시청(전역 처치골드↑) 반영. WaveManager.recalculateBuffs()가 갱신한다(§5-2)

  function getGold() {
    return gold;
  }

  function setGoldMul(mul) {
    goldMul = mul;
  }

  function getGoldMul() {
    return goldMul;
  }

  function add(amount) {
    gold += amount;
    EventBus.emit(EV.goldChanged, { gold, delta: amount });
  }

  /** 강화용. 골드가 모자라면 지출하지 않는다. */
  function trySpend(amount) {
    if (gold < amount) return { ok: false, reason: 'noGold' };
    add(-amount);
    return { ok: true };
  }

  function addKillReward(enemyDef) {
    add(Math.round(enemyDef.reward * goldMul));
  }

  function addWaveClearBonus(wave) {
    add(20 + wave * 2);
  }

  function addInstantWaveBonus(remainingSeconds) {
    add(Math.floor(remainingSeconds) * 3);
  }

  return {
    getGold,
    add,
    trySpend,
    addKillReward,
    addWaveClearBonus,
    addInstantWaveBonus,
    setGoldMul,
    getGoldMul,
  };
}

export const Economy = createEconomy();

export default Economy;
