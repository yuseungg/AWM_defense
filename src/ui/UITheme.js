/**
 * UITheme.js — 모든 연출 상수의 단일 소유처
 *
 * ⚠️ B 부재(D6~D7) 중 A가 UI를 튜닝할 때 **이 파일의 숫자만** 바꾼다.
 *    로직 파일(SeoulTowerLight / DamageNumber / DraftOverlay)은 건드리지 않는다.
 *
 * 증상 → 고칠 상수 매핑은 HANDOFF.md 참조.
 *
 * GridSystem.js를 import하는 이유(SPRITE.towerWidth) — GridSystem.js는 map.json만 참조하고
 * UI 쪽을 전혀 import하지 않아 순환 참조가 안 생긴다. mapView.js는 반대로 UITheme.js를
 * 이미 참조하고 있어서(순환 위험) 여기서 CELL을 가져오는 건 피한다.
 */
import GridSystem, { FOOTPRINT } from '../game/GridSystem.js';
import { FONT_FAMILY } from './FontLoader.js';

/**
 * 렌더 depth 레이어 — 이 파일 하나가 유일한 소유처다. 개별 파일에서 임의 숫자를 넣지 않는다
 * (2026-08-11 버그: TowerView가 setDepth(y)를 그대로 써서 화면 아래쪽 타워가 UpgradeUI 패널
 * 보다 큰 depth를 갖고, 패널이 타워에 가려지는 문제가 있었다 — 같은 문제가 재발하지 않게
 * 이 블록을 신설했다).
 *
 * `objects`(타워·적)는 y좌표를 그대로 더해 쓴다(`DEPTH.objects + y`) — "아래쪽(가까운) 오브젝트가
 * 위쪽 오브젝트 위에 그려진다"는 의사-원근감을 맵 높이(720) 안에서 유지하면서, 그 전체 범위가
 * 항상 map/path/grid보다 위·fx보다 아래에 오도록 최소 100의 여백을 둔다.
 * `fx`(데미지 숫자·파티클)는 objects 범위(100~820) 위, HUD/패널보다는 아래여야 피격 이펙트가
 * 오브젝트를 가리면서도 UI를 가리지 않는다.
 * `hud`/`panel`/`overlay`는 전부 화면 좌표 고정 UI라 y와 무관하게 완전히 위 계층에 산다.
 *
 * ⚠️ 아직 이 시스템으로 옮기지 않은 레거시 상수도 있다(BossAlert 9000번대·GameOverScene 9999·
 * DraftOverlay/UnlockOverlay의 OVERLAY_DEPTH=500) — 전부 DEPTH.panel(3000)보다 커서 순서는
 * 깨지지 않지만, 새로 만드는 화면은 이 블록 값을 쓴다.
 */
export const DEPTH = {
  map:     0,
  path:    10,
  grid:    20,
  objects: 100,   // 타워·적 — TowerView가 setDepth(DEPTH.objects + y)로 쓴다
  fx:      1000,  // 데미지 숫자·파티클
  hud:     2000,  // HUD·Controls·BuildUI
  panel:   3000,  // UpgradeUI 패널
  overlay: 4000,  // DraftOverlay·UnlockOverlay (신규 화면 전용 — 위 ⚠️ 참고)
};

export const COLOR = {
  bg:        0x11141a,   // 맵 배경 (배경 이미지가 없을 때의 폴백)
  path:      0x3a4356,   // 경로 — 배경 사진 위에서도 도로가 도드라지게 원래(#2a3040)보다 밝게 조정
  slot:      0x1c2230,   // 경로 밖 슬롯 격자
  accent:    0x3fa7d6,   // 단일 액센트 컬러 (아트 방향: 단색 실루엣 + 액센트 1개)
  ok:        0x4caf50,   // 배치 가능
  ng:        0xe53935,   // 배치 불가
  text:      0xf2f4f8,
  textDim:   0x8a919e,
};

/**
 * 배경 이미지 — 5웨이브마다 낮/밤 전환(mapView.js bgKeyForWave, 접속 시각 연동은 폐기함).
 * ?bg=day|night로 강제 지정 가능(촬영용). 파일이 없으면(loaderror) 조용히 COLOR.bg 단색으로 폴백한다.
 * 낮 사진이 밝아서 경로·적·데미지 숫자가 묻히므로 어두운 반투명 레이어를 한 겹 깐다.
 */
export const BG = {
  dimColor: 0x000000,
  dimDay:   0.35,   // ↑ 낮 배경이 밝아 가독성이 떨어지면 올린다. ↓ 내리면 사진이 더 잘 보이지만 묻히기 쉽다
  dimNight: 0.15,   // 밤은 원래 어두워서 낮보다 옅게. ↑ 올리면 더 어두워진다
};

/** 경로 밖 슬롯 격자 — 배치/재배치 모드일 때만 보인다(mapView.setGridVisible). ?debug=1은 상시 표시 */
export const GRID = {
  visibleAlpha:  0.35,  // 배치/재배치 모드에서 켜졌을 때 격자선 알파(선 색은 COLOR.slot)
  debugAlpha:    0.9,   // ?debug=1 상시 표시 — 격자 정렬 확인용이라 진하게 유지
  fadeMs:        150,   // 표시/숨김 전환 시간
  extraDimAlpha: 0.15,  // 격자 표시 중 배경을 추가로 어둡게(배치 판단 편의). 과하면 0으로 낮춰서 끈다
};

/**
 * 화면 프레임 — HUD·Controls·건설 바가 맨 캔버스에 텍스트만 떠 있어서 데모처럼 보인다는
 * 피드백 반영. 상/하단에 반투명 레터박스 바를 깔아 그 안의 UI가 "붙어 있는" 느낌을 주고,
 * 화면 전체를 얇은 테두리 + 모서리 브라켓으로 감싼다. ScreenFrame.js가 이 값을 읽는다.
 */
export const FRAME = {
  topBarHeight:    120,  // HUD(좌상단)·Controls(우상단)를 전부 담는 높이. ↑ 올리면 더 넉넉해진다
  bottomBarHeight: 100,  // 건설 바(barY=660)를 담는 높이
  barAlpha:        0.35, // ↑ 올리면 바가 더 짙어진다(과하면 그 위 텍스트 대비가 죽는다)
  barBorderColor:  0x3fa7d6,
  barBorderAlpha:  0.25, // 바와 플레이 영역 사이 경계선. 너무 튀지 않게 낮게 잡음

  borderWidth: 2,
  borderAlpha: 0.5,      // 화면 바깥 테두리. ↑ 올리면 더 또렷한 "창틀" 느낌이 된다

  bracketLength: 28,     // 모서리 브라켓 한 변 길이
  bracketInset:  6,      // 모서리에서 안쪽으로 얼마나 띄울지
  bracketWidth:  3,
  bracketAlpha:  0.8,
};

/**
 * 도로 표식 — 컨셉이 "적이 서울 도로를 타고 온다"라서 경로를 실제 차선/화살표가 있는
 * 도로처럼 그린다(mapView.js). 흰색 계열로 통일한다 — 한국 도로에서 진행방향 화살표·차로
 * 구분선은 보통 흰색이고, 노란색은 반대 차선 분리(양방향 도로) 전용이라 여긴 안 맞는다.
 */
