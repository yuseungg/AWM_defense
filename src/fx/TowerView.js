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
 * 에셋이 없는 지금은 랜드마크별 실루엣 도형 플레이스홀더를 쓴다(docs/ASSET_GUIDE.md와 동일한
 * 실루엣 규칙 — 윤곽만으로 식별 가능해야 한다는 원칙을 코드에도 그대로 반영).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW } from '../ui/UITheme.js';
import towersData from '../../data/towers.json';

const ASSET_KEY = id => `tower_${id}`;

/** 랜드마크별 실루엣 — 전부 원점(0,0) 기준으로 그린다. docs/ASSET_GUIDE.md 실루엣 규칙과 1:1 대응 */
const SILHOUETTES = {
  // N서울타워 — 첨탑형: 좁은 기단 + 삼각 첨탑 + 안테나
  nseoulTower(g, s) {
    g.fillRect(-s * 0.18, s * 0.28, s * 0.36, s * 0.22);
    g.fillTriangle(-s * 0.22, s * 0.28, s * 0.22, s * 0.28, 0, -s * 0.35);
    g.fillRect(-s * 0.03, -s * 0.5, s * 0.06, s * 0.18);
  },
  // 청계천 — 가로로 긴 물결 띠
  cheonggyecheon(g, s) {
    g.fillRoundedRect(-s * 0.5, -s * 0.14, s, s * 0.28, s * 0.14);
  },
  // 광화문 — 문루형: 사다리꼴 기단 + 삼각 지붕
  gwanghwamun(g, s) {
    g.fillTriangle(-s * 0.5, -s * 0.05, s * 0.5, -s * 0.05, 0, -s * 0.48);
    g.fillPoints([
      { x: -s * 0.4, y: s * 0.42 }, { x: s * 0.4, y: s * 0.42 },
      { x: s * 0.3, y: -s * 0.06 }, { x: -s * 0.3, y: -s * 0.06 },
    ], true);
  },
  // DDP — 유선형 덩어리: 각 없는 매끈한 타원
  ddp(g, s) {
    g.fillEllipse(0, 0, s * 0.9, s * 0.55);
  },
  // 롯데월드타워 — 가늘고 긴 사다리꼴(아래가 넓고 위로 갈수록 뾰족)
  lotteWorldTower(g, s) {
    g.fillPoints([
      { x: -s * 0.22, y: s * 0.5 }, { x: s * 0.22, y: s * 0.5 },
      { x: s * 0.07, y: -s * 0.5 }, { x: -s * 0.07, y: -s * 0.5 },
    ], true);
  },
  // 서울숲 — 나무 캐노피 3개 겹침 + 밑동
  seoulForest(g, s) {
    g.fillCircle(-s * 0.22, -s * 0.05, s * 0.28);
    g.fillCircle(s * 0.22, -s * 0.05, s * 0.28);
    g.fillCircle(0, -s * 0.28, s * 0.28);
    g.fillRect(-s * 0.06, s * 0.2, s * 0.12, s * 0.25);
  },
};

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

    const gfx = this.scene.add.graphics();
    const sprite = this.scene.add.image(x, y, '__DEFAULT').setVisible(false);
    gfx.setPosition(x, y);

    const entry = { gfx, sprite, towerId: id };
    this.byInstance.set(instanceId, entry);
    this.redraw(entry, 0);
  }

  applyLevel(instanceId, level) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return; // 이론상 objectBuilt가 항상 먼저 오므로 안 걸리지만 방어적으로 둠
    this.redraw(entry, level);
  }

  /** 텍스처가 있으면 이미지로, 없으면(지금 기본) 랜드마크별 실루엣 도형으로 그린다 */
  redraw(entry, level) {
    const def = towersData[entry.towerId];
    const lvl = def.levels[level];
    if (!lvl) return;

    const key = ASSET_KEY(entry.towerId);
    if (this.scene.textures.exists(key)) {
      entry.gfx.setVisible(false);
      entry.sprite.setTexture(key).setVisible(true).setScale(lvl.scale);
      return;
    }

    entry.sprite.setVisible(false);
    entry.gfx.clear().setVisible(true).setScale(lvl.scale);

    // 실루엣 밑에 얇은 기준 원 하나 — 어떤 모양이든 "여기 서 있다"는 발판 표시가 통일되게
    entry.gfx.lineStyle(1, VIEW.towerStrokeColor, VIEW.towerStrokeAlpha);
    entry.gfx.strokeCircle(0, 0, VIEW.towerSize * 0.55);

    entry.gfx.fillStyle(Phaser.Display.Color.HexStringToColor(lvl.tint).color, 1);
    const draw = SILHOUETTES[entry.towerId];
    if (draw) draw(entry.gfx, VIEW.towerSize);
    else entry.gfx.fillRect(-VIEW.towerSize / 2, -VIEW.towerSize / 2, VIEW.towerSize, VIEW.towerSize);
  }

  destroy() {
    EventBus.off(EV.objectBuilt, this.onBuilt, this);
    EventBus.off(EV.objectChanged, this.onChanged, this);
    this.byInstance.forEach(({ gfx, sprite }) => { gfx.destroy(); sprite.destroy(); });
  }
}
