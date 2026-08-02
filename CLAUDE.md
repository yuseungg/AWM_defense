# CLAUDE.md — 프로젝트 계약서

> **모든 작업 세션의 시작점. 코드를 쓰기 전에 반드시 읽는다.**
> 상세 기획은 `GAME_DESIGN.md`, 내 할 일은 `TASKS_A.md` 또는 `TASKS_B.md`.
> **작업 시간이 겹치지 않는 날은 `SYNC.md`를 세션 시작 때 읽고 종료 때 쓴다.**

---

## 1. 프로젝트 개요

**서울 디펜스** — 웹 브라우저에서 돌아가는 **로그라이트 엔드리스 타워디펜스**.

서울의 실존 랜드마크를 타워로 세워 도시 문제(미세먼지·과속차량·쓰레기더미)가 코어에 도달하는 것을 막는다. 스테이지 클리어는 없고 **최대한 오래 버티는 것(도달 웨이브 = 점수)**이 목표다.

### 절대 규칙 6가지 (이 게임의 정체성)

1. **N서울타워 조명 = 체력바.** 숫자 체력바를 만들지 않는다. 4단계(파랑4→초록3→노랑2→빨강1).
2. **유니크 룰.** 랜드마크 타워·서포터 건물은 **종류당 1개**만. 장애물만 무제한.
3. **타워 공격 = 그 건물의 실제 기능 = 그 도시문제의 실제 해법.** 상성 특효 + 피드백 필수.
4. **성장 3채널을 절대 섞지 않는다.** 드래프트 = 수평 다양성 / 골드 = 수직 파워 / 보스 정책 = 스윙.
5. **건설은 무료. 골드는 강화 전용.** 판매 없음, 재배치 무료.
6. **모든 오브젝트는 실존 서울의 무언가여야 한다.** 판타지 오브젝트 금지.

---

## 2. 기술 스택 · 제약

| 항목 | 값 |
|---|---|
| 엔진 | **Phaser 3** |
| 언어 | JavaScript (ES6 모듈). **TypeScript 쓰지 않는다** |
| 빌드 | Vite |
| 배포 | **GitHub Pages** — 정적 파일만. 서버·백엔드 절대 없음 |
| 저장 | `localStorage` (최고 기록·설정) |
| 외부 통신 | **금지.** fetch·API 호출 없음. 모든 데이터는 `/data/*.json` 내장 |
| 해상도 | 1280×720 기준, 반응형 스케일 |

**성능 필수:** 적·투사체·데미지 숫자는 **오브젝트 풀링**으로 관리한다. 매 프레임 `new` 금지. 웨이브 40+에서 화면에 100개 이상 존재한다.

---

## 3. 폴더 구조 · 담당 경계 ⚠️

```
/
├── CLAUDE.md              ← 이 파일 (공용)
├── GAME_DESIGN.md         ← 기획 원본 (공용, 읽기 전용)
├── TASKS_A.md / TASKS_B.md
├── index.html
├── /data/                 ← 【공용】 스키마 변경은 반드시 합의
│   ├── map.json  towers.json  enemies.json  waves.json
│   └── supports.json  obstacles.json  perks.json  policies.json
├── /src/
│   ├── main.js            ← 【공용】 Phaser 초기화
│   ├── EventBus.js        ← 【공용】 §5
│   ├── GameCore.js        ← 【공용】 §6 인터페이스
│   ├── MockGameCore.js    ← 【A가 D1에 작성】 B 개발용 더미
│   ├── /game/             ← 【A 담당】 B는 수정 금지
│   │   ├── PathSystem.js  GridSystem.js
│   │   ├── Enemy.js  EnemyPool.js  WaveManager.js
│   │   ├── Tower.js  Projectile.js  Combat.js
│   │   ├── Obstacle.js  Supporter.js  PerkSystem.js
│   │   ├── Economy.js  LevelSystem.js  DraftSystem.js
│   │   └── Debug.js
│   ├── /ui/               ← 【B 담당】 A는 수정 금지
│   │   ├── TitleScene.js  GameScene.js  GameOverScene.js
│   │   ├── HUD.js  BuildUI.js  UpgradeUI.js
│   │   ├── DraftOverlay.js  CodexUI.js
│   │   └── Controls.js
│   └── /fx/               ← 【B 담당】 A는 수정 금지
│       ├── SeoulTowerLight.js  SkyTint.js
│       ├── DamageNumber.js  Particles.js  StatusFx.js
│       └── BossAlert.js
└── /assets/               ← 【B 담당】
```

