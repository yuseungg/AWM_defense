/**
 * LaserFx.js — 즉시히트 레이저(오브젝트 풀링, FxLayer.spawnBurst/tickParticles와 동일한 알파 감쇠 패턴)
 *
 * ProjectileFx.js(화살)와 시각 모델이 다르다 — 화살은 "매 프레임 위치·방향이 갱신되는 이동체"지만
 * 레이저는 발사 순간 끝점 두 개가 고정되고 알파만 감쇠한다. 억지로 ProjectileFx에 얹으면 shape별로
 * tick() 로직이 갈라지는 분기투성이가 돼서 별도 파일로 둔다(같은 "타워 발사 이펙트" 가족이라
 * FxLayer(적 반응형 이펙트 전용, 이미 300줄 임박)에도 안 넣는다).
 *
 * towerFired를 구독하되, LASER_CONFIG에 설정이 있는 타워만 그린다(설정 존재로 필터 — 하드코딩
 * 분기 없음). 지금은 롯데월드타워(보라 고정)만 — N서울타워(레벨별 색)는 발사 시점의 현재 레벨을
 * 추적하는 작업이 따로 필요해 다음 턴에 이 맵에 항목만 추가한다.
 *
 * 발사 시 (x,y)→(targetX,targetY) 선을 월드 좌표로 즉시 한 번 그린다 — 이후 안 움직이므로
 * 화살과 달리 위치·회전 갱신 자체가 없다. 글로우(두껍고 옅은 선)와 코어(얇고 진한 선)를 같은
 * Graphics 객체에 겹쳐 그려서, tick()의 setAlpha() 한 번으로 둘이 같은 비율로 함께 페이드된다.
 *
 * depth는 선분 중간점 y로 스폰 시 1회만 설정한다(그 후 안 움직이니 갱신 불필요 — 화살의 "매
 * 프레임 depth=y 갱신"과 다른 이유는 이동 여부 차이 하나뿐이다).
 *
 * ?mockcore=1에서는 MockGameCore가 towerFired를 애초에 발행하지 않는다(ProjectileFx.js와 동일
 * 이유) — spawn() 자체가 안 불려서 별도 분기가 필요 없다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { LASER_FX } from '../ui/UITheme.js';

/** towerId → 레이저 설정(색만). 여기 없는 타워는 무시한다(필터 방식). */
const LASER_CONFIG = {
  lotteWorldTower: { color: 0x9b59b6 }, // 보라
  // nseoulTower: { color: ... } — 다음 작업(레벨별 색, 레벨 추적 필요)에서 추가
};

export class LaserFx {
  constructor(scene) {
    this.scene = scene;
    this.free = [];
    this.active = [];

    this.onFired = payload => this.spawn(payload);
    EventBus.on(EV.towerFired, this.onFired, this);

    this.onUpdate = time => this.tick(time);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  acquire() {
    return this.free.pop() ?? { gfx: this.scene.add.graphics().setVisible(false) };
  }

  spawn({ towerId, x, y, targetX, targetY }) {
    const cfg = LASER_CONFIG[towerId];
    if (!cfg) return; // 설정 없는 타워 — 조용히 무시

    if (this.active.length >= LASER_FX.poolSize) this.evictOldest();

    const p = this.acquire();
    const g = p.gfx.clear();
    g.lineStyle(LASER_FX.glowWidth, cfg.color, LASER_FX.glowAlpha);
    g.lineBetween(x, y, targetX, targetY);
    g.lineStyle(LASER_FX.coreWidth, cfg.color, LASER_FX.coreAlpha);
    g.lineBetween(x, y, targetX, targetY);
    g.setDepth((y + targetY) / 2).setAlpha(1).setVisible(true);

    p.born = this.scene.time.now;
    this.active.push(p);
  }

  /** 풀 고갈 시 가장 오래된 활성 레이저를 밀어낸다(FxLayer.evictOldestParticle과 동일 원칙) */
  evictOldest() {
    if (this.active.length === 0) return;
    let oldest = 0;
    for (let i = 1; i < this.active.length; i++) {
      if (this.active[i].born < this.active[oldest].born) oldest = i;
    }
    this.despawn(oldest);
  }

  despawn(index) {
    const item = this.active[index];
    item.gfx.setVisible(false);
    this.active[index] = this.active[this.active.length - 1];
    this.active.pop();
    this.free.push(item);
  }

  /** 위치·회전 갱신 없음 — 알파 감쇠만(FxLayer.tickParticles와 동일 t=경과/lifeMs 패턴) */
  tick(time) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const t = (time - p.born) / LASER_FX.fadeMs;
      if (t >= 1) { this.despawn(i); continue; }
      p.gfx.setAlpha(1 - t);
    }
  }

  destroy() {
    EventBus.off(EV.towerFired, this.onFired, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    [...this.free, ...this.active].forEach(p => p.gfx.destroy());
  }
}