export const ROAD = {
  edgeColor: 0x4a5468,   // 도로 양쪽 연석선 — 도로 면(COLOR.path)보다 밝은 회색으로 경계를 잡아준다
  edgeAlpha: 0.9,
  edgeWidth: 2,          // ↑ 올리면 연석이 더 두꺼워 보인다

  laneColor: 0xf2f4f8,
  laneAlpha: 0.35,   // ↑ 올리면 차선이 더 또렷해진다(과하면 그 위 적/타워가 묻힌다)
  laneWidth: 2,
  dashLen:   14,      // 점선 한 칸 길이
  gapLen:    10,      // 점선 사이 간격

  arrowColor:   0xf2f4f8,
  arrowAlpha:   0.3,
  arrowSize:    8,    // ↑ 올리면 화살표가 커진다
  arrowSpacing: 70,   // 화살표 사이 간격(px). ↓ 낮추면 더 촘촘해진다
};

/** N서울타워 조명 = 체력바. 단계 4→1 */
export const LIGHT = {
  colors:        [0xe53935, 0xfdd835, 0x4caf50, 0x2196f3], // index 0 = 단계1(빨강) … 3 = 단계4(파랑)
  offColor:      0x33383f,  // 조명 0 (소등)
  transitionMs:  600,   // 색 보간 시간. ↓ 낮추면 전환이 더 눈에 띈다

  // 하강 폭(delta = prevLevel - newLevel)별 화면 플래시 강도. CLAUDE.md §5-4
  // delta===1: 일반 관통 / delta>=2: 보스 코어 도달 — 가장 위협적인 순간이라 눈에 띄게 키운다
  flashAlphaPerLevel: { 1: 0.55, 2: 0.9 },
  flashMsPerLevel:    { 1: 220,  2: 420 },

  pulseMsAtRed:    700,  // 단계1에서 맥동 주기. ↓ 낮추면 더 다급해 보인다
  pulseScaleAtRed: 1.25, // 맥동 확대 배율
  healFlashHue:  0x8ce99a, // 회복 시 플래시 색 (관통 0 웨이브 보상)
  healFlashAlpha: 0.45,
  healFlashMs:    260,
};

/** 데미지 숫자 — 상성/크리를 플레이어에게 보이게 하는 유일한 장치 */
export const DMG = {
  poolSize:        200,   // 오브젝트 풀 크기 (웨이브 40+ 대비)
  fontSize:        18,
  effectiveScale:  1.6,   // 특효(isEffective) 배율. ↑ 올리면 상성이 더 잘 보인다
  critScale:       2.0,   // 크리(isCrit) 배율
  effectiveColor:  '#ffd54f',  // 특효 = 노란 숫자
  critColor:       '#ff7043',
  normalColor:     '#ffffff',
  lifeMs:          800,   // 표시 시간. ↑ 올리면 놓치기 어렵다
  riseDistance:    36,
  effectiveLabel:  '효과가 굉장했다!',
  labelCooldownMs: 1200,  // 라벨 도배 방지: 이 간격 안에는 1회만 표시
  labelY:          70,    // 라벨 화면 상단 중앙 고정 Y좌표(데미지 위치를 따라가지 않는다 — 심사 영상 가독성).
                           // ↑ 올리면 아래로(HUD와 가까워짐) · ↓ 내리면 화면 위쪽 끝에 붙는다
};

export const PARTICLE = {
  hitCount:   4,      // 피격 반짝임 개수. ↓ 낮추면 화면이 덜 정신없다
  hitSpeed:   60,     // 피격 파편 속도(px/s)
  hitLifeMs:  200,
  hitColor:   0xffffff,

  killCount:  10,
  killSpeed:  90,
  killLifeMs: 350,
  killColor:  0xffd54f,   // 특효 노랑과 동일 계열 — "처치했다"는 좋은 신호

  particleRadius: 2.5,

  goldPopMs:    500,
  goldPopColor: '#ffd54f',
  goldPopRise:  30,        // ↑ 올리면 더 높이 떠오른다

  maxOnScreen: 120,  // 성능 안전판(히트+처치 파티클 합산 상한, 오래된 것부터 밀어냄)
};

/** 상태이상 마커 — 적 머리 위 아이콘. 실제 코어에서만 위치 추적한다(EnemyPool 폴링, Mock은 좌표가 없다) */
export const STATUS_FX = {
  offsetY: -20,        // 적 중심에서 얼마나 위에 뜨는지

  stunColor: 0xffd54f,
  stunSize:  7,

  dotColor:   0x4caf50,
  dotBlinkMs: 300,      // ↓ 낮추면 더 빠르게 깜빡인다

  slowColor: 0x3fa7d6,
  slowSize:  6,
  slowAlpha: 0.8,
  // 물방울 실루엣 비율(slowSize 기준 배율) — 몸통(둥근 아래) 원 + 뾰족한 위 삼각형을 겹쳐 그린다
  slowDropRadiusMul:    0.75,  // 몸통 반지름
  slowDropBulgeMul:     0.35,  // 몸통 중심을 아래로 내리는 정도(위로 갈수록 좁아지는 느낌)
  slowDropTipMul:       1.1,   // 뾰족한 끝이 위로 얼마나 올라가는지
  slowDropShoulderMul:  0.62,  // 삼각형 밑변 폭(몸통과 이어지는 지점)
  slowDropHighlightColor: 0xffffff,
  slowDropHighlightAlpha: 0.8,
  slowDropHighlightRadiusMul: 0.16,
  slowDropHighlightOffsetMul: 0.28,
};

/** 장애물 발동 이펙트 + 쿨다운 게이지 — 이게 없으면 통나무·소독약이 작동하는지 알 방법이 없다 */
export const OBSTACLE_FX = {
  gaugeOffsetY: -18,
  gaugeRadius:  10,
  gaugeBgColor: 0x33383f,
  gaugeFillColor: 0x3fa7d6,
};

/**
 * 드래프트 오버레이 — 레벨업 3장 / 보스 정책 3장. 장수가 같아 레이아웃 한 벌로 끝난다.
 *
 * 틀 이미지(assets/cards/card_bg.png, 520×780 = 2:3)를 setDisplaySize(width, height)로 정확히
 * 맞추려고 width/height를 2:3로 맞췄다(260×390 = 정확히 절반, 선명하게 나온다). 300×340이던
 * 구 크기 그대로 얹으면 틀이 찌그러진다. 260*3 + 32*2 = 844px < 1280 ✓ / 390 < 720 ✓
 */