### 경계 규칙 (가장 중요)

- **A 작업 시:** `/src/game/` 안에서만 만들고 고친다. `/src/ui/`, `/src/fx/`, `/assets/`는 **읽기만**.
- **B 작업 시:** `/src/ui/`, `/src/fx/`, `/assets/` 안에서만. `/src/game/`은 **읽기만**.
- `/data/*.json`, `EventBus.js`, `GameCore.js`, `main.js`는 **공용**. 변경이 필요하면 **작업을 멈추고 사용자에게 "상대와 합의가 필요하다"고 알린다.** (→ `SYNC.md` §3에 요청으로 올린다)
- **`/data/*.json` 소유권 분리:** 수치 필드 = A / 텍스트 필드(name·label·codex·desc) = B / 구조 변경 = 합의
- 담당 밖 파일을 고쳐야 해결되는 문제가 생기면 **직접 고치지 말고 보고한다.**

---

## 4. 데이터 스키마 (D1 최우선 확정)

**모든 밸런스 수치는 코드가 아니라 `/data/*.json`에 있다. 하드코딩 금지.**

### map.json
```json
{ "paths": [[{"x":0,"y":140},{"x":1100,"y":140},{"x":1100,"y":340},{"x":220,"y":340},{"x":220,"y":540},{"x":1140,"y":540}]],
  "core": {"x":1180,"y":540}, "nseoulTower": {"x":1220,"y":460},
  "towerGrid": {"cell":40}, "obstacleGrid": {"cell":40} }
```
`paths`가 **배열의 배열**인 이유: 후반 분기 경로 확장을 위한 자리. 지금은 `paths[0]`만 쓴다.

**⚠️ 좌표 규칙 2개 — 깨지 말 것**

1. **모든 좌표는 `40k+20` (셀 중심)에 정렬한다.** `cell:40`이므로 셀 중심은 20, 60, 100, 140 … 이다.
   경로 중심선이 셀 **경계**에 걸리면 §5-3의 장애물 스냅이 모호해지고 배치 미리보기가 반 칸 어긋난다.
   좌표를 수정할 때 이 규칙을 반드시 유지한다.
2. **경로 총 길이 = 3,300px (1280×720 기준).** `enemies.json`의 `speed`는 이 길이를 기준으로 산정한다.
   목표: 기본 적 완주 **25~30초**. (구 경로 685px 기준 수치를 그대로 쓰면 완주 131초가 되어 게임이 성립하지 않는다)

### towers.json
```json
"cheonggyecheon": {
  "id":"cheonggyecheon","name":"청계천","role":"cc",
  "damage":5,"attackSpeed":0.8,"range":140,
  "projectileType":"aoe_water","aoeRadius":60,
  "effects":[{"type":"slow","amount":0.4,"duration":2.0}],
  "strongAgainst":{"dust":2.0},
  "upgradeBaseCost":80,
  "levels":[
    {"label":"복개도로","tint":"#8a8f99","scale":1.0,"costMul":1.0,"statMul":1.0},
    {"label":"청계고가도로","tint":"#6f9bd1","scale":1.1,"costMul":1.5,"statMul":1.6},
    {"label":"복원 하천","tint":"#3fa7d6","scale":1.2,"costMul":2.5,"statMul":2.5}
  ],
  "unlockLevel":1,
  "codex":"2005년 복원. 물 분사는 실제로 대기 중 분진을 억제한다."
}
```
`unlockLevel` = 이 레벨에 도달하면 **자동 해금**(선택 없음). N서울타워는 `unlockLevel: 0` = 항상 존재.

### enemies.json
```json
"trash": {"id":"trash","name":"쓰레기더미","archetype":"tank",
  "baseHp":150,"speed":25,"armor":5,"reward":20,"pierceDamage":2,"xp":5,
  "sprite":"trash","codex":"폐기물 처리·분리배출·자원순환."}
```
`pierceDamage` = 코어 도달 시 깎는 **조명 단계 수** (체력은 4단계뿐). 보스는 2.

### waves.json
```json
{"hpScale":1.08,"countScalePerWaves":3,
 "seasons":[{"from":1,"to":10,"name":"봄","mix":{"dust":0.8,"car":0.2,"trash":0.0}}],
 "boss":{"everyWaves":5,"baseHp":400,"hpMulPerBoss":1.15},
 "xp":{"levelBase":20,"levelGrowth":1.3},
 "buildXp":{"tower":3,"support":2,"obstacle":2}}
```

