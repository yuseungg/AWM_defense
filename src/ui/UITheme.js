/**
 * UITheme.js — 모든 연출 상수의 단일 소유처
 *
 * ⚠️ B 부재(D6~D7) 중 A가 UI를 튜닝할 때 **이 파일의 숫자만** 바꾼다.
 *    로직 파일(SeoulTowerLight / DamageNumber / DraftOverlay)은 건드리지 않는다.
 *
 * 증상 → 고칠 상수 매핑은 HANDOFF.md 참조.
 */

export const COLOR = {
  bg:        0x11141a,   // 맵 배경
  path:      0x2a3040,   // 경로
  slot:      0x1c2230,   // 경로 밖 슬롯 격자
  accent:    0x3fa7d6,   // 단일 액센트 컬러 (아트 방향: 단색 실루엣 + 액센트 1개)
  ok:        0x4caf50,   // 배치 가능
  ng:        0xe53935,   // 배치 불가
  text:      0xf2f4f8,
  textDim:   0x8a919e,
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
};

/** 장애물 발동 이펙트 + 쿨다운 게이지 — 이게 없으면 통나무·소독약이 작동하는지 알 방법이 없다 */
export const OBSTACLE_FX = {
  gaugeOffsetY: -18,
  gaugeRadius:  10,
  gaugeBgColor: 0x33383f,
  gaugeFillColor: 0x3fa7d6,
};

