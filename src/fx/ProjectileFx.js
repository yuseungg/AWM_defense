/**
 * ProjectileFx.js — 발사~이동~소멸 투사체 이펙트(오브젝트 풀링, FxLayer 패턴)
 *
 * towerFired를 구독하되, PROJECTILE_CONFIG에 설정이 있는 타워만 그린다 — 'gwanghwamun' 같은
 * 하드코딩 분기 대신 "그 towerId의 설정이 있는가"로 필터한다. 나중에 DDP 포탄 등을 추가할 때
 * 이 맵에 항목만 더하면 된다(코드 구조 변경 없음).
 *
 * ── 호밍(EnemyPool 폴링) ──────────────────────────────────────────────
 * towerFired 페이로드엔 targetX/targetY(발사 순간 스냅샷 좌표)만 있고 어느 적인지 식별자가
 * 없다 — Combat.js/Projectile.js처럼 실제 Enemy 객체 참조를 직접 받는 게 아니라서, "그 좌표에
 * 가장 가까운 살아있는 적"을 그 타워가 겨눈 대상으로 추론한다. WaveManager.fireTower가
 * EventBus.emit()하는 시점과 이 spawn()이 그 이벤트를 동기로 받는 시점 사이엔 시간이 전혀
 * 흐르지 않으므로(같은 틱) targetX/Y는 그 적의 실제 좌표와 완전히 일치한다 — 정확한 식별이다
 * (두 적이 정확히 같은 좌표에 겹쳐 있는 극단적 경우만 오판 가능하지만, 결과는 "다른 근처 적을
 * 追적"이라 시각적으로 티가 안 난다).
 *
 * 이후 매 프레임 EnemyPool.getActive()에서 그 id를 다시 찾아 목적지(destX/Y)를 갱신한다
 * (FxLayer.tickStatusMarkers·EnemyView가 이미 쓰는 폴링 패턴 재사용). 화살 여러 개가 동시에
 * 날 때 적마다 매번 배열을 새로 만들지 않도록, id→enemy Map은 틱 1회만 만들어 전부가 공유한다.
 *
 * 목표가 죽거나 사라지면(더 이상 posById에 없음) targetId를 null로 바꾸고 이후 갱신을 멈춘다
 * — destX/Y가 마지막으로 확인된 좌표에 고정된 채 그 지점을 향해 계속 직진하다 도착하면
 * 소멸한다("즉시 사라지면 어색하다"는 요건).
 *
 * 방향 전환엔 최대 각속도(arrowTurnRateDegPerSec)를 둬서 매 프레임 目標 쪽으로 딱 붙지 않고
 * 자연스럽게 휘어 쫓아가게 한다 — 이 때문에(이전 버전의 "발사 시 1회 계산, 매 프레임은 위치만"
 * 원칙과 달리) 매 프레임 삼각함수(atan2/sin/cos)가 필요하다. 풀 크기(30)가 작아 비용은
 * 무시할 만하다(EnemyView가 훨씬 큰 규모로 이미 하는 것과 같은 급).
 *
 * maxLifeMs는 회전 제한 때문에 이론상 영원히 목적지에 못 닿는 극단적 상황(예: 목표가 화살보다
 * 빠르게 계속 방향을 바꾸며 도망) 대비 강제 소멸 안전판이다.
 *
 * ?mockcore=1에서는 MockGameCore가 towerFired를 애초에 발행하지 않는다(TowerView 발사 반동과
 * 동일 이유) — spawn() 자체가 안 불려서 EnemyPool 폴링도 전혀 안 일어난다. 별도 __isMock
 * 분기가 필요 없다(core 파라미터 자체가 불필요).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { PROJECTILE_FX } from '../ui/UITheme.js';
import EnemyPool from '../game/EnemyPool.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const TURN_RATE_RAD_S = Phaser.Math.DegToRad(PROJECTILE_FX.arrowTurnRateDegPerSec);

/** towerId → 투사체 설정. 여기 없는 타워는 무시한다(필터 방식 — if towerId==='gwanghwamun' 금지). */
const PROJECTILE_CONFIG = {
  gwanghwamun: {
    shape: 'arrow',
    color: PROJECTILE_FX.arrowColor,
    length: PROJECTILE_FX.arrowLength,
    width: PROJECTILE_FX.arrowWidth,
    speed: PROJECTILE_FX.arrowSpeedPxS,
  },
  // ddp: { shape: 'cannonball', ... } — 다음 이펙트 작업에서 추가
};

