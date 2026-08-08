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
import { BossAlert } from '../fx/BossAlert.js';
import { FxLayer } from '../fx/FxLayer.js';
import { ProjectileFx } from '../fx/ProjectileFx.js';
import { LaserFx } from '../fx/LaserFx.js';
import { ImpactFx } from '../fx/ImpactFx.js';
import { TowerLevelTracker } from '../fx/TowerLevelTracker.js';
import { SoundManager } from '../fx/SoundManager.js';
import { HUD } from './HUD.js';
import { DraftOverlay } from './DraftOverlay.js';
import { Controls } from './Controls.js';
import { GameOverScene } from './GameOverScene.js';
import { BuildUI } from './BuildUI.js';
import { UpgradeUI } from './UpgradeUI.js';
import { ScreenFrame } from './ScreenFrame.js';
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
// ?mock=1은 main.js 라우터가 이미 선점(MockScene 전체로 분기) — 여기선 다른 이름을 쓴다.
const MOCK_CORE = new URLSearchParams(location.search).get('mockcore') === '1';

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
    // 배경 사진(낮/밤) — 없으면 loaderror만 나고 mapView.js가 COLOR.bg 단색으로 조용히 폴백한다.
    this.load.image('bg_day', 'bg/day.jpg');
    this.load.image('bg_night', 'bg/night.jpg');
    Object.keys(towersData).forEach(id => {
      this.load.image(`tower_${id}`, `towers/${id}.png`);
      // 레벨별 이미지(지금은 nseoulTower_1/_2/_3만 실제로 있음) — 나머지 5종×3단계는 404로
      // 조용히 무시된다(위 loaderror 안전장치). TowerView.redraw()가 tower_<id>_<level+1>을
      // 먼저 찾고 없으면 tower_<id>로 폴백한다.
      [1, 2, 3].forEach(n => this.load.image(`tower_${id}_${n}`, `towers/${id}_${n}.png`));
    });
    Object.keys(enemiesData).forEach(type => this.load.image(`enemy_${type}`, `enemies/${type}.png`));
    // 서포터/장애물은 아직 화면에 그리는 렌더러가 없다(§0 알려진 미완성) — 텍스처는 미리 로드해둬서
    // 나중에 렌더러가 생기면 preload() 수정 없이 바로 쓸 수 있게 한다.
    Object.keys(supportsData).forEach(id => this.load.image(`support_${id}`, `supports/${id}.png`));
    Object.keys(obstaclesData).forEach(id => this.load.image(`obstacle_${id}`, `obstacles/${id}.png`));

    // 사운드도 같은 폴백 원칙 — SFX 음원은 아직 없다(/docs/CREDITS.md 참고). loaderror만 조용히
    // 나고 SoundManager.play()가 scene.cache.audio.exists()로 확인 후 재생하니 파일만 나중에 넣으면 된다.
    ['fire', 'kill', 'warning', 'levelup', 'gameover'].forEach(key => this.load.audio(key, `sounds/${key}.mp3`));
    // BGM — 낮/밤 2곡(assets/bgm/bgm_day.mp3, bgm_night.mp3). 배경 사진과 같은 "5웨이브 주기"로 크로스페이드.
    this.load.audio('bgm_day', 'bgm/bgm_day.mp3');
    this.load.audio('bgm_night', 'bgm/bgm_night.mp3');
  }

  async create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    const { tower } = drawMap(this);

    // 레터박스 바 + 테두리 + 모서리 브라켓 — HUD/Controls/건설 바보다 먼저 만들어야
    // 그 아래(뒤)에 깔린다(Phaser는 depth가 같으면 생성 순서로 z가 정해진다)
    this.frame = new ScreenFrame(this);

    // 조명 = 체력바. SeoulTowerLight가 cityDamaged/cityHealed를 알아서 구독한다
    this.light = new SeoulTowerLight(this, tower.x, tower.y, 13);
    this.add.text(tower.x, tower.y - 30, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    // 골드/웨이브/계절/XP — goldChanged 등 4개 이벤트를 알아서 구독한다
    this.hud = new HUD(this);

    // ══ 코어 전환 지점 ══
    // 기본값 = 실제 GameCore.js (스텁 4개가 전부 채워져서 승격 완료, SYNC.md §2 N8).
    // `?mockcore=1`을 붙이면 전체 루프가 자동으로 도는 MockGameCore 데모 상태를 볼 수 있다
    // (UI/FX 검증·QA 용도로 남겨둔다 — SYNC.md §6-4 "Mock이 스펙이다").
    const { GameCore } = MOCK_CORE
      ? await import('../MockGameCore.js')
      : await import('../GameCore.js');
    this.core = GameCore;

    if (MOCK_CORE) {
      this.add.text(HUDT.margin, 104, 'MOCK DEMO', {
        fontSize: '12px', color: '#ff7043', fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 6, y: 3 },
      });
    }

    // instanceId → 강화 레벨(공용) — ProjectileFx/LaserFx 등 여러 이펙트가 같이 조회한다.
    // core가 방금 정해졌으니 그 이후에 만든다(N서울타워 부트스트랩에 getState() 필요).
    this.towerLevel = new TowerLevelTracker(this, this.core);

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

    // 타워별 공격 이펙트(발사~이동~소멸) — towerFired를 알아서 구독한다. PROJECTILE_CONFIG에
    // 설정된 타워만 그린다(지금은 광화문 화살만). core 불필요(§ ProjectileFx.js 상단 주석)
    this.projectileFx = new ProjectileFx(this);

    // 피격/처치 파편·팝업 + 상태이상 마커 + 장애물 발동/쿨다운 게이지 (Particles+StatusFx 통합)
    this.fx = new FxLayer(this, this.core);

    // 명중 임팩트(섬광+링+불똥) — 공용, LaserFx뿐 아니라 앞으로 DDP 폭발 등도 재사용한다
    this.impactFx = new ImpactFx(this);

    // 즉시히트 레이저(발사~페이드, 이동 없음) — LASER_CONFIG에 설정된 타워만(롯데월드타워·N서울타워).
    // 레벨별 색/두께는 towerLevel에서, 명중 임팩트는 impactFx.spawnImpact()를 그대로 재사용한다.
    this.laserFx = new LaserFx(this, this.towerLevel, this.impactFx);

    // 보스 등장/체력/코어 도달 연출 — bossSpawned·bossHpChanged·bossLeaked·bossKilled를 알아서 구독한다
    this.bossAlert = new BossAlert(this);

    // 사운드 — this.sound는 Phaser 내장 SoundManager 프로퍼티라 이름이 겹치면 안 된다(this.sfx로 둠)
    this.sfx = new SoundManager(this);

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
