/**
 * SpriteScale.js — 스프라이트를 가로세로비 유지한 채 목표 폭(px)에 맞추는 공용 헬퍼
 *
 * 80×80 같은 정사각형 강제 금지(CLAUDE.md 작업 지시) — 에셋마다 실측 비율이 제각각이라
 * (car는 2.53:1처럼 가로로 매우 긺) width만 정하고 height는 비율대로 따라오게 한다.
 *
 * EnemyView.js가 첫 사용처지만 이름·위치를 kind 중립으로 둔다 — 다음 턴 TowerView.js도
 * 그대로 재사용한다(건물류는 "바닥 중앙" 앵커가 필요할 수 있어 origin을 인자로 받는다).
 */

/**
 * @param {Phaser.GameObjects.Image} image
 * @param {number} targetWidth
 * @param {number} originX
 * @param {number} originY
 * @returns {number} 적용된 scale 값
 */
export function fitSpriteWidth(image, targetWidth, originX = 0.5, originY = 0.5) {
  image.setOrigin(originX, originY);
  // image.width = 텍스처 원본(비스케일) 프레임 폭 — Phaser가 보장하는 값이라 풀링돼 재사용된
  // 스프라이트가 이전에 다른 크기로 setScale돼 있었어도 항상 정확하다.
  const scale = targetWidth / image.width;
  image.setScale(scale);
  return scale;
}

/**
 * fitSpriteWidth의 높이 기준 버전 — 세로로 긴 에셋(해금 화면 카드 틀 등)을 화면 높이 안에
 * 맞출 때는 폭이 아니라 높이를 먼저 정해야 한다(UnlockOverlay.js: 카드 원본이 2:3 세로라
 * 폭 기준으로 맞추면 720px 화면을 넘긴다). 비율은 여기서도 하드코딩하지 않고 image.height를
 * 그 자리에서 읽는다.
 *
 * @param {Phaser.GameObjects.Image} image
 * @param {number} targetHeight
 * @param {number} originX
 * @param {number} originY
 * @returns {number} 적용된 scale 값
 */
export function fitSpriteHeight(image, targetHeight, originX = 0.5, originY = 0.5) {
  image.setOrigin(originX, originY);
  const scale = targetHeight / image.height;
  image.setScale(scale);
  return scale;
}
