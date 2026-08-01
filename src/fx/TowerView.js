/**
 * TowerView.js — 화면에 타워·서포터·장애물을 그린다 (건설되는 모든 것의 렌더러)
 *
 * 랜드마크 타워·서포터는 유니크 룰(CLAUDE.md §1) 때문에 게임 하나에 최대 8개뿐이고,
 * 장애물도 "한 칸 1개" 규칙상 맵 크기(격자 칸 수)로 상한이 있어 풀링이 필요 없다
 * (오브젝트 풀링은 EnemyView.js처럼 웨이브 40+에 100개 이상 존재하는 것들에만 필요하다).
 *
 * `objectBuilt`로 생성. 타워는 `objectChanged`(action:'upgraded')로 towers.json의
 * levels[].tint/scale을 적용해 역사 변천을 표현한다. 서포터/장애물은 데이터에 tint/scale
 * 필드가 없어서(§4 데이터 스키마) UITheme.js VIEW.objectColor의 고정색 + 레벨당 완만한
 * 확대(1 + level*0.15)로만 표현한다 — 장애물은 아직 강화 대상이 아니라(HANDOFF.md 참고)
 * 실제로는 항상 level 0이지만, 나중에 강화가 붙어도 코드 변경 없이 자연히 커지게 해둔다.
 *
 * `relocated`는 EventBus 계약상 좌표가 안 실려 와서(§5 알려진 미완성, BuildUI의 오라 추적과
 * 동일한 gap) 지금은 위치 갱신을 못 한다 — 재배치 UI 자체도 아직 없어서 실질적으로 발생하지 않는다.
 *
 * 에셋이 없는 지금은 실루엣 도형 플레이스홀더를 쓴다(docs/ASSET_GUIDE.md와 동일한
 * 실루엣 규칙 — 윤곽만으로 식별 가능해야 한다는 원칙을 코드에도 그대로 반영).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW } from '../ui/UITheme.js';
import towersData from '../../data/towers.json';
import supportsData from '../../data/supports.json';
import obstaclesData from '../../data/obstacles.json';

const DATA_BY_KIND = { tower: towersData, support: supportsData, obstacle: obstaclesData };
const ASSET_KEY = (kind, id) => `${kind}_${id}`;

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

  // 세운상가 — 좌우 건물 블록 두 개를 잇는 공중보행데크
  sewoon(g, s) {
    g.fillRect(-s * 0.45, -s * 0.05, s * 0.22, s * 0.5);
    g.fillRect(s * 0.23, -s * 0.05, s * 0.22, s * 0.5);
    g.fillRect(-s * 0.45, -s * 0.08, s * 0.9, s * 0.14);
  },
  // 서울시청 — 넓은 청사 + 중앙 첨탑
  cityHall(g, s) {
    g.fillRect(-s * 0.45, -s * 0.05, s * 0.9, s * 0.5);
    g.fillRect(-s * 0.05, -s * 0.42, s * 0.1, s * 0.4);
  },
  // 통나무 — 옆으로 눕힌 원통
  log(g, s) {
    g.fillRoundedRect(-s * 0.5, -s * 0.22, s, s * 0.44, s * 0.22);
  },
  // 소독약 — 스프레이 캔(몸통 원 + 노즐)
  disinfectant(g, s) {
    g.fillCircle(0, s * 0.05, s * 0.3);
    g.fillRect(-s * 0.08, -s * 0.35, s * 0.16, s * 0.3);
  },
};

export class TowerView {
  constructor(scene) {
    this.scene = scene;
    this.byInstance = new Map();

    this.onBuilt = payload => this.create(payload);
    this.onChanged = ({ instanceId, action, level }) => {
      if (action === 'upgraded') this.applyLevel(instanceId, level);
    };
    EventBus.on(EV.objectBuilt, this.onBuilt, this);
    EventBus.on(EV.objectChanged, this.onChanged, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  create({ kind, id, instanceId, x, y }) {
    const def = DATA_BY_KIND[kind]?.[id];
    if (!def) return;

    const gfx = this.scene.add.graphics();
    const sprite = this.scene.add.image(x, y, '__DEFAULT').setVisible(false);
    gfx.setPosition(x, y);

    const entry = { gfx, sprite, kind, objId: id };
    this.byInstance.set(instanceId, entry);
    this.redraw(entry, 0);
  }

  applyLevel(instanceId, level) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return; // 이론상 objectBuilt가 항상 먼저 오므로 안 걸리지만 방어적으로 둠
    this.redraw(entry, level);
  }

  /**
   * 텍스처가 있으면 이미지로, 없으면(지금 기본) 실루엣 도형으로 그린다.
   * 타워는 towers.json의 levels[].tint/scale을 그대로 쓴다. 서포터/장애물은 데이터에 그
   * 필드가 없어서(§4) VIEW.objectColor 고정색 + 레벨당 완만한 확대(1 + level*0.15)로 대신한다.
   */
  redraw(entry, level) {
    const { kind, objId } = entry;
    const def = DATA_BY_KIND[kind]?.[objId];
    if (!def) return;

    let scale, color;
    if (kind === 'tower') {
      const lvl = def.levels[level];
      if (!lvl) return;
      scale = lvl.scale;
      color = Phaser.Display.Color.HexStringToColor(lvl.tint).color;
    } else {
      scale = 1 + level * 0.15;
      color = VIEW.objectColor[objId] ?? VIEW.towerStrokeColor;
    }
    const size = kind === 'tower' ? VIEW.towerSize : kind === 'support' ? VIEW.supportSize : VIEW.obstacleSize;

    const key = ASSET_KEY(kind, objId);
    if (this.scene.textures.exists(key)) {
      entry.gfx.setVisible(false);
      entry.sprite.setTexture(key).setVisible(true).setScale(scale);
      return;
    }

    entry.sprite.setVisible(false);
    entry.gfx.clear().setVisible(true).setScale(scale);

    // 실루엣 밑에 얇은 기준 원 하나 — 어떤 모양이든 "여기 서 있다"는 발판 표시가 통일되게
    entry.gfx.lineStyle(1, VIEW.towerStrokeColor, VIEW.towerStrokeAlpha);
    entry.gfx.strokeCircle(0, 0, size * 0.55);

    entry.gfx.fillStyle(color, 1);
    const draw = SILHOUETTES[objId];
    if (draw) draw(entry.gfx, size);
    else entry.gfx.fillRect(-size / 2, -size / 2, size, size);
  }

  destroy() {
    EventBus.off(EV.objectBuilt, this.onBuilt, this);
    EventBus.off(EV.objectChanged, this.onChanged, this);
    this.byInstance.forEach(({ gfx, sprite }) => { gfx.destroy(); sprite.destroy(); });
  }
}
