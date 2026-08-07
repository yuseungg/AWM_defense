/**
 * mapView.js — 지도 배경(배경 사진 + 격자 + 도로 + 차선 + 진행 방향 화살표 + 코어)을 그린다.
 * GameScene · VerifyScene · MockScene이 공유한다.
 *
 * ⚠️ collectPathCells는 경로 셀을 "그리기 용도"로만 근사 수집한다. A가
 *    GridSystem.js에 정식 경로 셀 판정(장애물 배치 유효성 검사용)을 만들면
 *    이 함수는 그쪽으로 교체한다 — 지금은 시각화 전용 임시 구현이다. (SYNC.md §2)
 *
 * ★ 컨셉이 "적이 서울 도로를 타고 온다"라서 경로를 실제 도로처럼 그린다 —
 *   중앙 점선 차선 + 진행 방향 화살표(양방향 도로가 아니라 방향 표시 목적).
 *   ROAD 상수는 UITheme.js에 있다.
 *
 * ★ 경로 밖 슬롯 격자는 기본 숨김이다 — 배치/재배치 모드일 때만 setGridVisible(true)로 켠다
 *   (BuildUI.select/clearSelection, UpgradeUI.startRelocate/cancelRelocate/close가 호출한다).
 *   ?debug=1이면 격자 정렬 확인용으로 항상 보인다. 격자·격자용 추가 dim 레이어는 모듈
 *   싱글톤(gridGfx/gridDimGfx)으로 들고 있다 — 씬은 항상 하나만 활성화되므로(main.js) 충분하다.
 */

import mapData from '../../data/map.json';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, ROAD, BG, GRID, EASE } from './UITheme.js';

export const W = 1280;
export const H = 720;
export const CELL = mapData.obstacleGrid.cell;

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const BG_PARAM = new URLSearchParams(location.search).get('bg'); // 'day'|'night' 강제 지정(촬영용)
const BG_WAVES_PER_CYCLE = 5; // 5웨이브마다 낮/밤 전환(합의 사항 — 접속 시각 연동 폐기)

let gridGfx = null;
let gridDimGfx = null;
let bgImage = null;
let bgDim = null;
let bgWaveHandler = null;

/**
 * 웨이브 5개마다 낮↔밤 전환. wave 1~5=낮, 6~10=밤, 11~15=낮 ... (wave 0은 1로 취급).
 * ?bg=day|night면 웨이브와 무관하게 그 값으로 고정(촬영용).
 *
 * export하는 이유: SoundManager.js(BGM 낮/밤 크로스페이드)도 같은 "5웨이브 주기" 판정이
 * 필요하다. 매직넘버(5)를 두 곳에 따로 두지 않고 이 함수 하나로 공유한다.
 */
export function bgKeyForWave(wave) {
  if (BG_PARAM === 'day' || BG_PARAM === 'night') return BG_PARAM;
  const w = Math.max(1, wave);
  return Math.floor((w - 1) / BG_WAVES_PER_CYCLE) % 2 === 0 ? 'day' : 'night';
}

/** 이미 그려둔 배경 이미지의 텍스처·틴트만 교체한다(위치는 그대로) — 웨이브 전환마다 호출됨. */
function applyBgKey(scene, dayOrNight) {
  const fullKey = `bg_${dayOrNight}`;
  if (!bgImage || !scene.textures.exists(fullKey)) return;

  const src = scene.textures.get(fullKey).getSourceImage();
  const scale = Math.max(W / src.width, H / src.height);
  bgImage.setTexture(fullKey).setScale(scale);
  bgDim.setFillStyle(BG.dimColor, dayOrNight === 'day' ? BG.dimDay : BG.dimNight);
}

