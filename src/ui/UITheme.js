/**
 * UITheme.js — 모든 연출 상수의 단일 소유처
 *
 * ⚠️ B 부재(D4~D7) 중 A가 UI를 튜닝할 때 **이 파일의 숫자만** 바꾼다.
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
  hitCount:    4,    // 피격 반짝임 개수. ↓ 낮추면 화면이 덜 정신없다
  killCount:   10,
  goldPopMs:   500,
  maxOnScreen: 120,  // 성능 안전판
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
  gap:            8,    // 버튼 사이 간격. ↑ 올리면 더 벌어진다
  fontSize:       14,
  disabledAlpha:  0.35, // 드래프트 오버레이가 열렸을 때 흐려지는 정도. ↓ 낮추면 더 흐릿해진다
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
