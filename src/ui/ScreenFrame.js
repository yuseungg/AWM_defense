/**
 * ScreenFrame.js — "진짜 게임" 느낌을 주는 화면 틀 (레터박스 바 + 테두리 + 모서리 브라켓)
 *
 * HUD/Controls/BuildUI가 맨 캔버스 위에 텍스트만 떠 있어서 데모처럼 보인다는 피드백 반영.
 * 상/하단 레터박스 바를 깔아 그 안의 UI가 "붙어 있는" 패널처럼 보이게 하고, 화면 전체를
 * 얇은 액센트 테두리 + 모서리 브라켓으로 감싼다.
 *
 * ★ 생성 순서 중요: GameScene.create()에서 drawMap() 직후, HUD보다 먼저 만들어야 한다.
 *   Phaser는 depth가 같으면 생성 순서로 z-index가 정해지는데, 이 프레임은 지도 위·
 *   나머지 UI 아래에 있어야 한다. 바 높이(FRAME.topBarHeight/bottomBarHeight)는 HUD·
 *   Controls·건설 바가 전부 그 안에 들어오도록 잡아뒀다 — UI 레이아웃을 바꾸면 같이 맞춘다.
 */

import { COLOR, FRAME } from './UITheme.js';
import { W, H } from './mapView.js';

export class ScreenFrame {
  constructor(scene) {
    const g = scene.add.graphics();

    // 상/하단 레터박스 바
    g.fillStyle(0x000000, FRAME.barAlpha);
    g.fillRect(0, 0, W, FRAME.topBarHeight);
    g.fillRect(0, H - FRAME.bottomBarHeight, W, FRAME.bottomBarHeight);

    // 바와 플레이 영역의 경계선 — 붙어있는 패널처럼 보이게 하는 핵심
    g.lineStyle(1, FRAME.barBorderColor, FRAME.barBorderAlpha);
    g.lineBetween(0, FRAME.topBarHeight, W, FRAME.topBarHeight);
    g.lineBetween(0, H - FRAME.bottomBarHeight, W, H - FRAME.bottomBarHeight);

    // 화면 전체 테두리 — "창틀" 느낌
    g.lineStyle(FRAME.borderWidth, COLOR.accent, FRAME.borderAlpha);
    g.strokeRect(1, 1, W - 2, H - 2);

    // 모서리 브라켓 4개
    g.lineStyle(FRAME.bracketWidth, COLOR.accent, FRAME.bracketAlpha);
    this.drawBracket(g, 0, 0, 1, 1);
    this.drawBracket(g, W, 0, -1, 1);
    this.drawBracket(g, 0, H, 1, -1);
    this.drawBracket(g, W, H, -1, -1);

    this.gfx = g;
  }

  /** (x,y) 모서리에서 (dx,dy) 방향(안쪽)으로 뻗는 L자 브라켓 하나 */
  drawBracket(g, x, y, dx, dy) {
    const len = FRAME.bracketLength, off = FRAME.bracketInset;
    g.beginPath();
    g.moveTo(x + dx * off, y + dy * (off + len));
    g.lineTo(x + dx * off, y + dy * off);
    g.lineTo(x + dx * (off + len), y + dy * off);
    g.strokePath();
  }

  destroy() {
    this.gfx.destroy();
  }
}