/**
 * 배경 사진 — GameScene.preload()가 `bg_day`/`bg_night` 텍스처를 로드해뒀을 때만 그린다.
 * 없으면(로드 실패·MockScene/VerifyScene처럼 애초에 preload 자체를 안 하는 씬) 조용히
 * 스킵하고 카메라 배경색(COLOR.bg)이 그대로 보인다 — 다른 에셋들과 동일한 폴백 원칙
 * (TowerView/EnemyView의 `textures.exists()` 패턴).
 *
 * cover 방식: 텍스처의 실제 크기를 읽어서 세로를 캔버스에 맞추고 가로는 중앙 기준으로
 * 넘치는 만큼 잘라낸다 — 원본 해상도가 몇이든(1280×720이든 1685×925든) 코드 변경이 없다.
 *
 * `waveStarted`를 구독해서 5웨이브마다 텍스처를 교체한다(?bg= 강제 지정 시에는 구독 자체를
 * 안 한다 — 촬영 중에 웨이브가 넘어가서 값이 바뀌면 안 되므로).
 */
function drawBackground(scene) {
  const initialKey = bgKeyForWave(0);
  const fullKey = `bg_${initialKey}`;
  if (!scene.textures.exists(fullKey)) return;

  const src = scene.textures.get(fullKey).getSourceImage();
  const scale = Math.max(W / src.width, H / src.height);
  bgImage = scene.add.image(W / 2, H / 2, fullKey).setScale(scale);
  bgDim = scene.add.rectangle(W / 2, H / 2, W, H, BG.dimColor, initialKey === 'day' ? BG.dimDay : BG.dimNight);

  if (BG_PARAM !== 'day' && BG_PARAM !== 'night') {
    bgWaveHandler = ({ wave }) => applyBgKey(scene, bgKeyForWave(wave));
    EventBus.on(EV.waveStarted, bgWaveHandler);
    scene.events.once('shutdown', () => {
      if (bgWaveHandler) EventBus.off(EV.waveStarted, bgWaveHandler);
      bgWaveHandler = null;
      bgImage = null;
      bgDim = null;
    });
  }
}

/**
 * 배치/재배치 모드 진입·이탈 시 호출한다. ?debug=1일 때는 격자가 항상 보여야 하므로
 * 토글 요청을 무시한다(드로우맵 때 이미 debugAlpha로 고정해뒀다).
 */
export function setGridVisible(visible) {
  if (DEBUG || !gridGfx) return;
  const scene = gridGfx.scene;
  scene.tweens.killTweensOf(gridGfx);
  scene.tweens.add({
    targets: gridGfx, alpha: visible ? GRID.visibleAlpha : 0,
    duration: GRID.fadeMs, ease: EASE.fade,
  });
  if (gridDimGfx) {
    scene.tweens.killTweensOf(gridDimGfx);
    scene.tweens.add({
      targets: gridDimGfx, alpha: visible ? 1 : 0,
      duration: GRID.fadeMs, ease: EASE.fade,
    });
  }
}

/** 경로를 따라 걸으며 지나가는 격자 셀을 수집한다 (중복 제거) */
export function collectPathCells(path, cell) {
  const seen = new Set();
  const out = [];
  const step = cell / 4; // 셀을 건너뛰지 않도록 촘촘히 샘플링
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * (k / n);
      const y = a.y + (b.y - a.y) * (k / n);
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      if (cx < 0 || cy < 0 || cx * cell >= W || cy * cell >= H) continue;
      const key = `${cx},${cy}`;
      if (!seen.has(key)) { seen.add(key); out.push([cx, cy]); }
    }
  }
  return out;
}

