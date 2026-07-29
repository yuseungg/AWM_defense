/**
 * SeoulTowerLight.js — N서울타워 조명 = 도시 체력바 (CLAUDE.md 절대 규칙 1: 숫자 체력바 금지)
 *
 * 4단계: 파랑(4) → 초록(3) → 노랑(2) → 빨강(1) → 소등(0)
 * EventBus의 cityDamaged/cityHealed만 구독한다. 씬은 생성만 하면 나머지는 알아서 돈다.
 *
 * 색 보간·맥동은 Phaser tween(scene.tweens)으로만 만든다 — DraftOverlay 등이 게임을
 * 일시정지시킬 때 조명도 같이 멈춰야 하기 때문. 자체 update 루프를 쓰면 일시정지 중에도
 * 조명만 계속 돈다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { LIGHT } from '../ui/UITheme.js';

export class SeoulTowerLight {
  constructor(scene, x, y, radius = 13) {
    this.scene = scene;
    this.level = 4;

    this.circle = scene.add.circle(x, y, radius, LIGHT.colors[3]);

    this.colorTween = null;

    // off()로 정확히 떼어내려면 최초 등록한 함수 참조를 그대로 들고 있어야 한다
    this.onDamaged = ({ level }) => this.setLevel(level, true);
    this.onHealed = ({ level }) => this.setLevel(level, false);

    EventBus.on(EV.cityDamaged, this.onDamaged, this);
    EventBus.on(EV.cityHealed, this.onHealed, this);

    // destroy() 호출을 깜빡해도 씬이 죽으면 리스너가 같이 정리되도록 안전판을 건다
    scene.events.once('shutdown', () => this.destroy());
  }

  setLevel(newLevel, isDamage) {
    this._stopTweens();

    const fromInt = this.circle.fillColor;
    const toInt = newLevel <= 0 ? LIGHT.offColor : LIGHT.colors[newLevel - 1];
    this._tweenColor(fromInt, toInt);

    this.level = newLevel;
  }

  _tweenColor(fromInt, toInt) {
    const from = Phaser.Display.Color.IntegerToColor(fromInt);
    const to = Phaser.Display.Color.IntegerToColor(toInt);

    this.colorTween = this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: LIGHT.transitionMs,
      onUpdate: (tween) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, tween.getValue());
        this.circle.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  _stopTweens() {
    if (this.colorTween) { this.colorTween.stop(); this.colorTween = null; }
  }

  destroy() {
    this._stopTweens();
    EventBus.off(EV.cityDamaged, this.onDamaged, this);
    EventBus.off(EV.cityHealed, this.onHealed, this);
    this.circle.destroy();
  }
}
