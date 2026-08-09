/**
 * FontLoader.js — 커스텀 폰트(HancomSans/HancomPetroglyph) 로드 보장.
 *
 * Phaser Text는 캔버스 2D API(fillText)로 그리는데, 캔버스 렌더링은 CSS @font-face(index.html)를
 * "참조"만 해서는 다운로드가 안정적으로 트리거 안 되는 경우가 있고, 설령 트리거돼도 로드가 끝나기
 * 전에 이미 그려진 텍스트는 자동으로 다시 그려지지 않는다(FOUT — 폴백 폰트로 굳어버림).
 *
 * 그래서 Phaser 로더가 아니라 CSS Font Loading API(document.fonts)를 직접 쓴다:
 *   1) document.fonts.load()로 명시적으로 로드를 요청하고,
 *   2) document.fonts.ready까지 이어 붙여(브라우저의 "이 문서가 참조하는 폰트 전부 로드됨" 최종
 *      신호) 이중으로 확인한다.
 *
 * 실패해도(오프라인 등) reject하지 않는다 — 게임이 멈추면 안 되고, 실패 시엔 UITheme.FONT의
 * 폴백 폰트(Pretendard/시스템 폰트)가 자동으로 대신 쓰인다.
 *
 * main.js가 Phaser.Game을 만들기 전에 loadCustomFonts()를 호출해 최대한 일찍(타이틀 화면을
 * 보는 동안) 백그라운드로 받기 시작한다.
 */

export const FONT_FAMILY = {
  sans: 'HancomSans',
  petroglyph: 'HancomPetroglyph',
};

let loadPromise = null;

/** 로드를 시작한다(중복 호출해도 한 번만 실제로 요청 — 이미 진행 중인 Promise를 그대로 돌려줌). */
export function loadCustomFonts() {
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([
    document.fonts.load(`16px "${FONT_FAMILY.sans}"`),
    document.fonts.load(`16px "${FONT_FAMILY.petroglyph}"`),
  ])
    .then(() => document.fonts.ready)
    .catch(err => {
      console.warn('[FontLoader] 커스텀 폰트 로드 실패 — 폴백 폰트로 진행', err);
    });
  return loadPromise;
}

/** 동기 확인 — 지금 당장 텍스트를 만들어도 바로 올바른 폰트로 그려질지. */
export function areFontsReady() {
  return document.fonts.check(`16px "${FONT_FAMILY.sans}"`)
    && document.fonts.check(`16px "${FONT_FAMILY.petroglyph}"`);
}

/**
 * text가 로드 완료 시점까지 살아있으면(destroy 안 됐으면) 같은 fontFamily를 재적용해 강제로
 * 다시 그린다 — 처음 그려질 때 폰트가 아직 없어 폴백으로 그려졌던 경우를 뒤늦게 바로잡는
 * 2차 방어선이다(1차는 areFontsReady()로 열리는 시점에 이미 준비됐는지 확인하는 것).
 */
export function refreshOnReady(text) {
  loadCustomFonts().then(() => {
    if (text.active) text.setFontFamily(text.style.fontFamily);
  });
}