export const CARD = {
  count:      3,
  width:      260,
  height:     390,
  gap:        32,
  // 틀의 장식 테두리가 가장자리에서 약 8% 안쪽이라(260폭 기준 ≈21px), 그보다 여유 있게 28로 잡아
  // 글자가 테두리를 침범하지 않게 한다.
  padding:    28,
  slideInMs:  260,
  hoverLift:  10,

  // 카드 안 위계(위→아래): 타입 뱃지 → 이름 → 효과(★ 가장 눈에 띔) → 근거(흐리게)
  typeFontSize:   11,
  nameFontSize:   20,
  effectFontSize: 17,
  reasonFontSize: 13,

  // 틀(card_bg.png) 위에서 읽히는 색 세트 — 틀이 밝은 하늘색이라 기존 흰색 계열 텍스트는 안 보인다.
  // 어두운 남색 계열로 전부 뒤집는다. 실제 스크린샷으로 대비를 확인하고 조정한 값이다.
  typeColor:   '#3a5578',
  nameColor:   '#1a2a3a',
  effectColor: '#1d4a6e',
  reasonColor: '#4a6478',

  // card_bg.png 로드 실패 시 폴백(도형 카드, COLOR.slot 배경)용 색 세트 — 배경이 어두우니
  // 반대로 밝은 색이어야 읽힌다. 배경·타워 텍스처와 같은 "이미지 없으면 조용히 도형 폴백" 패턴.
  fallbackTypeColor:   '#8a919e',
  fallbackNameColor:   '#f2f4f8',
  fallbackEffectColor: '#ffd54f',
  fallbackReasonColor: '#8a919e',
};

/**
 * 타워 해금 화면(UnlockOverlay.js) — 카드(스프라이트+스탯) + 플레이버 2단 레이아웃.
 * "글씨가 안 읽힌다"는 기존 미니 배너 피드백 반영 — CARD보다 폰트를 전반적으로 키우고 밝은
 * 색을 쓴다. panelX/Y는 UnlockOverlay.js가 Phaser.Math.Clamp로 화면 경계 안에 고정한다
 * (내용이 고정 레이아웃이라 원래도 넘칠 일은 없지만, 방어적으로 clamp한다).
 *
 * 좌우 컬럼 폭은 panelW/panelPadding/colGap에서 산술로 유도한다(CARD.width*count+gap*(count-1)
 * 와 같은 방식) — 별도 컬럼 폭 상수를 안 둔다.
 */
export const UNLOCK = {
  // 배경 딤 — 낮/밤 배경(bg_day/night, mapView.js와 동일 소스) 위에 그대로 유지한다.
  dimColor: 0x000000,
  dimAlpha: 0.6,

  // 배너 틀(assets/ui/banner_frame.png, 원본 2149×732) — 폭 기준(가로 프레임이라 fitSpriteWidth).
  // 텍스트 Y는 이미지 중심이 아니라 실측한 프레임 사각형의 안쪽 중심 비율이다(픽셀 스캔 확인 —
  // 프레임이 이미지 전체 중심보다 위쪽에 있어 상하 여백이 비대칭: 위 20.2%, 아래 31.8%).
  bannerY: 70,             // 텍스처 없을 때 폴백 위치(프레임 없이 텍스트만)
  bannerFontSize: 36,
  bannerColor: '#3fa7d6',
  bannerFrameWidth: 420,
  bannerFrameTopY: 15,               // 상단 HUD·화면 끝과 안 겹치게 위로 당김
  bannerFrameTextCenterYRatio: 0.44, // 실측값(프레임 사각형 중심 / 이미지 전체 높이)

  panelX: 140, panelY: 110, panelW: 1000, panelH: 560, // 140+1000=1140<1280, 110+560=670<720
  panelPadding: 40,
  colGap: 40,

  // 카드 틀(assets/ui/card_frame.png, 원본 1024×1536 세로 2:3) — 폭이 아니라 "높이"를 먼저
  // 정한다. 세로로 긴 카드를 폭 기준으로 맞추면 계산상 높이가 720px 화면을 넘긴다(예: 폭
  // 440으로 맞추면 비율상 높이 660). 실제 렌더 폭은 fitSpriteHeight()가 로드된 텍스처에서
  // 그 자리에 계산한다(비율 하드코딩 없음) — UnlockOverlay.js가 사용.
  cardTopY: 173,    // 배너 틀(15~158) 아래 여유. cardTopY+cardHeight=643 < panelY+panelH(670)
  cardHeight: 470,
  // 이중선 테두리·모서리 문양을 안 침범하는 안전영역 여백(카드 실제 폭 기준) — 아이콘·라벨·값이
  // 전부 이 값 하나로 safeLeft/safeRight를 유도해 쓴다(UnlockOverlay.js). 32px일 때 스탯 줄
  // 아이콘이 테두리 장식선에 거의 붙어 보여서 "스페이스바 2칸"(≈14px)만큼 46으로 올렸다.
  // wordWrap 폭도 safeRight - labelX로 이 상수에서 자동 유도되니 여기 숫자만 바꾸면 양쪽 다 반영된다.
  cardInset: 46,

  cardTitleOffsetY: 50,   // 카드 top 기준 — 제목(각석체) y
  titleFontSize: 26,
  // 카드 틀(card_frame.png)이 밝은 양피지 배경이라, 카드 "안"(제목·스탯 라벨·값)만 어두운
  // 먹색 계열로 쓴다. 카드 "밖"(배너·플레이버, 어두운 딤 배경 위)은 계속 밝은 색을 유지한다 —
  // 아래 bannerColor/flavorColor는 이 이유로 건드리지 않는다.
  titleColor: '#2e2013',

  spriteWidth: 130,        // 카드가 좁아진 만큼(구 180 → 130) 축소
  cardSpriteOffsetY: 160,  // 카드 top 기준 — 스프라이트 중심 y

  cardStatStartOffsetY: 300, // 카드 top 기준 — 첫 스탯 줄 y. 4줄까지 안전영역 안에 들어감(계산 확인)
  statLineHeight: 26,
  statFontSize: 16,   // 카드가 좁아져서 구 18에서 축소(가로 폭 여유 확보, 산스라 이 크기도 충분히 읽힘)
  statLabelColor: '#2e2013',
  // 값은 원래 밝은 노랑(#ffd54f)이었는데 양피지 위에서 대비가 약해 짙은 금색(먹색과 구분되는
  // 강조색)으로 낮췄다 — 값이 굵게(fontStyle bold)도 처리돼 있어 라벨과는 이미 구분된다.
  statValueColor: '#a3661d',
  iconSize: 8,
  iconGap: 10,        // 아이콘과 라벨 텍스트 사이 간격

  flavorFontSize: 26,
  flavorColor: '#f2f4f8', // 카드 밖(어두운 딤 배경 위) — 밝은 색 유지

  // 플레이버 문구 위/아래 금색 장식(assets/ui/flavor_divider_top/bottom.png, 각 1536×300,
  // 원본에서 픽셀 밝기 스캔으로 정확히 잘라낸 조각). 문구 실제 렌더 높이(줄 수에 따라 다름)를
  // 만든 직후 읽어서 그 위/아래에 배치하므로 여기는 폭·간격만 상수화한다.
  dividerWidth: 400,
  dividerGap: 14,

  hintY: 660,
  hintFontSize: 15,
  hintColor: '#8a919e',

  slideInMs: 260,
};

