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
 * `relocated`는 EventBus 계약상 좌표가 안 실려 와서(§5 알려진 gap, BuildUI의 오라 추적과 동일)
 * `applyRelocate()`가 그때만 `getState()`로 1회 재조회한다(D18 예외 — 드래그 드롭마다 발생하지만
 * 여전히 "매 프레임"이 아니라 이벤트당 1회라 성능 조항에 어긋나지 않는다).
 *
 * ── 드래그 재배치 고스트 ────────────────────────────────────────────
 * UpgradeUI가 건물을 드래그하는 동안 `beginDrag`/`updateDragPosition`/`endDrag`를 직접 호출해
 * 이 엔트리의 gfx/sprite 위치를 커서에 맞춰 옮긴다 — `tickRecoil()`은 `entry.dragging`이 켜진
 * 동안 그 엔트리를 건드리지 않는다(발사 반동과 드래그가 같은 위치값을 두고 싸우는 걸 막는다).
 *
 * 에셋이 없는 지금은 실루엣 도형 플레이스홀더를 쓴다(docs/ASSET_GUIDE.md와 동일한
 * 실루엣 규칙 — 윤곽만으로 식별 가능해야 한다는 원칙을 코드에도 그대로 반영).
 *
 * ── 발사 반동(recoil) ──────────────────────────────────────────────
 * `towerFired` 이벤트(SYNC.md §3 C8)로 발사 순간을 직접 받는다 — payload의 x/y/targetX/targetY로
 * 반동 방향(조준 방향의 반대)을 즉시 계산하고 recoilStart를 찍으면, tickRecoil()은 매 프레임
 * 그 시각 이후 경과 시간만으로 감쇠(위치·스케일)를 그린다. 감지(이벤트)와 렌더(매 프레임 감쇠)가
 * 분리돼 있어서 폴링이 필요 없다. Mock은 실제 Tower.js를 쓰지 않아 이 이벤트를 애초에 안 쏘므로
 * 별도 분기 없이 자연히 아무 반동도 안 걸린다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW, EASE, ANIM, SPRITE } from '../ui/UITheme.js';
