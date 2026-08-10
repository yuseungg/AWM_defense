/**
 * UnlockOverlay.js — 타워 해금 화면 렌더링(카드: 스프라이트+스탯 / 우측: 플레이버).
 *
 * DraftOverlay가 큐에서 'unlock' 항목을 꺼낼 때 buildUnlockScreen()만 호출한다 — 큐 관리
 * (OverlayQueue)·표시 오케스트레이션(일시정지·닫기·다음 항목 진행)은 DraftOverlay 몫이고,
 * 이 파일은 순수하게 "이 타워의 해금 화면을 어떻게 그릴지"만 안다(닫기는 콜백으로 위임).
 *
 * 스탯은 전부 towers.json에서 그 자리에 읽는다(레벨 0 기준 고정값 — 해금 시점엔 아직 안 지어져
 * effectiveRange 같은 라이브 인스턴스 값이 없다). STAT_LAYOUT이 타워마다 어떤 스탯을 어떤
 * 라벨·아이콘·값으로 보여줄지 정의하는 단일 소스다. 특수 스탯 확인 결과:
 *   - 청계천 감속: effects[0]={type:'slow', amount:0.4, duration:2.0} — 그대로 읽음.
 *   - DDP 폭발범위: aoeRadius(90) — 그대로 읽음.
 *   - 롯데 "방어 관통": towers.json에 전용 필드가 없다. strongAgainst.trash(×1.5, 쓰레기더미
 *     상성 특효)를 대신 쓴다 — 이게 가장 가까운 기존 데이터다.
 *   - 서울숲 "범위 오오라": 별도 수치 필드가 없다 — 값 없이 설명 텍스트만 표시한다.
 *
 * 아이콘은 이모지를 안 쓴다(폰트별로 깨지거나 안 보일 수 있어서) — 이 프로젝트가 이미 자물쇠
 * (BuildUI.drawLockIcon)·상태이상 마커(FxLayer.drawStatusIcon)에 쓰는 것과 같은 원칙으로
 * 전부 Graphics 벡터 도형이다. 슬로우 아이콘은 청계천 상태이상 마커와 같은 물방울 실루엣을
 * 그대로 재사용해 일관성을 준다. DDP 폭발/서울숲 오오라 아이콘 색은 각 이펙트(ProjectileFx.js
 * PROJECTILE_CONFIG.ddp.impactColor / AuraFx.js AURA_CONFIG.seoulForest.color)와 맞췄다.
 *
 * ── 폰트(FontLoader.js) ────────────────────────────────────────────
 * 배너·카드 안 타워 이름·플레이버는 FONT.unlockTitle/unlockFlavor(천전리 각석체), 스탯
 * 라벨·값은 FONT.unlockStat(산스 SemiBold) — "클릭해서 계속" 힌트는 테마 텍스트가 아니라
 * 시스템 UI 문구라 기존 FONT.ui(Pretendard)를 그대로 쓴다. 이중 FOUT 방지: ①이 화면이 열리는
 * 시점에 이미 로드돼 있으면(브라우저가 areFontsReady()로 확인) 첫 렌더부터 바로 올바르게
 * 그려지고, ②설령 아직 로드 전이라 폴백으로 그려졌더라도 refreshOnReady()가 로드 완료 시점에
 * 살아있는 텍스트만 같은 fontFamily로 재적용해 강제로 다시 그린다. 스탯 라벨·값은 폭이 서로
 * 맞물려 있어서(값이 라벨 바로 뒤에 붙음) refreshOnReady 단일 텍스트용 API로는 부족하다 —
 * loadCustomFonts()를 직접 걸어 라벨 폭이 로드 후 바뀌면 값 위치·줄바꿈 폭까지 같이 재계산한다.
 *
 * ── 카드 틀(assets/ui/card_frame.png) ──────────────────────────────
 * 원본 1024×1536(세로 2:3) — 폭이 아니라 "높이"를 먼저 정하고 실제 폭은 fitSpriteHeight()가
 * 로드된 텍스처에서 그 자리에 계산한다(비율 하드코딩 없음, SpriteScale.js 참고). 텍스처가 없으면
 * (로드 실패 등) 카드 이미지를 안 그리고 기존 컬럼 폭(colW)을 레이아웃 폭으로 대신 쓴다 — 이때도
 * 새 비율을 지어내지 않는다.
 *
 * 이중선 테두리·모서리 문양을 안 침범하게 UNLOCK.cardInset만큼 안쪽을 "안전영역"으로 두고,
 * 제목·스프라이트·스탯을 전부 그 안에서 카드의 실제 좌상단 좌표 기준으로 배치한다(카드가
 * 없을 때의 폴백 폭도 이 계산에 그대로 반영됨). 스탯 라벨·값에는 안전영역을 넘는 극단적으로
 * 긴 텍스트에 대비해 wordWrap 안전망을 건다(정상적인 경우엔 한 줄에 들어간다).
 *
 * ── 배너 틀(assets/ui/banner_frame.png) ─────────────────────────────
 * 원본 2149×732, 완전 투명 배경의 가로 프레임. fitSpriteWidth로 폭 기준 배치하고, 텍스트 Y는
 * 이미지 전체 중심이 아니라 픽셀 스캔으로 실측한 "프레임 사각형 안쪽 중심" 비율(약 44%,
 * 위쪽에 치우쳐 있음)로 계산한다. 텍스처 없으면(로드 실패 등) 프레임 없이 UNLOCK.bannerY
 * 고정 위치로 폴백한다.
 *
 * ── 플레이버 장식(assets/ui/flavor_divider_top/bottom.png) ───────────
 * 원본은 위/아래 장식이 한 이미지에 같이 있었는데, 문구 줄 수(1~2줄)에 따라 위/아래를
 * 독립적으로 배치해야 자연스럽게 감싸져서 픽셀 밝기 스캔으로 정확히 잘라 두 파일로
 * 미리 나눴다(Phaser 런타임 setCrop은 크기 계산이 원본 프레임 기준으로 남는 경우가 있어
 * 피함). 문구 텍스트를 만든 직후 실제 렌더 높이(flavorText.height, wordWrap으로 줄 수가
 * 바뀌면 같이 바뀜)를 읽어서 그 위/아래에 배치한다 — 항상 문구를 감싼다.
 *
 * ── 배경(낮/밤 재사용) ────────────────────────────────────────────────
 * 별도 이미지 없이 mapView.js가 배경 사진 전환에 쓰는 bgKeyForWave()를 그대로 가져다 현재
 * 웨이브의 낮/밤을 판정하고, 이미 로드된 bg_day/bg_night를 mapView.js와 동일한 "cover" 방식
 * (원본 비율 유지, 화면을 꽉 채우게 넘치는 쪽을 잘라냄)으로 화면 전체에 깐다. 그 위에 기존
 * 딤(60% 검정)을 그대로 얹어 뒤 게임 화면이 비쳐 산만해지지 않게 한다. 텍스처 없으면 배경
 * 이미지 없이 딤만(기존과 동일) — 조용히 스킵.
 */