### supports.json
```json
"sewoon": {"id":"sewoon","name":"세운상가",
  "effect":{"type":"auraRange","value":0.25,"radius":150},
  "unique":true,"upgradeBaseCost":100,
  "levels":[{"statMul":1.0},{"statMul":1.4,"costMul":1.5},{"statMul":2.0,"costMul":2.5}],
  "codex":"전자상가 도시재생, 다시세운 공중보행데크."}
```
- **세운상가 = 오라형** (반경 내 타워 사거리 +25%) → 배치 위치가 중요
- **서울시청 = 전역형** (처치 골드 +25%) → 위치 무관
- 둘 다 `unique:true`. **획득 시 드래프트 풀에서 제거**한다.

### obstacles.json
```json
"log": {"id":"log","name":"통나무",
  "effect":{"type":"stun","duration":1.0,"cooldown":3.0},
  "placeOn":"path","upgradeBaseCost":40,
  "levels":[{"duration":1.0},{"duration":1.5,"costMul":1.5},{"duration":2.0,"costMul":2.5}]}
```
- **경로 위 격자**에 스냅, **한 셀 1개**(중복 불가 → 무한 스턴 차단)
- 드래프트 픽 1회당 1개 설치. 카드는 반복 등장(무제한)
- `cooldown` = 내부 재장전. 발동 후 그 시간 동안 비활성

### perks.json
```json
"power_up": {"id":"power_up","name":"공격력 강화",
  "effect":{"type":"globalDamage","value":0.10},"stackable":true}
```
3종: `globalCrit`(+5%, **100% 상한**) · `globalDamage`(+10%) · `globalPierce`(+5). 전부 누적.

### policies.json
```json
"car_rotation": {"id":"car_rotation","name":"차량 2부제",
  "effect":{"type":"enemySpawnMul","target":"car","value":0.6,"duration":3},
  "desc":"고농도 미세먼지 비상저감조치."}
```
`duration` 단위는 **웨이브 수**. `-1`이면 영구.

---

## 5. 핵심 계산 규칙 ⚠️ 기획서에 없던 부분 — 여기가 유일한 기준

### 5-1. 데미지 공식 (순서 고정)

```js
// 1) 기본 피해 (강화 레벨 반영)
let dmg = tower.damage * tower.levels[lv].statMul;
// 2) 상성 특효
const eff = def.strongAgainst?.[enemy.type] ?? 1.0;
dmg *= eff;
// 3) 전역 공격력 퍼크 (누적)
dmg *= (1 + perks.globalDamage);          // 예: 0.10 × 3장 = 0.30
// 4) 크리티컬 판정 (확률 100% 상한)
const critChance = Math.min(1.0, perks.globalCrit);  // 픽당 +0.05, 최대 1.0
const isCrit = Math.random() < critChance;
if (isCrit) dmg *= 2;
// 5) 방어력 차감 (관통 퍼크로 무시)
const armor = Math.max(0, enemy.armor - perks.globalPierce);
// 6) 최종
const final = Math.max(1, Math.round(dmg) - armor);
```

- **`isEffective = eff > 1.0`** → `enemyDamaged` 이벤트에 실어 보낸다. B가 노란 숫자 + "효과가 굉장했다!" 를 띄운다.
- **`isCrit`** → B가 큰 숫자로 표시.
- **최소 피해는 항상 1.** 방어력이 아무리 높아도 0데미지는 안 나온다.

### 5-2. 오라 버프 재계산 (세운상가)

**매 프레임 거리 계산 금지.** 이벤트 기반으로 한 번씩만 돈다.

```js
recalculateBuffs() {
  towers.forEach(t => t.resetToBase());
  supports.filter(s => s.effect.type.startsWith('aura'))
          .forEach(s => towers.filter(t => dist(s,t) <= s.effect.radius)
                              .forEach(t => t.applyBuff(s.effect)));
  applyGlobalEffects();   // perks + 전역형 서포터 + 정책
}
```
**호출 시점:** 타워 건설·재배치 / 서포터 건설·재배치·강화 / 퍼크 획득 / 정책 획득 / 타워 강화

같은 종류 서포터가 유니크라 **스택 예외 처리가 필요 없다.**

### 5-3. 격자 스냅

