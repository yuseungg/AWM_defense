/**
 * LevelSystem.js — XP 누적·레벨업 판정·unlockLevel 자동 해금 (CLAUDE.md §5-5)
 *
 * "해금 목록"을 별도 상태로 안 들고 있다 — unlockLevel은 단조 증가라, 현재 level로
 * towersData를 필터링하는 순수 계산이 항상 정답이다(getUnlockedTowers). levelUp 이벤트의
 * unlockedTower(그 레벨에서 새로 풀린 타워 하나)만 그 순간에 조회해서 실어 보낸다.
 *
 * draftCards는 항상 빈 배열이다 — DraftSystem(P3)이 다음 단계라 지금은 자리만 잡아둔다.
 */

import wavesData from '../../data/waves.json';
import towersData from '../../data/towers.json';
import { EventBus, EV } from '../EventBus.js';

function xpForLevel(n) {
  return Math.round(wavesData.xp.levelBase * Math.pow(wavesData.xp.levelGrowth, n - 1));
}

export function createLevelSystem() {
  let level = 1;
  let xp = 0;
  let xpToNext = xpForLevel(level);

  function addXp(amount) {
    xp += amount;

    while (xp >= xpToNext) {
      xp -= xpToNext;
      level++;
      xpToNext = xpForLevel(level);

      const unlocked = Object.values(towersData).find(t => t.unlockLevel === level);
      EventBus.emit(EV.levelUp, {
        level,
        unlockedTower: unlocked ? unlocked.id : null,
        draftCards: [],
      });
    }

    EventBus.emit(EV.xpChanged, { xp, level, xpToNext });
  }

  function addKillXp(enemyDef) {
    addXp(enemyDef.xp);
  }

  function addBuildXp(kind) {
    addXp(wavesData.buildXp[kind] ?? 0);
  }

  function getLevel() { return level; }
  function getXp() { return xp; }
  function getXpToNext() { return xpToNext; }

  function getUnlockedTowers() {
    return Object.values(towersData)
      .filter(t => t.unlockLevel <= level)
      .map(t => t.id);
  }

  return { addXp, addKillXp, addBuildXp, getLevel, getXp, getXpToNext, getUnlockedTowers };
}

export const LevelSystem = createLevelSystem();

export default LevelSystem;
