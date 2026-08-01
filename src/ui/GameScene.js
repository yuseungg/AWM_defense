/**
 * GameScene.js — 실제 게임 화면 (기본 모드)
 *
 * 지도 배경 + SeoulTowerLight(조명=체력바) + DamageNumber + HUD를 붙인다.
 * 실제 GameCore가 나오기 전까지는 MockGameCore를 스펙으로 쓴다 (SYNC.md §6-4).
 *
 * ?fxtest=1 = FX 검증 키 (B 영역). ?debug=1(웨이브 점프 등, CLAUDE.md §7)과
 * 숫자 키가 겹치면 서로 무력화되므로 완전히 분리된 플래그를 쓴다 — 여기서는 ?debug=1을 읽지 않는다.
 */

import Phaser from 'phaser';
import mapData from '../../data/map.json';
import { EventBus, EV } from '../EventBus.js';
import { SeoulTowerLight } from '../fx/SeoulTowerLight.js';
import { DamageNumber } from '../fx/DamageNumber.js';
import { EnemyView } from '../fx/EnemyView.js';
import { TowerView } from '../fx/TowerView.js';
import { HUD } from './HUD.js';
import { DraftOverlay } from './DraftOverlay.js';
import { Controls } from './Controls.js';
import { GameOverScene } from './GameOverScene.js';
import { BuildUI } from './BuildUI.js';
import { UpgradeUI } from './UpgradeUI.js';
import { drawMap, H } from './mapView.js';
import { COLOR, DMG, HUD as HUDT } from './UITheme.js';
import perksData from '../../data/perks.json';
import obstaclesData from '../../data/obstacles.json';
import supportsData from '../../data/supports.json';
import policiesData from '../../data/policies.json';
import towersData from '../../data/towers.json';
import enemiesData from '../../data/enemies.json';

