/**
 * HUD.js — 골드 · 웨이브/계절 · 레벨/XP 세그먼트 바
 *
 * ❌ 도시 체력 숫자바는 만들지 않는다 — 조명(SeoulTowerLight)이 체력바다 (CLAUDE.md §8).
 * goldChanged/xpChanged/waveStarted/seasonChanged만 구독한다. 실시간 갱신은 전부
 * 이벤트로 받고, 씬 진입 시 최초 1회만 getState()로 초기값을 채운다 (CLAUDE.md D18).
 *
 * 패널은 Panel.js의 drawPanel/drawSegmentBar만 쓴다 — 직접 rectangle을 그리지 않는다
 * (미래도시 패널 언어를 HUD/Controls/BuildUI가 공유하기 위한 규칙, HANDOFF.md §3 참고).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { HUD as HUDT, FONT, PANEL } from './UITheme.js';
import { drawPanel, drawSegmentBar } from './Panel.js';

export class HUD {
  constructor(scene) {
    this.scene = scene;
    const p = HUDT.padding;
    // 구분선(dividerX) 오른쪽 열은 전부 이 x에서 시작한다 — 웨이브 텍스트(wx)뿐 아니라
    // XP 바·"LV n" 라벨도 여기서 계산해야 구분선을 안 침범한다(HUDT.columnMargin, UITheme.js).
    // renderXp()에서도 다시 써야 해서 인스턴스에 저장해둔다.
    const wx = HUDT.dividerX + HUDT.columnMargin;
    this.rightColX = wx;

    this.panel = drawPanel(scene, HUDT.x, HUDT.y, HUDT.width, HUDT.height, { corners: ['br'] });

    this.goldText = scene.add.text(p, HUDT.rowGoldY, '', {
      fontFamily: FONT.number, fontSize: `${HUDT.numberFontSize}px`, color: HUDT.goldColor,
      letterSpacing: FONT.numberLetterSpacingEm * HUDT.numberFontSize,
    });
    this.goldLabel = scene.add.text(p, HUDT.rowLabelY, '골드', {
      fontFamily: FONT.label, fontSize: `${FONT.labelSize}px`, color: FONT.labelColor,
      letterSpacing: FONT.labelLetterSpacingEm * FONT.labelSize,
    });

    this.divider = scene.add.line(0, 0, HUDT.dividerX, 10, HUDT.dividerX, HUDT.height - 10, PANEL.borderColor, HUDT.dividerAlpha)
      .setOrigin(0, 0).setLineWidth(1);

    this.waveText = scene.add.text(wx, HUDT.rowGoldY, '', {
      fontFamily: FONT.ui, fontSize: `${HUDT.waveFontSize}px`, color: HUDT.neutralColor,
    });
    this.waveLabel = scene.add.text(wx, HUDT.rowLabelY, '진행', {
      fontFamily: FONT.label, fontSize: `${FONT.labelSize}px`, color: FONT.labelColor,
      letterSpacing: FONT.labelLetterSpacingEm * FONT.labelSize,
    });

    // "LV n" + XP 세그먼트 바는 구분선 오른쪽(wx)에서 시작한다 — 예전엔 왼쪽 padding(p)에서
    // 시작해 바 길이(8칸)가 구분선을 넘어 침범했다.
    this.levelText = scene.add.text(wx, HUDT.rowXpY, '', {
      fontFamily: FONT.label, fontSize: `${FONT.labelSize}px`, color: FONT.labelColor,
      letterSpacing: FONT.labelLetterSpacingEm * FONT.labelSize,
    });
    this.xpSegs = null; // drawSegmentBar는 매번 새 Graphics를 만들어서 renderXp()에서 destroy 후 재생성한다

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
    this.goldText.setText(`${this.gold}`);
  }

  renderWave() {
    this.waveText.setText(`웨이브 ${this.wave} · ${this.season}`);
  }

  renderXp() {
    this.levelText.setText(`LV ${this.level}`);
    const ratio = this.xpToNext > 0 ? Phaser.Math.Clamp(this.xp / this.xpToNext, 0, 1) : 0;
    const filled = Math.round(ratio * HUDT.xpSegCount);

    // xpSegWidth(HUDT)로 세그먼트 폭을 줄인다 — 다른 세그먼트 바(PANEL.segWidth=18)와 다르게
    // 여기만 좁혀야 구분선 오른쪽(this.rightColX)에서 시작해도 8칸이 패널 오른쪽 밖으로 안 넘친다.
    this.xpSegs?.destroy();
    this.xpSegs = drawSegmentBar(
      this.scene, this.rightColX + HUDT.xpSegX, HUDT.rowXpY, HUDT.xpSegCount, filled,
      { segWidth: HUDT.xpSegWidth },
    );
  }

  destroy() {
    EventBus.off(EV.goldChanged, this.onGold, this);
    EventBus.off(EV.xpChanged, this.onXp, this);
    EventBus.off(EV.waveStarted, this.onWave, this);
    EventBus.off(EV.seasonChanged, this.onSeason, this);
    this.panel.destroy();
    this.goldText.destroy();
    this.goldLabel.destroy();
    this.divider.destroy();
    this.waveText.destroy();
    this.waveLabel.destroy();
    this.levelText.destroy();
    this.xpSegs?.destroy();
  }
}