/**
 * 애니메이션 — 에셋 없이 코드만으로 타격감·생동감을 만든다. 전부 순수 렌더 오프셋/회전/스케일이고,
 * 논리 좌표(enemy.x/y, PathSystem 소유)는 절대 건드리지 않는다(EnemyView.js §절대 제약).
 * 개체마다 tween을 만들지 않는다 — update(time, delta)에서 시간 기반으로 직접 계산한다
 * (DamageNumber.js와 동일한 이유: 웨이브 40+에서 100개 이상이 동시에 움직인다).
 */
export const ANIM = {
  // 피격 리액션(enemyDamaged) — 히트스톱이 타격감의 대부분을 만든다
  hitstopMs:       50,    // 피격 순간 렌더 정지 시간(ms). ↑ 올리면 더 묵직하게 "멈칫"한다(40~60 권장)
  knockbackDist:   4,     // 넉백 최대 거리(px, 진행 반대 방향). ↑ 올리면 더 크게 밀린다(3~5 권장)
  knockbackMs:     150,   // 넉백이 히트스톱 종료 시점부터 원위치로 돌아오는 데 걸리는 시간
  scalePunchAmt:   0.15,  // 1.0 → 1+이값 → 1.0
  scalePunchMs:    100,
  effectiveHitMul: 1.5,   // isEffective(특효)면 위 세 값(시간·거리·스케일)에 곱하는 배율
  critHitMul:      1.5,   // isCrit면 곱하는 배율 — 특효+크리 동시면 곱연산(1.5×1.5=2.25배)

  // 절차적 이동 애니메이션 — archetype별 순수 시간 함수(Math.sin/cos). 개체마다 phase(0~2π 랜덤)를
  // 물고 있어야 전부 같은 박자로 안 움직인다(EnemyView.js acquire()에서 매 스폰마다 새로 뽑음).
  dustJitterAmp:  1.2,     // 미세먼지 떨림 폭(px). ↑ 올리면 더 부산해 보인다
  dustJitterFreq: 0.011,   // rad/ms
  dustFloatAmp:   3,       // 위아래 부유 폭(px)
  dustFloatFreq:  0.0022,  // rad/ms — 떨림보다 느린 큰 파동

  carTilt: 0.16,  // 과속차량 진행방향 고정 기울임(rad) — 기존 실루엣의 잔상 삼각형과 합쳐져 속도감을 낸다

  tankBobAmp:  3.5,     // 쓰레기더미 상하 bob 폭(px) — "무겁게"라 dust보다 폭은 크고 주기는 느리다
  tankBobFreq: 0.0014,  // rad/ms

  bossSpinFreq: 0.0006, // rad/ms — 보스는 진행방향 대신 이 값으로 회전을 완전히 대체한다(천천히 회전)

  // 타워 발사 반동 — EventBus에 towerFired가 아직 없어서(HANDOFF.md §5), TowerView가
  // Tower.cooldownRemaining이 리셋되는 순간을 스스로 감지한다(실제 코어에서만 동작).
  towerRecoilDist:       2,
  towerRecoilMs:         90,
  towerRecoilScalePunch: 0.06,
};

export const SHAKE = {
  bossSpawn:  0.004,
  bossLeaked: 0.012,  // 보스 코어 도달. ↑ 올리면 임팩트가 커진다
  durationMs: 320,
};

export const EASE = {
  ui:     'Cubic.easeOut',
  pop:    'Back.easeOut',
  fade:   'Sine.easeInOut',
};

/**
 * 공용 패널 언어 — HUD/Controls/BuildUI가 각자 사각형+반투명 검정을 그리던 걸 하나로
 * 통일한다(Panel.js). 미래도시 컨셉이라 직사각형 대신 모서리를 자른 다각형을 쓴다.
 */
export const PANEL = {
  chamfer:      12,     // 코너 잘림 기본 크기(px). ↑ 올리면 더 각져 보인다
  bgColor:      0x0e1520,
  bgAlpha:      0.92,   // 불투명에 가깝게 — 데이터가 배경 지도에 묻히면 안 된다
  borderColor:  0x3fa7d6,
  borderAlpha:  0.5,
  borderWidth:  1,

  // 세그먼트 바(XP·조명 등) — 채운 칸/빈 칸 색만 다르고 형태는 동일
  segGap:          2,
  segWidth:        18,
  segHeight:       8,
  segFilledColor:  0x3fa7d6,
  segFilledAlpha:  1,
  segEmptyColor:   0x1c2230,
  segEmptyAlpha:   0.7,
};

/**
 * 폰트 — Pretendard(assets/fonts/에 B가 나중에 파일을 넣는다). 파일이 없으면 시스템 폰트로
 * 자동 폴백된다(브라우저가 @font-face 로드 실패 시 알아서 처리 — 코드에서 존재 여부를 검사할
 * 필요가 없다). 숫자/라벨을 분리하는 이유: 숫자는 자간을 좁혀 조밀하게, 라벨은 넓혀 작게 —
 * 미래도시 HUD 특유의 위계.
 *
 * unlockTitle/unlockFlavor/unlockStat — 해금 화면(UnlockOverlay.js) 전용. 실제 이름
 * (FONT_FAMILY)은 FontLoader.js 한 곳에만 있고 여기서 폴백 스택으로 조합만 한다(같은
 * 문자열을 두 파일에 따로 안 둔다). flavor는 이 한 줄만 바꾸면 각석체→산스로 전환된다
 * (요청 사항 — 삐뚤함이 거슬리면 unlockStat과 같은 값으로만 바꾸면 됨).
 */
export const FONT = {
  ui:     '"Pretendard", "Malgun Gothic", sans-serif',
  number: '"Pretendard", "Malgun Gothic", sans-serif',
  label:  '"Pretendard", "Malgun Gothic", sans-serif',

  // em 배율(숫자). Phaser Text의 letterSpacing은 px 숫자만 받는다(CSS 'em' 문자열 불가 —
  // 넘기면 그 Text 오브젝트가 통째로 안 그려진다). 호출부에서 `배율 * fontSize`로 변환해 쓴다.
  numberLetterSpacingEm: 0.05,
  labelLetterSpacingEm:  0.18,
  labelSize:             9,
  labelColor:            '#8a919e',

  unlockTitle:  `"${FONT_FAMILY.petroglyph}", "Pretendard", serif`,
  unlockFlavor: `"${FONT_FAMILY.petroglyph}", "Pretendard", serif`, // ← 이 줄만 바꾸면 산스로 전환
  unlockStat:   `"${FONT_FAMILY.sans}", "Pretendard", sans-serif`,

  // 드래프트 카드(DraftOverlay.js) 전용 — 해금 화면과 같은 폰트 자산(FONT_FAMILY.petroglyph)을
  // 재사용한다. ★ DraftOverlay.js에서만 쓴다 — HUD·Controls·BuildUI는 위 FONT.ui 계열 그대로.
  card: `"${FONT_FAMILY.petroglyph}", "Pretendard", serif`,
};

