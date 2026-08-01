/**
 * Controls.js — 배속 1x/2x/3x · 일시정지 · 즉시 다음 웨이브
 *
 * ★ pause 소유권 함정: DraftOverlay도 GameCore.setPaused(bool)을 쓴다. boolean이라
 * 마지막 호출자가 이긴다 — 오버레이가 떠 있는 동안 이 컴포넌트의 pause 버튼을 누르면
 * 카드가 떠 있는 채로 게임이 다시 돈다. 그래서:
 *   1) 이 컴포넌트가 "유저가 원하는 pause 상태"를 `isUserPaused`로 소유한다
 *   2) DraftOverlay가 열릴 때 `setInputEnabled(false)`로 버튼을 아예 못 누르게 막는다
 *      (막지 않고 값만 동기화하면 여전히 레이스가 생긴다)
 *   3) DraftOverlay가 큐를 다 비우고 닫을 때 `isUserPaused`를 다시 읽어 복원한다
 * pause의 최종 소유권 기준은 이 클래스의 `isUserPaused`다 (HANDOFF.md §5 기록).
 */

import { EventBus, EV } from '../EventBus.js';
import { COLOR, CONTROLS } from './UITheme.js';
import { W } from './mapView.js';
import wavesData from '../../data/waves.json';

export class Controls {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.speed = 1;
    this.isUserPaused = false;
    this.overlayLocked = false; // DraftOverlay가 열려 있는 동안 true — 버튼 입력을 아예 막는다

    // 음소거는 Phaser 내장 scene.sound.mute를 그대로 쓴다(SoundManager는 별도 상태를 안 가짐).
    // localStorage에 기억해서 다음 방문에도 유지 — 매번 다시 끄는 건 짜증난다.
    scene.sound.mute = localStorage.getItem('muted') === '1';

    const initial = core.getState(); // 씬 진입 시 1회만 — CLAUDE.md D18
    this.isPrepPhase = !!initial.isPrepPhase;

    this.buttons = [];
    this.buildUI();
    this.refresh();

    this.onWaveStarted = () => { this.isPrepPhase = false; this.refresh(); };
    this.onWaveCleared = () => { this.isPrepPhase = true; this.refresh(); };
    EventBus.on(EV.waveStarted, this.onWaveStarted, this);
    EventBus.on(EV.waveCleared, this.onWaveCleared, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  buildUI() {
    const widths = [CONTROLS.buttonWidth, CONTROLS.buttonWidth, CONTROLS.waveButtonWidth, CONTROLS.muteButtonWidth];
    const totalW = widths.reduce((a, b) => a + b, 0) + CONTROLS.gap * (widths.length - 1);
    let x = W - CONTROLS.margin - totalW;
    const y = CONTROLS.margin;

    this.speedBtn = this.makeButton(x + widths[0] / 2, y + CONTROLS.buttonHeight / 2, widths[0],
      `${this.speed}x`, () => this.cycleSpeed());
    x += widths[0] + CONTROLS.gap;

    this.pauseBtn = this.makeButton(x + widths[1] / 2, y + CONTROLS.buttonHeight / 2, widths[1],
      '일시정지', () => this.togglePause());
    x += widths[1] + CONTROLS.gap;

    this.nextWaveBtn = this.makeButton(x + widths[2] / 2, y + CONTROLS.buttonHeight / 2, widths[2],
      `즉시 웨이브 (+${wavesData.instantWaveBonusGold}G)`, () => this.fireNextWave());
    x += widths[2] + CONTROLS.gap;

    this.muteBtn = this.makeButton(x + widths[3] / 2, y + CONTROLS.buttonHeight / 2, widths[3],
      this.scene.sound.mute ? '소리켜기' : '음소거', () => this.toggleMute());
  }

  makeButton(cx, cy, width, label, onClick) {
    const rect = this.scene.add.rectangle(cx, cy, width, CONTROLS.buttonHeight, COLOR.slot)
      .setStrokeStyle(1, COLOR.accent, 0.6)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add.text(cx, cy, label, {
      fontSize: `${CONTROLS.fontSize}px`, color: '#f2f4f8',
    }).setOrigin(0.5);

    // disableInteractive()로도 막지만, 같은 프레임에 눌린 이벤트까지 방어하는 이중 안전판
    rect.on('pointerdown', () => { if (!this.overlayLocked) onClick(); });

    const btn = { rect, text, group: [rect, text] };
    this.buttons.push(btn);
    return btn;
  }

  setButtonEnabled(btn, cond) {
    btn.group.forEach(o => o.setAlpha(cond ? 1 : CONTROLS.disabledAlpha));
    if (cond) btn.rect.setInteractive({ useHandCursor: true });
    else btn.rect.disableInteractive();
  }

  refresh() {
    this.setButtonEnabled(this.speedBtn, !this.overlayLocked);
    this.setButtonEnabled(this.pauseBtn, !this.overlayLocked);
    this.setButtonEnabled(this.nextWaveBtn, !this.overlayLocked && this.isPrepPhase);
  }

  cycleSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.core.setSpeed(this.speed);
    this.speedBtn.text.setText(`${this.speed}x`);
  }

  togglePause() {
    this.isUserPaused = !this.isUserPaused;
    this.core.setPaused(this.isUserPaused);
    this.pauseBtn.text.setText(this.isUserPaused ? '재생' : '일시정지');
  }

  fireNextWave() {
    if (!this.isPrepPhase) return; // 버튼이 비활성이라 보통 여기 안 옴 — WaveManager도 {ok:false}로 막아준다
    this.core.startNextWave();
  }

  toggleMute() {
    const muted = !this.scene.sound.mute;
    this.scene.sound.mute = muted;
    localStorage.setItem('muted', muted ? '1' : '0');
    this.muteBtn.text.setText(muted ? '소리켜기' : '음소거');
  }

  /** DraftOverlay가 열리고 닫힐 때 호출한다. false = 버튼 전부 잠금+흐리게 */
  setInputEnabled(enabled) {
    this.overlayLocked = !enabled;
    this.refresh();
  }

  destroy() {
    EventBus.off(EV.waveStarted, this.onWaveStarted, this);
    EventBus.off(EV.waveCleared, this.onWaveCleared, this);
    this.buttons.forEach(b => b.group.forEach(o => o.destroy()));
  }
}