/** 드래프트 오버레이 — 레벨업 3장 / 보스 정책 3장. 장수가 같아 레이아웃 한 벌로 끝난다 */
export const CARD = {
  // 드래프트 = 3장 고정 (레벨업·보스 정책 동일). 300*3 + 32*2 = 964px < 1280 → 여백 충분
  count:      3,
  width:      300,
  height:     340,
  gap:        32,
  padding:    20,
  fontSize:   18,   // ↑ 올리면 카드가 1초 안에 읽힌다. 3장이라 5장 때보다 키울 수 있다
  reasonSize: 13,   // "실제 근거 한 줄" (교육 2층)
  slideInMs:  260,
  hoverLift:  10,
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

export const HUD = {
  fontSize:   16,
  margin:     16,
  xpBarWidth: 240,
  xpBarHeight: 10,
};

/** 배속/일시정지/즉시웨이브 — 화면 우상단, HUD(좌상단)와 안 겹치게 고정 */
export const CONTROLS = {
  margin:         16,   // 화면 우상단 여백. ↑ 올리면 더 안쪽으로 들어온다(HUD와 겹치면 줄일 것)
  buttonHeight:   32,
  buttonWidth:    84,   // 배속·일시정지 버튼 폭
  waveButtonWidth: 132, // 즉시 웨이브 버튼 폭 — 보너스 골드 텍스트 때문에 더 넓다
  muteButtonWidth: 84,  // 음소거 버튼 폭 — "소리켜기"(4글자)까지 안 잘리게
  gap:            8,    // 버튼 사이 간격. ↑ 올리면 더 벌어진다
  fontSize:       14,
  disabledAlpha:  0.35, // 드래프트 오버레이가 열렸을 때 흐려지는 정도. ↓ 낮추면 더 흐릿해진다
};

/**
 * 오브젝트 렌더러 — 타워/적 화면 표시. 에셋이 없는 지금은 단색 도형 플레이스홀더로 그린다.
 * 에셋이 들어오면(§6 자동 교체 파이프라인) 이 상수들은 안 쓰이게 되지만 폴백 경로로는 계속 남는다.
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

  // 타워 — towers.json id별 색(levels[].tint) 구분. 사거리와 무관하게 셀(40px) 안에 들어와야 함
  towerSize:        28,   // 셀 40px 안에 여백을 두고 들어오는 크기. ↑ 올리면 셀을 거의 꽉 채운다
  towerStrokeColor: 0xf2f4f8,
  towerStrokeAlpha: 0.6,

  // 서포터/장애물 — supports.json/obstacles.json엔 타워와 달리 색 필드(tint)가 없어서
  // docs/ASSET_GUIDE.md §6에서 B가 새로 배정한 색을 그대로 가져와 코드-문서 값을 일치시킨다.
  supportSize:   26,
  obstacleSize:  18,   // 경로 위 마커라 타워보다 작게 — 경로 자체를 가리지 않아야 함
  objectColor: {
    sewoon:       0x8c7ae6,
    cityHall:     0x5b7c99,
    log:          0x7a5230,
    disinfectant: 0x4fc3c7,
  },

  buildSquashMs: 220,   // 배치 "쿵" 스쿼시 지속시간. ↓ 낮추면 더 통통 튀어 보인다
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
export const BUILD = {
  barY:        660,  // 하단 선택 바 중심 Y (H=720 기준, 여백 60px). Controls(우상단)·HUD(좌상단)와 안 겹침
  barHeight:   64,
  buttonWidth: 96,
  buttonGap:   10,
  fontSize:    13,
  builtAlpha:  0.35,  // 이미 지어진 유니크 타워 버튼(재클릭 불가). ↓ 낮추면 "다 지었다"는 느낌이 더 강해진다

  previewAlpha: 0.35,  // 배치 미리보기 실루엣. ↑ 올리면 배치 가능/불가 색이 더 잘 보인다

  rangeLineWidth: 2,
  rangeAlpha:     0.8,
  rangeColor:     0x3fa7d6,  // 사거리 원 = 파랑 계열 테두리

  auraColor:      0xba68c8,  // 오라 원 = 보라 계열 채움. 사거리(파랑)와 색상환에서 확실히 멀다
  auraFillAlpha:  0.15,      // ↑ 올리면 오라 범위가 더 눈에 띈다(과하면 밑에 있는 타워·경로가 안 보임)
  auraLineWidth:  2,
  auraLineAlpha:  0.6,

  selectedBorderColor: 0xffd54f,  // 선택된 버튼 강조. 특효 노랑과 동일 계열("지금 이걸 들고 있다" 신호)

  rejectToastMs:       1400,  // 실패 문구 유지 시간(페이드 시작까지). ↑ 올리면 더 오래 보인다
  rejectToastOffsetY:  16,    // 선택 바 바로 위 얼마나 띄울지

  // 미해금 슬롯 — "앞으로 뭐가 나올지 보여야 레벨업 동기가 생긴다"는 원칙(로그라이트 성장)
  lockedAlpha:     0.35,   // ↓ 낮추면 더 안 보인다(건설됨과 동일 알파를 공유 — 둘 다 "지금은 못 누른다"는 신호)
  lockIconColor:   0x8a919e,  // 자물쇠 아이콘 색 (HUD 보조 텍스트와 동일)
  lockBadgeColor:  '#8a919e', // "Lv.3"/"드래프트" 뱃지 색
  unlockFlashMs:   260,    // 해금 순간 스케일 팝 지속시간. ↓ 낮추면 더 튕기듯 보인다
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

  titleFontSize: 16,
  statFontSize:  13,   // ↑ 올리면 스탯 줄이 더 잘 읽힌다
  lineHeight:    20,   // 스탯 줄 사이 간격

  buttonWidth:  232,
  buttonHeight: 34,
  buttonGap:    8,     // 강화 버튼과 재배치 버튼 사이 간격
  buttonFontSize: 14,

  costShortColor: '#e53935',  // 골드 부족 시 "80G / 보유 45G" 강조색 (COLOR.ng와 동일 계열)
  maxLevelColor:  '#8a919e',  // "최대 강화" 문구색 (HUD 보조 텍스트와 동일)

  relocateHintColor: '#3fa7d6', // "이동할 위치를 고르세요" 안내문 색 (BUILD.rangeColor와 동일 — 배치 계열 신호)

  rejectToastMs: 1400,  // 강화/재배치 실패 문구 유지 시간. BUILD.rejectToastMs와 동일 값
};

/** 타이틀 화면 — 심사자가 보는 첫 화면. 3초 안에 시작 가능해야 한다(멋 부리지 않는다). */
export const TITLE = {
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