const FXTEST = new URLSearchParams(location.search).get('fxtest') === '1';
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const REAL = new URLSearchParams(location.search).get('real') === '1';

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  /**
   * 에셋 자동 교체 파이프라인 — `assets/<종류>/<id>.png` = json의 id와 1:1 (HANDOFF.md §6).
   * 실패(파일 없음)해도 loaderror만 조용히 넘어간다 — TowerView/EnemyView가
   * `scene.textures.exists(key)`로 직접 확인해서 없으면 도형 플레이스홀더로 그린다.
   * PNG를 넣거나 빼는 것만으로 코드 변경 없이 반영된다.
   */
  preload() {
    if (DEBUG) {
      this._failedAssets = [];
      this.load.on('loaderror', file => this._failedAssets.push(file.key));
      this.load.on('complete', () => {
        if (this._failedAssets.length) {
          console.log(`[에셋] 로드 실패(플레이스홀더로 대체) ${this._failedAssets.length}건:`, this._failedAssets.join(', '));
        }
      });
    } else {
      this.load.on('loaderror', () => {}); // 프로덕션에서는 404 스팸을 우리 쪽에서 더 얹지 않는다
    }

    // vite.config.js의 publicDir이 assets/를 site root로 서빙하므로 URL엔 "assets/" 접두어가 없다
    // (디스크상 파일 경로는 CLAUDE.md §3 그대로 assets/towers/<id>.png).
    Object.keys(towersData).forEach(id => this.load.image(`tower_${id}`, `towers/${id}.png`));
    Object.keys(enemiesData).forEach(type => this.load.image(`enemy_${type}`, `enemies/${type}.png`));
    // 서포터/장애물은 아직 화면에 그리는 렌더러가 없다(§0 알려진 미완성) — 텍스처는 미리 로드해둬서
    // 나중에 렌더러가 생기면 preload() 수정 없이 바로 쓸 수 있게 한다.
    Object.keys(supportsData).forEach(id => this.load.image(`support_${id}`, `supports/${id}.png`));
    Object.keys(obstaclesData).forEach(id => this.load.image(`obstacle_${id}`, `obstacles/${id}.png`));
  }

  async create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    const { tower } = drawMap(this);

    // 조명 = 체력바. SeoulTowerLight가 cityDamaged/cityHealed를 알아서 구독한다
    this.light = new SeoulTowerLight(this, tower.x, tower.y, 13);
    this.add.text(tower.x, tower.y - 30, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    // 골드/웨이브/계절/XP — goldChanged 등 4개 이벤트를 알아서 구독한다
    this.hud = new HUD(this);

    // ══ 코어 전환 지점 ══
    // 기본값 = MockGameCore(전체 루프가 보이는 데모 상태 유지). `?real=1`을 붙이면 실제
    // GameCore.js로 붙는다 — A가 LevelSystem/DraftSystem 등 자기 진도를 그때그때 확인하는 용도다.
    // 스텁 4개(buildSupport/buildObstacle/pickDraftCard/pickPolicy)가 전부 채워져서 실제 코어를
    // "기본값"으로 승격할 때가 오면, 아래 삼항의 기본값 쪽 한 줄만 바꾸면 된다.
    // (SYNC.md §6-4 "Mock이 스펙이다" / §2 전환 전제 조건 참고)
    const { GameCore } = REAL
      ? await import('../GameCore.js')
      : await import('../MockGameCore.js');
    this.core = GameCore;

    if (REAL) {
      this.add.text(HUDT.margin, 104, 'REAL CORE', {
        fontSize: '12px', color: '#ff7043', fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 6, y: 3 },
      });
    }

    // 배속/일시정지/즉시웨이브. DraftOverlay가 pause 소유권을 조회하므로 draft보다 먼저 만든다
    this.controls = new Controls(this, this.core);

    // 건물 선택 바 + 배치 미리보기 + 사거리/오라 원 — 절대 사수
    this.buildUI = new BuildUI(this, this.core);

    // 건물 클릭 → 강화/재배치 패널. DraftOverlay가 이걸 잠가야 해서 그보다 먼저 만든다
    this.upgradeUI = new UpgradeUI(this, this.core);

    // 타워/적 화면 표시 — EnemyView는 core.__isMock으로 좌표 갱신 방식을 한 번만 정한다
    this.towerView = new TowerView(this, this.core);
    this.enemyView = new EnemyView(this, this.core);

    // 데미지 숫자 — enemyDamaged를 알아서 구독한다. 타워/적 도형 위에 떠야 하므로 그 다음에 만든다
    this.dmg = new DamageNumber(this);

    // 레벨업 드래프트 3장 / 보스 정책 3장 — levelUp·bossKilled를 알아서 구독한다. GameCore.setPaused를
    // 직접 호출하므로 core가 준비된 뒤에 만든다.
    this.draft = new DraftOverlay(this, this.core);

    // 결과 화면 — gameOver를 알아서 구독한다
    this.gameOverScene = new GameOverScene(this, this.core);

    this.hud.init(GameCore.getState()); // 씬 진입 시 1회만 — CLAUDE.md D18
    GameCore.__startMock?.();

    if (FXTEST) this.setupFxTestKeys();
  }

  /**
   * 실제 GameCore는 매 프레임 update(deltaMs) 호출로 웨이브 타이머·적 이동·투사체·타워 발사를
   * 전진시킨다(GameCore.js 자체 문서화된 계약). MockGameCore는 자체 setInterval로 돌아가서
   * update()가 없다 — `?.`로 안전하게 건너뛴다. (발견 경위: EnemyView를 실제 코어로 검증하다가
   * 적이 전혀 안 움직이는 걸 보고 찾음. SYNC.md §2 참고)
   */
  update(time, delta) {
    this.core?.update?.(delta);
  }

  /**
   * FX 검증 키 (?fxtest=1 전용). GameCore를 거치지 않고 EventBus에 직접 emit해서
   * SeoulTowerLight·DamageNumber의 반응만 독립적으로 테스트한다.
   * D5에 A가 조명·데미지 상수(UITheme.js)를 튜닝할 때 쓰는 유일한 도구다.
   *
   *   조명: 1~4 레벨 강제 · 0 소등 · B 2단계 하강(보스 시뮬) · R 1단계 회복
   *         · S 씬 재시작(리스너 누수 검증용) · P MockGameCore 일시정지/재개
   *   데미지: Q 일반 · W 특효 · E 크리 · T 특효+크리 · Y 100개 동시발사(풀 부하 테스트)
   *   드래프트: D 레벨업 3장 강제 · F 보스 정책 3장 강제
   *             Z 레벨업 2개+정책 1개를 한꺼번에 큐에 밀어넣기(순차 처리·언페이즈 검증)
   *   ESC 안전판: 열린 오버레이 강제 닫기 + 강제 unpause
   *   O: gameOver 강제 발행(신기록 있음/없음 토글) — GameOverScene 검증
   */
  setupFxTestKeys() {
    const kb = this.input.keyboard;

    // ── 조명
    this.debugLevel = 4;
    const jumpTo = (target) => {
      if (target === this.debugLevel) return;
      const isDamage = target < this.debugLevel;
      this.debugLevel = target;
      EventBus.emit(isDamage ? EV.cityDamaged : EV.cityHealed, { level: target });
    };
    kb.on('keydown-ZERO', () => jumpTo(0));
    kb.on('keydown-ONE', () => jumpTo(1));
    kb.on('keydown-TWO', () => jumpTo(2));
    kb.on('keydown-THREE', () => jumpTo(3));
    kb.on('keydown-FOUR', () => jumpTo(4));
    kb.on('keydown-B', () => jumpTo(Math.max(0, this.debugLevel - 2)));
    kb.on('keydown-R', () => jumpTo(Math.min(4, this.debugLevel + 1)));
    kb.on('keydown-S', () => this.scene.restart());

    let paused = false;
    kb.on('keydown-P', () => {
      paused = !paused;
      this.core.setPaused(paused);
    });

    // ── 데미지 숫자
    const path = mapData.paths[0];
    const rndPos = () => ({
      x: 100 + Math.random() * 1000,
      y: path[Math.floor(Math.random() * path.length)].y,
    });
    const fire = (isEffective, isCrit) => {
      const { x, y } = rndPos();
      EventBus.emit(EV.enemyDamaged, {
        id: 'debug', amount: Math.round(4 + Math.random() * 60), x, y, isEffective, isCrit,
      });
    };
    kb.on('keydown-Q', () => fire(false, false));
    kb.on('keydown-W', () => fire(true, false));
    kb.on('keydown-E', () => fire(false, true));
    kb.on('keydown-T', () => fire(true, true));
    kb.on('keydown-Y', () => this.runDamageStressTest());

    // ── 드래프트
    kb.on('keydown-D', () => this.fireDebugLevelUp());
    kb.on('keydown-F', () => this.fireDebugBossKilled());
    kb.on('keydown-Z', () => {
      this.fireDebugLevelUp();
      this.fireDebugLevelUp();
      this.fireDebugBossKilled();
    });
    kb.on('keydown-ESC', () => this.draft.forceCloseAll());

    // ── 게임오버
    kb.on('keydown-O', () => {
      this._debugRecord = !this._debugRecord;
      EventBus.emit(EV.gameOver, {
        wave: Math.floor(Math.random() * 30) + 1,
        kills: Math.floor(Math.random() * 200),
        level: this._debugLevel || 1,
        isNewRecord: this._debugRecord,
      });
    });

    this.add.text(20, H - 100, 'FX 디버그(?fxtest=1): 조명 1~4·0·B·R·S·P · 데미지 Q·W·E·T·Y · 드래프트 D·F·Z · ESC 강제닫기 · O 게임오버', {
      fontSize: '12px', color: '#8a919e',
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);
  }

  /** 카드 풀에서 n장 무작위 추출 (MockGameCore.sample과 동일 로직, 디버그 전용 복제) */
  sampleCards(pool, n) {
    const a = [...pool];
    const out = [];
    while (a.length && out.length < n) out.push(...a.splice(Math.floor(Math.random() * a.length), 1));
    return out;
  }

  /** D 키 — 레벨업 드래프트 3장을 강제 발행한다. unlockLevel이 맞으면 해금 배너도 같이 뜬다 */
  fireDebugLevelUp() {
    this._debugLevel = (this._debugLevel || 0) + 1;
    const unlocked = Object.values(towersData).find(t => t.unlockLevel === this._debugLevel);
    const pool = [
      ...Object.values(supportsData).map(s => ({ cardId: s.id, kind: 'support', name: s.name, desc: s.desc })),
      ...Object.values(obstaclesData).map(o => ({ cardId: o.id, kind: 'obstacle', name: o.name, desc: o.desc })),
      ...Object.values(perksData).map(p => ({ cardId: p.id, kind: 'perk', name: p.name, desc: p.desc })),
    ];
    EventBus.emit(EV.levelUp, {
      level: this._debugLevel,
      unlockedTower: unlocked ? unlocked.id : null,
      draftCards: this.sampleCards(pool, 3),
    });
  }

  /** F 키 — 보스 정책 카드 3장을 강제 발행한다 */
  fireDebugBossKilled() {
    const pool = Object.values(policiesData).map(p => ({ cardId: p.id, kind: 'policy', name: p.name, desc: p.desc }));
    EventBus.emit(EV.bossKilled, { policyCards: this.sampleCards(pool, 3) });
  }

  /** Y 키 — 100개 동시 발사 후 활성 최대 개수·FPS를 샘플링해 콘솔에 보고한다 */
  runDamageStressTest() {
    const path = mapData.paths[0];
    for (let i = 0; i < 100; i++) {
      const x = 100 + Math.random() * 1000;
      const y = path[Math.floor(Math.random() * path.length)].y;
      const isEffective = Math.random() < 0.5;
      const isCrit = Math.random() < 0.5;
      EventBus.emit(EV.enemyDamaged, {
        id: `stress${i}`, amount: Math.round(4 + Math.random() * 60), x, y, isEffective, isCrit,
      });
    }

    let peak = 0;
    const start = this.time.now;
    const timer = this.time.addEvent({
      delay: 50, loop: true,
      callback: () => {
        peak = Math.max(peak, this.dmg.activeCount);
        if (this.time.now - start > DMG.lifeMs + 200) {
          timer.remove();
          console.log(`[DamageNumber 부하테스트] 100개 동시발사 · 활성 최대 ${peak}/${DMG.poolSize} · FPS ${this.game.loop.actualFps.toFixed(1)}`);
        }
      },
    });
  }
}