import Phaser from 'phaser';
import { COLOR, UNLOCK, STATUS_FX, FONT, DEPTH } from './UITheme.js';
import { drawPanel } from './Panel.js';
import { fitSpriteWidth, fitSpriteHeight } from '../fx/SpriteScale.js';
import { refreshOnReady, loadCustomFonts } from './FontLoader.js';
import { bgKeyForWave } from './mapView.js';
import towersData from '../../data/towers.json';

const W = 1280, H = 720;
// UITheme.js DEPTH.overlay(4000) 기준 — DraftOverlay.js와 동일한 이유(★ 2026-08-12 수정).
// 옛 값(500)은 TowerView가 DEPTH.objects + y(최대 ~820)로 그리기 시작한 뒤로, 화면 아래쪽에
// 지어둔 실제 타워가 이 화면보다 위에 그려져 카드 밖으로 삐져나온 것처럼 보였다.
const OVERLAY_DEPTH = DEPTH.overlay;

const DDP_BLAST_COLOR = 0xff5722;        // ProjectileFx.js PROJECTILE_CONFIG.ddp.impactColor와 동일
const SEOULFOREST_AURA_COLOR = 0x5fa04a; // AuraFx.js AURA_CONFIG.seoulForest.color와 동일

const perAttack = def => `${def.damage}`;
const perRange = def => `${def.range}`;
const perSpeed = def => `${(1 / def.attackSpeed).toFixed(1)}회`;

