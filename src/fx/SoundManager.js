/**
 * SoundManager.js — 최소 사운드 세트: 발사·처치·조명 하강 경고·레벨업·게임오버 + 낮/밤 BGM 크로스페이드
 *
 * ⚠️ SFX 음원은 아직 없다(팀이 아직 안 만듦/안 구함 — /docs/CREDITS.md에 규칙만 적어뒀다).
 *   Phaser 로더가 없는 파일에 loaderror만 내고 조용히 넘어가게 만들어서(GameScene.preload()의
 *   기존 이미지 폴백과 동일 패턴), 재생 직전에 scene.cache.audio.exists()로 존재를 확인한다.
 *   나중에 assets/sounds/<key>.mp3만 넣으면 코드 변경 없이 소리가 난다.
 *
 * 음소거는 Phaser 내장 scene.sound.mute를 그대로 쓴다(Controls.js가 토글 버튼만 붙인다) —
 * 이 클래스는 별도 mute 상태를 안 만든다. SFX·BGM 전부 scene.sound API를 거치므로 mute
 * 여부는 Phaser가 알아서 전역으로 반영한다.
 *
 * "발사" 이벤트가 EventBus에 따로 없다(타워가 쏠 때가 아니라 맞았을 때만 안다) — enemyDamaged를
 * 근사치로 쓴다. AOE 한 방이 여러 마리를 동시에 맞히면 여러 번 트리거될 수 있어서 짧게 스로틀한다.
 *
 * ── BGM(낮/밤 크로스페이드) ──
 * SFX(hit/kill/...)는 scene.sound.play(key)로 "쏘고 잊는다" — 재생 중인 인스턴스를 안 들고 있어도
 * 된다. BGM은 반대로 볼륨을 나중에 트윈해야 해서 scene.sound.add(key)로 지속 참조(this.bgmSound,
 * this.bgmSounds)를 들고 있는다. 자동재생 정책은 이미 해결돼 있다 — TitleScene.js가 시작 버튼
 * 클릭 시 AudioContext를 resume()한 뒤에 GameScene로 넘어오므로 여기선 추가 처리가 필요 없다.
 *
 * 낮/밤 판정(bgKeyForWave)은 mapView.js가 배경 사진 전환에 쓰는 것과 동일 함수를 그대로
 * import한다 — "5웨이브 주기"라는 매직넘버를 두 곳에 따로 두지 않기 위해서다. ?bg=day|night
 * 강제 파라미터가 있으면 bgKeyForWave가 항상 같은 값을 돌려주므로, waveStarted가 와도
 * 크로스페이드가 저절로 트리거되지 않는다(별도 분기 불필요).
 *
 * ── 타워 발사음 ──────────────────────────────────────────────────────
 * towerFired를 구독해 SFX_BY_TOWER에 있는 타워만 재생한다(필터 방식 — 다른 이펙트들과 동일 원칙,
 * 서울숲은 항목이 없어 자연히 무음). GameScene.js의 preload()도 이 맵의 값을 그대로 가져다 써서
 * 타워id→파일명 매핑이 한 곳에만 있다.
 *
 * DDP(1.9초)·청계천(1.26초)처럼 효과음 길이가 공격 주기(attackSpeed)보다 길면 자기 자신과
 * 항상 겹친다 — "이미 재생 중이면 스킵"은 청계천처럼 쿨다운이 짧은 타워를 거의 매번 건너뛰게
 * 만들어 "가끔만 소리 나는" 버그처럼 들린다. 대신 키별 동시 재생 개수를 제한(voice limit)해서
 * 넘으면 가장 오래된 것부터 끊는다 — FxLayer/ImpactFx/ProjectileFx가 이미 쓰는 "풀 고갈 시
 * 가장 오래된 것부터 밀어내기"와 같은 원칙이다. 이러려면 재생 중인 인스턴스를 붙잡고 있어야
 * 해서(끊으려면 참조가 필요) hit/kill 같은 1회성 play(key)가 아니라 BGM과 같은 add() 방식을 쓴다.
 */

import { EventBus, EV } from '../EventBus.js';
import { SOUND } from '../ui/UITheme.js';
import { bgKeyForWave } from '../ui/mapView.js';

const KEYS = { hit: 'fire', kill: 'kill', warning: 'warning', levelup: 'levelup', gameover: 'gameover' };
const HIT_THROTTLE_MS = 80;

