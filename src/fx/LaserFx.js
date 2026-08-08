/**
 * LaserFx.js — 즉시히트 레이저(오브젝트 풀링, FxLayer.spawnBurst/tickParticles와 동일한 알파 감쇠 패턴)
 *
 * ProjectileFx.js(화살)와 시각 모델이 다르다 — 화살은 "매 프레임 위치·방향이 갱신되는 이동체"지만
 * 레이저는 발사 순간 끝점 두 개가 고정되고 알파만 감쇠한다. 억지로 ProjectileFx에 얹으면 shape별로
 * tick() 로직이 갈라지는 분기투성이가 돼서 별도 파일로 둔다(같은 "타워 발사 이펙트" 가족이라
 * FxLayer(적 반응형 이펙트 전용, 이미 300줄 임박)에도 안 넣는다).
 *
 * towerFired를 구독하되, LASER_CONFIG에 설정이 있는 타워만 그린다(설정 존재로 필터 — 하드코딩
 * 분기 없음). 지금은 롯데월드타워(보라 고정)·N서울타워(레벨별 파랑/초록/황금) 2종.
 *
 * ── 레벨별 강화(TowerLevelTracker 주입) ──────────────────────────────
 * towerFired 페이로드엔 레벨이 없어서, GameScene이 만들어 주입하는 TowerLevelTracker(공용,
 * objectBuilt/objectChanged로 instanceId→level Map을 유지)에서 발사한 타워의 현재 레벨을 얻는다.
 * LASER_CONFIG의 색은 모든 타워가 같은 모양(colorByLevel 3칸 배열)을 갖는다 — 롯데처럼 레벨과
 * 무관한 타워도 3칸 다 같은 값으로 채워서, "레벨별로 다른가"를 분기하지 않고 항상
 * `cfg.colorByLevel[level]`로 조회하게 통일했다. 두께·글로우 강도·임팩트 버스트 개수는
 * 타워 공통(UITheme.LASER_FX의 *ByLevel 배열)이라 타워별로 안 갈린다.
 *
 * towers.json의 nseoulTower.levels[].tint는 재사용하지 않는다 — 그건 타워 몸체(실루엣) 색으로
 * "노후→복원"(회색→탄→연금색) 컨셉이라, 요청받은 레이저 팔레트(파랑/초록/황금)와 다른 값이다.
 *
 * ── 명중 임팩트 (ImpactFx.js 재사용) ──────────────────────────────────
 * GameScene이 주입하는 ImpactFx 인스턴스의 spawnImpact(x, y, color, level) 하나만 부른다 —
 * 섬광·링·불똥 풀링은 전부 ImpactFx 몫이다(레이저 전용이 아니라 DDP 폭발 등도 재사용할 공용
 * 컴포넌트라 이 파일엔 그 로직을 안 둔다). 레이저는 순간 판정이라 명중 좌표(targetX,targetY)가
 * 발사 시점에 이미 확정돼 있어 바로 호출하면 된다.
 *
 * 발사 시 (x,y)→(targetX,targetY) 선을 월드 좌표로 즉시 한 번 그린다 — 이후 안 움직이므로
 * 화살과 달리 위치·회전 갱신 자체가 없다. 글로우(두껍고 옅은 선)와 코어(얇고 진한 선)를 같은
 * Graphics 객체에 겹쳐 그려서, tick()의 setAlpha() 한 번으로 둘이 같은 비율로 함께 페이드된다.
 *
 * depth는 선분 중간점 y로 스폰 시 1회만 설정한다(그 후 안 움직이니 갱신 불필요 — 화살의 "매
 * 프레임 depth=y 갱신"과 다른 이유는 이동 여부 차이 하나뿐이다).
 *
 * ?mockcore=1에서는 MockGameCore가 towerFired를 애초에 발행하지 않는다(ProjectileFx.js와 동일
 * 이유) — spawn() 자체가 안 불려서 별도 분기가 필요 없다. TowerLevelTracker는 Mock에서도
 * objectBuilt/objectChanged를 정상 수신해 Map은 쌓이지만, 조회할 일 자체가 없어 무해하다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { LASER_FX } from '../ui/UITheme.js';

/** towerId → 레이저 설정. colorByLevel은 항상 3칸(Lv1/2/3) — 레벨 무관 타워도 같은 값 3개로 채운다. */
const LASER_CONFIG = {
  lotteWorldTower: { colorByLevel: [0x9b59b6, 0x9b59b6, 0x9b59b6] }, // 보라 고정
  nseoulTower:      { colorByLevel: [0x3fa7d6, 0x4caf50, 0xffd54f] }, // 파랑 → 초록 → 황금
};

export class LaserFx {
  constructor(scene, levelTracker, impactFx) {
    this.scene = scene;
    this.levelTracker = levelTracker;
    this.impactFx = impactFx;
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

  spawn({ instanceId, towerId, x, y, targetX, targetY }) {
    const cfg = LASER_CONFIG[towerId];
    if (!cfg) return; // 설정 없는 타워 — 조용히 무시

    if (this.active.length >= LASER_FX.poolSize) this.evictOldest();

    const level = this.levelTracker.getLevel(instanceId);
    const color = cfg.colorByLevel[Math.min(level, cfg.colorByLevel.length - 1)];
    const widthMul = LASER_FX.widthByLevel[Math.min(level, LASER_FX.widthByLevel.length - 1)];
    const glowAlphaMul = LASER_FX.glowAlphaByLevel[Math.min(level, LASER_FX.glowAlphaByLevel.length - 1)];

    const p = this.acquire();
    const g = p.gfx.clear();
    g.lineStyle(LASER_FX.glowWidth * widthMul, color, LASER_FX.glowAlpha * glowAlphaMul);
    g.lineBetween(x, y, targetX, targetY);
    g.lineStyle(LASER_FX.coreWidth * widthMul, color, LASER_FX.coreAlpha);
    g.lineBetween(x, y, targetX, targetY);
    g.setDepth((y + targetY) / 2).setAlpha(1).setVisible(true);

    p.born = this.scene.time.now;
    this.active.push(p);

    this.impactFx?.spawnImpact(targetX, targetY, color, level);
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
