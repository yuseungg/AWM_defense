/**
 * DraftSystem.js — 레벨업 드래프트 3장 추첨 (CLAUDE.md §5-5, D14)
 *
 * 풀 = 서포터2(유니크, 획득 시 제거) + 장애물2(반복) + 퍼크3(반복) = 7종.
 * 서포터가 다 빠져도 장애물+퍼크 5종이 항상 남아있어서, "3장 전부 못 쓰는 카드"가
 * 뜰 수 없는 구조다 — 별도 가중치 로직이 필요 없다.
 */

import wavesData from '../../data/waves.json';
import supportsData from '../../data/supports.json';
import obstaclesData from '../../data/obstacles.json';
import perksData from '../../data/perks.json';

export function createDraftSystem() {
  const takenSupports = new Set();

  function markSupportTaken(id) {
    takenSupports.add(id);
  }

  function buildPool() {
    return [
      ...Object.values(supportsData)
        .filter(s => !takenSupports.has(s.id))
        .map(s => ({ cardId: s.id, kind: 'support', name: s.name, desc: s.desc })),
      ...Object.values(obstaclesData)
        .map(o => ({ cardId: o.id, kind: 'obstacle', name: o.name, desc: o.desc })),
      ...Object.values(perksData)
        .map(p => ({ cardId: p.id, kind: 'perk', name: p.name, desc: p.desc })),
    ];
  }

  /** 중복 없이 n장 추첨(splice 기반) — MockGameCore.js/WaveManager.js의 sample()과 동일 방식. */
  function roll(n = wavesData.draftCardCount) {
    const pool = buildPool();
    const out = [];
    while (pool.length && out.length < n) out.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
    return out;
  }

  return { roll, markSupportTaken };
}

export const DraftSystem = createDraftSystem();

export default DraftSystem;
