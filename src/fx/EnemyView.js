/**
 * EnemyView.js — 화면에 적을 그린다 (오브젝트 풀링 필수, CLAUDE.md §2)
 *
 * 에셋이 없는 지금은 archetype별 단색 도형 플레이스홀더를 쓴다. `assets/enemies/<type>.png`가
 * 로드되면(§6 자동 교체 파이프라인) 그 텍스처로, 없으면 도형으로 자동 폴백한다.
 *
 * ★ 좌표 갱신 방식이 코어 종류에 따라 갈린다 (생성 시점에 한 번만 결정, 매 프레임 분기 아님):
 *   - 실제 GameCore: `EnemyPool.getActive()`를 매 프레임 그대로 폴링한다. A의 시뮬레이션과
 *     100% 일치(슬로우·스턴까지 반영된 값)하고, 이벤트 구독조차 필요 없다. GridSystem/PathSystem과
 *     동일하게 §3상 읽기 전용 접근이라 새 계약 없이 쓸 수 있다.
 *   - MockGameCore: Mock은 EnemyPool을 아예 안 건드려서(`enemySpawned`에 고정 좌표 한 번만 실어
 *     보낸다) 폴링할 대상이 없다. 대신 enemySpawned/enemyKilled로 토큰을 만들고, enemies.json의
 *     speed + PathSystem.getPointAtDistance()로 자체 보간한다 — 슬로우/스턴은 반영 안 되는 근사치지만
 *     Mock은 원래 연출 검증용이라 허용 범위다(SYNC.md §2 참고).
 *
 * ⚠️ 절대 제약: 적의 논리 위치는 A의 PathSystem/EnemyPool 소유다. setLogicPos()가 받은 x/y는
 * 절대 수정하지 않고 token.logicX/logicY에 그대로 저장만 한다 — 화면에 실제로 찍히는 좌표는
 * renderToken()이 그 위에 렌더 오프셋(히트스톱 정지·넉백·절차적 애니메이션)을 얹어서 별도로
 * 계산한다(renderX = logicX + offsetX 식). 이 파일 안에서도 두 값을 절대 섞지 않는다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW, ANIM } from '../ui/UITheme.js';
import enemiesData from '../../data/enemies.json';
import EnemyPool from '../game/EnemyPool.js';
import PathSystem from '../game/PathSystem.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const ASSET_KEY = type => `enemy_${type}`;

export class EnemyView {
  constructor(scene, core) {
    this.scene = scene;
    this.usePoolPolling = !core.__isMock;

    this.freeList = [];
    this.byId = new Map(); // id → token

    this.onUpdate = (time, delta) => this.tick(time, delta / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    // 피격 리액션은 폴링/보간 어느 경로든 동일 — enemyDamaged는 실제 코어·Mock 둘 다 쏜다
    this.onDamaged = payload => this.handleHit(payload);
    EventBus.on(EV.enemyDamaged, this.onDamaged, this);

    if (!this.usePoolPolling) {
      // Mock 전용: 이벤트로 토큰 생성/회수 + 자체 보간
      this.onSpawned = payload => this.spawnMockToken(payload);
      this.onKilled = ({ id }) => this.release(id);
      EventBus.on(EV.enemySpawned, this.onSpawned, this);
      EventBus.on(EV.enemyKilled, this.onKilled, this);
    }

    scene.events.once('shutdown', () => this.destroy());
  }

  // ────────────────────────────────────────── 풀
  acquire(id, type) {
    let token = this.freeList.pop();
    if (!token) {
      const gfx = this.scene.add.graphics();
      const sprite = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
      token = { gfx, sprite };
    }
    token.id = id;
    token.type = type;
    token.archetype = enemiesData[type]?.archetype ?? 'swarm';
    token.distance = 0;
    token.speed = enemiesData[type]?.speed ?? 100;
    token.prevX = undefined; // 재사용된 풀 토큰의 이전 위치를 지운다 — 안 지우면 죽은 자리에서
    token.prevY = undefined; // 새로 스폰된 자리로 순간이동한 것처럼 계산돼 첫 프레임에 헛도는 회전이 나온다
    token.heading = 0;
    token.phase = Math.random() * Math.PI * 2; // 개체마다 다른 박자 — 안 그러면 전부 기계적으로 보인다
    token.hitStart = -Infinity;
    token.hitFreezeUntil = -Infinity;
    token.hitStrength = 1;
    token.frozenX = 0;
    token.frozenY = 0;
    this.draw(token);
    this.byId.set(id, token);
    return token;
  }

  release(id) {
    const token = this.byId.get(id);
    if (!token) return;
    token.gfx.clear().setVisible(false);
    token.sprite.setVisible(false);
    this.byId.delete(id);
    this.freeList.push(token);
  }

  /** 텍스처가 있으면 이미지로, 없으면(지금 기본) archetype별 도형으로 그린다 */
  draw(token) {
    const key = ASSET_KEY(token.type);
    if (this.scene.textures.exists(key)) {
      token.gfx.setVisible(false);
      token.sprite.setTexture(key).setVisible(true);
      return;
    }
    token.sprite.setVisible(false);
    token.gfx.clear().setVisible(true);

    const def = enemiesData[token.type];
    const color = VIEW.enemyColors[token.type] ?? 0xffffff;
    token.gfx.fillStyle(color, 1);

    switch (def?.archetype) {
      case 'fast': {
        // 앞으로 기운 쐐기 + 뒤쪽 잔상 삼각형 하나(속도감)
        const s = VIEW.fastSize;
        token.gfx.fillStyle(color, 0.45);
        token.gfx.fillTriangle(-s * 0.2, -s * 0.4, -s * 0.2, s * 0.4, -s * 0.9, 0);
        token.gfx.fillStyle(color, 1);
        token.gfx.fillTriangle(s * 0.6, 0, -s * 0.4, -s * 0.5, -s * 0.4, s * 0.5);
        break;
      }
      case 'tank': {
        // 각진 더미 — 크기가 다른 사각형 3개를 어긋나게 겹쳐서 불규칙한 무더기로
        const s = VIEW.tankSize;
        token.gfx.fillRect(-s * 0.5, -s * 0.15, s * 0.65, s * 0.55);
        token.gfx.fillRect(-s * 0.1, -s * 0.45, s * 0.6, s * 0.5);
        token.gfx.fillRect(s * 0.05, -s * 0.05, s * 0.45, s * 0.4);
        break;
      }
      case 'boss': {
        // 큰 스모그 덩어리 + 안으로 말려드는 소용돌이(호를 겹쳐서 표현)
        const r = VIEW.bossRadius;
        token.gfx.fillCircle(0, 0, r);
        token.gfx.lineStyle(Math.max(2, r * 0.12), 0x000000, 0.35);
        token.gfx.beginPath();
        token.gfx.arc(0, 0, r * 0.62, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(280));
        token.gfx.strokePath();
        token.gfx.beginPath();
        token.gfx.arc(r * 0.05, -r * 0.05, r * 0.3, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(430));
        token.gfx.strokePath();
        break;
      }
      case 'swarm':
      default: {
        // 흩어진 입자 뭉치 — 크기가 다른 작은 원 여러 개를 느슨하게 겹쳐서
        const s = VIEW.swarmRadius;
        token.gfx.fillCircle(-s * 0.6, s * 0.3, s * 0.55);
        token.gfx.fillCircle(s * 0.5, s * 0.5, s * 0.5);
        token.gfx.fillCircle(s * 0.1, -s * 0.4, s * 0.65);
        token.gfx.fillCircle(-s * 0.3, -s * 0.15, s * 0.45);
        break;
      }
    }
  }

  // ────────────────────────────────────────── 피격 리액션 (히트스톱 + 넉백 + 스케일 펀치)
  /** enemyDamaged 페이로드의 x/y를 그대로 "정지 위치"로 쓴다 — Combat.js가 보내는 적중 순간 좌표라 정확하다. */
  handleHit({ id, x, y, isEffective, isCrit }) {
    const token = this.byId.get(id);
    if (!token) return; // 아직 화면에 없는 개체(생성 타이밍 차) — 조용히 무시
    const now = this.scene.time.now;
    const mul = (isEffective ? ANIM.effectiveHitMul : 1) * (isCrit ? ANIM.critHitMul : 1);
    token.hitStart = now;
    token.hitStrength = mul;
    token.hitFreezeUntil = now + ANIM.hitstopMs * mul;
    token.frozenX = x;
    token.frozenY = y;
  }

  /**
   * 논리 좌표만 기록한다(절대 제약 — enemy.x/y를 그대로 옮겨 적을 뿐 렌더에 쓰지 않는다).
   * 진행방향(heading)도 여기서 갱신 — renderToken()의 회전·넉백 방향 계산이 이 값을 쓴다.
   */
  setLogicPos(token, x, y) {
    if (token.prevX !== undefined && (x !== token.prevX || y !== token.prevY)) {
      token.heading = Math.atan2(y - token.prevY, x - token.prevX);
    }
    token.prevX = x;
    token.prevY = y;
    token.logicX = x;
    token.logicY = y;
  }

  /**
   * 실제 화면 좌표/회전/스케일을 계산해서 반영한다 — 유일하게 gfx/sprite에 값을 쓰는 곳.
   * renderX = logicX(또는 히트스톱 중이면 frozenX) + 절차적 오프셋 + 넉백 오프셋.
   */
  renderToken(token, now) {
    const frozen = now < token.hitFreezeUntil;
    const baseX = frozen ? token.frozenX : token.logicX;
    const baseY = frozen ? token.frozenY : token.logicY;

    let offX = 0, offY = 0, rotation = token.heading, scale = 1;

    switch (token.archetype) {
      case 'swarm':
        offX += ANIM.dustJitterAmp * Math.sin(now * ANIM.dustJitterFreq + token.phase * 3.1);
        offY += ANIM.dustJitterAmp * Math.cos(now * ANIM.dustJitterFreq * 1.3 + token.phase * 2.3)
              + ANIM.dustFloatAmp * Math.sin(now * ANIM.dustFloatFreq + token.phase);
        break;
      case 'fast':
        rotation += ANIM.carTilt;
        break;
      case 'tank':
        offY += ANIM.tankBobAmp * Math.sin(now * ANIM.tankBobFreq + token.phase);
        break;
      case 'boss':
        rotation = now * ANIM.bossSpinFreq + token.phase; // 진행방향 대신 자체 회전으로 완전히 대체
        break;
    }

    // 넉백 — 히트스톱이 끝나는 시점부터 시작해서 진행 반대 방향으로 밀렸다가 감쇠 복귀
    const knockElapsed = now - token.hitFreezeUntil;
    if (knockElapsed >= 0 && knockElapsed < ANIM.knockbackMs) {
      const k = 1 - knockElapsed / ANIM.knockbackMs;
      const dist = ANIM.knockbackDist * token.hitStrength * k * k;
      offX += -Math.cos(token.heading) * dist;
      offY += -Math.sin(token.heading) * dist;
    }

    // 스케일 펀치 — hitStart 기준(히트스톱 동안에도 같이 재생돼서 "맞았다"는 느낌이 즉시 온다)
    const punchElapsed = now - token.hitStart;
    if (punchElapsed >= 0 && punchElapsed < ANIM.scalePunchMs) {
      const p = punchElapsed / ANIM.scalePunchMs;
      scale = 1 + ANIM.scalePunchAmt * token.hitStrength * Math.sin(p * Math.PI);
    }

    const rx = baseX + offX, ry = baseY + offY;
    token.gfx.setPosition(rx, ry).setRotation(rotation).setScale(scale);
    token.sprite.setPosition(rx, ry).setRotation(rotation).setScale(scale);
  }

  // ────────────────────────────────────────── Mock 전용 — 자체 보간
  spawnMockToken({ id, type, x, y }) {
    const token = this.acquire(id, type);
    this.setLogicPos(token, x, y);
    this.renderToken(token, this.scene.time.now);
  }

  // ────────────────────────────────────────── 프레임 루프
  tick(time, dt) {
    if (this.usePoolPolling) this.tickPoll(time);
    else this.tickInterpolated(time, dt);
  }

  /** 실제 코어: EnemyPool.getActive()를 그대로 읽는다. 새로 보이면 만들고, 안 보이면 회수한다 */
  tickPoll(time) {
    const active = EnemyPool.getActive();
    const seen = new Set();
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      seen.add(e.id);
      let token = this.byId.get(e.id);
      if (!token) token = this.acquire(e.id, e.type);
      this.setLogicPos(token, e.x, e.y);
      this.renderToken(token, time);
    }
    for (const id of [...this.byId.keys()]) {
      if (!seen.has(id)) this.release(id);
    }
  }

  /** Mock: 거리를 직접 누적해 PathSystem으로 좌표 변환. 끝에 도달하면(관통 시뮬) 자동 회수 */
  tickInterpolated(time, dt) {
    for (const token of [...this.byId.values()]) {
      token.distance += token.speed * dt;
      if (token.distance >= PathSystem.totalLength) { this.release(token.id); continue; }
      const p = PathSystem.getPointAtDistance(token.distance);
      this.setLogicPos(token, p.x, p.y);
      this.renderToken(token, time);
    }
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    EventBus.off(EV.enemyDamaged, this.onDamaged, this);
    if (!this.usePoolPolling) {
      EventBus.off(EV.enemySpawned, this.onSpawned, this);
      EventBus.off(EV.enemyKilled, this.onKilled, this);
    }
    [...this.freeList, ...this.byId.values()].forEach(t => { t.gfx.destroy(); t.sprite.destroy(); });
    if (DEBUG) console.log(`[EnemyView] 종료 — 모드: ${this.usePoolPolling ? 'poll' : 'mock-interp'}`);
  }
}
