/**
 * SoundManager.js — 최소 사운드 세트: 발사·처치·조명 하강 경고·레벨업·게임오버·BGM 1
 *
 * ⚠️ 음원 파일은 아직 없다(팀이 아직 안 만듦/안 구함 — /docs/CREDITS.md에 규칙만 적어뒀다).
 *   Phaser 로더가 없는 파일에 loaderror만 내고 조용히 넘어가게 만들어서(GameScene.preload()의
 *   기존 이미지 폴백과 동일 패턴), 재생 직전에 scene.cache.audio.exists()로 존재를 확인한다.
 *   나중에 assets/sounds/<key>.mp3만 넣으면 코드 변경 없이 소리가 난다.
 *
 * 음소거는 Phaser 내장 scene.sound.mute를 그대로 쓴다(Controls.js가 토글 버튼만 붙인다) —
 * 이 클래스는 별도 mute 상태를 안 만든다. play()가 매번 scene.sound.play()를 거치기 때문에
 * mute 여부는 Phaser가 알아서 반영한다.
 *
 * "발사" 이벤트가 EventBus에 따로 없다(타워가 쏠 때가 아니라 맞았을 때만 안다) — enemyDamaged를
 * 근사치로 쓴다. AOE 한 방이 여러 마리를 동시에 맞히면 여러 번 트리거될 수 있어서 짧게 스로틀한다.
 */

import { EventBus, EV } from '../EventBus.js';

const KEYS = { hit: 'fire', kill: 'kill', warning: 'warning', levelup: 'levelup', gameover: 'gameover', bgm: 'bgm' };
const HIT_THROTTLE_MS = 80;

export class SoundManager {
  constructor(scene) {
    this.scene = scene;
    this._lastPlayedAt = {};

    this.onDamaged = () => this.playThrottled(KEYS.hit, HIT_THROTTLE_MS, { volume: 0.12 });
    this.onKilled = () => this.play(KEYS.kill, { volume: 0.4 });
    this.onCityDamaged = () => this.play(KEYS.warning, { volume: 0.6 });
    this.onLevelUp = () => this.play(KEYS.levelup, { volume: 0.5 });
    this.onGameOver = () => this.play(KEYS.gameover, { volume: 0.6 });

    EventBus.on(EV.enemyDamaged, this.onDamaged, this);
    EventBus.on(EV.enemyKilled, this.onKilled, this);
    EventBus.on(EV.cityDamaged, this.onCityDamaged, this);
    EventBus.on(EV.levelUp, this.onLevelUp, this);
    EventBus.on(EV.gameOver, this.onGameOver, this);

    this.play(KEYS.bgm, { volume: 0.3, loop: true });

    scene.events.once('shutdown', () => this.destroy());
  }

  play(key, config) {
    if (!this.scene.cache.audio.exists(key)) return; // 파일 없음 — 조용히 무시(loaderror 폴백과 동일 원칙)
    this.scene.sound.play(key, config);
  }

  playThrottled(key, minGapMs, config) {
    const now = this.scene.time.now;
    if (now - (this._lastPlayedAt[key] ?? -Infinity) < minGapMs) return;
    this._lastPlayedAt[key] = now;
    this.play(key, config);
  }

  destroy() {
    EventBus.off(EV.enemyDamaged, this.onDamaged, this);
    EventBus.off(EV.enemyKilled, this.onKilled, this);
    EventBus.off(EV.cityDamaged, this.onCityDamaged, this);
    EventBus.off(EV.levelUp, this.onLevelUp, this);
    EventBus.off(EV.gameOver, this.onGameOver, this);
    this.scene.sound.stopByKey(KEYS.bgm);
  }
}