/**
 * HUD — 좌상단 화면 가장자리에 붙는 패널(Panel.js drawPanel, corners:['br']만 잘림).
 * 골드(금색) | 웨이브·계절(무채색) 두 열 + 그 아래 XP 세그먼트 바.
 */
export const HUD = {
  x: 0,
  y: 0,
  width:  300,
  height: 92,
  padding: 16,      // 좌측 여백(골드 열)

  numberFontSize: 19,   // 골드 숫자
  waveFontSize:   13,   // 웨이브·계절 텍스트
  goldColor:      '#f0c674',
  neutralColor:   '#f2f4f8',

  dividerX:     100,   // 골드 열과 웨이브 열 사이 세로 구분선(패널 기준 x)
  dividerAlpha: 0.25,
  // 구분선 오른쪽 열(웨이브 텍스트·XP 바)이 시작하는 여백 — dividerX에 이만큼 더한 지점부터
  // 그린다. ★ XP 바가 구분선을 침범하던 버그(2026-08-12)의 수정 지점 — "LV n"·세그먼트 바
  // 둘 다 이 여백을 기준으로 계산해야 한다(하드코딩 금지, 웨이브 열도 이걸 재사용한다).
  columnMargin: 16,

  rowGoldY:  12,   // 골드 숫자 / 웨이브 텍스트 y
  rowLabelY: 36,   // "골드" / "진행" 라벨 y
  rowXpY:    58,   // "LV n" + 세그먼트 바 y

  xpSegCount: 8,
  // "LV n" 라벨 옆 세그먼트 바 시작 x — 이제 padding이 아니라 (dividerX + columnMargin) 기준
  // 상대값이다. xpSegWidth도 같이 줄여야 8칸이 패널 오른쪽(300px) 밖으로 안 넘친다 — 폭만
  // 줄이면 라벨 자리를 그대로 잡아먹어서, 둘 다 같이 조정한 값(계산: 116(시작 x) + 34(이 값) +
  // 8*12 + 7*2(세그먼트 8칸, xpSegWidth 기준) = 260 < 300).
  xpSegX:      34,
  xpSegWidth:  12,   // ↑ PANEL.segWidth(18)보다 좁다 — HUD XP 바 전용(다른 세그먼트 바는 그대로 18)
};

/**
 * 배속/일시정지/즉시웨이브/음소거 — 화면 우상단, HUD(좌상단)와 안 겹치게 고정.
 * 버튼 4개가 간격 없이 붙어 하나의 패널(Panel.js drawPanel, corners:['tl','br'])을 이룬다 —
 * 첫 버튼 쪽은 좌상단, 마지막 버튼 쪽은 우하단 코너만 잘려서 "하나의 덩어리"로 보인다.
 * 버튼 사이는 gap 대신 1px 구분선(HUD 골드|웨이브 구분선과 동일 언어).
 */
export const CONTROLS = {
  margin:          16,   // 화면 우상단 여백. ↑ 올리면 더 안쪽으로 들어온다(HUD와 겹치면 줄일 것)
  height:          32,
  buttonWidth:     84,   // 배속·일시정지 버튼 폭
  waveButtonWidth: 132,  // 즉시 웨이브 버튼 폭 — 보너스 골드 텍스트 때문에 더 넓다
  muteButtonWidth: 84,   // 음소거 버튼 폭 — "소리켜기"(4글자)까지 안 잘리게
  fontSize:        14,
  disabledAlpha:   0.35, // 드래프트 오버레이가 열렸을 때 흐려지는 정도. ↓ 낮추면 더 흐릿해진다

  activeColor:   '#3fa7d6',  // 활성 상태(2x·재생·음소거중) — 액센트
  dimColor:      '#8a919e',  // 기본 상태 — 흐린 회색
  dividerAlpha:  0.2,
};

/**
 * 오브젝트 렌더러 — 타워/적 화면 표시. 텍스처가 있으면 이미지(SPRITE 블록, fitSpriteWidth
 * 기준), 없으면 이 블록의 단색 도형 플레이스홀더로 그린다(TowerView.js/EnemyView.js가
 * `scene.textures.exists()`로 매번 확인 — 에셋을 넣거나 빼도 코드 변경이 필요 없다).
 */
export const VIEW = {
  // 적 — archetype별 형태 구분 (dust=swarm/car=fast/trash=tank/boss=boss, enemies.json 기준)
  enemyPoolSize:  150,   // 웨이브 40+ 100개 이상 대비 여유분. EnemyPool.js 기본 120에 맞춰 여유를 더 줌
  swarmRadius:    6,     // 미세먼지(작은 원). ↑ 올리면 뭉쳐 보이는 느낌이 강해진다
  fastSize:       14,    // 과속차량(삼각형 한 변). ↑ 올리면 더 커진다
  tankSize:       18,    // 쓰레기더미(사각형 한 변)
  bossRadius:     22,    // 보스(큰 원)
  enemyColors: {         // 적 타입별 색 — 형태(archetype)와 겹쳐서 이중으로 구분되게
    dust:  0xc9b458,
    car:   0xe57373,
    trash: 0x8a6d3b,
    boss:  0x8e44ad,
  },

  // 타워 — towers.json id별 색(levels[].tint) 구분. 표시 크기는 footprint(타워·서포터 2×2)의
  // 이 비율만큼(SPRITE.towerWidth = GridSystem.cell × FOOTPRINT.tower × towerFitRatio, UITheme.js
  // 하단 SPRITE 블록·HANDOFF.md §3 참고). 1.0(=예전 기본값)은 footprint를 꽉 채워 옆 칸·경로까지
  // 침범했고, 0.41(cell 1개만 기준으로 삼았던 중간 시도)은 반대로 너무 작아 보였다 — 그 중간값.
  towerFitRatio:  0.7,   // ↑ 올리면 타워가 커진다(1.0 = footprint 꽉 참 = 인접 타워와 변이 붙음)
  towerAnchorY:   0,     // 셀 하단 앵커 미세조정(px). ↓ 내리면 타워가 위로 올라간다
  towerStrokeColor: 0xf2f4f8,
  towerStrokeAlpha: 0.6,

  // 서포터/장애물 — supports.json/obstacles.json엔 타워와 달리 색 필드(tint)가 없어서
  // docs/ASSET_GUIDE.md §6에서 B가 새로 배정한 색을 그대로 가져와 코드-문서 값을 일치시킨다.
  supportFitRatio:   0.7,   // 서포터도 2×2 footprint라 타워와 동일 비율
  obstacleFitRatio:  0.7,   // 장애물은 footprint가 1×1이라 같은 비율이어도 결과는 훨씬 작다(경로 마커)
  objectColor: {
    sewoon:       0x8c7ae6,
    cityHall:     0x5b7c99,
    log:          0x7a5230,
    disinfectant: 0x4fc3c7,
  },

  buildSquashMs: 220,   // 배치 "쿵" 스쿼시 지속시간. ↓ 낮추면 더 통통 튀어 보인다
};

