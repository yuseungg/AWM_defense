/**
 * EventBus.js — A(코어) ↔ B(UI) 유일한 통신 채널
 *
 * ⚠️ 【공용】 파일. 페이로드 변경은 SYNC.md §3 절차를 탄다.
 * 이벤트 목록은 CLAUDE.md §6-1 이 유일한 기준이다.
 */

import Phaser from 'phaser';

export const EventBus = new Phaser.Events.EventEmitter();

/**
 * 이벤트 이름 상수. 문자열 오타로 인한 "구독은 했는데 안 온다" 사고를 막는다.
 * A도 B도 반드시 이 상수를 쓴다. 리터럴 문자열 금지.
 */
export const EV = {
  // ── 적
  enemySpawned:   'enemySpawned',    // { id, type, x, y }
  enemyDamaged:   'enemyDamaged',    // { id, amount, x, y, isEffective, isCrit }
  enemyKilled:    'enemyKilled',     // { id, type, reward, xp, x, y }

  // ── 상태이상 (구 enemyStunned 를 흡수·확장) [✅ A 승인 2026-07-28]
  statusApplied:  'statusApplied',   // { enemyId, type: 'stun'|'dot'|'slow', duration }

  // ── 도시 체력 = N서울타워 조명
  cityDamaged:    'cityDamaged',     // { level }  4→3→2→1
  cityHealed:     'cityHealed',      // { level }

  // ── 경제 · 성장
  goldChanged:    'goldChanged',     // { gold, delta }
  xpChanged:      'xpChanged',       // { xp, level, xpToNext }
  levelUp:        'levelUp',         // { level, unlockedTower, draftCards[] }  3장 (D14)
  cardPicked:     'cardPicked',      // { cardId }

  // ── 웨이브 · 보스
  waveStarted:    'waveStarted',     // { wave, season }
  waveCleared:    'waveCleared',     // { wave, perfect }
  bossSpawned:    'bossSpawned',     // { hp, wave }
  bossHpChanged:  'bossHpChanged',   // { hp, maxHp }              [✅ A 승인 2026-07-28]
  bossKilled:     'bossKilled',      // { policyCards[] }  3장
  bossLeaked:     'bossLeaked',      // { x, y }  코어 도달. 조명 2단계 하강
  seasonChanged:  'seasonChanged',   // { season }

  // ── 타워
  towerFired:     'towerFired',      // { instanceId, towerId, x, y, targetX, targetY } — SYNC.md §3 C8

  // ── 건설 · 배치  [✅ 전부 A 승인 2026-07-28]
  objectBuilt:    'objectBuilt',     // { kind, id, instanceId, cellX, cellY, x, y }
  objectChanged:  'objectChanged',   // { instanceId, action: 'upgraded'|'relocated', level }
  actionRejected: 'actionRejected',  // { action, reason }
  obstacleTriggered: 'obstacleTriggered', // { instanceId, type, x, y, cooldown }
  cloneAcquired:  'cloneAcquired',   // { kind: 'tower'|'support', id } — 최대 레벨 건물 복제로 그 종류 추가 설치권 획득

  // ── 버프 · 종료
  buffsRecalculated: 'buffsRecalculated', // { towerStats[] }
  gameOver:       'gameOver',        // { wave, kills, level, isNewRecord }
};

/** 배치 실패 이유. UI 문구와 1:1 대응한다. */
export const REJECT = {
  occupied:  '이미 다른 건물이 있습니다',
  unique:    '이 종류는 하나만 세울 수 있습니다',
  locked:    '아직 해금되지 않았습니다',
  noGold:    '골드가 부족합니다',
  notOnPath: '장애물은 경로 위에만 놓을 수 있습니다',
  onPath:    '경로 위에는 세울 수 없습니다',
  noPick:    '남은 설치 횟수가 없습니다',
  outOfBounds: '맵 밖에는 세울 수 없습니다', // 2×2 건물이 격자 가장자리에 걸칠 때
  notMaxLevel: '최대 레벨에 도달해야 복제할 수 있습니다',
};
