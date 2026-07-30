/**
 * MockScene.js — Mock 이벤트 모니터 (?mock=1, 진단 전용)
 *
 * 역할: "이벤트가 안 오는지 / GameScene이 안 그리는지" 구분하는 도구.
 * 그래서 SeoulTowerLight·DamageNumber를 여전히 만들어 organic하게(디버그 키 없이)
 * MockGameCore가 쏘는 랜덤 이벤트에만 반응시킨다 — GameScene과 별개인 "기준 렌더러".
 * FX 검증용 수동 키(1~4/Q/W/E/T/Y 등)는 GameScene의 ?fxtest=1로 이관했다.
 */

import Phaser from 'phaser';
import mapData from '../../data/map.json';
import { EventBus, EV } from '../EventBus.js';
import { SeoulTowerLight } from '../fx/SeoulTowerLight.js';
import { DamageNumber } from '../fx/DamageNumber.js';
import { drawMap, H } from './mapView.js';
import { COLOR } from './UITheme.js';

export class MockScene extends Phaser.Scene {
  constructor() { super('Mock'); }

  async create() {
    this.cameras.main.setBackgroundColor(COLOR.bg);
    drawMap(this);

    const t = mapData.nseoulTower;
    this.light = new SeoulTowerLight(this, t.x, t.y, 13);
    this.add.text(t.x, t.y - 30, 'N서울타워', { fontSize: '13px', color: '#f2f4f8' }).setOrigin(0.5);

    this.dmg = new DamageNumber(this);

    this.statusText = this.add.text(20, 20, '', {
      fontSize: '15px', color: '#f2f4f8', lineSpacing: 6,
      backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 12, y: 10 },
    });

    this.logText = this.add.text(20, H - 24, '', {
      fontSize: '12px', color: '#8a919e', lineSpacing: 3,
      backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 8, y: 6 },
    }).setOrigin(0, 1);

    this.log = [];
    this.counts = {};

    const { GameCore } = await import('../MockGameCore.js');
    this.core = GameCore;

    // 모든 이벤트를 구독해서 로그로 흘린다 (조명·데미지 숫자 자체는 위 인스턴스가 알아서 반영)
    // 핸들러 참조를 보관했다가 shutdown 훅에서 off() — SeoulTowerLight와 동일한 패턴.
    // 안 하면 씬 재시작마다 리스너가 쌓여 로그가 중복 표시된다.
    this.eventLogHandlers = Object.values(EV).map(name => {
      const handler = payload => this.onEvent(name, payload);
      EventBus.on(name, handler);
      return { name, handler };
    });
    this.events.once('shutdown', () => {
      this.eventLogHandlers.forEach(({ name, handler }) => EventBus.off(name, handler));
    });

    GameCore.__startMock();
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.refresh() });
  }

  onEvent(name, payload) {
    this.counts[name] = (this.counts[name] || 0) + 1;
    const brief = JSON.stringify(payload ?? {});
    this.log.unshift(`${name}  ${brief.length > 90 ? brief.slice(0, 90) + '…' : brief}`);
    if (this.log.length > 12) this.log.pop();
  }

  refresh() {
    const s = this.core.getState();
    const seen = Object.keys(this.counts).length;
    const total = Object.keys(EV).length;
    this.statusText.setText([
      'MockGameCore 모니터  (?mock=1)',
      `웨이브 ${s.wave} · ${s.season}   조명 ${s.cityLight}/4`,
      `골드 ${s.gold}   Lv.${s.level}  XP ${s.xp}/${s.xpToNext}`,
      `처치 ${s.kills}   해금 타워 ${s.unlockedTowers.length}/6`,
      `수신한 이벤트 종류 ${seen}/${total}`,
    ].join('\n'));
    this.logText.setText(this.log.join('\n'));
  }
}
