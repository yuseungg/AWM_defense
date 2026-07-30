/**
 * DamageNumber.js — 데미지 숫자 (오브젝트 풀링 필수, CLAUDE.md §2: 웨이브 40+ 에서 100개 이상 상존)
 *
 * 색(isEffective) ≠ 크기(isCrit). 둘은 서로 다른 축이라 한쪽이 다른 쪽을 가리면
 * 특효+크리가 겹치는(가장 통쾌한) 순간에 상성 정보가 사라진다 (CLAUDE.md §1 절대규칙 3).
 *
 * 트윈 대신 scene의 UPDATE 이벤트에서 직접 위치·알파를 갱신한다:
 *   ① 히트마다 tweens.add를 새로 만들면 풀링으로 아낀 할당 비용을 다시 쓰게 된다
 *   ② scene UPDATE 이벤트는 씬이 일시정지되면 자동으로 멈춘다 (드래프트 오버레이 대응)
 *
 * 풀은 비활성 프리 리스트(스택)로 관리한다. 라운드로빈이 아니다 — 활성 중인 숫자를
 * 덮어쓰면 화면에서 순간이동한 것처럼 보인다. 풀이 고갈되면(과부하) 가장 오래된
 * 활성 숫자를 밀어내 재사용한다 — "확률이 낮다"는 가정으로 조용히 드롭하지 않는다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { DMG } from '../ui/UITheme.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const EVICT_WARN_THROTTLE_MS = 3000; // 풀 고갈 경고 스로틀 — 과부하 중 다른 로그가 묻히지 않게

export class DamageNumber {
  constructor(scene) {
    this.scene = scene;

    this.freeList = [];
    this.activeList = [];

    this._evictWarnNextAt = -Infinity; // -Infinity → 첫 1회는 무조건 즉시 출력
    this._evictWarnSuppressed = 0;

    for (let i = 0; i < DMG.poolSize; i++) {
      const text = scene.add.text(0, 0, '', { fontSize: `${DMG.fontSize}px` })
        .setOrigin(0.5)
        .setVisible(false);
      this.freeList.push({ text, originY: 0, born: -Infinity });
    }

    this.label = {
      text: scene.add.text(scene.cameras.main.centerX, DMG.labelY, DMG.effectiveLabel, {
        fontSize: `${DMG.fontSize}px`,
        color: DMG.effectiveColor,
      }).setOrigin(0.5).setVisible(false),
      born: -Infinity,
    };

    // off()로 정확히 떼어내려면 최초 등록한 함수 참조를 그대로 들고 있어야 한다 (SeoulTowerLight와 동일 패턴)
    this.onDamaged = (payload) => this.spawn(payload);
    EventBus.on(EV.enemyDamaged, this.onDamaged, this);

    this.onUpdate = (time) => this.tick(time);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  spawn({ amount, x, y, isEffective, isCrit }) {
    const time = this.scene.time.now;

    let item;
    if (this.freeList.length > 0) {
      item = this.freeList.pop();
    } else {
      // 풀 고갈 — 가장 오래된 활성 숫자(가장 먼저 사라질 숫자)를 밀어내 재사용한다
      let oldest = 0;
      for (let i = 1; i < this.activeList.length; i++) {
        if (this.activeList[i].born < this.activeList[oldest].born) oldest = i;
      }
      item = this.activeList[oldest];
      this.activeList[oldest] = this.activeList[this.activeList.length - 1];
      this.activeList.pop();
      if (DEBUG) this.warnEviction(time);
    }

    // 색 = 상성, 크기 = 크리. 특효면 크리 여부와 무관하게 항상 노란색이다.
    const color = isEffective ? DMG.effectiveColor : isCrit ? DMG.critColor : DMG.normalColor;
    const scale = isCrit ? DMG.critScale : isEffective ? DMG.effectiveScale : 1.0;

    item.text.setText(String(amount)).setColor(color).setScale(scale)
      .setPosition(x, y).setAlpha(1).setVisible(true);
    item.originY = y;
    item.born = time;

    this.activeList.push(item);

    if (isEffective) this.showLabel(time);
  }

  /** 첫 1회는 즉시, 이후는 EVICT_WARN_THROTTLE_MS에 1번만 — 그사이 누적 횟수를 같이 찍는다 */
  warnEviction(time) {
    if (time < this._evictWarnNextAt) {
      this._evictWarnSuppressed++;
      return;
    }
    const suffix = this._evictWarnSuppressed > 0 ? ` — 최근 ${EVICT_WARN_THROTTLE_MS / 1000}초간 ${this._evictWarnSuppressed}회` : '';
    console.warn(`[DamageNumber] 풀 고갈(poolSize=${DMG.poolSize})${suffix}`);
    this._evictWarnNextAt = time + EVICT_WARN_THROTTLE_MS;
    this._evictWarnSuppressed = 0;
  }

  showLabel(time) {
    if (time - this.label.born < DMG.labelCooldownMs) return; // 도배 방지
    this.label.born = time;
    this.label.text.setAlpha(1).setVisible(true).setY(DMG.labelY);
  }

  tick(time) {
    for (let i = this.activeList.length - 1; i >= 0; i--) {
      const item = this.activeList[i];
      const t = (time - item.born) / DMG.lifeMs;
      if (t >= 1) {
        item.text.setVisible(false);
        this.activeList[i] = this.activeList[this.activeList.length - 1];
        this.activeList.pop();
        this.freeList.push(item);
      } else {
        item.text.y = item.originY - DMG.riseDistance * t;
        item.text.setAlpha(1 - t);
      }
    }

    const lt = time - this.label.born;
    if (lt < DMG.lifeMs) {
      const t = lt / DMG.lifeMs;
      this.label.text.y = DMG.labelY - DMG.riseDistance * t;
      this.label.text.setAlpha(1 - t);
    } else if (this.label.text.visible) {
      this.label.text.setVisible(false);
    }
  }

  /** 부하 테스트/모니터링용. 내부 상태를 직접 노출하지 않고 개수만 읽는다 */
  get activeCount() {
    return this.activeList.length;
  }

  destroy() {
    EventBus.off(EV.enemyDamaged, this.onDamaged, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    [...this.freeList, ...this.activeList].forEach(item => item.text.destroy());
    this.label.text.destroy();
  }
}
