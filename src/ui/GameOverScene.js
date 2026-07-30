/**
 * GameOverScene.js — 결과 화면 (gameOver 구독 → 이 화면으로 전환)
 *
 * ⚠️ 이름과 달리 실제 Phaser.Scene이 아니라 GameScene 위에 그려지는 오버레이 컴포넌트다
 * (SeoulTowerLight/HUD/DraftOverlay와 동일한 패턴 — `new GameOverScene(scene, core)`).
 * 진짜 Phaser 씬 전환(`scene.restart()`/`scene.start('Game')`)을 쓰지 않는 이유는 아래
 * 재시작 방식과 같다: WaveManager/Economy/GridSystem이 모듈 싱글톤이라 씬만 새로 만들면
 * 상태가 안 지워진다. 그래서 재시작은 항상 `location.reload()`다.
 *
 * ★ 2초 내 재시작이 절대 사수 조건 — 전환 연출은 GAMEOVER.fadeInMs(300ms 이내)로 짧게,
 * 큰 버튼 하나 + Enter/Space 키 전부 받는다.
 */

import { EventBus, EV } from '../EventBus.js';
import { COLOR, GAMEOVER } from './UITheme.js';
import { W, H } from './mapView.js';

export class GameOverScene {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;
    this.visuals = [];

    this.onGameOver = (payload) => this.show(payload);
    EventBus.on(EV.gameOver, this.onGameOver, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  show({ wave, kills, level, isNewRecord }) {
    const dim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, GAMEOVER.dimAlpha)
      .setDepth(9999).setInteractive().setAlpha(0);
    this.visuals.push(dim);

    const container = [];

    const waveText = this.scene.add.text(W / 2, H / 2 - 120, `웨이브 ${wave}`, {
      fontSize: `${GAMEOVER.waveFontSize}px`, color: '#f2f4f8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9999);
    container.push(waveText);

    const subText = this.scene.add.text(W / 2, H / 2 - 20, `처치 ${kills}   Lv.${level}`, {
      fontSize: `${GAMEOVER.subFontSize}px`, color: '#8a919e',
    }).setOrigin(0.5).setDepth(9999);
    container.push(subText);

    if (isNewRecord) {
      const record = this.scene.add.text(W / 2, H / 2 + 24, '신기록!', {
        fontSize: `${GAMEOVER.subFontSize + 4}px`, color: GAMEOVER.newRecordColor, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(9999);
      container.push(record);
      this.recordTween = this.scene.tweens.add({
        targets: record, scale: { from: 1, to: 1.15 },
        duration: GAMEOVER.newRecordPulseMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    const btnY = H / 2 + 100;
    const btn = this.scene.add.rectangle(W / 2, btnY, GAMEOVER.buttonWidth, GAMEOVER.buttonHeight, COLOR.accent)
      .setDepth(9999).setInteractive({ useHandCursor: true });
    const btnText = this.scene.add.text(W / 2, btnY, '다시 시작 (Enter)', {
      fontSize: `${GAMEOVER.buttonFontSize}px`, color: '#11141a', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9999);
    container.push(btn, btnText);

    this.visuals.push(...container);

    const restart = () => location.reload();
    btn.on('pointerdown', restart);
    const kb = this.scene.input.keyboard;
    kb.on('keydown-ENTER', restart);
    kb.on('keydown-SPACE', restart);

    // 전환 연출은 GAMEOVER.fadeInMs 이내로 짧게 — 여기서 멋 부리면 재플레이율이 떨어진다
    container.forEach(o => o.setAlpha(0));
    this.scene.tweens.add({ targets: [dim, ...container], alpha: 1, duration: GAMEOVER.fadeInMs, ease: 'Cubic.easeOut' });
  }

  destroy() {
    EventBus.off(EV.gameOver, this.onGameOver, this);
    if (this.recordTween) this.recordTween.stop();
    this.visuals.forEach(o => o.destroy());
  }
}