/**
 * 실제 PNG 스프라이트의 목표 폭(px, SpriteScale.js의 fitSpriteWidth가 소비). VIEW의
 * swarmRadius/fastSize/tankSize/bossRadius(위)는 손그림 도형 폴백 전용 파라미터라 의미가
 * 다르다(반지름·변 길이 등 도형마다 제각각) — 실사 스프라이트는 "가로세로비 유지한 목표 폭"
 * 하나로 통일해서 여기 따로 둔다. 시작값은 눈대중 — ?real=1에서 보고 이 블록만 조정하면 된다.
 */
export const SPRITE = {
  enemyWidth: {
    swarm: 20,  // dust — 가장 작게
    fast:  34,  // car
    tank:  30,  // trash
    boss:  56,  // 위압감이 나야 함 — 작아 보이면 여기부터 키운다
  },
  // 목표 폭 = 그 종류가 실제로 점유하는 footprint(GridSystem.cell × FOOTPRINT[kind]) × VIEW의
  // fitRatio — footprint를 그대로(비율 1.0) 쓰면 타워·서포터가 80px 통짜로 그려져서 옆 칸·
  // 경로까지 침범하고, footprint를 무시하고 cell 1개만 기준으로 삼으면(과거 시도) 반대로 너무
  // 작아 보인다. 그래서 "그 건물이 차지하는 땅의 몇 %를 채우는가"로 표현한다.
  towerWidth:    GridSystem.cell * FOOTPRINT.tower    * VIEW.towerFitRatio,    // 40×2×0.7 = 56
  supportWidth:  GridSystem.cell * FOOTPRINT.support  * VIEW.supportFitRatio,  // 40×2×0.7 = 56
  obstacleWidth: GridSystem.cell * FOOTPRINT.obstacle * VIEW.obstacleFitRatio, // 40×1×0.7 = 28
};

/**
 * 건물 배치 — 절대 사수. 사거리 원과 오라 원은 색뿐 아니라 형태로도 구분한다
 * (TASKS_B.md P4 기준: "오라 반경 원과 사거리 원이 서로 헷갈리지 않음" — 색만 다르면
 * 겹쳤을 때·저대비 모니터·색약에서 무너진다):
 *   사거리 = 테두리만(strokeCircle) · 오라 = 채움 + 낮은 알파(fillCircle)
 *
 * barY 등은 1280×720 고정 해상도(CLAUDE.md §2) 기준 절대값이다. mapView.js의 H를 참조하지
 * 않는 이유는 UITheme.js가 상수 전용 파일이라 mapView.js를 import하면 순환 참조가 생기기 때문.
 */
/**
 * 건설 바 — 화면 하단 중앙에 뜨는 44×44 "이미지 프레임" 슬롯의 묶음.
 * 슬롯 = drawPanel(외곽 테두리, 상태별 색) + 4px 안쪽 이미지 영역(텍스처 있으면 이미지,
 * 없으면 실루엣) + 우하단 뱃지(건설됨=✓ / 잠김=레벨·드래프트 / 장애물=남은 개수).
 * 슬롯 하나 = Container(중심이 원점) — scale은 container 하나만 조작하면 되게 만들어서
 * "선택중 살짝 확대"를 개별 오브젝트가 아니라 슬롯 전체가 한 덩어리로 팝 하게 한다.
 */
export const BUILD = {
  barY:      660,  // 하단 선택 바 중심 Y (H=720 기준). Controls(우상단)·HUD(좌상단)와 안 겹침
  barHeight: 88,   // 패널 전체 높이(슬롯+라벨+여백). UpgradeUI가 "건설 바 영역" 판정에 이 값을 그대로 쓴다

  slotSize:    44,
  slotGap:     10,   // 슬롯 사이 간격
  slotInset:   4,    // 외곽 테두리 안쪽 이미지 영역 여백
  slotTopPad:  12,   // 패널 상단 ~ 슬롯 상단
  slotChamfer: 6,
  groupGap:    24,   // 타워 그룹 ↔ 서포터/장애물 그룹 사이 여백(그 중앙에 구분선)
  dividerAlpha: 0.25,

  labelFontSize: 10,
  labelGap:      4,   // 슬롯 하단 ~ 이름 라벨

  slotBorderSelectable: 0x2b6f8a,  // 흐린 청록 — 선택 가능
  slotBorderSelected:   0x3fa7d6,  // 밝은 청록(액센트) — 선택중
  slotBorderBuilt:      0x3fa7d6,  // 청록 — 건설됨
  slotBorderLocked:     0x33383f,  // 어둡게 — 잠김
  slotSelectedScale:    1.08,      // 선택중 살짝 확대

  builtAlpha:  0.45,  // 이미 지어진 유니크 타워 슬롯(재클릭 불가). ↓ 낮추면 "다 지었다"는 느낌이 더 강해진다
  lockedAlpha: 0.5,   // ↓ 낮추면 더 안 보인다

  checkColor:    '#4caf50',
  badgeColor:    '#8a919e',   // "Lv.3"/"드래프트"/"x3" 뱃지 색
  lockIconColor: 0x8a919e,    // 자물쇠 아이콘 색 (HUD 보조 텍스트와 동일)

  previewAlpha: 0.35,  // 배치 미리보기 실루엣. ↑ 올리면 배치 가능/불가 색이 더 잘 보인다

  rangeLineWidth: 2,
  rangeAlpha:     0.8,
  rangeColor:     0x3fa7d6,  // 사거리 원 = 파랑 계열 테두리

  auraColor:      0xba68c8,  // 오라 원 = 보라 계열 채움. 사거리(파랑)와 색상환에서 확실히 멀다
  auraFillAlpha:  0.15,      // ↑ 올리면 오라 범위가 더 눈에 띈다(과하면 밑에 있는 타워·경로가 안 보임)
  auraLineWidth:  2,
  auraLineAlpha:  0.6,

  rejectToastMs:       1400,  // 실패 문구 유지 시간(페이드 시작까지). ↑ 올리면 더 오래 보인다
  rejectToastOffsetY:  16,    // 선택 바 바로 위 얼마나 띄울지

  unlockFlashMs:    260,   // 해금 순간 스케일 팝 지속시간. ↓ 낮추면 더 튕기듯 보인다
  unlockScalePunch: 1.3,   // 해금 순간 최대 확대 배율. ↑ 올리면 더 두드러진다
};

/** 게임오버 — 도달 웨이브(=점수)가 가장 크게 보여야 한다. 재시작 유도가 최우선이라 연출은 짧게 */
export const GAMEOVER = {
  dimAlpha:        0.75, // 배경 어둡기. ↑ 올리면 더 어두워진다
  fadeInMs:        250,  // 전환 연출 시간. **300ms 안쪽 유지할 것** — 여기서 멋 부리면 재플레이율이 떨어진다
  waveFontSize:    96,   // 도달 웨이브(점수). ↑ 올리면 더 크게, 한눈에 안 놓치게
  subFontSize:     20,   // 처치/레벨 등 보조 정보. 웨이브보다 항상 작아야 한다
  newRecordColor:  '#ffd54f', // 신기록 강조색(특효 노랑과 동일 계열 — "좋은 신호"의 일관된 색 언어)
  newRecordPulseMs: 500, // 신기록 맥동 주기. ↓ 낮추면 더 급해 보인다
  buttonWidth:     240,
  buttonHeight:    56,
  buttonFontSize:  22,
};

