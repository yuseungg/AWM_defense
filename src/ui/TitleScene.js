/**
 * TitleScene.js — 심사자가 보는 첫 화면. 진짜 Phaser.Scene이다(GameOverScene과 달리).
 *
 * ★ 3초 안에 시작할 수 있어야 한다 — 여기서 멋 부리면 심사자가 안 넘어간다.
 *   그래서 애니메이션·배경 장식 없이 텍스트 5줄 + 버튼 하나뿐이다.
 *
 * ★★ 브라우저는 사용자 클릭(제스처) 전엔 오디오를 재생할 수 없다 — [시작] 클릭이
 *   이 세션에서 유일하게 보장된 사용자 제스처라 사운드 해금은 반드시 여기서 한다.
 *
 * main.js가 ?debug=1/?fxtest=1일 때 이 씬 자체를 씬 배열에서 빼고 GameScene을 바로
 * 올린다 — 검증할 때마다 여길 클릭하는 건 낭비라서.
 */

import Phaser from 'phaser';
import { COLOR, TITLE } from './UITheme.js';
import { W, H } from './mapView.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);

    this.add.text(W / 2, TITLE.titleY, '서울 디펜스', {
      fontSize: `${TITLE.titleFontSize}px`, color: '#f2f4f8', fontStyle: 'bold',
    }).setOrigin(0.5);

    const today = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`;
    this.add.text(W / 2, TITLE.dateY, `${dateStr} 서울 — 오늘의 방어`, {
      fontSize: `${TITLE.dateFontSize}px`, color: '#f2f4f8',
    }).setOrigin(0.5);

    this.add.text(W / 2, TITLE.descY, '서울의 랜드마크로 도시 문제를 막아라', {
      fontSize: `${TITLE.descFontSize}px`, color: TITLE.descColor,
    }).setOrigin(0.5);

    const bestWave = Number(localStorage.getItem('bestWave') || 0);
    const bestText = bestWave > 0 ? `최고 기록: 웨이브 ${bestWave}` : '첫 도전';
    this.add.text(W / 2, TITLE.bestY, bestText, {
      fontSize: `${TITLE.bestFontSize}px`, color: TITLE.bestColor,
    }).setOrigin(0.5);

    const btn = this.add.rectangle(W / 2, TITLE.buttonY, TITLE.buttonWidth, TITLE.buttonHeight, COLOR.accent)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2, TITLE.buttonY, '시작', {
      fontSize: `${TITLE.buttonFontSize}px`, color: '#11141a', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W / 2, TITLE.hintY, 'Enter / Space로도 시작', {
      fontSize: `${TITLE.hintFontSize}px`, color: TITLE.hintColor,
    }).setOrigin(0.5);

    const start = () => {
      // ══ 사운드 해금 지점 ══ 브라우저는 사용자 제스처 없이 오디오를 못 튼다 —
      // 이 클릭이 이 세션에서 유일하게 보장된 제스처라 여기서 직접 resume한다.
      if (this.sound?.context?.state === 'suspended') this.sound.context.resume();
      this.scene.start('Game');
    };
    btn.on('pointerdown', start);
    this.input.keyboard.on('keydown-ENTER', start);
    this.input.keyboard.on('keydown-SPACE', start);
  }
}
