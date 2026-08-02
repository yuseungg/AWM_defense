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
 *
 * ── 발사 반동(recoil) ──────────────────────────────────────────────
 * EventBus에 `towerFired` 같은 이벤트가 없어서(HANDOFF.md §5에 기록) A의 파일을 고치지 않고는
 * "지금 쐈다"는 신호를 직접 받을 방법이 없다. 대신 `GameCore.getState().towers`가 돌려주는
 * 배열이 WaveManager 내부 배열의 "참조"라는 점(GameCore.js:231 `getTowers()`가 복사 없이
 * 그대로 반환)을 이용해 씬 진입 시 1회만(D18 준수) 이 배열 참조를 들고, 매 프레임
 * `tower.cooldownRemaining`이 감소하다 갑자기 튀어오르는 순간(=Tower.update()가 쿨다운을
 * `attackSpeed`로 리셋한 순간, 곧 발사 순간)을 렌더러가 스스로 감지한다. `tower.findTarget()`은
 * 순수 조회 메서드(부작용 없음)라 반동 방향(=조준 방향의 반대)을 구하는 데 그대로 쓴다.
 * 전부 읽기 전용이고 논리 상태는 절대 건드리지 않는다 — 그래도 A의 내부 구현(배열이 참조로
 * 온다는 점)에 기대는 만큼 이상적인 방법은 아니다. A가 `towerFired` 이벤트를 추가해주면
 * 이 블록은 그걸로 교체한다. Mock은 cooldownRemaining이 없는 더미 객체라 아예 동작 안 함
 * (다른 Mock 한계와 동일 원칙 — HANDOFF.md §0).
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { VIEW, EASE, ANIM } from '../ui/UITheme.js';
import { FOOTPRINT } from '../game/GridSystem.js';
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

    // 발사 반동 — 실제 코어에서만(§ 위 주석). Mock의 tower 객체엔 cooldownRemaining이 없어서
    // prevCooldown이 항상 undefined로 남아 자연히 아무 반동도 안 걸린다(에러도 안 남).
    this.trackRecoil = !core.__isMock;
    this.liveTowers = this.trackRecoil ? core.getState().towers : null; // 씬 진입 시 1회만(D18)

    this.onBuilt = payload => this.create(payload);
    this.onChanged = ({ instanceId, action, level }) => {
      if (action === 'upgraded') this.applyLevel(instanceId, level);
      else if (action === 'relocated') this.applyRelocate(instanceId);
    };
    EventBus.on(EV.objectBuilt, this.onBuilt, this);
    EventBus.on(EV.objectChanged, this.onChanged, this);

    this.onUpdate = (time) => this.tickRecoil(time);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);

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
      baseX: x, baseY: y, baseScale: 1, squashing: false,
      dirX: 1, dirY: 0, recoilStart: -Infinity, prevCooldown: undefined,
    };
    this.byInstance.set(instanceId, entry);
    this.redraw(entry, 0);
    this.playBuildSquash(entry);
  }

  /**
   * 배치 "쿵" — redraw()가 세팅한 자연 스케일을 목표값으로 삼아 찌그러진 상태에서 튕겨 돌아온다.
   * 이 튠 도중엔 tickRecoil()이 매 프레임 scale을 건드리면 안 된다(둘 다 같은 scaleX/Y를
   * 놓고 싸우면 squash가 그대로 씹힌다) — entry.squashing으로 그 창을 표시해서 tickRecoil이 넘어가게 한다.
   */
  playBuildSquash(entry) {
    const targetX = entry.gfx.scaleX, targetY = entry.gfx.scaleY;
    entry.squashing = true;
    entry.gfx.setScale(targetX * 1.4, targetY * 0.4);
    entry.sprite.setScale(targetX * 1.4, targetY * 0.4);
    this.scene.tweens.add({
      targets: [entry.gfx, entry.sprite],
      scaleX: targetX, scaleY: targetY,
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

    entry.baseScale = scale; // 발사 반동의 스케일 펀치가 여기 곱해진다(tickRecoil)

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

  // ────────────────────────────────────────── 발사 반동 (§ 상단 주석 참고)
  /**
   * tower.cooldownRemaining이 감소하다 갑자기 커지면 방금 리셋된 것 — 즉 발사 순간이다.
   * 타워 수가 유니크 룰상 최대 8개뿐이라(§ 상단) 매 프레임 전부 순회해도 비용이 무시할 만하다
   * (EnemyView처럼 100+개를 오브젝트 풀로 관리해야 하는 경우와는 스케일이 다르다).
   */
  tickRecoil(time) {
    if (!this.trackRecoil || !this.liveTowers) return;

    for (const tower of this.liveTowers) {
      const entry = this.byInstance.get(tower.instanceId);
      if (!entry || entry.squashing) continue; // objectBuilt가 아직 안 왔거나, 배치 "쿵" 튠이 scale을 쥐고 있는 동안

      if (entry.prevCooldown !== undefined && tower.cooldownRemaining > entry.prevCooldown + 1e-6) {
        const target = tower.findTarget(); // 순수 조회 — 방금 실제로 쐈을 그 대상과 사실상 동일
        if (target) {
          const dx = target.x - tower.x, dy = target.y - tower.y;
          const dist = Math.hypot(dx, dy) || 1;
          entry.dirX = dx / dist;
          entry.dirY = dy / dist;
        }
        entry.recoilStart = time;
      }
      entry.prevCooldown = tower.cooldownRemaining;

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
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate, this);
    this.byInstance.forEach(({ gfx, sprite }) => { gfx.destroy(); sprite.destroy(); });
  }
}
