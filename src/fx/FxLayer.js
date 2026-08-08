/**
 * FxLayer.js — Particles + StatusFx 통합 (CLAUDE.md §2 오브젝트 풀링 필수)
 *
 * 원래 두 파일로 나뉠 예정이었지만 이벤트 구독 패턴과 풀링 구조가 완전히 같아서
 * 나누면 풀이 두 벌이 된다 — 하나로 합쳐서 활성 파티클 총량(PARTICLE.maxOnScreen)을
 * 한 군데서 관리한다.
 *
 * - enemyDamaged   → 흰색 반짝임(작은 파편 버스트)
 * - enemyKilled    → 골드색 파편 버스트 + "+20G +5XP" 팝업(DamageNumber와 동일한 풀링 패턴)
 * - statusApplied  → 적 머리 위 상태 아이콘(stun=별·dot=녹색 점멸·slow=파란 삼각). 실제 코어에서만
 *   위치를 추적한다 — EnemyPool.getActive() 폴링(EnemyView.js와 동일한 이유, Mock은 좌표가 없다)
 * - obstacleTriggered → 발동 파편(장애물 색) + 재사용 쿨다운 원형 게이지. 이게 없으면 통나무·
 *   소독약이 실제로 작동하는지 플레이어가 알 방법이 없다 — 장애물 2종이 무의미해 보인다
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { PARTICLE, STATUS_FX, OBSTACLE_FX, VIEW } from '../ui/UITheme.js';
import { H } from '../ui/mapView.js';
import EnemyPool from '../game/EnemyPool.js';

const FXTEST = new URLSearchParams(location.search).get('fxtest') === '1';
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

/** 4점 별 — 자물쇠 아이콘(BuildUI)과 같은 원칙: 이미지 없이 그래픽으로 직접 그린다 */
function drawStar(g, cx, cy, r) {
  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i;
    const rad = i % 2 === 0 ? r : r * 0.4;
    points.push({ x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad });
  }
  g.fillPoints(points, true);
}

export class FxLayer {
  constructor(scene, core) {
    this.scene = scene;
    this.usePoolPolling = !core.__isMock; // EnemyView.js와 동일한 판단 기준

    this.particleFree = [];
    this.particleActive = [];
    this.popupFree = [];
    this.popupActive = [];
    this.statusById = new Map();          // enemyId → { gfx, type, expiresAt }
    this.obstacleGaugeById = new Map();   // instanceId → { gfx, x, y, cooldown, triggeredAt }

    this.onDamaged = ({ x, y }) => this.spawnBurst(x, y, PARTICLE.hitCount, PARTICLE.hitColor, PARTICLE.hitSpeed, PARTICLE.hitLifeMs);
    this.onKilled = ({ x, y, reward, xp }) => {
      this.spawnBurst(x, y, PARTICLE.killCount, PARTICLE.killColor, PARTICLE.killSpeed, PARTICLE.killLifeMs);
      this.spawnKillPopup(x, y, reward, xp);
    };
    this.onStatus = payload => this.spawnStatusMarker(payload);
    this.onObstacle = payload => this.spawnObstacleEffect(payload);

    EventBus.on(EV.enemyDamaged, this.onDamaged, this);
    EventBus.on(EV.enemyKilled, this.onKilled, this);
    EventBus.on(EV.statusApplied, this.onStatus, this);
    EventBus.on(EV.obstacleTriggered, this.onObstacle, this);

    this.onUpdate = (time, delta) => this.tick(time, delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    if (FXTEST) this.setupFxTestKeys();

    scene.events.once('shutdown', () => this.destroy());
  }

  // ────────────────────────────────────────── 파편 파티클 풀 (히트+처치 공용)
  acquireParticle() {
    return this.particleFree.pop() ?? {
      obj: this.scene.add.circle(0, 0, PARTICLE.particleRadius, 0xffffff).setVisible(false),
      vx: 0, vy: 0, born: 0, lifeMs: 0,
    };
  }

  spawnBurst(x, y, count, color, speed, lifeMs) {
    for (let i = 0; i < count; i++) {
      if (this.particleActive.length >= PARTICLE.maxOnScreen) this.evictOldestParticle();
      const p = this.acquireParticle();
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random() * 0.5);
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.born = this.scene.time.now;
      p.lifeMs = lifeMs;
      p.obj.setPosition(x, y).setFillStyle(color, 1).setAlpha(1).setVisible(true);
      this.particleActive.push(p);
    }
  }

