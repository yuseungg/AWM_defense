/**
 * AuraFx.js — 상시 오오라(서울숲). instanceId → 오오라 오브젝트 Map 관리.
 *
 * ProjectileFx·LaserFx·ImpactFx는 전부 "떴다 사라지는" 풀 모델이지만, 오오라는 그 타워가
 * 존재하는 동안 계속 떠있는 상시 표시라 시각 모델 자체가 다르다 — 프리리스트 풀 대신
 * instanceId로 바로 조회하는 Map 하나로 관리한다(TowerView.byInstance와 같은 형태).
 *
 * ── 반경 = 실제 유효 사거리(effectiveRange) ──────────────────────────
 * aoeRadius(투사체 착탄 반경)를 안 쓴다 — Tower.js 문서화 그대로 "range·aoeRadius는 레벨과
 * 무관한 def 고정값이고, range만 오라 버프로 바뀐다": aoeRadius는 세운상가 버프가 전혀
 * 안 먹는다(Projectile.js가 tower.def.aoeRadius를 원본 그대로 씀). 오오라는 "이 범위를
 * 공격한다"를 보여줘야 하므로, UpgradeUI.drawRangeCircle()이 파란 사거리 원을 그릴 때 쓰는
 * 것과 완전히 같은 소스 — obj.effectiveRange(= def.range × rangeMul) — 를 그대로 쓴다.
 * 레벨은 range에 영향이 없으므로(위 인용과 동일 근거) 오오라 반경엔 레벨이 관여하지 않는다.
 *
 * ── 라이프사이클 ──────────────────────────────────────────────────
 * objectBuilt(kind==='tower', id가 AURA_CONFIG에 있음)로 생성(이 시점엔 effectiveRange가
 * 페이로드에 없어 core.getState() 1회 조회, D18 예외). objectChanged(action:'upgraded')와
 * buffsRecalculated 둘 다 반경을 다시 읽는다 — GameCore.upgrade()/relocate() 둘 다 이미
 * WaveManager.recalculateBuffs()를 호출한 뒤 objectChanged를 발행하므로(확인 완료) 세운상가
 * 설치·강화·재배치로 인한 변화까지 buffsRecalculated 하나로 전부 잡힌다. objectChanged
 * (action:'relocated')는 위치만 보정한다. towerFired로 공격 순간 펄스를 트리거한다.
 *
 * "타워 제거" 이벤트는 없다(CLAUDE.md §1 규칙5 — 판매 없음) — 인스턴스가 사라질 일 자체가
 * 없어서 씬 shutdown 정리 하나면 충분하다(확인 완료, 별도 정리 로직 불필요).
 *
 * 서울숲은 nseoulTower와 달리 buildTower()를 정상적으로 거쳐 objectBuilt가 항상 온다(GameCore.js
 * 확인 — ensureNSeoulTower 같은 우회는 nseoulTower 전용) — 부트스트랩 보정이 필요 없다.
 *
 * buffsRecalculated의 towerStats는 WaveManager가 자기 내부 살아있는 Tower 배열을 그대로 넘긴
 * 것(getState().towers와 동일 객체) — 별도 getState() 조회 없이 페이로드에서 바로 읽는다.
 * Mock의 towerStats 항목엔 effectiveRange 자체가 없는 목업 객체라(?mockcore=1) Number.isFinite로
 * 방어한다 — 값이 없으면 반경을 안 건드리고 조용히 넘어간다.
 *
 * ── 그리기 ────────────────────────────────────────────────────────
 * 반지름 1짜리 유닛 원을 생성 시 딱 한 번 그려두고, 반경이 실제로 바뀌는 순간에만
 * setScale(radius)를 다시 부른다 — ProjectileFx/LaserFx/ImpactFx와 같은 "1회 그리고 트랜스폼만"
 * 원칙. 매 프레임 바뀌는 건 알파뿐이다(맥동 + 공격 펄스, 둘 다 순수 시간 기반 계산이라 가볍다):
 *   breathe = baseAlpha + amplitude × (sin(time/breatheMs × 2π) × 0.5 + 0.5)
 *   pulse   = pulseBoost × max(0, 1 - (경과)/pulseMs)      — towerFired 순간부터 감쇠
 *   alpha   = min(1, breathe + pulse)
 *
 * depth는 y 기반이 아니라 고정 상수(AURA_FX.depth) — 배경(기본 depth 0)보다는 위, 타워·적
 * (depth=y, 대략 100 이상)보다는 항상 아래에 안정적으로 깔린다.
 *
 * ?mockcore=1: MockGameCore도 objectBuilt를 종류 구분 없이 발행한다(확인 완료) — 정상 동작한다.
 * 다만 towerFired는 Mock이 안 쏘므로(ProjectileFx.js와 동일 이유) 펄스만 자연히 안 걸린다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { AURA_FX } from '../ui/UITheme.js';

/** towerId → 오오라 설정(색만). 여기 없는 타워는 무시한다(필터 방식). */
const AURA_CONFIG = {
  seoulForest: { color: 0x5fa04a }, // towers.json seoulForest 최대 레벨 tint와 동일 — 연녹색
};