/** 맵 배경을 그린다. { path, cells, core, tower }를 돌려준다. */
export function drawMap(scene) {
  drawBackground(scene);

  const path = mapData.paths[0];

  // 격자 표시 중 배경을 살짝 더 어둡게(배치 판단 편의) — 격자와 같은 박자로 페이드
  gridDimGfx = scene.add.rectangle(W / 2, H / 2, W, H, BG.dimColor, GRID.extraDimAlpha).setAlpha(0);

  gridGfx = scene.add.graphics();
  gridGfx.lineStyle(1, COLOR.slot, 1); // 알파는 오브젝트 alpha로 통일 관리(setGridVisible이 그걸 트윈한다)
  for (let x = 0; x <= W; x += CELL) gridGfx.lineBetween(x, 0, x, H);
  for (let y = 0; y <= H; y += CELL) gridGfx.lineBetween(0, y, W, y);
  gridGfx.setAlpha(DEBUG ? GRID.debugAlpha : 0);

  const cells = collectPathCells(path, CELL);
  const cellGfx = scene.add.graphics();
  cellGfx.fillStyle(COLOR.path, 1);
  cells.forEach(([cx, cy]) => cellGfx.fillRect(cx * CELL, cy * CELL, CELL, CELL));

  drawRoadEdges(scene, cells, CELL);
  drawDashedCenterline(scene, path);
  drawDirectionArrows(scene, path);

  const core = mapData.core, tower = mapData.nseoulTower;
  scene.add.circle(core.x, core.y, 14, COLOR.ng).setStrokeStyle(2, 0xffffff, 0.7);
  scene.add.text(core.x, core.y - 30, '코어', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

  return { path, cells, core, tower };
}

/**
 * 도로 양쪽 경계선(연석) — 도로 셀 집합의 "바깥 테두리"를 그린다. 셀 격자 기반이라 폴리라인
 * 오프셋 계산(코너에서 이가 어긋나는 문제) 없이, 이웃 셀이 도로가 아닌 변만 골라 그으면
 * S자로 꺾이는 구간까지 자동으로 딱 맞는다.
 */
function drawRoadEdges(scene, cells, cell) {
  const set = new Set(cells.map(([cx, cy]) => `${cx},${cy}`));
  const g = scene.add.graphics();
  g.lineStyle(ROAD.edgeWidth, ROAD.edgeColor, ROAD.edgeAlpha);
  cells.forEach(([cx, cy]) => {
    const x = cx * cell, y = cy * cell;
    if (!set.has(`${cx},${cy - 1}`)) g.lineBetween(x, y, x + cell, y);
    if (!set.has(`${cx},${cy + 1}`)) g.lineBetween(x, y + cell, x + cell, y + cell);
    if (!set.has(`${cx - 1},${cy}`)) g.lineBetween(x, y, x, y + cell);
    if (!set.has(`${cx + 1},${cy}`)) g.lineBetween(x + cell, y, x + cell, y + cell);
  });
}

/** 중앙 점선 차선 — 실선 대신 끊어 그려서 "도로" 느낌을 준다. 세그먼트별로 독립 계산해서 꺾이는 지점에서도 자연스럽다. */
function drawDashedCenterline(scene, path) {
  const g = scene.add.graphics();
  g.lineStyle(ROAD.laneWidth, ROAD.laneColor, ROAD.laneAlpha);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1) continue;
    const dx = (b.x - a.x) / segLen, dy = (b.y - a.y) / segLen;
    let d = 0;
    while (d < segLen) {
      const dashEnd = Math.min(d + ROAD.dashLen, segLen);
      g.lineBetween(a.x + dx * d, a.y + dy * d, a.x + dx * dashEnd, a.y + dy * dashEnd);
      d += ROAD.dashLen + ROAD.gapLen;
    }
  }
}

/** 진행 방향 화살표 — 양방향 차선 표시가 아니라 "적이 이쪽으로 온다"는 흐름을 보여주는 목적. */
function drawDirectionArrows(scene, path) {
  const g = scene.add.graphics();
  g.fillStyle(ROAD.arrowColor, ROAD.arrowAlpha);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1) continue;
    const dx = (b.x - a.x) / segLen, dy = (b.y - a.y) / segLen;
    const count = Math.floor(segLen / ROAD.arrowSpacing);
    for (let k = 1; k <= count; k++) {
      const d = k * ROAD.arrowSpacing;
      if (d >= segLen) break;
      drawArrow(g, a.x + dx * d, a.y + dy * d, dx, dy, ROAD.arrowSize);
    }
  }
}

/** (cx,cy)를 중심으로 (dx,dy) 방향을 가리키는 화살촉 삼각형 하나. */
function drawArrow(g, cx, cy, dx, dy, size) {
  const px = -dy, py = dx; // dx,dy에 수직인 방향(화살 밑변 폭 방향)
  const tipX = cx + dx * size, tipY = cy + dy * size;
  const backX = cx - dx * size * 0.6, backY = cy - dy * size * 0.6;
  g.fillTriangle(
    tipX, tipY,
    backX + px * size * 0.5, backY + py * size * 0.5,
    backX - px * size * 0.5, backY - py * size * 0.5,
  );
}
