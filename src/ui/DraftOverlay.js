/**
 * DraftOverlay.js — 레벨업 드래프트 3장 / 보스 정책 3장 / 타워 해금 배너 (D14: UI 한 벌로 처리)
 *
 * 큐 관리(정렬·중복 조회)는 OverlayQueue.js가 맡고, 이 클래스는 "지금 뭘 보여줄지·언제
 * 일시정지할지·화면을 어떻게 그릴지"만 담당한다(표시 담당). 우선순위(해금1/드래프트2/정책3)는
 * OverlayQueue의 OVERLAY_PRIORITY 하나에만 있다.
 *
 * ── 해금 배너는 독립 오버레이 항목이다 ──────────────────────────────
 * EV.levelUp 페이로드엔 unlockedTower와 draftCards가 같이 실려 오지만, 화면은 분리한다 —
 * unlockedTower가 있으면 'unlock' 항목과 'draft' 항목을 각각 큐에 넣어 순서대로(해금 먼저)
 * 하나씩 보여준다. 카드 모양은 MockGameCore가 정의한 스펙 그대로: { cardId, kind, name, desc }.
 * desc는 이미 "효과 + 실제 근거" 한 줄로 각 json(perks/obstacles/supports/policies)에
 * 들어있다 — 별도 포맷터를 만들지 않는다. 카드 효과 수치를 바꾸면 해당 json의 desc도
 * 같이 고쳐야 한다(HANDOFF.md에 기록).
 *
 * "일시정지"는 GameCore.setPaused(bool) 하나로만 처리한다(§6-2 유일한 pause API).
 * Phaser 씬 자체는 pause하지 않는다 — 그러면 오버레이 자신의 클릭·트윈도 멈춰버린다.
 * 큐 처리 중(해금→드래프트→정책 전환 사이)엔 setPaused를 다시 안 건드린다 — 큐가 완전히
 * 빌 때만 재개해서, 화면이 바뀌는 찰나에 게임이 잠깐 풀렸다 다시 잠기는 깜빡임이 없다.
 *
 * ★ UI는 코어의 실패로 멈추지 않는다. pick()은 GameCore 반환값과 무관하게 항상
 * closeCurrent()를 실행한다 — A의 GameCore 1단계는 아직 { ok:false, reason:'notImplemented' }를
 * 반환하는데, 여기서 멈추면 setPaused(true) 상태로 게임이 영구 정지한다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, CARD } from './UITheme.js';
import { OverlayQueue } from './OverlayQueue.js';
import towersData from '../../data/towers.json';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const W = 1280, H = 720;
// BuildUI/UpgradeUI의 사거리·오라 원(depth 45~62)보다 항상 위에 뜨게 한다 — 세운상가 오라 원이
// 카드 위로 비쳐 보이던 문제(depth 미지정 시 기본값 0이라 오라 레이어보다 아래에 깔림).
// BossAlert(9000대)·GameOverScene(9999)보다는 아래로 남겨서 그쪽이 항상 최우선이 되게 한다.
const OVERLAY_DEPTH = 500;

export class DraftOverlay {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.queue = new OverlayQueue();
    this.current = null; // { type, payload }
    this.visuals = [];

    this.onLevelUp = ({ unlockedTower, draftCards }) => {
      // 같은 타워 해금이 큐에 이미 대기 중이거나 지금 화면에 떠 있으면 또 넣지 않는다(중복 방지).
      // 정상 흐름에선 unlockLevel이 타워마다 고유·단조증가라 안 생기지만, 방어적으로 막아둔다.
      if (unlockedTower && !this.isUnlockQueuedOrShown(unlockedTower)) {
        this.queue.enqueue('unlock', { unlockedTower });
      }
      this.queue.enqueue('draft', { draftCards });
      this.tryShowNext();
    };
    this.onBossKilled = (payload) => { this.queue.enqueue('policy', payload); this.tryShowNext(); };

    EventBus.on(EV.levelUp, this.onLevelUp, this);
    EventBus.on(EV.bossKilled, this.onBossKilled, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  isUnlockQueuedOrShown(towerId) {
    if (this.current?.type === 'unlock' && this.current.payload.unlockedTower === towerId) return true;
    return this.queue.some(item => item.type === 'unlock' && item.payload.unlockedTower === towerId);
  }

  /** 큐에서 우선순위 1등을 꺼내 보여준다. 이미 뭔가 떠 있으면 손대지 않고 기다린다. */
  tryShowNext() {
    if (this.current) return;

    if (this.queue.isEmpty()) {
      // 큐가 완전히 빈 시점에만 재개한다. Controls도 setPaused를 쓰는 boolean 하나라 마지막
      // 호출자가 이긴다 — false를 그냥 부르면 유저가 원래 원했던 pause 상태(isUserPaused)를
      // 지워버린다. Controls의 값을 다시 읽어 복원하고, 잠갔던 버튼도 같이 풀어준다.
      this.scene.controls?.setInputEnabled(true);
      this.scene.buildUI?.setInputEnabled(true);
      this.scene.upgradeUI?.setInputEnabled(true);
      this.core.setPaused(this.scene.controls?.isUserPaused ?? false);
      return;
    }

    const { type, payload } = this.queue.dequeue();
    this.show(type, payload);
  }

  show(type, payload) {
    const cards = type === 'draft' ? payload.draftCards : type === 'policy' ? payload.policyCards : null;

    // ★ 카드가 0장이면(draft/policy만 해당 — unlock은 카드가 없는 종류) 오버레이를 열지 않는다.
    // cards.forEach가 아무것도 안 그려서 화면만 어두워지고, 누를 카드가 없어 pick()이 절대
    // 안 불려서 closeCurrent()도 안 온다 — 그러면 setPaused(true) 상태로 게임이 영구 정지한다.
    if (type !== 'unlock' && (!cards || cards.length === 0)) {
      this.tryShowNext();
      return;
    }

    this.core.setPaused(true);
    this.scene.controls?.setInputEnabled(false); // 화면이 떠 있는 동안 Controls 버튼을 아예 못 누르게
    this.scene.buildUI?.setInputEnabled(false);  // 배치도 잠근다(같은 이유)
    this.scene.upgradeUI?.setInputEnabled(false); // 강화 패널도 동일 — ESC 우선순위도 이 컴포넌트가 기준(HANDOFF §5)
    this.current = { type, payload };

    if (type === 'unlock') this.renderUnlock(payload);
    else this.render(type, payload, cards);
  }

  /**
   * 타워 해금 — 카드 없이 배너 하나만 보여주는 독립 화면이다. 지금은 최소 기능(배너 + 클릭해서
   * 계속)만 만든다 — "예시 이미지 같은 큰 해금 화면"으로 바꾸는 건 다음 작업(A) 몫이라 여기서는
   * 큐 항목 자체를 독립시켜두는 것까지만 한다(비주얼 확장이 이 함수 하나만 손보면 되게).
   */
  renderUnlock({ unlockedTower }) {
    const t = towersData[unlockedTower];
    const label = t ? t.name : unlockedTower;

    const dim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(OVERLAY_DEPTH);
    const banner = this.scene.add.text(W / 2, H / 2 - 20, `${label} 해금!`, {
      fontSize: `${CARD.fontSize + 12}px`, color: '#3fa7d6', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH);
    const hint = this.scene.add.text(W / 2, H / 2 + 40, '클릭해서 계속', {
      fontSize: `${CARD.reasonSize}px`, color: '#8a919e',
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH);

    const group = [dim, banner, hint];
    group.forEach(o => { o.alpha = 0; });
    this.scene.tweens.add({ targets: group, alpha: 1, duration: CARD.slideInMs, ease: 'Cubic.easeOut' });

    dim.on('pointerdown', () => this.dismissUnlock());
    this.visuals.push(...group);
  }

  dismissUnlock() {
    this.closeCurrent();
    this.tryShowNext();
  }

  render(type, payload, cards) {
    const totalW = CARD.width * CARD.count + CARD.gap * (CARD.count - 1);
    const startX = (W - totalW) / 2;
    const y = (H - CARD.height) / 2;

    const dim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(OVERLAY_DEPTH);
    this.visuals.push(dim);

    cards.forEach((card, i) => {
      const x = startX + i * (CARD.width + CARD.gap) + CARD.width / 2;
      this.visuals.push(...this.buildCard(card, type, x, y));
    });
  }

  buildCard(card, type, x, y) {
    const bg = this.scene.add.rectangle(x, y + CARD.height / 2, CARD.width, CARD.height, COLOR.slot)
      .setStrokeStyle(2, COLOR.accent, 0.6)
      .setInteractive({ useHandCursor: true })
      .setDepth(OVERLAY_DEPTH);

    const title = this.scene.add.text(x, y + CARD.padding, card.name, {
      fontSize: `${CARD.fontSize}px`, color: '#f2f4f8', fontStyle: 'bold',
      wordWrap: { width: CARD.width - CARD.padding * 2 }, align: 'center',
    }).setOrigin(0.5, 0).setDepth(OVERLAY_DEPTH);

    const desc = this.scene.add.text(x, y + CARD.padding + 56, card.desc, {
      fontSize: `${CARD.reasonSize}px`, color: '#8a919e',
      wordWrap: { width: CARD.width - CARD.padding * 2 }, align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(OVERLAY_DEPTH);

    const group = [bg, title, desc];
    group.forEach(o => { o.alpha = 0; });
    this.scene.tweens.add({ targets: group, alpha: 1, duration: CARD.slideInMs, ease: 'Cubic.easeOut' });

    bg.on('pointerover', () => {
      this.scene.tweens.add({ targets: group, y: `-=${CARD.hoverLift}`, duration: 120, ease: 'Cubic.easeOut' });
    });
    bg.on('pointerout', () => {
      this.scene.tweens.add({ targets: group, y: `+=${CARD.hoverLift}`, duration: 120, ease: 'Cubic.easeOut' });
    });
    bg.on('pointerdown', () => this.pick(card, type));

    return group;
  }

  pick(card, type) {
    let res;
    try {
      res = type === 'draft' ? this.core.pickDraftCard(card.cardId) : this.core.pickPolicy(card.cardId);
    } catch (err) {
      if (DEBUG) console.warn(`[DraftOverlay] ${type} 픽 중 예외 — UI는 계속 진행한다`, err);
    }
    this.closeCurrent(); // ★ 반환값과 무관하게 항상 닫는다
    if (!res?.ok && DEBUG) {
      console.warn(`[DraftOverlay] ${type} 픽 실패(${res?.reason ?? 'unknown'}) — actionRejected로 표시만, 오버레이는 이미 닫힘`);
    }
    this.tryShowNext();
  }

  closeCurrent() {
    this.visuals.forEach(o => o.destroy());
    this.visuals = [];
    this.current = null;
  }

  /** ?fxtest=1 ESC 안전판 — 큐까지 전부 비우고 강제로 unpause한다 */
  forceCloseAll() {
    this.closeCurrent();
    this.queue.clear();
    this.core.setPaused(false);
    this.scene.controls?.setInputEnabled(true);
    this.scene.buildUI?.setInputEnabled(true);
    this.scene.upgradeUI?.setInputEnabled(true);
  }

  destroy() {
    EventBus.off(EV.levelUp, this.onLevelUp, this);
    EventBus.off(EV.bossKilled, this.onBossKilled, this);
    this.closeCurrent();
    this.queue.clear();
    this.core.setPaused(false); // ★ 무조건 unpause 안전판 — 오버레이가 열린 채로 씬이 죽어도 게임이 안 멈춘다
    this.scene.buildUI?.setInputEnabled(true);
    this.scene.upgradeUI?.setInputEnabled(true);
  }
}
