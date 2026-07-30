/**
 * HUD.js — 골드 · 웨이브/계절 · 레벨/XP바
 *
 * ❌ 도시 체력 숫자바는 만들지 않는다 — 조명(SeoulTowerLight)이 체력바다 (CLAUDE.md §8).
 * goldChanged/xpChanged/waveStarted/seasonChanged만 구독한다. 실시간 갱신은 전부
 * 이벤트로 받고, 씬 진입 시 최초 1회만 getState()로 초기값을 채운다 (CLAUDE.md D18).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, HUD as HUDT } from './UITheme.js';

const ROW_GAP = HUDT.fontSize + 6;

export class HUD {
  constructor(scene) {
    this.scene = scene;
    const m = HUDT.margin;

    const style = { fontSize: `${HUDT.fontSize}px`, color: '#f2f4f8' };
    this.goldText = scene.add.text(m, m, '', style);
    this.waveText = scene.add.text(m, m + ROW_GAP, '', style);
    this.levelText = scene.add.text(m, m + ROW_GAP * 2, '', style);

    const barY = m + ROW_GAP * 2 + HUDT.fontSize + 4;
    this.xpBarBg = scene.add.rectangle(m, barY, HUDT.xpBarWidth, HUDT.xpBarHeight, 0x2a3040).setOrigin(0, 0);
    this.xpBarFill = scene.add.rectangle(m, barY, 0, HUDT.xpBarHeight, COLOR.accent).setOrigin(0, 0);

    this.gold = 0;
    this.wave = 0;
    this.season = '';
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 1;

    // off()로 정확히 떼어내려면 최초 등록한 함수 참조를 그대로 들고 있어야 한다 (SeoulTowerLight/DamageNumber와 동일 패턴)
    this.onGold = ({ gold }) => { this.gold = gold; this.renderGold(); };
    this.onXp = ({ xp, level, xpToNext }) => { this.xp = xp; this.level = level; this.xpToNext = xpToNext; this.renderXp(); };
    this.onWave = ({ wave, season }) => { this.wave = wave; this.season = season; this.renderWave(); };
    this.onSeason = ({ season }) => { this.season = season; this.renderWave(); };

    EventBus.on(EV.goldChanged, this.onGold, this);
    EventBus.on(EV.xpChanged, this.onXp, this);
    EventBus.on(EV.waveStarted, this.onWave, this);
    EventBus.on(EV.seasonChanged, this.onSeason, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  /** 씬 진입 시 getState() 결과로 1회만 초기 페인트 (D18: 매 프레임 호출 금지) */
  init(state) {
    this.gold = state.gold;
    this.wave = state.wave;
    this.season = state.season;
    this.level = state.level;
    this.xp = state.xp;
    this.xpToNext = state.xpToNext;
    this.renderGold();
    this.renderWave();
    this.renderXp();
  }

  renderGold() {
    this.goldText.setText(`골드 ${this.gold}`);
  }

  renderWave() {
    this.waveText.setText(`웨이브 ${this.wave} · ${this.season}`);
  }

  renderXp() {
    this.levelText.setText(`Lv.${this.level}   XP ${this.xp}/${this.xpToNext}`);
    const ratio = this.xpToNext > 0 ? Phaser.Math.Clamp(this.xp / this.xpToNext, 0, 1) : 0;
    this.xpBarFill.width = HUDT.xpBarWidth * ratio;
  }

  destroy() {
    EventBus.off(EV.goldChanged, this.onGold, this);
    EventBus.off(EV.xpChanged, this.onXp, this);
    EventBus.off(EV.waveStarted, this.onWave, this);
    EventBus.off(EV.seasonChanged, this.onSeason, this);
    this.goldText.destroy();
    this.waveText.destroy();
    this.levelText.destroy();
    this.xpBarBg.destroy();
    this.xpBarFill.destroy();
  }
}