/** towerId → 발사음 로드 키. 여기 없는 타워는 무음(서울숲) — GameScene.preload()도 이 맵을 그대로 쓴다. */
export const SFX_BY_TOWER = {
  gwanghwamun: 'sfx_gwanghwamun',
  cheonggyecheon: 'sfx_cheonggyecheon',
  ddp: 'sfx_ddp',
  nseoulTower: 'sfx_nseoulTower',
  lotteWorldTower: 'sfx_lotteWorldTower',
};

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

    // key → 그 발사음의 활성 Sound 인스턴스 배열(voice limit 판정·정리용)
    this.towerSfxByKey = new Map();
    this.onTowerFired = ({ towerId }) => {
      const key = SFX_BY_TOWER[towerId];
      if (key) this.playTowerSfx(key);
    };
    EventBus.on(EV.towerFired, this.onTowerFired, this);

    // bgmKey: 현재 재생 중인 트랙의 낮/밤 키('day'|'night'). bgmSound: 그 Sound 인스턴스(볼륨 트윈 대상).
    // bgmSounds: scene.sound.add()로 만든 모든 BGM Sound 인스턴스(크로스페이드로 페이드아웃 중인
    // 이전 트랙 포함) — scene.sound는 씬 범위가 아니라 게임 전역이라(scene.tweens와 다름) 씬이
    // 죽어도 자동 정리가 안 된다. 여기 다 넣어둬야 destroy()에서 죽은 참조 없이 전부 정리된다.
    this.bgmKey = null;
    this.bgmSound = null;
    this.bgmSounds = new Set();
    this.onWaveStarted = ({ wave }) => this.setBgmKey(bgKeyForWave(wave));
    EventBus.on(EV.waveStarted, this.onWaveStarted, this);
    this.setBgmKey(bgKeyForWave(0)); // 첫 진입(wave=0) — 이전 트랙 없이 목표 볼륨까지 페이드인

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

  /** voice limit 있는 재생 — 같은 key가 sfxMaxConcurrentPerKey개 넘게 겹치면 가장 오래된 것부터 끊는다. */
  playTowerSfx(key) {
    if (!this.scene.cache.audio.exists(key)) return; // 파일 없음 — 조용히 무시(기존 원칙과 동일)

    const list = this.towerSfxByKey.get(key) ?? [];
    if (list.length >= SOUND.sfxMaxConcurrentPerKey) {
      const oldest = list.shift();
      oldest.stop();
      oldest.destroy();
    }

    const sound = this.scene.sound.add(key, { volume: SOUND.sfxVolume });
    sound.once('complete', () => {
      const l = this.towerSfxByKey.get(key);
      const idx = l?.indexOf(sound) ?? -1;
      if (idx !== -1) l.splice(idx, 1);
      sound.destroy(); // add()로 만든 인스턴스는 자연 종료돼도 자동 파괴되지 않는다 — 직접 정리
    });

    list.push(sound);
    this.towerSfxByKey.set(key, list);
    sound.play();
  }

  /** dayOrNight: 'day'|'night'. 이미 그 트랙이면 아무것도 안 한다(중복 크로스페이드 방지). */
  setBgmKey(dayOrNight) {
    if (dayOrNight === this.bgmKey) return;
    const fullKey = `bgm_${dayOrNight}`;
    if (!this.scene.cache.audio.exists(fullKey)) return; // 파일 없음 — 조용히 스킵(SFX와 동일 원칙)

    const prevSound = this.bgmSound;
    const nextSound = this.scene.sound.add(fullKey, { loop: true, volume: 0 });
    this.bgmSounds.add(nextSound);
    nextSound.play();
    this.scene.tweens.add({ targets: nextSound, volume: SOUND.bgmVolume, duration: SOUND.bgmCrossfadeMs });

    if (prevSound) {
      this.scene.tweens.add({
        targets: prevSound, volume: 0, duration: SOUND.bgmCrossfadeMs,
        onComplete: () => {
          this.bgmSounds.delete(prevSound);
          prevSound.destroy(); // stop() 없이 destroy()만 해도 재생이 멈춘다(Phaser 내장 동작)
        },
      });
    }

    this.bgmKey = dayOrNight;
    this.bgmSound = nextSound;
  }

  destroy() {
    EventBus.off(EV.enemyDamaged, this.onDamaged, this);
    EventBus.off(EV.enemyKilled, this.onKilled, this);
    EventBus.off(EV.cityDamaged, this.onCityDamaged, this);
    EventBus.off(EV.levelUp, this.onLevelUp, this);
    EventBus.off(EV.gameOver, this.onGameOver, this);
    EventBus.off(EV.waveStarted, this.onWaveStarted, this);
    EventBus.off(EV.towerFired, this.onTowerFired, this);

    // scene.sound는 씬 범위가 아니라 게임 전역이라(scene.tweens와 달리) 씬이 죽어도 자동 정리가
    // 안 된다 — bgmSounds에 쌓아둔 걸(크로스페이드 도중이면 페이드아웃 중인 이전 트랙까지) 전부
    // killTweensOf 후 stop+destroy해야 죽은 참조 없이 정리된다.
    this.bgmSounds.forEach(sound => {
      this.scene.tweens.killTweensOf(sound);
      sound.stop();
      sound.destroy();
    });
    this.bgmSounds.clear();
    this.bgmSound = null;

    // 타워 발사음도 같은 이유(scene.sound 전역) — 아직 재생 중인 것 전부 정리
    this.towerSfxByKey.forEach(list => list.forEach(sound => { sound.stop(); sound.destroy(); }));
    this.towerSfxByKey.clear();
  }
}