/** towerId → 표시할 스탯 배열. 타워마다 구성이 다르다(요청 확정본 그대로). */
const STAT_LAYOUT = {
  gwanghwamun: [
    { label: '단일공격', icon: 'attack', value: perAttack },
    { label: '사거리', icon: 'range', value: perRange },
    { label: '초당공격', icon: 'speed', value: perSpeed },
  ],
  cheonggyecheon: [
    { label: '광역공격', icon: 'attack', value: perAttack },
    { label: '사거리', icon: 'range', value: perRange },
    { label: '초당공격', icon: 'speed', value: perSpeed },
    {
      label: '특수효과: 감속', icon: 'slow', iconColor: STATUS_FX.slowColor,
      value: def => `${Math.round(def.effects[0].amount * 100)}% (${def.effects[0].duration}초)`,
    },
  ],
  ddp: [
    { label: '광역공격', icon: 'attack', value: perAttack },
    { label: '사거리', icon: 'range', value: perRange },
    { label: '초당공격', icon: 'speed', value: perSpeed },
    { label: '폭발범위', icon: 'blast', iconColor: DDP_BLAST_COLOR, value: def => `${def.aoeRadius}` },
  ],
  lotteWorldTower: [
    { label: '단일공격', icon: 'attack', value: perAttack },
    { label: '사거리', icon: 'range', value: perRange },
    { label: '초당공격', icon: 'speed', value: perSpeed },
    { label: '특수효과: 방어 관통', icon: 'pierce', value: def => `쓰레기더미 ×${def.strongAgainst.trash}` },
  ],
  seoulForest: [
    { label: '지속피해', icon: 'attack', value: perAttack },
    { label: '범위', icon: 'range', value: def => `${def.aoeRadius}` },
    { label: '초당공격', icon: 'speed', value: perSpeed },
    {
      label: '특수효과: 범위 오오라', icon: 'aura', iconColor: SEOULFOREST_AURA_COLOR,
      value: () => '범위 내 모든 적 지속 공격',
    },
  ],
};

/** towerId → 플레이버 문구(확정본 그대로). */
const FLAVOR = {
  cheonggyecheon: '되살아난 물길로 오염을 막아라',
  gwanghwamun: '선조의 힘으로 도시를 지켜라',
  ddp: '첨단 기술로 적들을 막아라',
  lotteWorldTower: '구름을 뚫는 높이로 가장 단단한 적도 관통한다',
  seoulForest: '도심 속 숲이 끊임없이 정화한다',
};

function drawAttackIcon(g, cx, cy, size, color) {
  g.fillStyle(color, 1);
  g.fillPoints([
    { x: cx, y: cy - size }, { x: cx + size, y: cy },
    { x: cx, y: cy + size }, { x: cx - size, y: cy },
  ], true);
}

function drawRangeIcon(g, cx, cy, size, color) {
  g.lineStyle(2, color, 1);
  g.strokeCircle(cx, cy, size);
}

function drawSpeedIcon(g, cx, cy, size, color) {
  g.fillStyle(color, 1);
  g.slice(cx, cy, size, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(180), false);
  g.fillPath();
}

/** 청계천 상태이상 마커(FxLayer.drawStatusIcon)와 같은 물방울 실루엣을 아이콘 크기로 그대로 재사용. */
function drawSlowIcon(g, cx, cy, size, color) {
  g.fillStyle(color, STATUS_FX.slowAlpha);
  g.fillCircle(cx, cy + size * STATUS_FX.slowDropBulgeMul, size * STATUS_FX.slowDropRadiusMul);
  g.fillTriangle(
    cx, cy - size * STATUS_FX.slowDropTipMul,
    cx - size * STATUS_FX.slowDropShoulderMul, cy,
    cx + size * STATUS_FX.slowDropShoulderMul, cy,
  );
}