import { FOOTPRINT } from '../game/GridSystem.js';
import { fitSpriteWidth } from './SpriteScale.js';
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
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;
    this.byInstance = new Map();

    this.onBuilt = payload => this.create(payload);
    this.onChanged = ({ instanceId, action, level }) => {
      if (action === 'upgraded') this.applyLevel(instanceId, level);
      else if (action === 'relocated') this.applyRelocate(instanceId);
    };
    this.onFired = payload => this.handleFired(payload);
    EventBus.on(EV.objectBuilt, this.onBuilt, this);
    EventBus.on(EV.objectChanged, this.onChanged, this);
    EventBus.on(EV.towerFired, this.onFired, this);

    this.onUpdate = (time) => this.tickRecoil(time);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

    // GameCore.ensureNSeoulTower가 objectBuilt를 발행하지 않아 여기서 getState로 보정.
    // 로직 쪽에서 이벤트 발행 시 이 블록 제거 가능. (N서울타워는 buildTower()를 안 거치고
    // 모듈 로드 시 WaveManager에 직접 추가되는 상시 지형물이라, create()의 유일한 트리거인
    // objectBuilt를 영원히 못 받는다 — 씬 진입 시 1회 조회는 D18이 허용하는 예외와 동일 패턴.)
    const nst = core.getState().towers.find(t => t.id === 'nseoulTower');
    if (nst) {
      this.create({ kind: 'tower', id: 'nseoulTower', instanceId: nst.instanceId, x: nst.x, y: nst.y });
      // create()는 항상 level 0으로 그린다(정상 objectBuilt 경로는 그 순간이 실제로 항상 Lv1이라
      // 맞는 가정이지만, 여기 보정 경로는 씬이 나중에 만들어질 수도 있어 이미 강화된 상태일 수 있다).
      if (nst.level > 0) this.applyLevel(nst.instanceId, nst.level);
    }

    scene.events.once('shutdown', () => this.destroy());
  }

  create({ kind, id, instanceId, x, y }) {
    const def = DATA_BY_KIND[kind]?.[id];
    if (!def) return;

    const gfx = this.scene.add.graphics();
    const sprite = this.scene.add.image(x, y, '__DEFAULT').setVisible(false);
    gfx.setPosition(x, y);

    const entry = {
      gfx, sprite, kind, objId: id,
      baseX: x, baseY: y, baseScale: 1, squashing: false, dragging: false,
      dirX: 1, dirY: 0, recoilStart: -Infinity,
    };
    this.byInstance.set(instanceId, entry);
    this.redraw(entry, 0);
    this.playBuildSquash(entry);
  }

  // ────────────────────────────────────────── 드래그 재배치 (UpgradeUI가 호출)
  /** 드래그 시작 — 반투명 고스트로 전환하고 tickRecoil이 이 엔트리의 위치를 건드리지 않게 막는다. */
  beginDrag(instanceId) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    entry.dragging = true;
    entry.gfx.setAlpha(0.75);
    entry.sprite.setAlpha(0.75);
  }

  /** 드래그 중 커서를 그대로 따라간다 — 셀 스냅은 UI 쪽 미리보기 사각형이 별도로 보여준다. */
  updateDragPosition(instanceId, x, y) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    entry.gfx.setPosition(x, y);
    entry.sprite.setPosition(x, y);
  }

  /**
   * 드래그 종료 — 항상 entry.baseX/baseY로 되돌린다. 이동에 성공했다면 objectChanged가 먼저
   * 도착해 applyRelocate()가 baseX/baseY를 이미 새 위치로 갱신해뒀을 것이고(EventBus는 동기 발행),
   * 실패했다면 baseX/baseY가 원래 값 그대로라 자연히 "원위치 복귀"가 된다 — 성공/실패를 따로 안 받아도 된다.
   */
  endDrag(instanceId) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    entry.dragging = false;
    entry.gfx.setAlpha(1).setPosition(entry.baseX, entry.baseY);
    entry.sprite.setAlpha(1).setPosition(entry.baseX, entry.baseY);
  }

  /**
   * 배치 "쿵" — redraw()가 세팅한 자연 스케일을 목표값으로 삼아 찌그러진 상태에서 튕겨 돌아온다.
   * 이 튠 도중엔 tickRecoil()이 매 프레임 scale을 건드리면 안 된다(둘 다 같은 scaleX/Y를
   * 놓고 싸우면 squash가 그대로 씹힌다) — entry.squashing으로 그 창을 표시해서 tickRecoil이 넘어가게 한다.
   *
   * 목표값은 entry.gfx.scaleX가 아니라 entry.baseScale에서 읽는다 — 텍스처 분기(redraw())는
   * gfx.setScale()을 아예 안 부르고 return하기 때문에(도형을 안 그리니까), gfx.scaleX엔 실제
   * 스프라이트 목표 스케일과 무관한 잔여값이 남아있다. baseScale은 두 분기 모두에서 항상
   * 올바른 "지금 적용해야 할 스케일"을 담고 있는 유일한 소스다(tickRecoil()과 동일 원칙).
   */
  playBuildSquash(entry) {
    const target = entry.baseScale;
    entry.squashing = true;
    entry.gfx.setScale(target * 1.4, target * 0.4);
    entry.sprite.setScale(target * 1.4, target * 0.4);
    this.scene.tweens.add({
      targets: [entry.gfx, entry.sprite],
      scaleX: target, scaleY: target,
      duration: VIEW.buildSquashMs, ease: EASE.pop,
      onComplete: () => { entry.squashing = false; },
    });
  }

  applyLevel(instanceId, level) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return; // 이론상 objectBuilt가 항상 먼저 오므로 안 걸리지만 방어적으로 둠
    this.redraw(entry, level);
  }

  /**
   * objectChanged 페이로드엔 좌표가 없다(EventBus.js 계약상 {instanceId, action, level}뿐) —
   * 재배치는 드문 이벤트라 이때만 getState()로 1회 재조회한다(BuildUI의 오라 추적과 동일한 D18 예외).
   * UpgradeUI 재배치 UI가 생기면서 더 이상 "발생하지 않는" 경로가 아니게 됐다(HANDOFF.md §5 갱신 필요).
   */
  applyRelocate(instanceId) {
    const entry = this.byInstance.get(instanceId);
    if (!entry || !this.core) return;
    const state = this.core.getState();
    const obj = [...state.towers, ...state.supports].find(o => o.instanceId === instanceId);
    if (!obj) return;
    entry.baseX = obj.x;
    entry.baseY = obj.y;
    entry.gfx.setPosition(obj.x, obj.y);
    entry.sprite.setPosition(obj.x, obj.y);
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
    // VIEW.towerSize/supportSize는 1칸(40px) 기준으로 튜닝된 값 — 2×2 블록을 채우도록 FOOTPRINT만큼 키운다.
    // 장애물은 FOOTPRINT.obstacle이 1이라 곱해도 기존과 동일(×1).
    const baseSize = kind === 'tower' ? VIEW.towerSize : kind === 'support' ? VIEW.supportSize : VIEW.obstacleSize;
    const size = baseSize * (FOOTPRINT[kind] ?? 1);

    entry.baseScale = scale; // 발사 반동의 스케일 펀치가 여기 곱해진다(tickRecoil) — 텍스처 타워는 아래서 폭 정규화까지 곱해 덮어쓴다

    // 타워는 레벨별 이미지가 있을 수 있다(지금은 nseoulTower만 실제로 있음, 나머지 5종은 자동 폴백).
    // tower_<id>_<level+1>을 먼저 찾고 없으면 tower_<id>. level은 0-index(Tower.js this.level을
    // GameCore.js가 그대로 emit — 확인 완료: Lv1=0/Lv2=1/Lv3=2)라 파일명(_1/_2/_3, 1-index)과
    // 맞추려면 +1이 필요하다.
    const leveledKey = kind === 'tower' ? `${ASSET_KEY(kind, objId)}_${level + 1}` : null;
    const key = (leveledKey && this.scene.textures.exists(leveledKey)) ? leveledKey : ASSET_KEY(kind, objId);

    if (this.scene.textures.exists(key)) {
      entry.gfx.setVisible(false);
      entry.sprite.setTexture(key).setVisible(true);
      if (kind === 'tower') {
        // 목표 폭(FOOTPRINT 유래 80px) 정규화 × 레벨 배율을 곱해서 entry.baseScale 하나로
        // 합친다 — tickRecoil()·playBuildSquash()가 전부 이 값만 읽으므로(§B 함정 수정) 여기서만
        // 정확히 계산해두면 나머지는 자동으로 옳다. 서포터/장애물은 아직 폭 정규화 대상 밖(다음 턴)
        // 이라 위에서 이미 넣어둔 scale(레벨 배율만)을 그대로 쓴다.
        entry.baseScale = fitSpriteWidth(entry.sprite, SPRITE.towerWidth) * scale;
      }
      entry.sprite.setScale(entry.baseScale);
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

  // ────────────────────────────────────────── 발사 반동 (§ 상단 주석 참고)
  /** towerFired 수신 즉시 반동 방향(조준 방향의 반대)과 시작 시각만 찍는다 — 렌더는 tickRecoil이 매 프레임 감쇠로 그린다. */
  handleFired({ instanceId, x, y, targetX, targetY }) {
    const entry = this.byInstance.get(instanceId);
    if (!entry) return;
    const dx = targetX - x, dy = targetY - y;
    const dist = Math.hypot(dx, dy) || 1;
    entry.dirX = dx / dist;
    entry.dirY = dy / dist;
    entry.recoilStart = this.scene.time.now;
  }

  /**
   * recoilStart 이후 경과 시간만으로 위치·스케일 감쇠를 그린다(감지는 handleFired가 이벤트로 이미 끝냄).
   * 오브젝트 수가 유니크 룰·격자 상한으로 적어서(§ 상단) 매 프레임 전부 순회해도 비용이 무시할 만하다
   * (EnemyView처럼 100+개를 오브젝트 풀로 관리해야 하는 경우와는 스케일이 다르다). 서포터·장애물
   * 엔트리는 recoilStart가 항상 -Infinity로 남아 자연히 아무 반동도 안 걸린다.
   */
  tickRecoil(time) {
    for (const entry of this.byInstance.values()) {
      // 배치 "쿵" 튠이 scale을 쥐고 있거나, 드래그로 위치를 쥐고 있는 동안엔 넘어간다
      if (entry.squashing || entry.dragging) continue;

      let k = 0, scaleMul = 1;
      const elapsed = time - entry.recoilStart;
      if (elapsed >= 0 && elapsed < ANIM.towerRecoilMs) {
        const p = elapsed / ANIM.towerRecoilMs;
        k = (1 - p) ** 2;
        scaleMul = 1 + ANIM.towerRecoilScalePunch * Math.sin(p * Math.PI);
      }
      const dist = ANIM.towerRecoilDist * k;
      const rx = entry.baseX - entry.dirX * dist, ry = entry.baseY - entry.dirY * dist;
      const rs = entry.baseScale * scaleMul;
      entry.gfx.setPosition(rx, ry).setScale(rs);
      entry.sprite.setPosition(rx, ry).setScale(rs);
    }
  }

  destroy() {
    EventBus.off(EV.objectBuilt, this.onBuilt, this);
    EventBus.off(EV.objectChanged, this.onChanged, this);
    EventBus.off(EV.towerFired, this.onFired, this);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.byInstance.forEach(({ gfx, sprite }) => { gfx.destroy(); sprite.destroy(); });
  }
}