  /** 풀 고갈 시 가장 오래된 것부터 밀어낸다 — DamageNumber.js와 동일 원칙("조용히 드롭 안 함") */
  evictOldestParticle() {
    if (this.particleActive.length === 0) return;
    let oldest = 0;
    for (let i = 1; i < this.particleActive.length; i++) {
      if (this.particleActive[i].born < this.particleActive[oldest].born) oldest = i;
    }
    const item = this.particleActive[oldest];
    item.obj.setVisible(false);
    this.particleActive[oldest] = this.particleActive[this.particleActive.length - 1];
    this.particleActive.pop();
    this.particleFree.push(item);
  }

  tickParticles(time, dt) {
    for (let i = this.particleActive.length - 1; i >= 0; i--) {
      const p = this.particleActive[i];
      const t = (time - p.born) / p.lifeMs;
      if (t >= 1) {
        p.obj.setVisible(false);
        this.particleActive[i] = this.particleActive[this.particleActive.length - 1];
        this.particleActive.pop();
        this.particleFree.push(p);
      } else {
        p.obj.x += p.vx * dt;
        p.obj.y += p.vy * dt;
        p.obj.setAlpha(1 - t);
      }
    }
  }

  // ────────────────────────────────────────── 처치 팝업 ("+20G +5XP") — DamageNumber와 동일 패턴
  acquirePopup() {
    return this.popupFree.pop() ?? {
      text: this.scene.add.text(0, 0, '', { fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5).setVisible(false),
      born: 0, originY: 0,
    };
  }

  spawnKillPopup(x, y, reward, xp) {
    const item = this.acquirePopup();
    item.text.setText(`+${reward}G  +${xp}XP`).setColor(PARTICLE.goldPopColor)
      .setPosition(x, y).setAlpha(1).setVisible(true);
    item.originY = y;
    item.born = this.scene.time.now;
    this.popupActive.push(item);
  }

  tickPopups(time) {
    for (let i = this.popupActive.length - 1; i >= 0; i--) {
      const item = this.popupActive[i];
      const t = (time - item.born) / PARTICLE.goldPopMs;
      if (t >= 1) {
        item.text.setVisible(false);
        this.popupActive[i] = this.popupActive[this.popupActive.length - 1];
        this.popupActive.pop();
        this.popupFree.push(item);
      } else {
        item.text.y = item.originY - PARTICLE.goldPopRise * t;
        item.text.setAlpha(1 - t);
      }
    }
  }

  // ────────────────────────────────────────── 상태이상 마커
  spawnStatusMarker({ enemyId, type, duration }) {
    if (!this.usePoolPolling) return; // Mock은 statusApplied에 좌표가 없어 추적 불가(EnemyView.js와 동일 이유)
    let marker = this.statusById.get(enemyId);
    if (!marker) {
      marker = { gfx: this.scene.add.graphics().setDepth(40) };
      this.statusById.set(enemyId, marker);
    }
    marker.type = type;
    marker.expiresAt = this.scene.time.now + duration * 1000;
  }

  tickStatusMarkers(time) {
    if (this.statusById.size === 0) return;
    const active = EnemyPool.getActive();
    const posById = new Map(active.map(e => [e.id, e]));

    for (const [enemyId, marker] of [...this.statusById]) {
      const enemy = posById.get(enemyId);
      if (!enemy || time > marker.expiresAt) {
        marker.gfx.destroy();
        this.statusById.delete(enemyId);
        continue;
      }
      this.drawStatusIcon(marker, enemy.x, enemy.y + STATUS_FX.offsetY, time);
    }
  }

  /** 형태로 구분한다(색만으로 구분하면 색약·저대비에서 무너진다 — BUILD의 사거리/오라 원과 동일 원칙) */
  drawStatusIcon(marker, x, y, time) {
    const g = marker.gfx.clear().setPosition(x, y);
    if (marker.type === 'stun') {
      g.fillStyle(STATUS_FX.stunColor, 1);
      drawStar(g, 0, 0, STATUS_FX.stunSize);
    } else if (marker.type === 'dot') {
      const blink = (Math.sin(time / STATUS_FX.dotBlinkMs) + 1) / 2;
      g.fillStyle(STATUS_FX.dotColor, 0.35 + blink * 0.65);
      g.fillCircle(0, 0, 5);
    } else if (marker.type === 'slow') {
      // 클래식 물방울(눈물방울) — 둥근 몸통(원) + 뾰족한 위(삼각형)를 겹쳐 그린다
      const s = STATUS_FX.slowSize;
      g.fillStyle(STATUS_FX.slowColor, STATUS_FX.slowAlpha);
      g.fillCircle(0, s * STATUS_FX.slowDropBulgeMul, s * STATUS_FX.slowDropRadiusMul);
      g.fillTriangle(
        0, -s * STATUS_FX.slowDropTipMul,
        -s * STATUS_FX.slowDropShoulderMul, 0,
        s * STATUS_FX.slowDropShoulderMul, 0,
      );
      // 작은 흰 하이라이트 — 물방울다움을 살리는 반짝임 하나
      g.fillStyle(STATUS_FX.slowDropHighlightColor, STATUS_FX.slowDropHighlightAlpha);
      g.fillCircle(
        -s * STATUS_FX.slowDropHighlightOffsetMul,
        s * STATUS_FX.slowDropBulgeMul - s * STATUS_FX.slowDropHighlightOffsetMul,
        s * STATUS_FX.slowDropHighlightRadiusMul,
      );
    }
  }

  // ────────────────────────────────────────── 장애물 발동 + 쿨다운 게이지
  spawnObstacleEffect({ instanceId, type, x, y, cooldown }) {
    let gauge = this.obstacleGaugeById.get(instanceId);
    if (!gauge) {
      gauge = { gfx: this.scene.add.graphics().setDepth(40), x, y };
      this.obstacleGaugeById.set(instanceId, gauge);
    }
    gauge.cooldown = cooldown;
    gauge.triggeredAt = this.scene.time.now;

    const color = VIEW.objectColor[type] ?? 0xffffff; // type = obstacle id(log/disinfectant), TowerView와 동일 색
    this.spawnBurst(x, y, PARTICLE.hitCount, color, PARTICLE.hitSpeed, PARTICLE.hitLifeMs);
  }

  tickGauges(time) {
    this.obstacleGaugeById.forEach(gauge => {
      const progress = gauge.cooldown > 0
        ? Phaser.Math.Clamp((time - gauge.triggeredAt) / (gauge.cooldown * 1000), 0, 1)
        : 1;
      this.redrawGauge(gauge, progress);
    });
  }

  redrawGauge(gauge, progress) {
    const g = gauge.gfx;
    const cx = gauge.x, cy = gauge.y + OBSTACLE_FX.gaugeOffsetY, r = OBSTACLE_FX.gaugeRadius;
    g.clear();
    g.lineStyle(2, OBSTACLE_FX.gaugeBgColor, 0.9);
    g.strokeCircle(cx, cy, r);
    if (progress > 0) {
      g.fillStyle(OBSTACLE_FX.gaugeFillColor, 0.85);
      g.slice(cx, cy, r, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * progress), false);
      g.fillPath();
    }
  }

