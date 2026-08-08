/**
 * TowerLevelTracker.js — instanceId → 현재 강화 레벨 (여러 이펙트가 공유하는 단일 소스)
 *
 * ProjectileFx·LaserFx, 그리고 앞으로 붙을 오오라·물안개·포탄까지 "이 타워 지금 몇 레벨이지"를
 * 똑같이 물어봐야 한다 — 각자 objectBuilt/objectChanged를 중복 구독하면 같은 일을 여러 번 하는
 * 셈이라, GameScene에서 이 트래커 하나만 만들어 필요한 이펙트 컴포넌트에 주입한다.
 *
 * towerFired마다 getState()로 조회하지 않는다 — 발사 빈도(광화문 초당 1.7회 등)에 매번 부르면
 * §6-2 "매 프레임 호출 금지" 취지에 어긋난다. 대신 강화가 실제로 일어난 순간(objectChanged)에만
 * 갱신하는 이벤트 기반 Map이라 조회(getLevel)는 그냥 동기 Map.get이다.
 *
 * N서울타워는 GameCore.ensureNSeoulTower()가 buildTower()를 안 거쳐 objectBuilt를 못 받는다
 * (TowerView.js가 이미 같은 이유로 겪는 문제, 거기서 쓴 것과 동일한 보정 — 씬 진입 시 1회
 * getState()로 부트스트랩, D18이 허용하는 예외라 매 프레임 호출 금지와 안 부딪힌다).
 */

import { EventBus, EV } from '../EventBus.js';

export class TowerLevelTracker {
  constructor(scene, core) {
    this.levelByInstance = new Map();

    this.onBuilt = ({ instanceId }) => this.levelByInstance.set(instanceId, 0);
    this.onChanged = ({ instanceId, action, level }) => {
      if (action === 'upgraded') this.levelByInstance.set(instanceId, level);
    };
    EventBus.on(EV.objectBuilt, this.onBuilt, this);
    EventBus.on(EV.objectChanged, this.onChanged, this);

    const nst = core.getState().towers.find(t => t.id === 'nseoulTower');
    if (nst) this.levelByInstance.set(nst.instanceId, nst.level);

    scene.events.once('shutdown', () => this.destroy());
  }

  /** 모르는 instanceId(아직 objectBuilt를 못 받은 경우 등)는 0(최소 레벨)으로 안전하게 취급한다. */
  getLevel(instanceId) {
    return this.levelByInstance.get(instanceId) ?? 0;
  }

  destroy() {
    EventBus.off(EV.objectBuilt, this.onBuilt, this);
    EventBus.off(EV.objectChanged, this.onChanged, this);
  }
}
