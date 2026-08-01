/**
 * PerkSystem.js — 부가효과(퍼크) 누적 관리 (GAME_DESIGN §9)
 *
 * 값·상한(cap)은 전부 perks.json에서 읽는다 — "크리 100% 상한"을 코드에 박지 않는다.
 * crit_up만 cap이 있고 power_up/pierce_up은 없어서 자연히 무제한 누적된다.
 */

import perksData from '../../data/perks.json';

export function createPerkSystem() {
  const state = { globalCrit: 0, globalDamage: 0, globalPierce: 0 };

  function addPerk(perkId) {
    const def = perksData[perkId];
    if (!def) return;

    const { type, value, cap } = def.effect;
    const next = state[type] + value;
    state[type] = cap != null ? Math.min(cap, next) : next;
  }

  function get() {
    return { ...state };
  }

  return { addPerk, get };
}

export const PerkSystem = createPerkSystem();

export default PerkSystem;