/**
 * 강화 패널 — 맵의 건물(타워·서포터)을 클릭하면 뜨는 인스펙터.
 * HUD(좌상단) 바로 아래 고정 위치 — Controls·건설 바·N서울타워/코어 라벨과 안 겹치는 유일한 빈 공간.
 */
export const UPGRADE = {
  panelX:      16,
  panelY:      140,
  panelWidth:  260,
  panelHeight: 300,   // ↑ 올리면 하단 여백이 늘어난다(내용은 항상 위에서부터 채움)
  padding:     14,

  // 한글은 Phaser의 캔버스 텍스트 폭/높이 자동 계산이 글리프 상단 획(ㅌ·ㅍ 등)을 살짝 못 잡는
  // 경우가 있어 16px에서 맨 위 줄(타워 이름)이 미세하게 잘려 보였다. 1px만 낮춰서 회피 —
  // origin은 addLine()이 기본값 (0,0)을 그대로 쓰고(패널 상단으로 삐져나가지 않음), 시작 y도
  // panelY+padding(154)이라 패널 위 여백 안이라 이 폰트 크기 자체가 원인이었다. 긴 이름(예:
  // "롯데월드타워 · 복원 하천", wordWrap으로 2줄) 기준으로 확인함 — ?fxtest=1 U키.
  titleFontSize: 15,
  statFontSize:  13,   // ↑ 올리면 스탯 줄이 더 잘 읽힌다
  lineHeight:    20,   // 스탯 줄 사이 간격

  buttonWidth:  232,
  buttonHeight: 34,
  buttonGap:    8,     // 강화 버튼과 재배치 버튼 사이 간격
  buttonFontSize: 14,

  costShortColor: '#e53935',  // 골드 부족 시 "80G / 보유 45G" 강조색 (COLOR.ng와 동일 계열)
  maxLevelColor:  '#8a919e',  // "최대 강화" 문구색 (HUD 보조 텍스트와 동일)

  relocateHintColor: '#3fa7d6', // "이동할 위치를 고르세요" 안내문 색 (BUILD.rangeColor와 동일 — 배치 계열 신호)

  // 크리·관통처럼 "이 타워만의" 값이 아니라 전군 공통(퍼크)인 스탯 라벨 색 — 세운상가(VIEW.objectColor.sewoon)와
  // 같은 보라 계열로, "건물 고유 스탯이 아니라 시스템 버프"라는 느낌을 색으로도 구분한다.
  globalBuffColor: '#8c7ae6',
  dividerColor: 0xffffff,
  dividerAlpha: 0.15,   // 타워 고유 스탯 / 전역 버프 구간을 가르는 얇은 선

  rejectToastMs: 1400,  // 강화/재배치 실패 문구 유지 시간. BUILD.rejectToastMs와 동일 값

  damageRefreshMs: 700, // 누적 피해 실시간 갱신 주기(0.5~1초 요건). MockGameCore.fakeCombat 주기와 같아 ?mock=1 확인이 쉽다
};

/** 타이틀 화면 — 심사자가 보는 첫 화면. 3초 안에 시작 가능해야 한다(멋 부리지 않는다). */
export const TITLE = {
  // Phaser 캔버스 텍스트는 폰트에 따라 위아래 여백을 충분히 안 잡아서 획 상단이 잘리는
  // 경우가 있다(한글 + 큰 폰트에서 특히) — 텍스트마다 이 여백을 캔버스에 미리 얹어서 피한다.
  // ★ x/y 둘 다 대칭(좌우 동일 x, 상하 동일 top=bottom=y)이라 setOrigin(0.5) 기준 시각적
  // 중심은 안 밀린다 — 패딩이 캔버스만 키우고 글자를 그 한가운데 그대로 그리기 때문. 그래도
  // 폰트가 바뀌면 깨질 수 있으니 스크린샷으로 y 위치가 실제로 안 밀렸는지 확인할 것.
  textPaddingX: 8,
  textPaddingY: 12,

  titleFontSize: 56,
  titleY:        180,
  dateFontSize:  20,
  dateY:         250,
  descFontSize:  16,
  descY:         290,
  descColor:     '#8a919e',
  bestFontSize:  16,
  bestY:         340,
  bestColor:     '#ffd54f',   // 최고 기록 강조색(특효 노랑과 동일 계열)

  buttonWidth:    200,
  buttonHeight:   56,
  buttonY:        440,
  buttonFontSize: 22,

  hintFontSize: 13,
  hintY:        500,
  hintColor:    '#8a919e',
};

/**
 * 보스 연출 — CLAUDE.md §8 금지 조항("숫자 체력바 금지")은 도시(N서울타워 조명)에만 적용된다.
 * 보스 체력바는 별개라 숫자/바 형태로 보여줘도 된다.
 */
export const BOSS = {
  bannerFontSize: 24,
  bannerY:        60,
  bannerColor:    '#e53935',   // 경고색 — 조명 1단계(빨강)와 동일 계열
  bannerMs:       1400,        // 배너 노출 시간

  skyDarkenAlpha: 0.35,        // 등장 시 하늘이 어두워지는 정도. ↑ 올리면 더 어두워진다
  skyDarkenMs:    600,

  hpBarWidth:  360,
  hpBarHeight: 18,
  hpBarY:      90,
  hpBarColor:      0xe53935,
  hpBarBgColor:    0x33383f,

  leakSquashScale: 0.6,   // bossLeaked 소멸 시 찌그러지는 정도. ↓ 낮추면 더 납작해진다
  leakFadeMs:      280,
};

/**
 * 투사체 이펙트(ProjectileFx.js) — towerId별 모양·색·속도는 PROJECTILE_CONFIG(그 파일 안)가
 * 갖고, 여기는 튜닝 숫자만 둔다. arrowSpeedPxS는 연출용 값이라 Projectile.js(로직, 900px/s)와
 * 굳이 맞출 필요 없다 — 눈으로 보고 조정한다.
 *
 * 호밍(EnemyPool 폴링) — 과속차량(385px/s)처럼 빠른 적은 화살(700px/s) 비행 중에도 꽤 움직여서
 * 직진이면 스치는 경우가 잦다. arrowTurnRateDegPerSec는 "1초에 최대 몇 도까지 방향을 꺾을 수
 * 있는가" — 낮추면 뻣뻣해서 빠른 적을 놓치고, 너무 높으면 순간적으로 홱 꺾여 부자연스럽다.
 * maxLifeMs는 안전판(회전 제한 때문에 이론상 영원히 목표에 못 닿는 경우 대비 강제 소멸).
 */
