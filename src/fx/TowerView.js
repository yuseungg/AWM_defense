/**
 * TowerView.js — 화면에 타워를 그린다
 *
 * 랜드마크 타워는 유니크 룰(CLAUDE.md §1) 때문에 게임 하나에 최대 6개뿐이라 풀링이 필요 없다
 * (오브젝트 풀링은 EnemyView.js처럼 웨이브 40+에 100개 이상 존재하는 것들에만 필요하다).
 *
 * `objectBuilt`로 생성, `objectChanged`(action:'upgraded')로 towers.json의 levels[].tint/scale을
 * 적용해 역사 변천을 표현한다. `relocated`는 EventBus 계약상 좌표가 안 실려 와서(§5 알려진 미완성,
 * BuildUI의 오라 추적과 동일한 gap) 지금은 위치 갱신을 못 한다 — 재배치 UI 자체도 아직 없어서
 * 실질적으로 발생하지 않는다.
 *
 * 에셋이 없는 지금은 towers.json id별 색(levels[0].tint) 사각형 플레이스홀더를 쓴다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW } from '../ui/UITheme.js';
import towersData from '../../data/towers.json';

const ASSET_KEY = id => `tower_${id}`;

export class TowerView {
  constructor(scene) {
    this.scene = scene;
    this.byInstance = new Map();

    this.onBuilt = payload => { if (payload.kind === 'tower') this.create(payload); };
    this.onChanged = ({ instanceId, action, level }) => {
      if (action === 'upgraded') this.applyLevel(instanceId, level);
    };
    EventBus.on(EV.objectBuilt, this.onBuilt, this);
    EventBus.on(EV.objectChanged, this.onChanged, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  create({ id, instanceId, x, y }) {
    const def = towersData[id];
    if (!def) return;

    const key = ASSET_KEY(id);
    const useAsset = this.scene.textures.exists(key);

    const rect = this.scene.add.rectangle(x, y, VIEW.towerSize, VIEW.towerSize, this.tintOf(def, 0))
      .setStrokeStyle(2, VIEW.towerStrokeColor, VIEW.towerStrokeAlpha)
      .setVisible(!useAsset);
    const sprite = this.scene.add.image(x, y, useAsset ? key : '__DEFAULT').setVisible(useAsset);

    rect.setScale(def.levels[0].scale);
    sprite.setScale(def.levels[0].scale);

    this.byInstance.set(instanceId, { rect, sprite, towerId: id, useAsset });
  }

  applyLevel(instanceId, level) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return; // 이론상 objectBuilt가 항상 먼저 오므로 안 걸리지만 방어적으로 둠
    const def = towersData[entry.towerId];
    const lvl = def.levels[level];
    if (!lvl) return;

    entry.rect.setFillStyle(this.tintOf(def, level)).setScale(lvl.scale);
    entry.sprite.setScale(lvl.scale);
  }

  tintOf(def, level) {
    return Phaser.Display.Color.HexStringToColor(def.levels[level].tint).color;
  }

  destroy() {
    EventBus.off(EV.objectBuilt, this.onBuilt, this);
    EventBus.off(EV.objectChanged, this.onChanged, this);
    this.byInstance.forEach(({ rect, sprite }) => { rect.destroy(); sprite.destroy(); });
  }
}