| 격자 | 대상 | 규칙 |
|---|---|---|
| **경로 밖 슬롯 격자** | 랜드마크 타워 · 서포터 건물 | **2×2(4칸)**, 앵커(좌상단) 기준 |
| **경로 위 격자** | 장애물 | 한 칸 1개(1×1 유지 — 경로 폭이 1칸이라 커지면 배치 불가 지점이 급증하고, "한 칸 1개" 무한 스턴 방지 규칙과도 충돌) |

체감은 자유 배치, 내부는 셀 스냅. 유효성 검사는 **`footprint 전 칸이 비었나?` 불린 하나**(1×1일 땐 칸 하나, 2×2일 땐 네 칸 전부).
크기는 `GridSystem.js`가 export하는 `FOOTPRINT = { tower: 2, support: 2, obstacle: 1 }` 하나로만 관리한다 — A(`/src/game`)·B(`/src/ui`,`/src/fx`) 양쪽이 이 상수를 참조하고, 숫자를 각자 하드코딩하지 않는다.

### 5-4. 조명 체력

- 시작 4(파랑). 적 코어 도달 시 `pierceDamage`만큼 하강
- **1(빨강)에서 추가 피격 → 게임오버**
- 한 웨이브를 **관통 0**으로 막으면 **1단계 회복**(최대 4)
- **보스 코어 도달:** 쿵 + 화면 흔들림 + 보스 소멸, 조명 **2단계 하강**. **정책 보상 없음.**
  → 노랑(2) 이하에서 보스 관통 시 게임오버
- **웨이브 = 고정 스폰 세트.** 무한 생성 없음. 스폰된 적이 전부 정리(처치 또는 관통)되면 웨이브 종료.
  **보스도 그 세트의 일부다** — 보스를 놓쳐도 웨이브는 끝난다

### 5-5. XP · 레벨

```
레벨 N→N+1 필요 XP = round(20 × 1.3^(N-1))   // 20, 26, 34, 44, 57 ...
```
- 처치 XP: 미세먼지 1 / 과속차량 2 / 쓰레기더미 5 / 보스 20
- 건설 XP: 랜드마크 타워 +3 / 서포터·장애물 +2
- 레벨업 시 **①`unlockLevel`이 맞는 타워 자동 해금 ②드래프트 3장 제시** 를 동시에 발행

**⚠️ 드래프트는 3장이다 (5장 아님). [✅ A 승인 2026-07-28]**
풀 = 서포터 2(유니크, 획득 시 제거) + 장애물 2(반복) + 퍼크 3(누적) = **7종**.
7종에서 5장을 뽑으면 서포터를 다 획득한 뒤 남은 풀이 5종이 되어 **매번 같은 5장이 나온다 = 선택이 사라진다.**
3장이면 조합 35가지가 유지되고, 카드 폭을 키워 "실제 근거 한 줄"(교육 2층)을 읽히게 넣을 수 있다.
카드 수는 `waves.json`의 `draftCardCount` / `policyCardCount`로 관리한다.

### 5-6. `unlockLevel` 매핑 [✅ A 승인 2026-07-28]

| 레벨 | 자동 해금 | 근거 |
|---|---|---|
| 0 | N서울타워 | 시작 시 존재 |
| 1 | 청계천 | 미세먼지 특효 ×2.0 → 초반 상성 학습 |
| 2 | 광화문 | 범용 딜. 안전판 |
| 3 | DDP | 광역. 스웜 대응 |
| 4 | 롯데월드타워 | 쓰레기더미 특효. 탱커 등장 시점과 맞춤 |
| 5 | 서울숲 | 오라형. 배치 이해도가 필요해서 마지막 |

---

## 6. 인터페이스 (A ↔ B 유일한 통신)

### 6-1. 이벤트 버스 (A 발행 → B 구독)

```js
// /src/EventBus.js
import Phaser from 'phaser';
export const EventBus = new Phaser.Events.EventEmitter();
```