export const PROJECTILE_FX = {
  poolSize: 30,           // 광화문 attackSpeed 0.6s(초당 1.7회) 기준 여유분. 타워 추가되면 올린다
  arrowSpeedPxS: 700,
  arrowColor: 0xc9a86a,   // 광화문 최대 레벨(목조 복원) tint와 맞춘 색
  arrowLength: 18,
  arrowWidth: 4,
  arrowTurnRateDegPerSec: 900, // ↑ 올리면 더 급하게 꺾인다(즉응형 호밍) · ↓ 낮추면 더 뻣뻣해진다
  maxLifeMs: 2000,             // 회전 제한으로 계속 못 따라잡는 극단적 상황의 강제 소멸 시한

  // DDP 포탄 — shape만 다른 shell. 회전 속도·수명 안전판은 화살과 공유(같은 호밍 로직)
  shellSpeedPxS: 420,     // 화살(700)보다 느리게 — "묵직한 포탄" 느낌
  shellRadius: 7,
  shellColor: 0x5a5f66,   // DDP 몸체(회색 계열)와 맞춘 탄체 색 — 착탄색(주황)과는 별개
};

/**
 * 즉시히트 레이저(LaserFx.js) — 화살(ProjectileFx)과 달리 이동이 없어 두께·페이드·풀만
 * 공통으로 둔다. 색은 타워마다 다르므로 LaserFx.js의 LASER_CONFIG 맵에 따로 둔다.
 *
 * *ByLevel 배열은 인덱스 0/1/2 = Lv1/2/3(TowerLevelTracker가 주는 level과 그대로 대응, Tower.js
 * this.level이 0-index라 towers.json levels[]와도 이미 같은 규칙 — TowerView.js 참고).
 */
export const LASER_FX = {
  poolSize: 20,     // 화살보다 여유롭지만(롯데 attackSpeed 2.0s) 이후 타워 추가 대비 넉넉히
  fadeMs: 150,       // ↑ 올리면 더 오래 남는다("즉시"라는 느낌이 흐려짐)
  coreWidth: 3,
  coreAlpha: 0.9,
  glowWidth: 10,     // ↑ 올리면 빛이 더 퍼져 보인다
  glowAlpha: 0.25,

  widthByLevel:     [1, 1.4, 1.9],   // 코어·글로우 두께 배율 — 레벨 높을수록 더 굵게
  glowAlphaByLevel: [1, 1.3, 1.7],   // 글로우 알파 배율 — 레벨 높을수록 더 진하게
};

/**
 * 명중 임팩트(ImpactFx.js) — 레이저 전용이 아니라 공용이다(DDP 폭발 등도 재사용 예정이라
 * LASER_FX가 아니라 여기 둔다). flash(섬광)·ring(링)은 "반경 0→N, 알파 1→0"로 같은 애니메이션
 * 모델이라 ImpactFx 안에서 풀 하나(radial)를 공유하고 filled 플래그로만 구분한다. spark(불똥)는
 * 방사형으로 튀며 중력을 받는 별도 풀이다.
 *
 * flash·spark는 색을 고정한다(흰색/연노랑) — 레이저 색과 같으면 그 위에서 안 보인다. ring만
 * 호출자가 넘기는 색(그 타워의 레이저 색)을 그대로 써서 "흰 코어 + 무기색 테두리"를 만든다.
 *
 * *ByLevel 배열은 LASER_FX와 동일하게 인덱스 0/1/2 = Lv1/2/3.
 */
export const IMPACT_FX = {
  poolSize: 24,   // 명중 1회당 flash 1 + ring 1 + spark N개가 한꺼번에 뜬다 — 화살/레이저 풀보다 넉넉히

  flashColor: 0xffffff,
  flashRadiusByLevel: [14, 18, 24],
  flashMs: 120,     // ↓ 낮추면 더 순간적으로 "퍽"

  ringRadiusByLevel: [22, 30, 40],
  ringWidth: 2,
  ringMs: 180,

  sparkColor: 0xfff3c4,
  sparkCountByLevel: [5, 8, 12],
  sparkSpeedMin: 220,
  sparkSpeedMax: 380,
  sparkLength: 6,
  sparkWidth: 2,
  sparkLifeMs: 180,
  sparkGravityPxS2: 500,  // ↑ 올리면 더 빨리 아래로 처진다("튀었다 떨어지는" 느낌)
};

/**
 * 상시 오오라(AuraFx.js) — 화살·레이저·임팩트처럼 "떴다 사라지는" 풀 모델이 아니라, 타워가
 * 존재하는 동안 계속 떠있는 Map 기반 관리다(§ AuraFx.js 상단 주석). depth는 y 기반이 아니라
 * 고정값 — mapView.js의 경로·격자 그래픽이 전부 depth 미지정(기본 0)이고 타워·적은 depth=y
 * (대략 100 이상)를 쓰므로, 그 사이에 안정적으로 끼우는 낮은 고정값이면 된다.
 *
 * 반경은 상수가 아니라 obj.effectiveRange(사거리 원과 동일 소스)를 그대로 쓴다 — range는
 * 레벨과 무관한 고정값이라(Tower.js 문서화) 여기 레벨별 반경 배율은 없다.
 */
export const AURA_FX = {
  depth: 10,
  baseAlpha: 0.12,          // 평상시 은은한 밝기
  breatheAmplitude: 0.06,   // 맥동 폭 — 알파가 baseAlpha±이 값 사이를 오간다
  breatheMs: 2200,          // 맥동 한 주기 길이
  pulseBoost: 0.25,         // towerFired 순간 추가되는 밝기(감쇠 시작값)
  pulseMs: 250,             // 펄스가 0으로 감쇠하는 시간
};

/**
 * 광역 타격 원(AoeCircleFx.js) — 청계천처럼 "공격 순간에만" 착탄 지점에 뜨는 채운 원.
 * 상시 오오라(AURA_FX)와 달리 반경은 aoeRadius(레벨·버프 영향 없는 고정값)라 배율이 없고,
 * 대신 alphaMulByLevel로 밝기만 강화한다. ImpactFx.spawnRadial(반경 0→N, 성장+페이드)을
 * baseAlpha만 낮춰서 그대로 재사용한다(새 애니메이션 없음).
 */
export const AOE_FX = {
  fadeMs: 350,                      // "확 나타났다 0.3~0.4초에 사라짐" 요건
  baseAlpha: 0.35,                  // 반투명 채운 원 기준 밝기
  alphaMulByLevel: [1, 1.25, 1.5],  // aoeRadius가 고정이라 밝기로 강화 표현
};

/**
 * BGM + 타워 발사음(SoundManager.js). 기존 hit/kill/warning/levelup/gameover SFX는 이 블록을
 * 안 쓴다(각자 play() 호출부에 볼륨 직접 지정) — 타워 발사음만 여기로 새로 뺐다.
 */
export const SOUND = {
  bgmVolume:      0.3,   // 크로스페이드 목표 볼륨(기존 단일 BGM과 동일선상)
  bgmCrossfadeMs: 1500,  // 낮↔밤 전환 시 페이드 인/아웃 길이

  sfxVolume: 0.3,               // 타워 발사음 공통 볼륨
  sfxMaxConcurrentPerKey: 2,    // 같은 발사음이 이 개수 넘게 겹치면 가장 오래된 것부터 끊는다
};
