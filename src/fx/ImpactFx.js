/**
 * ImpactFx.js — 명중 임팩트(섬광+링+불똥), 오브젝트 풀링. LaserFx 전용이 아니라 공용이다 —
 * DDP 폭발 등 앞으로 붙을 다른 명중 이펙트도 spawnImpact() 하나로 재사용한다.
 *
 * 두 가지 풀:
 * ── radial(섬광·링 공유) ────────────────────────────────────────────
 * 둘 다 "반경 0→N, 알파 1→0"으로 동일한 애니메이션이라 풀 하나를 공유하고 filled(채움=섬광/
 * 테두리=링) 플래그로만 그리는 방식을 가른다. 유닛 원(반지름 1)을 스폰 시 딱 한 번 그려두고,
 * 매 프레임은 `setScale(maxRadius × easeOut(t))`만 갱신한다(ProjectileFx가 로컬 좌표에 모양을
 * 1회 그리고 트랜스폼만 바꾸는 것과 같은 원칙 — 반경이 바뀔 때마다 다시 그리는 것보다 훨씬 싸다).
 *
 * ── spark(불똥) ────────────────────────────────────────────────────
 * 방사형으로 튀는 짧은 선. 로컬 좌표에 1회 그린 뒤 발사 각도로 회전시켜 두고, 매 프레임 중력
 * (vy += gravity×dt)을 더해 아래로 처지는 궤적을 만든다. 방향이 계속 바뀌므로 회전은 매 프레임
 * atan2(vy,vx)로 다시 잡는다(풀이 작아 비용 무시할 만함 — ProjectileFx의 호밍과 같은 급).
 *
 * 색: flash·spark는 고정(흰색/연노랑) — 레이저·타워 색과 겹치면 그 위에서 안 보이기 때문이다.
 * ring만 호출자가 넘긴 color를 그대로 써서 "흰 코어 + 무기색 테두리"를 만든다.
 *
 * 둘 다 FxLayer.tickParticles와 동일한 t=경과/lifeMs 페이드 패턴, 풀 고갈 시 가장 오래된 것부터
 * 밀어낸다(두 풀 각각 독립적으로).
 */

import Phaser from 'phaser';
import { IMPACT_FX } from '../ui/UITheme.js';

/** 반경이 처음엔 빠르게, 갈수록 천천히 커지는 "확 터지는" 느낌의 표준 감속 커브 */
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function byLevel(arr, level) {
  return arr[Math.min(level, arr.length - 1)];
}

