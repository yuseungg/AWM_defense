/**
 * Controls.js — 배속 1x/2x/3x · 일시정지 · 즉시 다음 웨이브 · 음소거
 *
 * ★ pause 소유권 함정: DraftOverlay도 GameCore.setPaused(bool)을 쓴다. boolean이라
 * 마지막 호출자가 이긴다 — 오버레이가 떠 있는 동안 이 컴포넌트의 pause 버튼을 누르면
 * 카드가 떠 있는 채로 게임이 다시 돈다. 그래서:
 *   1) 이 컴포넌트가 "유저가 원하는 pause 상태"를 `isUserPaused`로 소유한다
 *   2) DraftOverlay가 열릴 때 `setInputEnabled(false)`로 버튼을 아예 못 누르게 막는다
 *      (막지 않고 값만 동기화하면 여전히 레이스가 생긴다)
 *   3) DraftOverlay가 큐를 다 비우고 닫을 때 `isUserPaused`를 다시 읽어 복원한다
 * pause의 최종 소유권 기준은 이 클래스의 `isUserPaused`다 (HANDOFF.md §5 기록).
 *
 * 버튼 4개가 간격 없이 붙어 Panel.js의 drawPanel 하나(corners:['tl','br'])를 이룬다 —
 * 개별 사각형을 그리지 않는다. 클릭 영역은 투명 Zone으로 패널 위에 얹는다.
 */

import { EventBus, EV } from '../EventBus.js';
import { CONTROLS, PANEL } from './UITheme.js';
import { W } from './mapView.js';
import { drawPanel } from './Panel.js';
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
    this.dividers = [];
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
    const totalW = widths.reduce((a, b) => a + b, 0);
    const x0 = W - CONTROLS.margin - totalW;
    const y = CONTROLS.margin;

    this.panel = drawPanel(this.scene, x0, y, totalW, CONTROLS.height, { corners: ['tl', 'br'] });

    let x = x0;
    this.speedBtn = this.makeButton(x, y, widths[0], `${this.speed}x`, () => this.cycleSpeed(), () => this.speed > 1);
    x += widths[0];

    this.addDivider(x, y);
    this.pauseBtn = this.makeButton(x, y, widths[1], '일시정지', () => this.togglePause(), () => this.isUserPaused);
    x += widths[1];

    this.addDivider(x, y);
    this.nextWaveBtn = this.makeButton(x, y, widths[2], `즉시 웨이브 (+${wavesData.instantWaveBonusGold}G)`,
      () => this.fireNextWave(), () => this.isPrepPhase);
    x += widths[2];

    this.addDivider(x, y);
    this.muteBtn = this.makeButton(x, y, widths[3], this.scene.sound.mute ? '소리켜기' : '음소거',
      () => this.toggleMute(), () => this.scene.sound.mute);
  }

  addDivider(x, y) {
    const line = this.scene.add.line(0, 0, x, y + 6, x, y + CONTROLS.height - 6, PANEL.borderColor, CONTROLS.dividerAlpha)
      .setOrigin(0, 0).setLineWidth(1);
    this.dividers.push(line);
  }

  /** (x,y) = 이 버튼 슬롯의 좌상단. isActiveFn()이 true면 액센트색, 아니면 흐린 회색(§ 활성 상태 규칙) */
  makeButton(x, y, width, label, onClick, isActiveFn) {
    const cx = x + width / 2, cy = y + CONTROLS.height / 2;
    const zone = this.scene.add.zone(cx, cy, width, CONTROLS.height)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add.text(cx, cy, label, { fontSize: `${CONTROLS.fontSize}px`, color: CONTROLS.dimColor }).setOrigin(0.5);

    // disableInteractive()로도 막지만, 같은 프레임에 눌린 이벤트까지 방어하는 이중 안전판
    zone.on('pointerdown', () => { if (!this.overlayLocked) onClick(); });

    const btn = { zone, text, group: [zone, text], isActiveFn };
    this.buttons.push(btn);
    return btn;
  }

  setButtonEnabled(btn, cond) {
    btn.group.forEach(o => o.setAlpha(cond ? 1 : CONTROLS.disabledAlpha));
    if (cond) btn.zone.setInteractive({ useHandCursor: true });
    else btn.zone.disableInteractive();
  }

  updateButtonColor(btn) {
    btn.text.setColor(btn.isActiveFn() ? CONTROLS.activeColor : CONTROLS.dimColor);
  }

  refresh() {
    this.setButtonEnabled(this.speedBtn, !this.overlayLocked);
    this.setButtonEnabled(this.pauseBtn, !this.overlayLocked);
    this.setButtonEnabled(this.nextWaveBtn, !this.overlayLocked && this.isPrepPhase);
    this.buttons.forEach(b => this.updateButtonColor(b));
  }

  cycleSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.core.setSpeed(this.speed);
    this.speedBtn.text.setText(`${this.speed}x`);
    this.updateButtonColor(this.speedBtn);
  }

  togglePause() {
    this.isUserPaused = !this.isUserPaused;
    this.core.setPaused(this.isUserPaused);
    this.pauseBtn.text.setText(this.isUserPaused ? '재생' : '일시정지');
    this.updateButtonColor(this.pauseBtn);
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
    this.updateButtonColor(this.muteBtn);
  }

  /** DraftOverlay가 열리고 닫힐 때 호출한다. false = 버튼 전부 잠금+흐리게 */
  setInputEnabled(enabled) {
    this.overlayLocked = !enabled;
    this.refresh();
  }

  destroy() {
    EventBus.off(EV.waveStarted, this.onWaveStarted, this);
    EventBus.off(EV.waveCleared, this.onWaveCleared, this);
    this.panel.destroy();
    this.dividers.forEach(d => d.destroy());
    this.buttons.forEach(b => b.group.forEach(o => o.destroy()));
  }
}