export class AuraFx {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;
    this.byInstance = new Map();

    this.onBuilt = payload => this.create(payload);
    this.onChanged = ({ instanceId, action }) => {
      if (action === 'upgraded') this.refreshRadiusFromState(instanceId);
      else if (action === 'relocated') this.applyRelocate(instanceId);
    };
    this.onBuffsRecalculated = ({ towerStats }) => this.refreshAllRadii(towerStats);
    this.onFired = ({ instanceId }) => this.pulse(instanceId);
    EventBus.on(EV.objectBuilt, this.onBuilt, this);
    EventBus.on(EV.objectChanged, this.onChanged, this);
    EventBus.on(EV.buffsRecalculated, this.onBuffsRecalculated, this);
    EventBus.on(EV.towerFired, this.onFired, this);

    this.onUpdate = time => this.tick(time);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  create({ kind, id, instanceId, x, y }) {
    if (kind !== 'tower') return;
    const cfg = AURA_CONFIG[id];
    if (!cfg) return; // 설정 없는 타워 — 조용히 무시

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(cfg.color, 1);
    gfx.fillCircle(0, 0, 1);
    gfx.setPosition(x, y).setDepth(AURA_FX.depth).setVisible(true);

    this.byInstance.set(instanceId, { gfx, pulseStart: -Infinity });
    this.refreshRadiusFromState(instanceId);
  }

  /** objectBuilt/objectChanged(upgraded) 전용 — 페이로드에 effectiveRange가 없어 1회 조회한다. */
  refreshRadiusFromState(instanceId) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    const obj = this.core.getState().towers.find(t => t.instanceId === instanceId);
    this.applyRadius(entry, obj?.effectiveRange);
  }

  /** buffsRecalculated 전용 — 페이로드에 이미 실려온 배열에서 바로 찾는다(추가 조회 없음). */
  refreshAllRadii(towerStats) {
    if (this.byInstance.size === 0) return;
    const byId = new Map(towerStats.map(t => [t.instanceId, t]));
    for (const [instanceId, entry] of this.byInstance) {
      this.applyRadius(entry, byId.get(instanceId)?.effectiveRange);
    }
  }

  applyRadius(entry, effectiveRange) {
    if (!Number.isFinite(effectiveRange)) return; // Mock 등 값이 없으면 마지막 반경 유지
    entry.gfx.setScale(effectiveRange);
  }

  /** objectChanged엔 좌표가 없다(TowerView.applyRelocate와 동일 계약) — 재배치는 드문 이벤트라 이때만 getState() 1회. */
  applyRelocate(instanceId) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    const obj = this.core.getState().towers.find(t => t.instanceId === instanceId);
    if (!obj) return;
    entry.gfx.setPosition(obj.x, obj.y);
  }

  pulse(instanceId) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    entry.pulseStart = this.scene.time.now;
  }

  tick(time) {
    if (this.byInstance.size === 0) return;
    for (const entry of this.byInstance.values()) {
      const breathe = AURA_FX.baseAlpha
        + AURA_FX.breatheAmplitude * (Math.sin((time / AURA_FX.breatheMs) * Math.PI * 2) * 0.5 + 0.5);
      const sincePulse = time - entry.pulseStart;
      const pulse = sincePulse >= 0
        ? AURA_FX.pulseBoost * Math.max(0, 1 - sincePulse / AURA_FX.pulseMs)
        : 0;
      entry.gfx.setAlpha(Math.min(1, breathe + pulse));
    }
  }

  destroy() {
    EventBus.off(EV.objectBuilt, this.onBuilt, this);
    EventBus.off(EV.objectChanged, this.onChanged, this);
    EventBus.off(EV.buffsRecalculated, this.onBuffsRecalculated, this);
    EventBus.off(EV.towerFired, this.onFired, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.byInstance.forEach(({ gfx }) => gfx.destroy());
  }
}