export class ImpactFx {
  constructor(scene) {
    this.scene = scene;
    this.radialFree = [];
    this.radialActive = [];
    this.sparkFree = [];
    this.sparkActive = [];

    this.onUpdate = (time, delta) => this.tick(time, delta / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  /** 공용 진입점 — 섬광 1 + 링 1 + 불똥 N개(레벨별)를 한 번에 스폰한다. */
  spawnImpact(x, y, color, level = 0) {
    this.spawnRadial(x, y, IMPACT_FX.flashColor, byLevel(IMPACT_FX.flashRadiusByLevel, level), IMPACT_FX.flashMs, true);
    this.spawnRadial(x, y, color, byLevel(IMPACT_FX.ringRadiusByLevel, level), IMPACT_FX.ringMs, false);

    const count = byLevel(IMPACT_FX.sparkCountByLevel, level);
    for (let i = 0; i < count; i++) this.spawnSpark(x, y);
  }

  // ────────────────────────────────────────── radial(섬광·링 공유)
  acquireRadial() {
    return this.radialFree.pop() ?? { gfx: this.scene.add.graphics().setVisible(false) };
  }

  /**
   * baseAlpha(기본 1) — 그리는 시점에 채워/그리는 자체 알파(도형에 구워짐). tick()의 setAlpha(1-t)는
   * GameObject 전체 알파라 이것과 곱연산으로 겹친다 — baseAlpha를 낮추면 "시작부터 반투명"하게
   * 나타났다 페이드되고(AoeCircleFx.js의 청계천 채운 원), 기본값 1이면 기존 섬광/링과 동일하다.
   */
  spawnRadial(x, y, color, maxRadius, lifeMs, filled, baseAlpha = 1) {
    if (this.radialActive.length >= IMPACT_FX.poolSize) this.evictOldestRadial();

    const p = this.acquireRadial();
    const g = p.gfx.clear();
    if (filled) {
      g.fillStyle(color, baseAlpha);
      g.fillCircle(0, 0, 1);
    } else {
      g.lineStyle(IMPACT_FX.ringWidth, color, baseAlpha);
      g.strokeCircle(0, 0, 1);
    }
    g.setPosition(x, y).setScale(0).setAlpha(1).setVisible(true);

    p.maxRadius = maxRadius;
    p.lifeMs = lifeMs;
    p.born = this.scene.time.now;
    this.radialActive.push(p);
  }

  evictOldestRadial() {
    if (this.radialActive.length === 0) return;
    let oldest = 0;
    for (let i = 1; i < this.radialActive.length; i++) {
      if (this.radialActive[i].born < this.radialActive[oldest].born) oldest = i;
    }
    this.despawnRadial(oldest);
  }

  despawnRadial(index) {
    const item = this.radialActive[index];
    item.gfx.setVisible(false);
    this.radialActive[index] = this.radialActive[this.radialActive.length - 1];
    this.radialActive.pop();
    this.radialFree.push(item);
  }

  // ────────────────────────────────────────── spark(불똥)
  acquireSpark() {
    return this.sparkFree.pop() ?? { gfx: this.scene.add.graphics().setVisible(false) };
  }

  spawnSpark(x, y) {
    if (this.sparkActive.length >= IMPACT_FX.poolSize) this.evictOldestSpark();

    const angle = Math.random() * Math.PI * 2;
    const speed = IMPACT_FX.sparkSpeedMin + Math.random() * (IMPACT_FX.sparkSpeedMax - IMPACT_FX.sparkSpeedMin);

    const p = this.acquireSpark();
    const g = p.gfx.clear();
    g.lineStyle(IMPACT_FX.sparkWidth, IMPACT_FX.sparkColor, 1);
    g.lineBetween(-IMPACT_FX.sparkLength / 2, 0, IMPACT_FX.sparkLength / 2, 0);
    g.setPosition(x, y).setRotation(angle).setAlpha(1).setVisible(true);

    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.born = this.scene.time.now;
    this.sparkActive.push(p);
  }

  evictOldestSpark() {
    if (this.sparkActive.length === 0) return;
    let oldest = 0;
    for (let i = 1; i < this.sparkActive.length; i++) {
      if (this.sparkActive[i].born < this.sparkActive[oldest].born) oldest = i;
    }
    this.despawnSpark(oldest);
  }

  despawnSpark(index) {
    const item = this.sparkActive[index];
    item.gfx.setVisible(false);
    this.sparkActive[index] = this.sparkActive[this.sparkActive.length - 1];
    this.sparkActive.pop();
    this.sparkFree.push(item);
  }

  // ────────────────────────────────────────── 프레임 루프
  tick(time, dt) {
    for (let i = this.radialActive.length - 1; i >= 0; i--) {
      const p = this.radialActive[i];
      const t = (time - p.born) / p.lifeMs;
      if (t >= 1) { this.despawnRadial(i); continue; }
      p.gfx.setScale(p.maxRadius * easeOutQuad(t)).setAlpha(1 - t);
    }

    for (let i = this.sparkActive.length - 1; i >= 0; i--) {
      const p = this.sparkActive[i];
      const t = (time - p.born) / IMPACT_FX.sparkLifeMs;
      if (t >= 1) { this.despawnSpark(i); continue; }
      p.vy += IMPACT_FX.sparkGravityPxS2 * dt;
      p.gfx.x += p.vx * dt;
      p.gfx.y += p.vy * dt;
      p.gfx.setRotation(Math.atan2(p.vy, p.vx)).setAlpha(1 - t);
    }
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    [...this.radialFree, ...this.radialActive].forEach(p => p.gfx.destroy());
    [...this.sparkFree, ...this.sparkActive].forEach(p => p.gfx.destroy());
  }
}