| 이벤트 | 페이로드 |
|---|---|
| `enemySpawned` | `{ id, type, x, y }` |
| `enemyDamaged` | `{ id, amount, x, y, isEffective, isCrit }` |
| `enemyKilled` | `{ id, type, reward, xp, x, y }` |
| ~~`enemyStunned`~~ → `statusApplied` | `{ enemyId, type: 'stun'\|'dot'\|'slow', duration }` ⭐ |
| `cityDamaged` | `{ level }` — 4→3→2→1 |
| `cityHealed` | `{ level }` |
| `goldChanged` | `{ gold, delta }` |
| `xpChanged` | `{ xp, level, xpToNext }` |
| `levelUp` | `{ level, unlockedTower, draftCards[] }` — **3장** |
| `cardPicked` | `{ cardId }` |
| `waveStarted` | `{ wave, season }` |
| `waveCleared` | `{ wave, perfect }` |
| `bossSpawned` | `{ hp, wave }` |
| `bossKilled` | `{ policyCards[] }` — 3장 (처치 시) |
| `bossLeaked` | `{ x, y }` — 보스가 코어 도달. B가 쿵+흔들림+소멸 연출 |
| `seasonChanged` | `{ season }` |
| `buffsRecalculated` | `{ towerStats[] }` |
| `gameOver` | `{ wave, kills, level, isNewRecord }` |
| `bossHpChanged` | `{ hp, maxHp }` ⭐ — 보스 체력 표시 (금지 규칙은 **도시** 체력바에만 적용) |
| `objectBuilt` | `{ kind, id, instanceId, cellX, cellY, x, y }` ⭐ — 배치 "쿵" 스쿼시 연출 |
| `objectChanged` | `{ instanceId, action: 'upgraded'\|'relocated', level }` ⭐ — 역사 변천 색조·재배치 |
| `actionRejected` | `{ action, reason, message }` ⭐ — **없으면 실패가 "클릭이 씹힌 것"처럼 보인다** |
| `obstacleTriggered` | `{ instanceId, type, x, y, cooldown }` ⭐ — 통나무 발동 + 쿨다운 게이지 |
| `towerFired` | `{ instanceId, towerId, x, y, targetX, targetY }` ⭐ — 타워 발사 반동 애니메이션용 (`SYNC.md` §3 C8) |

⭐ = **[✅ A 승인 2026-07-28]** `SYNC.md` §3 C3. 이벤트 이름은 `EventBus.js`의 `EV` 상수를 쓴다 (리터럴 문자열 금지).

### 6-2. GameCore 인터페이스 (B → A) — 시그니처 변경 금지

**D1에 A가 먼저 만들고 커밋한다.**

**규약 3개 [✅ A 승인 2026-07-28]**

1. **좌표 단위 = 셀 인덱스.** `cellX = Math.floor(px / 40)`. 픽셀→셀 변환 책임은 **B**에게 있다.
2. **반환값 = `{ ok, reason?, instanceId? }`.** `canBuild`도 boolean이 아니다 —
   boolean만 오면 UI가 **"왜 안 되는지"를 표시할 수 없다.**
   `reason` 목록: `'occupied'` `'unique'` `'locked'` `'noGold'` `'notOnPath'` `'onPath'` `'noPick'` `'outOfBounds'`
   (`outOfBounds`는 타워·서포터가 2×2로 커지면서 추가됨 — 앵커 셀 기준 footprint가 격자 밖으로 나가는 경우)
3. **`getState()`는 매 프레임 호출 금지.** 씬 진입 · 오버레이 열 때 · `?debug=1` 에서만.
   실시간 갱신은 전부 이벤트로 한다 (§2 성능 조항).
   `instanceId` 형식은 `"cheonggyecheon#1"` (id + `#` + 순번).

```js
export const GameCore = {
  buildTower(towerId, cellX, cellY) {},        // 무료. 유니크·해금 검사
  buildSupport(supportId, cellX, cellY) {},    // 무료. 종류당 1개
  buildObstacle(obstacleId, cellX, cellY) {},  // 무료. 경로 격자, 픽당 1개
  relocate(instanceId, cellX, cellY) {},       // 재배치 (무료)
  upgrade(instanceId) {},                      // 골드 소모. 강화 전용
  pickDraftCard(cardId) {},                    // 레벨업 드래프트 결과
  pickPolicy(policyId) {},                     // 보스 정책 결과
  startNextWave() {},                          // 즉시 웨이브 (보너스 골드)
  setSpeed(n) {}, setPaused(bool) {},
  canBuild(id, cellX, cellY) {},               // → { ok, reason } (boolean 아님)
  getState() {}   // { gold, xp, level, xpToNext, wave, season, cityLight,
                  //   towers[], supports[], obstacles[], perks{}, policies[],
                  //   unlockedTowers[], kills, bestWave, isPrepPhase }
};
```

