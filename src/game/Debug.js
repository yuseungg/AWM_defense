/**
 * Debug.js — ?debug=1 전용 디버그 모드 (CLAUDE.md §7)
 *
 * "개발 편의 기능이 아니라 일정을 지키는 장치다." — 밸런싱을 이걸로 한다.
 *
 * Phaser의 scene.input.keyboard가 아니라 window 레벨 keydown을 쓴다 — 그래야 어떤 씬이
 * 떠 있든(?core=1의 CoreScene, 나중에 GameScene 등) B의 /src/ui/를 안 건드리고 동작한다.
 * 모듈이 로드되는 시점에 ?debug=1을 스스로 확인해서, 아니면 아무 것도 안 한다(자기완결형).
 *
 * 1~9=웨이브 점프 · G=골드+1000 · X=XP+500 · K=화면 적 전멸 · H=무적 토글 · F=5배속 · V=10배속
 */

import GameCore from '../GameCore.js';
import WaveManager from './WaveManager.js';
import Economy from './Economy.js';
import LevelSystem from './LevelSystem.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

function handleKeydown(e) {
  const n = Number(e.key);
  if (n >= 1 && n <= 9) {
    WaveManager.jumpToWave(n);
    console.log(`[Debug] 웨이브 ${n}으로 점프`);
    return;
  }

  switch (e.key) {
    case 'g': case 'G':
      Economy.add(1000);
      console.log('[Debug] 골드 +1000');
      break;
    case 'x': case 'X':
      LevelSystem.addXp(500);
      console.log('[Debug] XP +500');
      break;
    case 'k': case 'K':
      WaveManager.killAllEnemies();
      console.log('[Debug] 화면의 적 전멸');
      break;
    case 'h': case 'H': {
      const next = !WaveManager.isInvincible();
      WaveManager.setInvincible(next);
      console.log(`[Debug] 무적 ${next ? 'ON' : 'OFF'}`);
      break;
    }
    case 'f': case 'F':
      GameCore.setSpeed(5);
      console.log('[Debug] 배속 5x');
      break;
    case 'v': case 'V':
      GameCore.setSpeed(10);
      console.log('[Debug] 배속 10x');
      break;
    default:
      break;
  }
}

if (DEBUG) {
  window.addEventListener('keydown', handleKeydown);
  console.log('[Debug] 디버그 모드 활성 — 1~9 웨이브점프 · G 골드 · X XP · K 전멸 · H 무적 · F/V 배속5x/10x');
}