/** 로컬 좌표계(+x = 진행 방향)에 모양을 딱 한 번 그린다. 이후엔 setPosition/setRotation만 갱신한다. */
function drawShape(gfx, cfg) {
  gfx.clear();
  gfx.fillStyle(cfg.color, 1);
  switch (cfg.shape) {
    case 'arrow':
      gfx.fillTriangle(
        cfg.length / 2, 0,
        -cfg.length / 2, -cfg.width / 2,
        -cfg.length / 2, cfg.width / 2,
      );
      break;
    default:
      if (DEBUG) console.warn(`[ProjectileFx] 알 수 없는 shape: ${cfg.shape}`);
  }
}

/** 발사 순간 스냅샷 좌표와 가장 가까운 살아있는 적 id — 그 타워가 겨눈 대상으로 추론(§ 상단 주석) */
function findNearestEnemyId(x, y) {
  let bestId = null, bestDist = Infinity;
  for (const e of EnemyPool.getActive()) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestDist) { bestDist = d; bestId = e.id; }
  }
  return bestId;
}

/** current를 desired 쪽으로 최대 maxDelta(라디안)만큼만 회전시킨다 — [-π, π] 정규화 후 클램프. */
function turnToward(current, desired, maxDelta) {
  let diff = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  if (diff > maxDelta) diff = maxDelta;
  else if (diff < -maxDelta) diff = -maxDelta;
  return current + diff;
}

export class ProjectileFx {
  constructor(scene) {
    this.scene = scene;
    this.free = [];
    this.active = [];

    this.onFired = payload => this.spawn(payload);
    EventBus.on(EV.towerFired, this.onFired, this);

    this.onUpdate = (time, delta) => this.tick(time, delta / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  acquire() {
    return this.free.pop() ?? { gfx: this.scene.add.graphics().setVisible(false) };
  }

  spawn({ towerId, x, y, targetX, targetY }) {
    const cfg = PROJECTILE_CONFIG[towerId];
    if (!cfg) return; // 설정 없는 타워 — 조용히 무시

    if (this.active.length >= PROJECTILE_FX.poolSize) this.evictOldest();

    const p = this.acquire();
    drawShape(p.gfx, cfg);
    const heading = Math.atan2(targetY - y, targetX - x);
    p.gfx.setPosition(x, y).setRotation(heading).setDepth(y).setAlpha(1).setVisible(true);
    p.heading = heading;
    p.destX = targetX;
    p.destY = targetY;
    p.targetId = findNearestEnemyId(targetX, targetY); // null이면 스냅샷 좌표로 직진
    p.speed = cfg.speed;
    p.born = this.scene.time.now;
    this.active.push(p);
  }

  /** 풀 고갈 시 가장 오래된 활성 투사체를 밀어낸다(FxLayer.evictOldestParticle과 동일 원칙 — 조용히 드롭 안 함) */
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

  tick(time, dt) {
    if (this.active.length === 0) return;

    // 추적 중인 화살이 하나라도 있을 때만 폴링한다 — 전부 목표를 잃은(직진 중) 상태면 불필요
    const needsPolling = this.active.some(p => p.targetId != null);
    const posById = needsPolling ? new Map(EnemyPool.getActive().map(e => [e.id, e])) : null;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];

      if (time - p.born >= PROJECTILE_FX.maxLifeMs) { this.despawn(i); continue; } // 안전판

      if (p.targetId != null) {
        const enemy = posById.get(p.targetId);
        if (enemy && enemy.alive) { p.destX = enemy.x; p.destY = enemy.y; }
        else { p.targetId = null; } // 목표 소실 — 이후 destX/Y 고정, 그 지점으로 직진 후 소멸
      }

      const dx = p.destX - p.gfx.x, dy = p.destY - p.gfx.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (step >= dist) { p.gfx.setPosition(p.destX, p.destY); this.despawn(i); continue; }

      if (dist > 0) {
        const desired = Math.atan2(dy, dx);
        p.heading = turnToward(p.heading, desired, TURN_RATE_RAD_S * dt);
      }
      p.gfx.x += Math.cos(p.heading) * step;
      p.gfx.y += Math.sin(p.heading) * step;
      p.gfx.setRotation(p.heading).setDepth(p.gfx.y);
    }
  }

  destroy() {
    EventBus.off(EV.towerFired, this.onFired, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    [...this.free, ...this.active].forEach(p => p.gfx.destroy());
  }
}
