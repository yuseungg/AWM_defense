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
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW } from '../ui/UITheme.js';
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

    this.onUpdate = (time, delta) => this.tick(delta / 1000);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

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
    token.distance = 0;
    token.speed = enemiesData[type]?.speed ?? 100;
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
        const s = VIEW.fastSize;
        token.gfx.fillTriangle(0, -s * 0.6, -s * 0.5, s * 0.5, s * 0.5, s * 0.5);
        break;
      }
      case 'tank': {
        const s = VIEW.tankSize;
        token.gfx.fillRect(-s / 2, -s / 2, s, s);
        break;
      }
      case 'boss':
        token.gfx.fillCircle(0, 0, VIEW.bossRadius);
        break;
      case 'swarm':
      default:
        token.gfx.fillCircle(0, 0, VIEW.swarmRadius);
        break;
    }
  }

  setPos(token, x, y) {
    token.gfx.setPosition(x, y);
    token.sprite.setPosition(x, y);
  }

  // ────────────────────────────────────────── Mock 전용 — 자체 보간
  spawnMockToken({ id, type, x, y }) {
    const token = this.acquire(id, type);
    this.setPos(token, x, y);
  }

  // ────────────────────────────────────────── 프레임 루프
  tick(dt) {
    if (this.usePoolPolling) this.tickPoll();
    else this.tickInterpolated(dt);
  }

  /** 실제 코어: EnemyPool.getActive()를 그대로 읽는다. 새로 보이면 만들고, 안 보이면 회수한다 */
  tickPoll() {
    const active = EnemyPool.getActive();
    const seen = new Set();
    for (let i = 0; i < active.length; i++) {
      const e = active[i];
      seen.add(e.id);
      let token = this.byId.get(e.id);
      if (!token) token = this.acquire(e.id, e.type);
      this.setPos(token, e.x, e.y);
    }
    for (const id of [...this.byId.keys()]) {
      if (!seen.has(id)) this.release(id);
    }
  }

  /** Mock: 거리를 직접 누적해 PathSystem으로 좌표 변환. 끝에 도달하면(관통 시뮬) 자동 회수 */
  tickInterpolated(dt) {
    for (const token of [...this.byId.values()]) {
      token.distance += token.speed * dt;
      if (token.distance >= PathSystem.totalLength) { this.release(token.id); continue; }
      const p = PathSystem.getPointAtDistance(token.distance);
      this.setPos(token, p.x, p.y);
    }
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    if (!this.usePoolPolling) {
      EventBus.off(EV.enemySpawned, this.onSpawned, this);
      EventBus.off(EV.enemyKilled, this.onKilled, this);
    }
    [...this.freeList, ...this.byId.values()].forEach(t => { t.gfx.destroy(); t.sprite.destroy(); });
    if (DEBUG) console.log(`[EnemyView] 종료 — 모드: ${this.usePoolPolling ? 'poll' : 'mock-interp'}`);
  }
}