### 6-3. Mock 레이어 — 병렬 작업의 핵심 ⭐

**D1에 A가 `MockGameCore.js`를 만든다. B가 이걸 기다린다 — A의 최우선 작업.**

타이머로 가짜 이벤트만 발행한다(실제 로직 없음). B는 `?mock=1`로 실행해 **실제 코어가 한 줄도 없어도** HUD·드래프트·조명·이펙트를 전부 완성할 수 있다. 실제 코어 완성 시 import 한 줄 교체.

**Mock과 실제 동작이 다르면 실제 코어가 정답이다. Mock을 고친다.**

---

## 7. 코딩 규칙

- **밸런스 수치 하드코딩 금지.** 전부 `/data/*.json`에서 읽는다
- **오브젝트 풀링 필수** (적·투사체·데미지 숫자)
- 한 파일 300줄 넘으면 분리를 제안한다
- 주석은 **왜**를 쓴다. 무엇을 하는지는 코드가 말한다
- 함수·변수명은 영어, 사용자에게 보이는 문자열은 한국어
- `console.log`는 `DEBUG` 플래그로 감싼다

### 타겟팅 (변경 금지)
**First 모드 단일 고정.** 사거리 내 적 중 `pathProgress`가 최대(코어에 가장 가까운) 적을 공격. 다른 타겟팅 모드는 구현하지 않는다.

### 디버그 모드 — 최우선 구현
`?debug=1`로 활성화 (A 영역):
- `1~9` 웨이브 점프 · `G` 골드 +1000 · `X` XP +500(레벨업 강제)
- `K` 화면의 적 전멸 · `H` 무적 토글 · 배속 5x/10x 해금

`?fxtest=1` = FX 검증 키 (B 영역, `GameScene.js`). 조명·데미지 숫자 상수 튜닝용 —
`?debug=1`의 숫자 키(웨이브 점프)와 겹치면 서로 무력화되므로 완전히 분리된 플래그를 쓴다.

**개발 편의 기능이 아니라 일정을 지키는 장치다.** 밸런싱 하루를 이걸로 산다.

---

## 8. 절대 하지 말 것

- ❌ 담당 폴더 밖 파일 수정 (§3)
- ❌ 서버·백엔드·외부 API 호출
- ❌ TypeScript 도입, 새 프레임워크·상태관리 라이브러리 추가
- ❌ 밸런스 수치 하드코딩
- ❌ 숫자 체력바 만들기 (조명이 체력바다)
- ❌ 건물 판매 기능 (재배치만 있다)
- ❌ 스코프에 없는 기능 추가 — 좋은 아이디어는 코드 대신 `TASKS_*.md`의 "v2 아이디어"에 적는다
- ❌ AI가 준 코드를 통짜로 한 번에 커밋

---

## 9. 스코프

**포함:** 서울 1맵·S자 경로 1개 / N서울타워(고정) + 랜드마크 5(자동 해금) / 서포터 2 / 장애물 2 / 부가효과 3 / 정책 5 / 적 3 + 보스 / 레벨업 드래프트 3장·골드 강화·보스 정책 3채널 / 유니크 룰·상성 특효·조명 체력·하늘 틴트 / 계절 4 / 날짜 시드·시각/계절 반영 / 배속·즉시웨이브·사거리표시·디버그 / 역사 변천(색조+자막)

**제외(v2):** 도시 순환·다중 경로·분기 / 캐릭터·액티브 스킬 / 영구 성장·갸챠·상점 / 글로벌 리더보드·업적·사운드 풀세트 / 랜덤 기상 / 서포터·장애물 추가 종류

---

## 10. Git 규칙

- 브랜치: A = `feat/game-core`, B = `feat/ui`
- **같이 일하는 날:** 하루 3회 싱크(13시/19시/취침 전)에 `main` 머지
- **시간이 어긋나는 날:** **세션 단위**로 머지 + `SYNC.md` 기록 (→ `SYNC.md` §6-2)
- 어느 쪽이든 **세션 하나 끝날 때마다 머지**한다. 격차가 벌어지면 충돌이 폭발한다
- `main`은 **항상 실행 가능**해야 한다. 깨진 채로 push 금지
- 커밋은 **기능 단위로 잘게**. 공모전 심사에 커밋 기록이 포함된다
- 메시지: `feat: First 타겟팅 구현` / `fix: 투사체 풀 반환 누락` / `balance: 미세먼지 체력 20→18`