function drawBlastIcon(g, cx, cy, size, color) {
  g.lineStyle(2, color, 1);
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    g.lineBetween(cx, cy, cx + Math.cos(a) * size, cy + Math.sin(a) * size);
  }
}

function drawPierceIcon(g, cx, cy, size, color) {
  g.fillStyle(color, 1);
  g.fillTriangle(cx - size, cy - size * 0.7, cx - size, cy + size * 0.7, cx, cy);
  g.fillTriangle(cx, cy - size * 0.7, cx, cy + size * 0.7, cx + size, cy);
}

function drawAuraIcon(g, cx, cy, size, color) {
  g.lineStyle(2, color, 0.9);
  g.strokeCircle(cx, cy, size * 0.6);
  g.lineStyle(2, color, 0.4);
  g.strokeCircle(cx, cy, size);
}

const ICON_DRAWERS = {
  attack: drawAttackIcon,
  range: drawRangeIcon,
  speed: drawSpeedIcon,
  slow: drawSlowIcon,
  blast: drawBlastIcon,
  pierce: drawPierceIcon,
  aura: drawAuraIcon,
};

/**
 * towerId 해금 화면을 그려서 생성된 GameObject 배열을 돌려준다(destroy()는 호출부 책임 —
 * DraftOverlay.visuals와 동일 계약). onDismiss는 화면을 클릭해서 넘길 때 부르는 콜백이다.
 * wave는 배경 낮/밤 판정용(bgKeyForWave) — DraftOverlay가 core.getState()로 1회 조회해 넘긴다.
 */
