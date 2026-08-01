/**
 * DraftOverlay.js — 레벨업 드래프트 3장 / 보스 정책 3장 (D14: UI 한 벌로 처리)
 *
 * 카드 모양은 MockGameCore가 정의한 스펙을 그대로 쓴다: { cardId, kind, name, desc }.
 * desc는 이미 "효과 + 실제 근거" 한 줄로 각 json(perks/obstacles/supports/policies)에
 * 들어있다 — 별도 포맷터를 만들지 않는다. 카드 효과 수치를 바꾸면 해당 json의 desc도
 * 같이 고쳐야 한다(HANDOFF.md에 기록).
 *
 * "일시정지"는 GameCore.setPaused(bool) 하나로만 처리한다(§6-2 유일한 pause API).
 * Phaser 씬 자체는 pause하지 않는다 — 그러면 오버레이 자신의 클릭·트윈도 멈춰버린다.
 *
 * ★ UI는 코어의 실패로 멈추지 않는다. pick()은 GameCore 반환값과 무관하게 항상
 * closeCurrent()를 실행한다 — A의 GameCore 1단계는 아직 { ok:false, reason:'notImplemented' }를
 * 반환하는데, 여기서 멈추면 setPaused(true) 상태로 게임이 영구 정지한다.
 */

import Phaser from 'phaser';
import { EventBus, EV } from '../EventBus.js';
import { COLOR, CARD } from './UITheme.js';
import towersData from '../../data/towers.json';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const W = 1280, H = 720;

export class DraftOverlay {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.draftQueue = [];
    this.policyQueue = [];
    this.current = null; // { type }
    this.visuals = [];

    this.onLevelUp = (payload) => { this.draftQueue.push(payload); this.tryShowNext(); };
    this.onBossKilled = (payload) => { this.policyQueue.push(payload); this.tryShowNext(); };

    EventBus.on(EV.levelUp, this.onLevelUp, this);
    EventBus.on(EV.bossKilled, this.onBossKilled, this);

    scene.events.once('shutdown', () => this.destroy());
  }

  /** 레벨업 → 정책 순서(D14/§6-1). 이미 뭔가 떠 있으면 큐에만 쌓고 기다린다 */
  tryShowNext() {
    if (this.current) return;
    if (this.draftQueue.length > 0) {
      this.show('draft', this.draftQueue.shift());
    } else if (this.policyQueue.length > 0) {
      this.show('policy', this.policyQueue.shift());
    } else {
      // 큐가 완전히 빈 시점에만 재개한다. Controls도 setPaused를 쓰는 boolean 하나라 마지막
      // 호출자가 이긴다 — false를 그냥 부르면 유저가 원래 원했던 pause 상태(isUserPaused)를
      // 지워버린다. Controls의 값을 다시 읽어 복원하고, 잠갔던 버튼도 같이 풀어준다.
      this.scene.controls?.setInputEnabled(true);
      this.scene.buildUI?.setInputEnabled(true);
      this.scene.upgradeUI?.setInputEnabled(true);
      this.core.setPaused(this.scene.controls?.isUserPaused ?? false);
    }
  }

  show(type, payload) {
    const cards = type === 'draft' ? payload.draftCards : payload.policyCards;

    // ★ 카드가 0장이면(DraftSystem 미완성 등으로 core가 빈 배열을 보낼 때) 오버레이를 열지 않는다.
    // cards.forEach가 아무것도 안 그려서 화면만 어두워지고, 누를 카드가 없어 pick()이 절대
    // 안 불려서 closeCurrent()도 안 온다 — 그러면 setPaused(true) 상태로 게임이 영구 정지한다.
    // (실제로 A의 LevelSystem.js가 이 상태를 보낸다 — DraftSystem 전 단계라 draftCards: []가 항상 옴)
    if (!cards || cards.length === 0) {
      this.tryShowNext();
      return;
    }

    this.core.setPaused(true);
    this.scene.controls?.setInputEnabled(false); // 카드가 떠 있는 동안 Controls 버튼을 아예 못 누르게
    this.scene.buildUI?.setInputEnabled(false);  // 카드가 떠 있는 동안 배치도 잠근다(같은 이유)
    this.scene.upgradeUI?.setInputEnabled(false); // 강화 패널도 동일 — ESC 우선순위도 이 컴포넌트가 기준(HANDOFF §5)
    this.current = { type };
    this.render(type, payload, cards);
  }

  render(type, payload, cards) {
    const totalW = CARD.width * CARD.count + CARD.gap * (CARD.count - 1);
    const startX = (W - totalW) / 2;
    const y = (H - CARD.height) / 2;

    const dim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive();
    this.visuals.push(dim);

    if (type === 'draft' && payload.unlockedTower) {
      const t = towersData[payload.unlockedTower];
      const banner = this.scene.add.text(W / 2, y - 36, `${t ? t.name : payload.unlockedTower} 해금!`, {
        fontSize: `${CARD.fontSize + 4}px`, color: '#3fa7d6', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.visuals.push(banner);
    }

    cards.forEach((card, i) => {
      const x = startX + i * (CARD.width + CARD.gap) + CARD.width / 2;
      this.visuals.push(...this.buildCard(card, type, x, y));
    });
  }

  buildCard(card, type, x, y) {
    const bg = this.scene.add.rectangle(x, y + CARD.height / 2, CARD.width, CARD.height, COLOR.slot)
      .setStrokeStyle(2, COLOR.accent, 0.6)
      .setInteractive({ useHandCursor: true });

    const title = this.scene.add.text(x, y + CARD.padding, card.name, {
      fontSize: `${CARD.fontSize}px`, color: '#f2f4f8', fontStyle: 'bold',
      wordWrap: { width: CARD.width - CARD.padding * 2 }, align: 'center',
    }).setOrigin(0.5, 0);

    const desc = this.scene.add.text(x, y + CARD.padding + 56, card.desc, {
      fontSize: `${CARD.reasonSize}px`, color: '#8a919e',
      wordWrap: { width: CARD.width - CARD.padding * 2 }, align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0);

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
    this.draftQueue = [];
    this.policyQueue = [];
    this.core.setPaused(false);
    this.scene.controls?.setInputEnabled(true);
    this.scene.buildUI?.setInputEnabled(true);
    this.scene.upgradeUI?.setInputEnabled(true);
  }

  destroy() {
    EventBus.off(EV.levelUp, this.onLevelUp, this);
    EventBus.off(EV.bossKilled, this.onBossKilled, this);
    this.closeCurrent();
    this.core.setPaused(false); // ★ 무조건 unpause 안전판 — 오버레이가 열린 채로 씬이 죽어도 게임이 안 멈춘다
    this.scene.buildUI?.setInputEnabled(true);
    this.scene.upgradeUI?.setInputEnabled(true);
  }
}
