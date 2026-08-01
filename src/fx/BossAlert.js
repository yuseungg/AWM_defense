/**
 * BossAlert.js — 보스 등장·체력·코어 도달 연출 (CLAUDE.md §6-1 계약에 있었지만 받는 쪽이 없던 이벤트 4개)
 *
 * bossHpChanged로 숫자/바 형태의 체력바를 그린다 — CLAUDE.md §1의 "숫자 체력바 금지"는
 * **도시(N서울타워 조명)**에만 적용되는 규칙이다(EventBus.js에도 명시돼 있음). 보스는 별개다.
 *
 * bossLeaked(보스가 코어에 도달)가 이 게임에서 가장 위협적인 순간인데 지금까지 아무 연출도
 * 없었다 — 조명 2단계 하강(SeoulTowerLight가 cityDamaged로 별도 처리)과 동시에 쿵+강한
 * 흔들림+보스 소멸이 터져야 그 위협이 전달된다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { BOSS, SHAKE } from '../ui/UITheme.js';
import { W, H } from '../ui/mapView.js';
import mapData from '../../data/map.json';

const FXTEST = new URLSearchParams(location.search).get('fxtest') === '1';

export class BossAlert {
  constructor(scene) {
    this.scene = scene;
    this.bannerGroup = [];
    this.hpBarGroup = [];
    this.hpFillObj = null;
    this.hpLabelObj = null;
    this.skyOverlay = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(5);

    this.onBossSpawned = payload => this.handleSpawned(payload);
    this.onBossHpChanged = payload => this.handleHpChanged(payload);
    this.onBossLeaked = payload => this.handleLeaked(payload);
    this.onBossKilled = () => this.handleKilled();

    EventBus.on(EV.bossSpawned, this.onBossSpawned, this);
    EventBus.on(EV.bossHpChanged, this.onBossHpChanged, this);
    EventBus.on(EV.bossLeaked, this.onBossLeaked, this);
    EventBus.on(EV.bossKilled, this.onBossKilled, this);

    if (FXTEST) this.setupFxTestKeys();

    scene.events.once('shutdown', () => this.destroy());
  }

  handleSpawned({ hp, wave }) {
    this.clearBanner();
    const banner = this.scene.add.text(W / 2, BOSS.bannerY, `보스 웨이브 ${wave} — 거대 스모그 덩어리 등장!`, {
      fontSize: `${BOSS.bannerFontSize}px`, color: BOSS.bannerColor, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9000);
    this.bannerGroup.push(banner);
    this.scene.tweens.add({
      targets: banner, alpha: 0, delay: BOSS.bannerMs, duration: 300,
      onComplete: () => { banner.destroy(); this.bannerGroup = this.bannerGroup.filter(o => o !== banner); },
    });

    this.scene.tweens.killTweensOf(this.skyOverlay);
    this.scene.tweens.add({ targets: this.skyOverlay, alpha: BOSS.skyDarkenAlpha, duration: BOSS.skyDarkenMs });

    this.scene.cameras.main.shake(SHAKE.durationMs, SHAKE.bossSpawn);

    this.showHpBar(hp, hp);
  }

  handleHpChanged({ hp, maxHp }) {
    if (!this.hpFillObj) { this.showHpBar(hp, maxHp); return; }
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this.hpFillObj.width = BOSS.hpBarWidth * ratio;
    this.hpLabelObj.setText(`보스 ${Math.max(0, Math.round(hp))}/${maxHp}`);
  }

  /** 보스가 코어에 도달 — 이 게임에서 가장 위협적인 순간. 쿵 + 강한 흔들림 + 소멸. */
  handleLeaked({ x, y }) {
    this.scene.cameras.main.shake(SHAKE.durationMs, SHAKE.bossLeaked);

    const boom = this.scene.add.circle(x, y, 30, 0xffffff, 0.85).setDepth(9000);
    this.scene.tweens.add({
      targets: boom,
      scaleX: 1 / BOSS.leakSquashScale, scaleY: BOSS.leakSquashScale, alpha: 0,
      duration: BOSS.leakFadeMs, ease: 'Cubic.easeOut',
      onComplete: () => boom.destroy(),
    });

    this.clearHpBar();
    this.fadeSky();
  }

  handleKilled() {
    this.clearHpBar();
    this.fadeSky();
  }

  showHpBar(hp, maxHp) {
    this.clearHpBar();
    const bg = this.scene.add.rectangle(W / 2, BOSS.hpBarY, BOSS.hpBarWidth, BOSS.hpBarHeight, BOSS.hpBarBgColor).setDepth(9000);
    const fill = this.scene.add.rectangle(
      W / 2 - BOSS.hpBarWidth / 2, BOSS.hpBarY, BOSS.hpBarWidth, BOSS.hpBarHeight, BOSS.hpBarColor,
    ).setOrigin(0, 0.5).setDepth(9001);
    const label = this.scene.add.text(W / 2, BOSS.hpBarY, `보스 ${hp}/${maxHp}`, {
      fontSize: '13px', color: '#f2f4f8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(9002);

    this.hpBarGroup = [bg, fill, label];
    this.hpFillObj = fill;
    this.hpLabelObj = label;
  }

  clearHpBar() {
    this.hpBarGroup.forEach(o => o.destroy());
    this.hpBarGroup = [];
    this.hpFillObj = null;
    this.hpLabelObj = null;
  }

  clearBanner() {
    this.bannerGroup.forEach(o => o.destroy());
    this.bannerGroup = [];
  }

  fadeSky() {
    this.scene.tweens.killTweensOf(this.skyOverlay);
    this.scene.tweens.add({ targets: this.skyOverlay, alpha: 0, duration: BOSS.skyDarkenMs });
  }

  // ────────────────────────────────────────── ?fxtest=1 검증 키
  /** N: 보스 등장 강제 · M: bossLeaked(코어 도달) 강제 */
  setupFxTestKeys() {
    const kb = this.scene.input.keyboard;
    kb.on('keydown-N', () => EventBus.emit(EV.bossSpawned, { hp: 400, wave: 5 }));
    kb.on('keydown-M', () => EventBus.emit(EV.bossLeaked, { x: mapData.core.x, y: mapData.core.y }));

    this.scene.add.text(20, H - 220, 'BossAlert 검증(?fxtest=1): N=보스 등장 · M=코어 도달(bossLeaked)', {
      fontSize: '12px', color: '#8a919e',
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);
  }

  destroy() {
    EventBus.off(EV.bossSpawned, this.onBossSpawned, this);
    EventBus.off(EV.bossHpChanged, this.onBossHpChanged, this);
    EventBus.off(EV.bossLeaked, this.onBossLeaked, this);
    EventBus.off(EV.bossKilled, this.onBossKilled, this);
    this.clearBanner();
    this.clearHpBar();
    this.skyOverlay.destroy();
  }
}
