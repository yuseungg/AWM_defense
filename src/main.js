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
 *   ?real=1    GameScene 안에서만 의미 있음 — MockGameCore 대신 실제 GameCore.js로 붙는다.
 *              스텁 4개(buildSupport/buildObstacle/pickDraftCard/pickPolicy)가 안 채워진 지금은
 *              레벨업·드래프트가 안 뜬다 — A가 자기 진도 확인용으로 쓴다 (HANDOFF.md §0)
 */

import Phaser from 'phaser';
import { COLOR } from './ui/UITheme.js';
import { W, H } from './ui/mapView.js';
import { GameScene } from './ui/GameScene.js';
import { MockScene } from './ui/MockScene.js';
import { VerifyScene } from './ui/VerifyScene.js';

const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';
const VERIFY = params.get('verify') === '1';

const activeScene = MOCK ? MockScene : VERIFY ? VerifyScene : GameScene;

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: COLOR.bg,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [activeScene],
});