export function buildUnlockScreen(scene, towerId, onDismiss, wave) {
  const def = towersData[towerId];
  const stats = STAT_LAYOUT[towerId] ?? [];
  const flavor = FLAVOR[towerId] ?? '';
  const visuals = [];

  // 내용이 고정 레이아웃이라 원래도 넘칠 일은 없지만, 패널·카드·배너 좌표는 방어적으로
  // 화면 안에 clamp한다.
  const panelX = Phaser.Math.Clamp(UNLOCK.panelX, 0, W - UNLOCK.panelW);
  const panelY = Phaser.Math.Clamp(UNLOCK.panelY, 0, H - UNLOCK.panelH);
  const cardTopY = Phaser.Math.Clamp(UNLOCK.cardTopY, 0, H - UNLOCK.cardHeight);
  const bannerFrameTopY = Phaser.Math.Clamp(UNLOCK.bannerFrameTopY, 0, H);

  // 배경 — 현재 웨이브의 낮/밤(mapView.js와 동일 판정)을 딤보다 먼저 깐다. mapView.js와 같은
  // "cover" 스케일(원본 비율 유지, 화면을 꽉 채우게 넘치는 쪽을 잘라냄).
  const bgKey = `bg_${bgKeyForWave(wave ?? 0)}`;
  if (scene.textures.exists(bgKey)) {
    const src = scene.textures.get(bgKey).getSourceImage();
    const bgScale = Math.max(W / src.width, H / src.height);
    const bg = scene.add.image(W / 2, H / 2, bgKey).setScale(bgScale).setDepth(OVERLAY_DEPTH - 1);
    visuals.push(bg);
  }

  const dim = scene.add.rectangle(W / 2, H / 2, W, H, UNLOCK.dimColor, UNLOCK.dimAlpha)
    .setInteractive().setDepth(OVERLAY_DEPTH);
  dim.on('pointerdown', () => onDismiss());
  visuals.push(dim);

  // 배너 틀 — 폭 기준 배치, 텍스트 Y는 실측한 프레임 안쪽 중심 비율로 계산한다. 텍스처 없으면
  // 프레임 없이 UNLOCK.bannerY 고정 위치로 폴백한다.
  let bannerTextY = UNLOCK.bannerY;
  if (scene.textures.exists('banner_frame')) {
    const bannerFrame = scene.add.image(W / 2, bannerFrameTopY, 'banner_frame').setDepth(OVERLAY_DEPTH);
    const frameScale = fitSpriteWidth(bannerFrame, UNLOCK.bannerFrameWidth, 0.5, 0);
    const frameHeight = bannerFrame.height * frameScale;
    bannerTextY = bannerFrameTopY + frameHeight * UNLOCK.bannerFrameTextCenterYRatio;
    visuals.push(bannerFrame);
  }

  const banner = scene.add.text(W / 2, bannerTextY, `${def ? def.name : towerId} 해금!`, {
    fontFamily: FONT.unlockTitle, fontSize: `${UNLOCK.bannerFontSize}px`, color: UNLOCK.bannerColor, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
  refreshOnReady(banner);
  visuals.push(banner);

  const panel = drawPanel(scene, panelX, panelY, UNLOCK.panelW, UNLOCK.panelH, { depth: OVERLAY_DEPTH });
  visuals.push(panel);

  // 좌우 컬럼 폭은 CARD.width*count+gap*(count-1)과 같은 방식으로 산술 유도한다(별도 폭 상수 없음).
  const innerW = UNLOCK.panelW - UNLOCK.panelPadding * 2;
  const colW = (innerW - UNLOCK.colGap) / 2;
  const leftCenterX = panelX + UNLOCK.panelPadding + colW / 2;
  const rightCenterX = panelX + UNLOCK.panelPadding + colW + UNLOCK.colGap + colW / 2;

  // 카드 틀 — 높이 기준으로 맞추고 실제 폭은 로드된 텍스처에서 계산한다(비율 하드코딩 없음).
  // 텍스처가 없으면(로드 실패 등) 이미지 없이 기존 컬럼 폭(colW)을 레이아웃 폭으로 대신 쓴다.
  let cardWidth = colW;
  let cardImage = null;
  if (scene.textures.exists('card_frame')) {
    cardImage = scene.add.image(leftCenterX, cardTopY, 'card_frame').setDepth(OVERLAY_DEPTH + 1);
    const cardScale = fitSpriteHeight(cardImage, UNLOCK.cardHeight, 0.5, 0);
    cardWidth = cardImage.width * cardScale;
    visuals.push(cardImage);
  }

  // 안전판 — depth 역전(파일 상단 OVERLAY_DEPTH 주석) 같은 원인을 몰라도 카드 영역 밖으로는
  // 아무것도 안 그려지게 마스크를 건다. 원인을 고친 뒤에도 남겨둔다(재발 방지용 방어선).
  // 카드 틀(card_frame) 유무와 무관하게 "카드가 논리적으로 차지하는 영역"(leftCenterX 기준
  // cardWidth×cardHeight)을 그대로 쓴다 — 텍스처가 없어도 카드 콘텐츠는 이 영역 안에 있어야 한다.
  const cardMaskGfx = scene.make.graphics(undefined, false)
    .fillRect(leftCenterX - cardWidth / 2, cardTopY, cardWidth, UNLOCK.cardHeight);
  const cardMask = cardMaskGfx.createGeometryMask();
  visuals.push(cardMaskGfx);
  if (cardImage) cardImage.setMask(cardMask);

  // 이중선 테두리·모서리 문양을 안 침범하는 안전영역(카드의 실제 좌상단 기준)
  const safeLeft = leftCenterX - cardWidth / 2 + UNLOCK.cardInset;
  const safeRight = leftCenterX + cardWidth / 2 - UNLOCK.cardInset;

  const title = scene.add.text(leftCenterX, cardTopY + UNLOCK.cardTitleOffsetY, def ? def.name : towerId, {
    fontFamily: FONT.unlockTitle, fontSize: `${UNLOCK.titleFontSize}px`, color: UNLOCK.titleColor, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 2).setMask(cardMask);
  refreshOnReady(title);
  visuals.push(title);

  const spriteKey = `tower_${towerId}`;
  if (scene.textures.exists(spriteKey)) {
    const sprite = scene.add.image(leftCenterX, cardTopY + UNLOCK.cardSpriteOffsetY, spriteKey)
      .setDepth(OVERLAY_DEPTH + 2).setMask(cardMask);
    fitSpriteWidth(sprite, UNLOCK.spriteWidth, 0.5, 0.5);
    visuals.push(sprite);
  }

  let statY = cardTopY + UNLOCK.cardStatStartOffsetY;
  const iconX = safeLeft + UNLOCK.iconSize;
  stats.forEach(stat => {
    const g = scene.add.graphics().setDepth(OVERLAY_DEPTH + 2).setMask(cardMask);
    (ICON_DRAWERS[stat.icon] ?? drawAttackIcon)(g, iconX, statY, UNLOCK.iconSize, stat.iconColor ?? COLOR.accent);
    visuals.push(g);

    const labelX = iconX + UNLOCK.iconSize + UNLOCK.iconGap;
    const label = scene.add.text(labelX, statY, `${stat.label}  `, {
      fontFamily: FONT.unlockStat, fontSize: `${UNLOCK.statFontSize}px`, color: UNLOCK.statLabelColor,
      wordWrap: { width: Math.max(60, safeRight - labelX) }, // 안전영역을 넘는 극단적으로 긴 라벨 방어망
    }).setOrigin(0, 0.5).setDepth(OVERLAY_DEPTH + 2).setMask(cardMask);
    visuals.push(label);

    const value = scene.add.text(label.x + label.width, statY, stat.value(def), {
      fontFamily: FONT.unlockStat, fontSize: `${UNLOCK.statFontSize}px`, color: UNLOCK.statValueColor, fontStyle: 'bold',
      wordWrap: { width: Math.max(60, safeRight - (label.x + label.width)) },
    }).setOrigin(0, 0.5).setDepth(OVERLAY_DEPTH + 2).setMask(cardMask);
    visuals.push(value);

    // 라벨·값은 폭이 서로 맞물려 있어서(값이 라벨 바로 뒤에 붙음) refreshOnReady 단일 텍스트용
    // API로는 부족하다 — 로드 완료 후 라벨 폭이 바뀌면 값 위치·줄바꿈 폭까지 같이 재계산한다.
    loadCustomFonts().then(() => {
      if (!label.active || !value.active) return;
      label.setFontFamily(FONT.unlockStat);
      value.setFontFamily(FONT.unlockStat);
      value.setX(label.x + label.width);
      value.setWordWrapWidth(Math.max(60, safeRight - value.x), true);
    });

    statY += UNLOCK.statLineHeight;
  });

  const flavorText = scene.add.text(rightCenterX, panelY + UNLOCK.panelH / 2, flavor, {
    fontFamily: FONT.unlockFlavor, fontSize: `${UNLOCK.flavorFontSize}px`, color: UNLOCK.flavorColor, fontStyle: 'bold',
    wordWrap: { width: colW }, align: 'center', lineSpacing: 8,
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
  refreshOnReady(flavorText);
  visuals.push(flavorText);

  // 문구 위/아래 금색 장식 — 문구의 실제 렌더 높이(줄 수에 따라 다름)를 기준으로 배치해서
  // 1줄이든 2줄이든 항상 자연스럽게 감싼다.
  ['flavor_divider_top', 'flavor_divider_bottom'].forEach((key, i) => {
    if (!scene.textures.exists(key)) return;
    const divider = scene.add.image(rightCenterX, 0, key).setDepth(OVERLAY_DEPTH + 1);
    fitSpriteWidth(divider, UNLOCK.dividerWidth, 0.5, i === 0 ? 1 : 0); // top=하단앵커, bottom=상단앵커
    const y = i === 0
      ? flavorText.y - flavorText.height / 2 - UNLOCK.dividerGap
      : flavorText.y + flavorText.height / 2 + UNLOCK.dividerGap;
    divider.setPosition(rightCenterX, y);
    visuals.push(divider);
  });

  // 힌트는 테마 텍스트가 아니라 시스템 UI 문구라 커스텀 폰트를 안 쓴다(기존 FONT.ui 그대로)
  const hint = scene.add.text(W / 2, UNLOCK.hintY, '클릭해서 계속', {
    fontFamily: FONT.ui, fontSize: `${UNLOCK.hintFontSize}px`, color: UNLOCK.hintColor,
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
  visuals.push(hint);

  visuals.forEach(o => { o.alpha = 0; });
  scene.tweens.add({ targets: visuals, alpha: 1, duration: UNLOCK.slideInMs, ease: 'Cubic.easeOut' });

  return visuals;
}
