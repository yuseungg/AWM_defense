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
 * 살아있는 텍스트만 같은 fontFamily로 재적용해 강제로 다시 그린다.
 */

import Phaser from 'phaser';
import { COLOR, UNLOCK, STATUS_FX, FONT } from './UITheme.js';
import { drawPanel } from './Panel.js';
import { fitSpriteWidth } from '../fx/SpriteScale.js';
import { refreshOnReady } from './FontLoader.js';
import towersData from '../../data/towers.json';

const W = 1280, H = 720;
const OVERLAY_DEPTH = 500;

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
 */
export function buildUnlockScreen(scene, towerId, onDismiss) {
  const def = towersData[towerId];
  const stats = STAT_LAYOUT[towerId] ?? [];
  const flavor = FLAVOR[towerId] ?? '';
  const visuals = [];

  // 내용이 고정 레이아웃이라 원래도 넘칠 일은 없지만, 패널 좌표는 방어적으로 화면 안에 clamp한다.
  const panelX = Phaser.Math.Clamp(UNLOCK.panelX, 0, W - UNLOCK.panelW);
  const panelY = Phaser.Math.Clamp(UNLOCK.panelY, 0, H - UNLOCK.panelH);

  const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(OVERLAY_DEPTH);
  dim.on('pointerdown', () => onDismiss());
  visuals.push(dim);

  const banner = scene.add.text(W / 2, UNLOCK.bannerY, `${def ? def.name : towerId} 해금!`, {
    fontFamily: FONT.unlockTitle, fontSize: `${UNLOCK.bannerFontSize}px`, color: UNLOCK.bannerColor, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH);
  refreshOnReady(banner);
  visuals.push(banner);

  const panel = drawPanel(scene, panelX, panelY, UNLOCK.panelW, UNLOCK.panelH, { depth: OVERLAY_DEPTH });
  visuals.push(panel);

  // 좌우 컬럼 폭은 CARD.width*count+gap*(count-1)과 같은 방식으로 산술 유도한다(별도 폭 상수 없음).
  const innerW = UNLOCK.panelW - UNLOCK.panelPadding * 2;
  const colW = (innerW - UNLOCK.colGap) / 2;
  const leftCenterX = panelX + UNLOCK.panelPadding + colW / 2;
  const rightCenterX = panelX + UNLOCK.panelPadding + colW + UNLOCK.colGap + colW / 2;

  const title = scene.add.text(leftCenterX, panelY + (UNLOCK.titleY - UNLOCK.panelY), def ? def.name : towerId, {
    fontFamily: FONT.unlockTitle, fontSize: `${UNLOCK.titleFontSize}px`, color: UNLOCK.titleColor, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
  refreshOnReady(title);
  visuals.push(title);

  const spriteKey = `tower_${towerId}`;
  if (scene.textures.exists(spriteKey)) {
    const sprite = scene.add.image(leftCenterX, panelY + (UNLOCK.spriteY - UNLOCK.panelY), spriteKey)
      .setDepth(OVERLAY_DEPTH + 1);
    fitSpriteWidth(sprite, UNLOCK.spriteWidth, 0.5, 0.5);
    visuals.push(sprite);
  }

  let statY = panelY + (UNLOCK.statStartY - UNLOCK.panelY);
  const iconX = leftCenterX - colW / 2 + UNLOCK.iconSize;
  stats.forEach(stat => {
    const g = scene.add.graphics().setDepth(OVERLAY_DEPTH + 1);
    (ICON_DRAWERS[stat.icon] ?? drawAttackIcon)(g, iconX, statY, UNLOCK.iconSize, stat.iconColor ?? COLOR.accent);
    visuals.push(g);

    const label = scene.add.text(iconX + UNLOCK.iconSize + UNLOCK.iconGap, statY, `${stat.label}  `, {
      fontFamily: FONT.unlockStat, fontSize: `${UNLOCK.statFontSize}px`, color: UNLOCK.statLabelColor,
    }).setOrigin(0, 0.5).setDepth(OVERLAY_DEPTH + 1);
    refreshOnReady(label);
    visuals.push(label);

    // label.width 기준으로 한 번만 배치한다 — refreshOnReady가 나중에 label의 폭을 바꿔도
    // (폴백↔커스텀 폰트 글자폭 차이) value가 같이 안 움직인다. 실제로는 로드가 이 화면이 뜨기
    // 전에 이미 끝나 있을 가능성이 높아(로컬 폰트) 체감 오차는 미미하다고 판단해 이번 범위에선
    // 감수한다 — 거슬리면 다음 단계(카드 배치)에서 같이 손본다.
    const value = scene.add.text(label.x + label.width, statY, stat.value(def), {
      fontFamily: FONT.unlockStat, fontSize: `${UNLOCK.statFontSize}px`, color: UNLOCK.statValueColor, fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(OVERLAY_DEPTH + 1);
    refreshOnReady(value);
    visuals.push(value);

    statY += UNLOCK.statLineHeight;
  });

  const flavorText = scene.add.text(rightCenterX, panelY + UNLOCK.panelH / 2, flavor, {
    fontFamily: FONT.unlockFlavor, fontSize: `${UNLOCK.flavorFontSize}px`, color: UNLOCK.flavorColor, fontStyle: 'bold',
    wordWrap: { width: colW }, align: 'center', lineSpacing: 8,
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
  refreshOnReady(flavorText);
  visuals.push(flavorText);

  // 힌트는 테마 텍스트가 아니라 시스템 UI 문구라 커스텀 폰트를 안 쓴다(기존 FONT.ui 그대로)
  const hint = scene.add.text(W / 2, UNLOCK.hintY, '클릭해서 계속', {
    fontFamily: FONT.ui, fontSize: `${UNLOCK.hintFontSize}px`, color: UNLOCK.hintColor,
  }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1);
  visuals.push(hint);

  visuals.forEach(o => { o.alpha = 0; });
  scene.tweens.add({ targets: visuals, alpha: 1, duration: UNLOCK.slideInMs, ease: 'Cubic.easeOut' });

  return visuals;
}
