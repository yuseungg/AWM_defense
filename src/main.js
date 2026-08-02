/**
 * main.js — Phaser 부트
 *
 * ⚠️ 이 파일은 CLAUDE.md §3상 【공용】이다. 구조 변경은 SYNC.md §3에 올린다.
 * 씬 로직은 전부 /src/ui/*.js로 옮겼다 — 여기는 URL 플래그로 씬을 고르고 부트하는 것만 한다.
 *
 *   (기본)     GameScene   — 실제 게임 화면
 *   ?mock=1    MockScene   — Mock 이벤트 모니터(진단용, "이벤트가 안 오는지" 확인)
 *   ?verify=1  VerifyScene — 경로 검증 화면(격자 정렬·완주 시간 자동 검사)
 *   ?fxtest=1  GameScene 안에서만 의미 있음 — 조명·데미지 숫자 FX 검증 키 (B 영역)
 *   ?debug=1   GameScene 안에서만 의미 있음 — 웨이브 점프 등 (A 영역, CLAUDE.md §7)
 *   ?mockcore=1 GameScene 안에서만 의미 있음 — 기본값(실제 GameCore.js) 대신 전체 루프가 자동으로
 *              도는 MockGameCore 데모로 붙는다(SYNC.md §2 N8, UI/FX 검증·QA 용도)
 */

import Phaser from 'phaser';
import { COLOR } from './ui/UITheme.js';
import { W, H } from './ui/mapView.js';
import { TitleScene } from './ui/TitleScene.js';
import { GameScene } from './ui/GameScene.js';
import { MockScene } from './ui/MockScene.js';
import { VerifyScene } from './ui/VerifyScene.js';
// Debug.js는 자기완결형이다 — window keydown을 스스로 등록하고 ?debug=1도 스스로 확인한다.
// 여기서는 모듈을 로드만 시켜준다(부수효과 목적 import). CLAUDE.md §7.
import './game/Debug.js';

// 사운드 파일이 아직 없을 때(SoundManager.js §5)의 개발 서버 전용 함정: 이미지는 없으면 서버가
// 깔끔하게 404를 줘서 Phaser의 loaderror로 조용히 잡히는데, vite dev 서버는 없는 sounds/*.mp3
// 요청에 SPA 폴백으로 index.html(200)을 돌려준다 — Phaser가 그 HTML을 오디오로 디코드하려다
// 캐치 안 되는 rejection을 던진다(GitHub Pages 배포본은 진짜 404라 이 문제가 없다, 개발 전용).
window.addEventListener('unhandledrejection', (e) => {
  if (String(e.reason).includes('decode audio data')) e.preventDefault();
});

const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const VERIFY = params.get('verify') === '1';
const DEBUG = params.get('debug') === '1';
const FXTEST = params.get('fxtest') === '1';

// 검증 중엔 타이틀 클릭이 매번 낭비다 — ?debug=1/?fxtest=1이면 타이틀을 건너뛰고 바로 GameScene으로 들어간다.
const SKIP_TITLE = DEBUG || FXTEST;

let scenes;
if (MOCK) scenes = [MockScene];
else if (VERIFY) scenes = [VerifyScene];
else if (SKIP_TITLE) scenes = [GameScene];
else scenes = [TitleScene, GameScene]; // Phaser는 배열의 첫 씬을 자동 시작한다 — Title에서 scene.start('Game')으로 전환

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: COLOR.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: scenes,
});