  // ────────────────────────────────────────── 프레임 루프
  tick(time, delta) {
    this.tickParticles(time, delta / 1000);
    this.tickPopups(time);
    this.tickStatusMarkers(time);
    this.tickGauges(time);
  }

  // ────────────────────────────────────────── ?fxtest=1 검증 키
  /** ,(쉼표): 실제 코어의 활성 적 최대 3마리에 stun·dot·slow를 각각 강제 적용 */
  setupFxTestKeys() {
    const kb = this.scene.input.keyboard;
    kb.on('keydown-COMMA', () => {
      const active = this.usePoolPolling ? EnemyPool.getActive() : [];
      if (!active.length) {
        if (DEBUG) console.warn('[FxLayer] , — 활성 적이 없어 상태이상 마커를 확인할 대상이 없다(?mockcore=1에서는 위치 추적 안 함)');
        return;
      }
      ['stun', 'dot', 'slow'].forEach((type, i) => {
        const enemy = active[i];
        if (enemy) EventBus.emit(EV.statusApplied, { enemyId: enemy.id, type, duration: 3 });
      });
    });

    this.scene.add.text(20, H - 240, 'FxLayer 검증(?fxtest=1): , = 상태이상 3종(stun·dot·slow) 강제', {
      fontSize: '12px', color: '#8a919e',
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);
  }

  destroy() {
    EventBus.off(EV.enemyDamaged, this.onDamaged, this);
    EventBus.off(EV.enemyKilled, this.onKilled, this);
    EventBus.off(EV.statusApplied, this.onStatus, this);
    EventBus.off(EV.obstacleTriggered, this.onObstacle, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    [...this.particleFree, ...this.particleActive].forEach(p => p.obj.destroy());
    [...this.popupFree, ...this.popupActive].forEach(p => p.text.destroy());
    this.statusById.forEach(m => m.gfx.destroy());
    this.obstacleGaugeById.forEach(g => g.gfx.destroy());
  }
}
