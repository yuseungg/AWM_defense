/**
 * AoeCircleFx.js — 공격 순간에만 착탄 지점에 뜨는 광역 타격 원(청계천 등). 자체 풀·Graphics가
 * 없는 얇은 위임 계층이다 — towerFired를 걸러서 실제 그리기는 전부 ImpactFx.spawnRadial()에
 * 맡긴다(섬광·링과 똑같은 "반경 0→N 성장 + 알파 페이드" 모델이라 새로 만들 게 없다).
 *
 * AuraFx(상시 오오라)와 다른 점 — 반경 소스: AuraFx는 effectiveRange(사거리, 세운상가 버프
 * 반영)를 쓰지만, 여긴 aoeRadius(착탄 반경, towers.json 정적값 — 레벨·버프 전혀 안 먹는다,
 * WaveManager.fireTower()가 tower.def.aoeRadius를 원본 그대로 넘기는 것으로 확인)를 쓴다.
 * 그래서 레벨 강화는 반경이 아니라 AOE_FX.alphaMulByLevel로 밝기만 키운다.
 *
 * towerFired 페이로드의 targetX/targetY(발사 순간 타깃 스냅샷)를 착탄 중심으로 쓴다 —
 * WaveManager.fireTower()가 발사당 정확히 1번만 이 이벤트를 쏘고, 같은 틱에 동기로 도착하므로
 * 실제 착탄 지점과 사실상 일치한다(ProjectileFx.js의 호밍 근거와 동일한 전제).
 *
 * towerId → 설정(색만)은 AOE_CONFIG 필터 방식 — 지금은 청계천만, DDP 폭발은 다음 작업에서
 * 이 맵에 항목만 추가하면 된다.
 */

import { EventBus, EV } from '../EventBus.js';
import { AOE_FX } from '../ui/UITheme.js';
import towersData from '../../data/towers.json';

const AOE_CONFIG = {
  cheonggyecheon: { color: 0x26a69a }, // 청록, 반투명 — AuraFx에서 옮겨온 것과 동일 색
  // ddp: { color: ... } — 다음 작업(폭발)에서 추가
};

function byLevel(arr, level) {
  return arr[Math.min(level, arr.length - 1)];
}

export class AoeCircleFx {
  constructor(scene, impactFx, levelTracker) {
    this.impactFx = impactFx;
    this.levelTracker = levelTracker;

    this.onFired = payload => this.spawn(payload);
    EventBus.on(EV.towerFired, this.onFired, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  spawn({ instanceId, towerId, targetX, targetY }) {
    const cfg = AOE_CONFIG[towerId];
    if (!cfg) return; // 설정 없는 타워 — 조용히 무시

    const level = this.levelTracker.getLevel(instanceId);
    const alpha = Math.min(1, AOE_FX.baseAlpha * byLevel(AOE_FX.alphaMulByLevel, level));

    this.impactFx.spawnRadial(targetX, targetY, cfg.color, towersData[towerId].aoeRadius, AOE_FX.fadeMs, true, alpha);
  }

  destroy() {
    EventBus.off(EV.towerFired, this.onFired, this);
  }
}
