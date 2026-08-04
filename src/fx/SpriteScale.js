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
