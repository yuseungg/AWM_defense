/**
 * Panel.js — HUD/Controls/BuildUI가 공유하는 패널 그리기 언어
 *
 * 미래도시 컨셉: 직사각형 대신 모서리를 잘라낸(chamfer) 다각형 + 불투명에 가까운
 * 짙은 배경 + 1px 액센트 테두리. 각 UI 파일이 따로 rectangle()을 그리면 조금씩
 * 어긋난다 — 이 파일이 유일한 그리기 창구다. 상수는 전부 UITheme.js의 PANEL 블록.
 */

import { PANEL } from './UITheme.js';

const ALL_CORNERS = ['tl', 'tr', 'br', 'bl'];

/** (x,y)=좌상단 기준 w×h 사각형에서 corners에 포함된 코너만 chamfer만큼 잘라낸 다각형 점 목록 */
function chamferPoints(x, y, w, h, chamfer, corners) {
  const c = Math.min(chamfer, w / 2, h / 2);
  const has = k => corners.includes(k);
  const pts = [];

  if (has('tl')) { pts.push({ x, y: y + c }); pts.push({ x: x + c, y }); }
  else pts.push({ x, y });

  if (has('tr')) { pts.push({ x: x + w - c, y }); pts.push({ x: x + w, y: y + c }); }
  else pts.push({ x: x + w, y });

  if (has('br')) { pts.push({ x: x + w, y: y + h - c }); pts.push({ x: x + w - c, y: y + h }); }
  else pts.push({ x: x + w, y: y + h });

  if (has('bl')) { pts.push({ x: x + c, y: y + h }); pts.push({ x, y: y + h - c }); }
  else pts.push({ x, y: y + h });

  return pts;
}

/**
 * 모서리 잘린 패널을 그린다. (x,y)는 좌상단 기준(HUD류는 원점 기준 배치가 자연스럽다).
 * opts.corner(단수)로 문자열 하나("tl") 또는 opts.corners(복수)로 배열을 받는다 — 둘 다 지원.
 * 반환: Phaser.GameObjects.Graphics (destroy()는 호출부 책임 — 기존 컴포넌트들과 동일한 패턴)
 */
export function drawPanel(scene, x, y, w, h, opts = {}) {
  const {
    chamfer = PANEL.chamfer,
    fillColor = PANEL.bgColor,
    fillAlpha = PANEL.bgAlpha,
    borderColor = PANEL.borderColor,
    borderAlpha = PANEL.borderAlpha,
    borderWidth = PANEL.borderWidth,
    depth = null,
  } = opts;
  const corners = opts.corners ?? (opts.corner != null ? [].concat(opts.corner) : ALL_CORNERS);

  const pts = chamferPoints(x, y, w, h, chamfer, corners);

  const g = scene.add.graphics();
  g.fillStyle(fillColor, fillAlpha);
  g.fillPoints(pts, true);
  if (borderWidth > 0) {
    g.lineStyle(borderWidth, borderColor, borderAlpha);
    g.strokePoints(pts, true, true);
  }
  if (depth != null) g.setDepth(depth);
  return g;
}

/**
 * 세그먼트 분할 바. 채운 칸은 밝게, 빈 칸은 어둡게 — XP·조명 단계 등 "몇 칸 찼는가"를
 * 보여줄 때 쓴다. (x,y) = 첫 세그먼트의 좌상단. vertical이면 위→아래로 쌓는다(조명용).
 */
export function drawSegmentBar(scene, x, y, segs, filled, opts = {}) {
  const {
    segWidth = PANEL.segWidth,
    segHeight = PANEL.segHeight,
    gap = PANEL.segGap,
    filledColor = PANEL.segFilledColor,
    filledAlpha = PANEL.segFilledAlpha,
    emptyColor = PANEL.segEmptyColor,
    emptyAlpha = PANEL.segEmptyAlpha,
    vertical = false,
    depth = null,
  } = opts;

  const g = scene.add.graphics();
  for (let i = 0; i < segs; i++) {
    const on = i < filled;
    g.fillStyle(on ? filledColor : emptyColor, on ? filledAlpha : emptyAlpha);
    if (vertical) g.fillRect(x, y + i * (segHeight + gap), segWidth, segHeight);
    else g.fillRect(x + i * (segWidth + gap), y, segWidth, segHeight);
  }
  if (depth != null) g.setDepth(depth);
  return g;
}
