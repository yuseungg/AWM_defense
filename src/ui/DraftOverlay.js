/**
 * DraftOverlay.js — 레벨업 드래프트 3장 / 보스 정책 3장 / 타워 해금 화면 (D14: UI 한 벌로 처리)
 *
 * 큐 관리(정렬·중복 조회)는 OverlayQueue.js가, 해금 화면 그리기는 UnlockOverlay.js가 맡고,
 * 이 클래스는 "지금 뭘 보여줄지·언제 일시정지할지"만 담당한다(오케스트레이션). 우선순위
 * (해금1/드래프트2/정책3)는 OverlayQueue의 OVERLAY_PRIORITY 하나에만 있다.
 *
 * ── 해금 화면은 독립 오버레이 항목이다 ──────────────────────────────
 * EV.levelUp 페이로드엔 unlockedTower와 draftCards가 같이 실려 오지만, 화면은 분리한다 —
 * unlockedTower가 있으면 'unlock' 항목과 'draft' 항목을 각각 큐에 넣어 순서대로(해금 먼저)
 * 하나씩 보여준다. enqueueUnlock()이 공개 메서드라 levelUp 없이도(청계천의 "게임 시작 1회
 * 소개") 외부(GameScene)에서 그대로 재사용한다. 카드 모양은 MockGameCore가 정의한 스펙
 * 그대로: { cardId, kind, name, desc }. desc는 각 json(perks/obstacles/supports/policies)에
 * "효과|근거" 형태로 파이프(|) 하나로 나눠 들어있다 — buildCard()가 split('|')로 두 줄(효과
 * 강조·근거는 흐리게)로 그린다. 파이프 없는 값도 안 깨지게 근거는 빈 문자열로 폴백한다.
 * 카드 효과 수치를 바꾸면 해당 json의 desc도 같이 고쳐야 한다(HANDOFF.md에 기록).
 *
 * 카드 틀(assets/cards/card_bg.png, 520×780 한 장)을 3장 전부에 공통으로 깐다 — 카드마다
 * 다른 그림이 아니다. 로드 실패 시 기존 도형 카드로 조용히 폴백한다(buildCard() 참고).
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
import { COLOR, CARD, FONT } from './UITheme.js';
import { OverlayQueue } from './OverlayQueue.js';
import { buildUnlockScreen } from './UnlockOverlay.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const W = 1280, H = 720;
// BuildUI/UpgradeUI의 사거리·오라 원(depth 45~62)보다 항상 위에 뜨게 한다 — 세운상가 오라 원이
// 카드 위로 비쳐 보이던 문제(depth 미지정 시 기본값 0이라 오라 레이어보다 아래에 깔림).
// BossAlert(9000대)·GameOverScene(9999)보다는 아래로 남겨서 그쪽이 항상 최우선이 되게 한다.
const OVERLAY_DEPTH = 500;

// card.kind(§6-1 MockGameCore/DraftSystem 공용 스펙) → 카드 상단 타입 뱃지 한글 라벨
const TYPE_LABEL = { perk: '퍼크', support: '서포터', obstacle: '장애물', policy: '정책' };

export class DraftOverlay {
  constructor(scene, core) {
    this.scene = scene;
    this.core = core;

    this.queue = new OverlayQueue();
    this.current = null; // { type, payload }
    this.visuals = [];

    this.onLevelUp = ({ unlockedTower, draftCards }) => {
      if (unlockedTower) this.enqueueUnlock(unlockedTower);
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

  /**
   * 해금 화면을 큐에 넣는 공개 진입점 — onLevelUp이 이걸 쓰고, GameScene도 "게임 시작 시
   * 청계천 소개"처럼 levelUp 없이 직접 해금 화면을 띄우고 싶을 때 그대로 재사용한다.
   * 같은 타워 해금이 이미 큐에 대기 중이거나 지금 화면에 떠 있으면 또 넣지 않는다(중복 방지) —
   * 정상적인 levelUp 흐름에선 unlockLevel이 타워마다 고유·단조증가라 안 생기지만 방어적으로 막아둔다.
   */
  enqueueUnlock(towerId) {
    if (this.isUnlockQueuedOrShown(towerId)) return;
    this.queue.enqueue('unlock', { unlockedTower: towerId });
    this.tryShowNext();
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
   * 타워 해금 — 카드+스프라이트+스탯+플레이버+배경 그리기는 전부 UnlockOverlay.js 몫이다.
   * 배경(낮/밤)은 현재 웨이브 기준이라 core.getState()로 1회 조회해서 넘긴다(D18 예외, 매 프레임 아님).
   */
  renderUnlock({ unlockedTower }) {
    const { wave } = this.core.getState();
    this.visuals.push(...buildUnlockScreen(this.scene, unlockedTower, () => this.dismissUnlock(), wave));
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

  /**
   * 카드 틀(assets/cards/card_bg.png, 520×780 한 장, 3장 전부 공통)을 setDisplaySize(260×390)로
   * 깐다. 없으면(파일 없음 등) 기존 도형 카드로 조용히 폴백 — 틀 유무에 따라 배경 밝기가
   * 정반대라 글자 색도 세트째로 뒤집는다(틀=밝은 하늘색→어두운 남색 글자,
   * 폴백=어두운 COLOR.slot→밝은 글자, CARD.xxxColor vs CARD.fallbackXxxColor, UITheme.js).
   * desc는 "효과|근거"로 저장돼 있어(각 json 텍스트 필드) split('|')로 나눠 두 줄로 그린다.
   */
  buildCard(card, type, x, y) {
    const hasFrame = this.scene.textures.exists('card_bg');
    const col = hasFrame
      ? { type: CARD.typeColor, name: CARD.nameColor, effect: CARD.effectColor, reason: CARD.reasonColor }
      : { type: CARD.fallbackTypeColor, name: CARD.fallbackNameColor, effect: CARD.fallbackEffectColor, reason: CARD.fallbackReasonColor };

    const bg = hasFrame
      ? this.scene.add.image(x, y + CARD.height / 2, 'card_bg').setDisplaySize(CARD.width, CARD.height)
      : this.scene.add.rectangle(x, y + CARD.height / 2, CARD.width, CARD.height, COLOR.slot).setStrokeStyle(2, COLOR.accent, 0.6);
    bg.setInteractive({ useHandCursor: true }).setDepth(OVERLAY_DEPTH);

    const wrapWidth = CARD.width - CARD.padding * 2;
    const [effectText, reasonText = ''] = String(card.desc ?? '').split('|');

    const typeBadge = this.scene.add.text(x, y + CARD.padding, TYPE_LABEL[card.kind] ?? card.kind, {
      fontFamily: FONT.card, fontSize: `${CARD.typeFontSize}px`, color: col.type,
      wordWrap: { width: wrapWidth }, align: 'center',
    }).setOrigin(0.5, 0).setDepth(OVERLAY_DEPTH);

    const title = this.scene.add.text(x, y + CARD.padding + 22, card.name, {
      fontFamily: FONT.card, fontSize: `${CARD.nameFontSize}px`, color: col.name, fontStyle: 'bold',
      wordWrap: { width: wrapWidth }, align: 'center', lineSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(OVERLAY_DEPTH);

    // ★ 카드 안에서 가장 눈에 띄어야 하는 줄 — 위계상 이름 다음, 가장 큰 실질 정보
    const effect = this.scene.add.text(x, y + CARD.padding + 84, effectText, {
      fontFamily: FONT.card, fontSize: `${CARD.effectFontSize}px`, color: col.effect, fontStyle: 'bold',
      wordWrap: { width: wrapWidth }, align: 'center', lineSpacing: 3,
    }).setOrigin(0.5, 0).setDepth(OVERLAY_DEPTH);

    // 근거는 카드 하단에 고정 — "실제 근거 한 줄" (교육 2층), 가장 흐리게
    const reason = this.scene.add.text(x, y + CARD.height - CARD.padding, reasonText, {
      fontFamily: FONT.card, fontSize: `${CARD.reasonFontSize}px`, color: col.reason,
      wordWrap: { width: wrapWidth }, align: 'center', lineSpacing: 3,
    }).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH);

    const group = [bg, typeBadge, title, effect, reason];
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
