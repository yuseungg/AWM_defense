/**
 * OverlayQueue.js — 순차 오버레이 요청 큐(해금/드래프트/정책 등). 우선순위로 정렬해 하나씩
 * 순서대로 처리하기 위한 순수 데이터 구조다 — Phaser·렌더링·GameCore를 전혀 모른다.
 * DraftOverlay가 이 큐로 "다음에 뭘 보여줄지"만 물어보고, 실제 표시(일시정지·그리기·닫기)는
 * DraftOverlay 몫이다(표시 담당과 큐 관리를 분리).
 *
 * 우선순위: 숫자가 작을수록 먼저 나온다. Array.sort는 ES2019+에서 안정 정렬이 보장돼
 * 같은 우선순위끼리는 enqueue한 순서 그대로 유지된다(도착 순).
 */

export const OVERLAY_PRIORITY = {
  unlock: 1, // 타워 해금 배너
  draft: 2,  // 레벨업 드래프트 3장
  policy: 3, // 보스 처치 정책 3장
};

export class OverlayQueue {
  constructor() {
    this.items = [];
  }

  enqueue(type, payload) {
    this.items.push({ type, payload });
    this.items.sort((a, b) => (OVERLAY_PRIORITY[a.type] ?? Infinity) - (OVERLAY_PRIORITY[b.type] ?? Infinity));
  }

  dequeue() {
    return this.items.shift();
  }

  isEmpty() {
    return this.items.length === 0;
  }

  /** 이미 큐에 대기 중인 같은 종류의 요청이 있는지(중복 방지용 조회) — Array.some과 동일 계약. */
  some(predicate) {
    return this.items.some(predicate);
  }

  clear() {
    this.items = [];
  }
}

export default OverlayQueue;
