# HANDOFF.md — B 부재(D6~D7) 인계 문서

> **이 문서는 골격 문서다.** D3까지 기능이 끝날 때마다 채워 넣는다 — 시간이 끊겨도
> 이 시점까지의 인계 내용은 항상 최신 상태로 존재한다.
> 경계 해제 조건·소유권 규칙은 `CLAUDE.md` §3·`SYNC.md` §1이 원본이다. 여기는 그걸
> "지금 당장 뭘 해야 하는가" 관점으로 재구성한 것.

---

## 0. 현재 상태 한눈에

**완성된 것**
- `/src/fx/SeoulTowerLight.js` — 조명 4단계, 색 보간·플래시·맥동·회복 연출
- `/src/fx/DamageNumber.js` — 오브젝트 풀링(200개), 색(특효)/크기(크리) 직교 분리
- `/src/fx/EnemyView.js` — 적 화면 표시(archetype별 도형, 오브젝트 풀링). 실제 코어=`EnemyPool.getActive()`
  폴링 / Mock=`PathSystem` 자체 보간, 생성 시점에 한 번만 분기 (D4 신규, §0 하단 참고)
- `/src/fx/TowerView.js` — 타워 화면 표시(`towers.json` id별 색), `objectChanged`(upgraded)로 tint/scale
  갱신해 역사 변천 표현. 유니크 룰로 최대 6개뿐이라 풀링 불필요 (D4 신규)
- `/src/ui/GameScene.js` — 기본 화면(지도+조명+데미지숫자+HUD+드래프트+타워/적 렌더러 연결)
- `/src/ui/HUD.js` — 골드/웨이브·계절/레벨+XP바
- `/src/ui/DraftOverlay.js` — 레벨업 3장/보스 정책 3장, 큐 처리, "코어 실패해도 안 멈춤" 안전판
- `/src/ui/Controls.js` — 배속 1x/2x/3x·일시정지·즉시 다음 웨이브. pause 소유권 규칙은 §5 참고
- `/src/ui/GameOverScene.js` — 결과 화면(웨이브 크게·신기록 연출). 실제 Phaser 씬 전환이 아니라 오버레이 컴포넌트(§5 참고)
- `/src/ui/MockScene.js`(`?mock=1`), `/src/ui/VerifyScene.js`(`?verify=1`), `/src/ui/mapView.js`(공유 지도 렌더링)
- `/src/ui/BuildUI.js` — 건물 선택 바 + 배치 미리보기 + 사거리/오라 원. **절대 사수 6개 전부 완료**
- `/src/main.js` — Phaser 부트 전용(URL 플래그로 씬 선택만 함)
- **에셋 자동 교체 파이프라인** — `vite.config.js`의 `publicDir: 'assets'` + `GameScene.preload()`의
  `loaderror` 처리 + `TowerView`/`EnemyView`의 `textures.exists()` 폴백. `assets/towers/<id>.png`·
  `assets/enemies/<type>.png`를 Git에 올리기만 하면 코드 변경 없이 반영된다(§6 참고, 실제 PNG로 검증 완료)
- A: `/src/game/` 9종 완성 — `PathSystem`·`GridSystem`·`Enemy`·`EnemyPool`·`Tower`·`Projectile`·`Combat`·`Economy`·`WaveManager`
- `/src/GameCore.js` — A가 1단계 구현 완료(`buildTower`/`canBuild`/`upgrade`/`relocate`/`getState`/`setSpeed`/`setPaused`/`startNextWave`).
  `buildSupport`/`buildObstacle`/`pickDraftCard`/`pickPolicy` 4개는 스텁(`{ok:false, reason:'notImplemented'}`)

**✅ 절대 사수 6개는 D3에 완료.** 일정이 바뀌어 작업일이 5일로 늘면서 D4부터 오브젝트 렌더러 +
에셋 파이프라인을 추가로 작업 중이다(§1 표 참고, `SYNC.md` §1도 동일하게 갱신됨).

**🔴 D4 발견 — `GameScene.js`에 Phaser `update(time, delta)`가 없어서 실제 코어가 멈춰 있었다.**
`GameCore.js`의 `update(deltaMs)`는 `WaveManager.update()`를 돌려서 웨이브 타이머·적 이동·투사체·
타워 발사를 전진시키는 **매 프레임 호출 계약**인데, 아무도 이걸 부르지 않고 있었다 — Mock은 자체
`setInterval`로 돌아가서 이 문제가 지금까지 안 보였다. `EnemyView`를 실제 코어로 검증하다가 "적이
전혀 안 움직인다"에서 발견했다. `GameScene.js`에 `update(time, delta) { this.core?.update?.(delta); }`
한 줄을 추가해서 고쳤다(Mock엔 `.update()`가 없어서 `?.`로 안전하게 건너뜀). **이전 세션의 "실제
코어 스모크 테스트 통과" 기록은 이 버그 때문에 불완전한 검증이었다** — 타워 배치·이벤트 발행까지는
됐지만 시간 기반 시뮬레이션(웨이브 진행·적 이동)은 실제로 돈 적이 없었다.

**GameCore.js는 이제 저장소에 있지만, 아직 기본값이 아니다 — `?real=1`로 언제든 확인할 수 있다.**

A가 D4 세션에 "GameScene 코어 스왑을 자기가 하겠다"고 제안했지만, 아직 이르다고 판단해 보류했다
(§2 A에게 보내는 항목 참고). 대신 통째로 바꾸는 대신 **URL 플래그로 분기**해서, 기본값은 여전히
Mock(전체 루프가 보이는 데모 상태 유지)으로 두고 A가 `?real=1`로 자기 진도를 그때그때 확인할 수 있게
했다. 화면 좌상단에 빨간 "REAL CORE" 배지가 뜨면 실제 코어로 도는 중이라는 뜻이다.

- **분기 방법(스왑 아님)**: `GameScene.js` 75~83번째 줄 `// ══ 코어 전환 지점 ══` — 기본값은
  `MockGameCore.js`, `?real=1`이면 `GameCore.js`. **기본값을 실제 코어로 승격시킬 때가 오면**
  삼항의 기본값 쪽(`: await import('../MockGameCore.js')`) 한 줄만 `GameCore.js`로 바꾸면 된다.
- **전환(승격) 판단 기준**: `GameCore.js`의 스텁 4개(`buildSupport`/`buildObstacle`/`pickDraftCard`/
  `pickPolicy`)가 전부 실제로 구현돼서 `{ok:true}`를 반환할 때. 구체적인 선행 순서는 §2
  "A에게 보내는 항목"에 있다 — LevelSystem → DraftSystem → Supporter/Obstacle.
- **`?real=1` 검증 결과(D4, 이 시점 `main`의 `GameCore.js` 기준 — 아래 LevelSystem 단락 참고)** —
  되는 것: 타워 배치(`BuildUI`+`TowerView`)·적 스폰과 이동(`EnemyView` 폴링, `update()` 수정 덕분에
  실제로 돎)·웨이브 진행·전투(데미지 숫자·상성)·골드 경제·조명 체력·배속/일시정지/즉시웨이브·
  **보스전(정책 카드 3장은 `WaveManager.js`가 자체 구현해서 실제로 뜬다)**까지 콘솔 에러 없이 정상
  동작. 안 되는 것: 서포터/장애물 배치·정책 픽 효과 적용(스텁이라 정책 카드는 뜨지만 골라도 효과 없음).
- **🚨 `LevelSystem.js`(A가 D4에 `feat/game-core`에 올림, 아직 `main`엔 없음) + `DraftOverlay.js` 안전판
  (D4, 이미 `main`에 있음)**: A가 XP/레벨/`unlockedTowers` 자동 해금을 구현했다(N4 권장 순서 1번).
  그런데 `levelUp`의 `draftCards`가 항상 빈 배열이라(`DraftSystem` 다음 단계), 그 상태로
  `DraftOverlay`가 열리면 **화면이 어두워진 채 영구 정지**하는 버그가 있었다 — B가 미리 발견해서
  `DraftOverlay.show()`에 "카드 0장이면 안 연다" 가드를 추가해뒀다(이미 `main`에 반영됨, SYNC.md
  §2 N5). **`LevelSystem.js` 자체는 아직 이 저장소에 없다** — A의 브랜치에만 있고, 우리 정책상
  `feat/game-core`를 통째로 병합하지 않으므로(§0 상단 경고 참고), `GameCore.js` 때와 같은 방식으로
  이 파일만 골라 가져와야 반영된다.

**⚠️ `feat/game-core` 브랜치를 그대로 병합하지 말 것.** 그 브랜치의 `main.js`는 B가 D2에 리팩터링
(GameScene/MockScene/VerifyScene/mapView.js 분리)하기 **이전** 시점 기준이다. A가 브랜치에 추가한
`?core=1` 검증 모드도 그 구식 `main.js` 안에 새 씬 클래스를 직접 넣는 방식이라, 브랜치를 통째로
병합하면 이 리팩터링이 지워진다. `/src/game/*.js` 9종은 세션 5 통합 때 이미 `main`에 들어와 있었고,
**빠져있던 건 `GameCore.js` 하나뿐**이라 그것만 B가 가져왔다. A는 지금 `main`에 있는 파일들 위에
계속 작업하면 되고(내용은 A가 짠 것과 동일), `main.js` 구조는 현재(B가 리팩터링한) 버전이 기준이다.

**사소한 발견**: 실제 `WaveManager`는 시작 시 `season`이 `null`이라 HUD에 "웨이브 0 · null"로 잠깐
뜬다(Mock은 `'봄'`으로 초기화됨). 첫 웨이브 시작하면 정상화된다 — 급하면 `WaveManager`에서 초기
season을 `waves.json`의 첫 시즌으로 잡으면 된다.

---

## 1. URL 플래그 6종

| 플래그 | 씬 | 용도 | 소유 |
|---|---|---|---|
| (기본, 없음) | `GameScene` | 실제 게임 화면(`MockGameCore`로 동작) | 공용 |
| `?mock=1` | `MockScene` | Mock 이벤트 모니터(진단용) — "이벤트가 안 오는지 vs UI가 안 그리는지" 구분. `GameScene`과 무관한 별도 씬(변경 없음) | B |
| `?verify=1` | `VerifyScene` | 경로 검증 — 격자 정렬(40k+20)·완주 시간 자동 검사. `speed` 튜닝 시 유일한 회귀 검증 화면 | 공용(A가 주로 씀) |
| `?fxtest=1` | `GameScene` 내부 | FX/드래프트 검증 키 | **B 영역** |
| `?debug=1` | `GameScene` 내부 | 웨이브 점프(1~9)·골드(G)·XP(X)·적전멸(K)·무적(H)·배속 (`CLAUDE.md` §7) | **A 영역** |
| `?real=1` | `GameScene` 내부 | **D4 신규.** `MockGameCore` 대신 실제 `GameCore.js`로 붙는다. 화면 좌상단에 빨간 "REAL CORE" 배지가 뜬다. A가 자기 진도 확인용(§0 참고) | A |

`?fxtest=1`과 `?debug=1`은 숫자 키가 겹치면 서로 무력화되므로 **완전히 분리된 플래그**다. 서로 조합해서 켜도 무방(각 씬이 무관한 플래그는 무시). `?real=1`은 숫자 키를 안 쓰므로 `?debug=1`과 같이 켜도 안전하다(`?real=1&debug=1`).

---

## 2. 검증 키 전체 목록 (`?fxtest=1`)

### 조명 — `SeoulTowerLight`
| 키 | 확인하는 것 |
|---|---|
| `1`~`4` | 특정 레벨로 강제 전환 — 4단계 색 보간이 전부 정상인지 |
| `0` | 소등 — 게임오버 직전 상태의 색상 |
| `B` | 2단계 하강(보스 시뮬) — 델타=2 플래시가 델타=1보다 확실히 강한지(보스 관통 시그널 구분) |
| `R` | 1단계 회복 — 회복 플래시(초록)가 피격 플래시(빨강)와 색으로 구분되는지 |
| `S` | 씬 재시작 — `EventBus` 리스너 누수 확인(반복 재시작해도 로그 중복 안 되는지) |
| `P` | `MockGameCore` 일시정지/재개 — 배경 랜덤 이벤트를 꺼서 다른 키 테스트가 안 헷갈리게 |

### 데미지 숫자 — `DamageNumber`
| 키 | 확인하는 것 |
|---|---|
| `Q` | 일반(흰색, 배율1) 표시 확인 |
| `W` | 특효(노란색) 표시 확인 |
| `E` | 크리(확대) 표시 확인 — 색은 흰색 그대로여야 함(특효 아니므로) |
| `T` | 특효+크리 동시 — 노란색+확대가 동시에 살아있는지, 크리가 특효 색을 안 가리는지(§1 절대규칙 3) |
| `Y` | 100개 동시 발사 — 풀 200개가 부하를 버티는지, 고갈 시 조용히 드롭 안 하고 경고 로그를 남기는지 |

### 드래프트 — `DraftOverlay`
| 키 | 확인하는 것 |
|---|---|
| `D` | 레벨업 드래프트 3장 강제 — 카드 표시·해금 배너·픽 흐름 |
| `F` | 보스 정책 3장 강제 — 정책 카드 표시·픽 흐름(배너는 안 떠야 함) |
| `Z` | 레벨업 2개+정책 1개를 한꺼번에 큐잉 — 순서(레벨업 먼저)와 "큐가 완전히 빌 때만 unpause" 확인 |
| `ESC` | 강제 닫기+강제 unpause — `GameCore`가 실패해도 게임이 영구 정지하지 않는 안전판 |

### 게임오버 — `GameOverScene`
| 키 | 확인하는 것 |
|---|---|
| `O` | `gameOver` 강제 발행(신기록 있음/없음 매번 토글) — 결과 화면 레이아웃·신기록 연출·Enter/Space 재시작을 코어 없이 검증 |

---

## 3. `UITheme.js` 증상 → 상수 매핑표

**원칙: 로직 파일을 열기 전에 여기부터 본다.** 대부분의 "이상해 보이는" 문제는 숫자 하나로 끝난다.

| 증상 | 고칠 상수 |
|---|---|
| 조명 전환이 안 띈다 | `LIGHT.flashAlphaPerLevel` ↑ |
| 조명 전환이 너무 느리다/빠르다 | `LIGHT.transitionMs` |
| 빨강(1단계) 경고가 눈에 안 띈다 | `LIGHT.pulseMsAtRed` ↓, `LIGHT.pulseScaleAtRed` ↑ |
| 회복했는지 모르겠다 | `LIGHT.healFlashAlpha` ↑, `LIGHT.healFlashMs` ↑ |
| 조명 색 자체가 마음에 안 든다 | `LIGHT.colors` (index 0=1단계 빨강 … 3=4단계 파랑) |
| 특효 숫자가 안 보인다 | `DMG.effectiveScale` ↑, `DMG.lifeMs` ↑ |
| 데미지 숫자가 중간에 끊기듯 사라진다(풀 고갈 의심) | `DMG.poolSize` ↑ — 단, 먼저 `?fxtest=1` `Y`로 실측할 것 |
| 데미지 숫자가 너무 안 움직인다 | `DMG.riseDistance` ↑ |
| 라벨("효과가 굉장했다!")이 HUD와 겹친다 | `DMG.labelY` 조정 (값을 올리면 아래로) |
| 라벨이 너무 자주/안 뜬다 | `DMG.labelCooldownMs` |
| 화면이 정신없다 | `PARTICLE.hitCount` ↓ — **단, `Particles.js`가 아직 없어서 지금은 아무 효과 없음(§5)** |
| 드래프트 카드가 안 읽힌다 | `CARD.fontSize` ↑, `CARD.reasonSize` ↑ |
| 드래프트 카드가 화면 밖으로 나간다 | `CARD.width` ↓ 또는 `CARD.gap` ↓ (`CARD.count`는 **절대 건드리지 말 것** — 3장은 D14 계약, `TASKS`/드래프트 풀 설계와 묶여있음) |
| 카드 등장/호버가 뻣뻣하다 | `CARD.slideInMs`, `CARD.hoverLift` |
| 보스 관통 임팩트가 약하다 | `LIGHT.flashAlphaPerLevel[2]` ↑ — **`SHAKE.bossLeaked`는 아직 아무 데도 안 쓰임(`BossAlert.js` 없음, §5)** |
| HUD 글자가 작다/화면 끝에 붙어있다 | `HUD.fontSize` ↑, `HUD.margin` ↑ |
| XP바가 안 보인다 | `HUD.xpBarWidth` ↑, `HUD.xpBarHeight` ↑ |
| Controls 버튼이 HUD랑 겹친다 | `CONTROLS.margin` ↑ (우상단 여백을 더 준다) |
| Controls 버튼 글자/폭이 안 맞는다 | `CONTROLS.buttonWidth`(배속·일시정지) / `CONTROLS.waveButtonWidth`(즉시 웨이브) / `CONTROLS.fontSize` |
| 오버레이 열렸을 때 Controls가 너무 안 흐려 보인다(또는 너무 안 보인다) | `CONTROLS.disabledAlpha` |
| 게임오버 화면에서 웨이브 숫자가 눈에 안 띈다 | `GAMEOVER.waveFontSize` ↑ |
| 게임오버 전환이 뚝 끊기거나 너무 느리다 | `GAMEOVER.fadeInMs` (**300ms 넘기지 말 것** — §7 사수 조건) |
| 신기록 연출이 안 보인다/너무 산만하다 | `GAMEOVER.newRecordColor`, `GAMEOVER.newRecordPulseMs` |
| 재시작 버튼이 작다/안 눌린다 | `GAMEOVER.buttonWidth`, `GAMEOVER.buttonHeight`, `GAMEOVER.buttonFontSize` |
| 배치 미리보기가 잘 안 보인다 | `BUILD.previewAlpha` ↑ |
| 사거리 원과 오라 원이 헷갈린다 | 색이 아니라 **형태**로 구분돼 있다(사거리=테두리만, 오라=채움) — 그래도 헷갈리면 `BUILD.auraFillAlpha` ↑ 또는 `BUILD.rangeLineWidth` ↑ |
| 오라 원이 밑에 있는 타워/경로를 가린다 | `BUILD.auraFillAlpha` ↓ |
| 선택 바 버튼이 작다/이름이 잘린다 | `BUILD.buttonWidth` ↑, `BUILD.fontSize` |
| 배치 실패 문구가 안 보인다/너무 빨리 사라진다 | `BUILD.rejectToastMs` ↑ |
| 이미 지은 유니크 타워 버튼이 안 흐려 보인다 | `BUILD.builtAlpha` ↓ |
| 적이 안 보인다/너무 작다 | `VIEW.swarmRadius`/`VIEW.fastSize`/`VIEW.tankSize`/`VIEW.bossRadius` ↑ |
| 적 색이 구분 안 된다 | `VIEW.enemyColors` (타입별 hex) |
| 타워가 셀 안에 너무 작다/꽉 차 보인다 | `VIEW.towerSize` (40px 셀 기준, 사거리와 무관) |
| 타워 테두리가 안 보인다 | `VIEW.towerStrokeColor`, `VIEW.towerStrokeAlpha` ↑ |

---

## 4. A가 지켜야 할 규칙 (D6~D7 경계 해제 조건)

`SYNC.md` §1 원본 그대로:
1. **`UITheme.js` 상수부터 바꾼다** (§3 표 참고)
2. 그래도 안 되면 로직을 수정하되, 수정 부분에 **`// [A-D5]` 주석**을 남긴다
3. 커밋 prefix는 **`ui(A):`**

**🔴 로직을 손대지 말아야 할 파일 3개 — 이유까지 알아야 결국 안 고친다**

| 파일 | 왜 위험한가 |
|---|---|
| `SeoulTowerLight.js` | 색 보간 tween과 델타(하강 폭) 티어 판정이 맞물려 있다. 과거 실제 버그(`camera.flash`의 `force` 기본값이 `false`라 보스급 플래시가 조용히 씹힘)가 이 파일에서 나왔다 — 상수 하나 잘못 옮겨도 "보스 관통인데 일반 관통처럼 보인다"는 발견하기 어려운 시그널 손실이 생긴다 |
| `DamageNumber.js` | 프리 리스트/활성 리스트 풀링(스왑 삭제, "가장 오래된 것" 축출, eviction 스로틀)이 정교하게 맞물려 있다. 로직을 잘못 옮기면 웨이브 40+에서야 터지는 조용한 메모리 누수나 "숫자가 안 사라짐" 버그가 생긴다 — 심사 직전에 나오면 못 고친다 |
| `DraftOverlay.js` | **이 프로젝트에서 유일하게 "게임이 통째로 멈추는" 실패 모드를 가진 파일이다.** `pick()`이 `closeCurrent()`를 호출하지 않는 경로가 생기면 `setPaused(true)` 상태로 게임이 영구 정지한다. 큐 순서(레벨업→정책)나 안전판(반환값 무관 항상 닫기, `destroy()`의 강제 unpause)을 건드리면 겉보기엔 멀쩡해 보이다가 특정 순서에서만 멈춘다. **D4에 안전판 하나 더 추가함**(`show()` 맨 앞의 빈 카드 가드) — `draftCards`/`policyCards`가 빈 배열이면 아예 안 열고 `tryShowNext()`로 넘긴다. **이것도 절대 지우면 안 된다** — `DraftSystem`이 붙기 전까지 A의 `LevelSystem.js`는 항상 빈 배열을 보내는데, 이 가드가 없으면 레벨업할 때마다 게임이 멈춘다(SYNC.md §2 N5) |

---

## 5. 알려진 미완성 목록

**"이건 버그인가 미구현인가"로 시간 태우지 않게 전부 적는다.**

- **pause 소유권 기준은 `Controls.isUserPaused`다.** `GameCore.setPaused(bool)`은 boolean 하나라
  마지막 호출자가 이긴다. `DraftOverlay`도 이걸 쓰기 때문에(오버레이 여는 동안 강제 정지), 오버레이가
  열려 있는 동안은 `Controls`의 버튼을 `setInputEnabled(false)`로 아예 잠가서 유저가 pause를
  건드릴 수 없게 막고, 오버레이가 큐를 다 비우고 닫힐 때 `Controls.isUserPaused`를 다시 읽어
  `setPaused()`를 복원한다. **`BuildUI`도 같은 패턴을 따른다** — `DraftOverlay.show()`/`tryShowNext()`/
  `forceCloseAll()`/`destroy()`가 `scene.buildUI?.setInputEnabled(bool)`도 같이 호출해서, 카드가 떠 있는
  동안은 배치 미리보기·클릭이 전부 잠긴다(선택 상태는 유지 — 닫히면 이어서 배치 가능). **새로 pause를
  호출하는 컴포넌트를 추가한다면 반드시 이 패턴(호출 전 `Controls.setInputEnabled(false)`·
  `BuildUI.setInputEnabled(false)`로 잠그고, 끝나면 복원)을 따라야 한다** — 안 그러면
  "카드/모달이 떠 있는데 게임이 돈다" 버그가 조용히 재발한다.
- **재시작은 `location.reload()`다. `scene.restart()`/`scene.start('Game')`을 쓰면 안 된다.**
  `WaveManager`/`Economy`/`GridSystem`이 모듈 싱글톤이라 씬만 새로 만들면 조명 0·웨이브 62 같은
  이전 상태가 그대로 남는다 — 게임이 초기화 안 된다. `GameCore.reset()`을 요청해뒀다(`SYNC.md` §3 C5).
  생기면 `GameOverScene.js`의 `location.reload()` 호출을 그걸로 교체한다.
- **`bestWave` localStorage는 A(`WaveManager.js`)가 이미 읽고 쓴다** (`grep -rn "localStorage" src/game/ src/MockGameCore.js`로 확인함 — `WaveManager.js` 39번째 줄에서 읽고 226번째 줄에서 쓴다, `MockGameCore.js`도 동일 패턴).
  **`GameOverScene.js`는 `bestWave`를 저장하지 않는다** — `gameOver` 이벤트의 `isNewRecord`를 그대로
  표시만 한다. B가 중복 저장하면 안 됨(값이 어긋난다).
- **`GameCore.js`는 이제 저장소에 있다(§0 참고)** — `buildTower`/`canBuild`/`getState`/`setPaused`/`upgrade`/`relocate`는 실제로 동작 확인함(B가 헤드리스로 스모크 테스트). `buildSupport`/`buildObstacle`/`pickDraftCard`/`pickPolicy` 4개는 여전히 스텁(`{ok:false, reason:'notImplemented'}`) — `DraftOverlay`는 이미 이 실패를 흡수하도록 만들어져 있으니 손댈 필요 없다(§4)
- **`BuildUI`는 타워 배치만 처리한다(오늘 스코프).** 서포터/장애물 배치 UI는 없다 — `buildSupport`/`buildObstacle`가 스텁인 것과 맞물려 있다. 드래프트로 서포터를 뽑아도(Mock 기준) 배치할 UI가 없어 `instanceId`만 `#pending`으로 남는다
- **오라 원은 실제로 지어진 세운상가가 있을 때만 보인다.** `buildSupport`가 스텁인 지금은 항상 빈 상태다 — `?fxtest=1`의 `C` 키(마우스 추적)로 반경/색/형태만 독립 검증했다. 서포터 배치가 실제로 붙으면 `BuildUI.handleObjectBuilt`가 `objectBuilt`(kind:'support') 이벤트만으로 자동으로 원을 그린다(추가 작업 불필요)
- **✅ 적/타워 렌더러는 이제 있다(D4, `EnemyView.js`/`TowerView.js`).** 아래 세 가지는 여전히 남은 갭:
  - **`TowerView`는 `relocate`(재배치) 시 위치를 못 옮긴다.** `objectChanged` 페이로드에 좌표가 없어서다
    (EventBus.js 계약상 `{instanceId, action, level}`뿐 — `BuildUI`의 오라 추적과 동일한 gap, §2 참고).
    실질 영향 없음 — 드래그 재배치 UI 자체가 아직 없어서 이 경로가 발생하지 않는다.
  - **`EnemyView`의 Mock 경로(자체 보간)는 슬로우/스턴/DoT를 반영하지 않는다.** `enemies.json`의 고정
    `speed`로만 전진한다 — 실제 코어(폴링 경로)는 100% 정확하다. Mock은 연출 검증용이라 허용 범위.
  - **적/타워 색은 전부 플레이어 시점 상단(북쪽)에서 본 단색 도형이다.** 회전·방향 표시 없음(에셋이
    들어오면 자연스럽게 해결됨).
- **🔴 D4에 발견·수정: `GameScene.js`에 Phaser `update()`가 없어서 실제 코어의 시간 기반 시뮬레이션
  (웨이브 진행·적 이동·투사체·타워 발사)이 전혀 안 돌고 있었다.** `update(time, delta) { this.core?.update?.(delta); }`
  한 줄 추가로 해결(§0 참고). **A가 실제 코어 관련 새 기능을 테스트할 때 "왜 안 움직이지"가 나오면
  이 메서드가 살아있는지부터 확인한다** — 실수로 지워지면 똑같은 증상이 재발한다.
- **`Particles.js`/`StatusFx.js`/`SkyTint.js`/`BossAlert.js` 파일 자체가 없다.** `UITheme.js`의 `PARTICLE`/`SHAKE` 상수는 존재하지만 아무 코드도 이걸 읽지 않는다(§3에 표시해둠)
- **`TitleScene.js`/`UpgradeUI.js`/`CodexUI.js` 미착수** (`Controls.js`/`GameOverScene.js`/`BuildUI.js`는 완료 — §0 참고)
- A 쪽 `LevelSystem.js`/`PerkSystem.js`/`DraftSystem.js`/`Supporter.js`/`Obstacle.js`/`Debug.js` 미착수
- **`BuildUI`는 타워 배치만 처리한다.** 서포터/장애물 배치 UI는 없다 — `buildSupport`/`buildObstacle`가 스텁인 것과 맞물려 있다. 드래프트로 서포터를 뽑아도(Mock 기준) 배치할 UI가 없어 `instanceId`만 `#pending`으로 남는다
- **오라 원은 실제로 지어진 세운상가가 있을 때만 보인다.** `buildSupport`가 스텁인 지금은 항상 빈 상태다 — `?fxtest=1`의 `C` 키(마우스 추적)로 반경/색/형태만 독립 검증했다. 서포터 배치가 실제로 붙으면 `BuildUI.handleObjectBuilt`가 `objectBuilt`(kind:'support') 이벤트만으로 자동으로 원을 그린다(추가 작업 불필요)
- **정책/드래프트 픽이 실제로 반영되는지 검증 불가.** `MockGameCore`에서는 반영되지만(퍼크 누적 등) 실제 `GameCore`는 아직 스텁이라 확인할 방법이 없다

---

## 6. 에셋 교체 규약 — ✅ D4에 자동 교체 파이프라인 구축·검증 완료

`assets/<종류>/<id>.png` = 해당 `json`의 `id` 필드와 1:1 대응 (예: `assets/towers/cheonggyecheon.png`,
`assets/enemies/dust.png`). **디렉터리는 저장소 최상단 `assets/`를 그대로 쓴다** — CLAUDE.md §3 구조
그대로다.

**동작 원리**
1. `vite.config.js`에 `publicDir: 'assets'`를 설정해서 `assets/` 내용을 그대로 정적 서빙한다
   (원래 Vite 기본값인 `/public/` 폴더가 이 프로젝트엔 없어서 대체함).
2. `GameScene.preload()`가 `towers.json`/`enemies.json`의 모든 id/type에 대해 `assets/towers/<id>.png`·
   `assets/enemies/<type>.png` 로드를 **전부 시도**한다. 파일이 없으면 Phaser가 콘솔에 로드 실패를
   찍지만(`?debug=1`일 때만 우리 쪽에서 한 줄로 요약 로그) 게임은 멈추지 않는다.
3. `TowerView`/`EnemyView`가 그릴 때마다 `scene.textures.exists(key)`로 직접 확인한다 —
   있으면 이미지, 없으면 도형 플레이스홀더. **코드에서 아무것도 안 바꿔도 된다.**

**검증**: 더미 PNG(`cheonggyecheon.png`, `dust.png`)를 `assets/towers/`·`assets/enemies/`에 넣고
헤드리스로 확인 — 그 둘만 로드 성공 목록에 들어가고 나머지는 그대로 실패(플레이스홀더 폴백) 확인.
검증 후 더미 파일은 삭제했다(실제 에셋 아님).

**B가 부재 중에도 폰으로 GitHub 웹에 `assets/towers/gwanghwamun.png`처럼 파일 하나만 올리면,
다음 배포 빌드부터 자동으로 반영된다.** A가 코드를 손댈 필요가 전혀 없다.

**D4 갱신**: `supports.json`/`obstacles.json`도 같은 방식으로 `preload()`에 추가해뒀다
(`assets/supports/<id>.png`, `assets/obstacles/<id>.png`) — 화면에 그리는 렌더러는 아직 없지만
텍스처는 미리 로드해두니 렌더러가 생기면 코드 변경 없이 바로 반영된다.

**스타일 기준·프롬프트 템플릿·14종 우선순위는 `/docs/ASSET_GUIDE.md`를 본다.** B가 D6~D7 부재
중 폰으로 에셋을 만들 때 참고할 유일한 문서 — 색상·규격·실루엣 규칙·완성된 프롬프트 14개가 전부
그대로 복붙 가능한 형태로 들어있다.

**플레이스홀더도 D4에 개선했다** — 에셋이 하나도 없어도 랜드마크 6종·적 4종이 전부 서로 다른
도형 실루엣으로 구분된다(`TowerView.js`/`EnemyView.js`, `ASSET_GUIDE.md` §4 규칙과 동일한 형태
기준 적용). "도형이라 게임처럼 안 보인다"는 문제는 에셋이 안 들어와도 상당 부분 해소됐다.

---

## 7. 밸런싱 합격 기준 (P4를 A 혼자 판정하는 기준)

- 웨이브 1~5 총 소요 **3분 이내**
- 웨이브 5 이전 **레벨업 최소 2회**
- 특효(노란) 숫자가 **화면 어디를 봐도 인지됨**
- 조명 4→3 전환을 **모르고 지나칠 수 없음**
- 웨이브 20에서 **화면 오브젝트 100+ 상태로 프레임 유지**

---

## 8. 촬영 대본

**판단 없이 그대로 따라 찍으면 되게 썼다.** 초 단위 타임라인 + 정확한 키까지 적었다.
총 45~58초, 7컷.

### ✅ D4 갱신 — 타워/적 스프라이트 렌더러 생김

이전 버전은 "타워/적이 화면에 안 보인다"를 촬영 전 필수 확인으로 올려뒀는데, D4에 `EnemyView.js`/
`TowerView.js`가 생기면서 해결됐다. **이제 컷 2는 fxtest 강제 발행 대신 실제 화면(타워 사각형 +
archetype별 도형 적)을 그대로 찍을 수 있다** — 아래 컷 2 지시가 그 기준으로 바뀌었다.

단, 에셋(PNG)이 아직 하나도 없어서 전부 **단색 도형 플레이스홀더**다(사각형 타워, 원/삼각형/사각형 적).
심사 인상을 더 올리고 싶으면 §6 파이프라인이 이미 동작하니 D6~D7 중 PNG 몇 장만 넣어도 그대로
반영된다 — 필수는 아니고 있으면 훨씬 좋은 것.

### 시나리오 판단 — (A) 실제 코어 vs (B) Mock

**확인 절차(D4부터 훨씬 쉬워짐):** URL에 `?real=1`만 붙이고(파일 수정 불필요, §0·§1 참고)
웨이브 5까지 진행해본다.
- 실제 처치로 레벨업 카드가 뜨고, 카드를 고르면 `pickDraftCard`가 `{ok:true}`를 반환한다
  → **(A) `?real=1`로 촬영.** 이게 최선이다 — 아래 각 컷의 "(A)" 지시를 따른다.
- 카드가 안 뜨거나(`LevelSystem` 미완성), 픽이 `{ok:false, reason:'notImplemented'}`면
  → **(B) 기본 URL(Mock)로 촬영.** 아래 각 컷의 "(B)" 지시를 따른다. **연출(조명·데미지숫자·
  드래프트 오버레이·게임오버)은 전부 진짜고 데이터만 시뮬레이션이다 — 안 찍는 것보다 훨씬 낫다.**
- **D4 시점 실측: (B)다.** `?real=1`로 직접 확인함 — XP/레벨이 영구 고정이라(`LevelSystem` 부재)
  레벨업 카드가 원천적으로 안 뜬다(§0 "`?real=1` 검증 결과" 참고). `LevelSystem`이 생기면 이 판단을
  다시 해본다. 단, **보스 정책 카드는 `?real=1`에서도 실제로 뜬다**(`WaveManager.js` 자체 구현) —
  컷 5는 (A)/(B) 둘 다 시도해볼 만하다.

이 판단은 컷 3(드래프트)·컷 5(보스)에서만 실제로 갈린다. 컷 1·2·6·7은 (A)/(B) 상관없이 동일하다
(전부 `EventBus`에 직접 꽂혀 있는 `?fxtest=1` 연출이라 어느 코어를 쓰든 똑같이 동작한다).

**⚠️ `?debug=1`의 웨이브 점프(`1`~`9`)·`G`(골드)·`X`(XP)·`K`(적 전멸)·`H`(무적) 키는 아직 없다.**
`CLAUDE.md` §7에 명세만 있고 실제 구현 파일(`Debug.js`)이 없다(`git show HEAD:src/game/Debug.js` → 없음).
A가 D6~D7에 이걸 만들면 (A) 시나리오 촬영이 훨씬 쉬워진다(웨이브를 실제로 다섯 번 뛰지 않고 바로
5로 점프) — 없으면 아래 (A) 지시대로 `Controls`의 3배속 + "즉시 웨이브" 버튼으로 대신한다.

---

### 컷 1 — 오프닝 (0-4s)

**❌ `TitleScene.js`는 없다** (§0·§5 참고 — 미착수, 절대 사수 6개엔 안 들어감). 날짜·최고 기록을
인게임에서 보여줄 화면이 없으므로 **영상 편집 프로그램에서 텍스트 카드를 얹는다.**

- **URL**: (플래그 없음, 기본 화면)
- **키**: 없음. 웨이브 0(시작 직후) 상태에서 4초간 정지
- **편집 시 텍스트**: "서울 디펜스 — [촬영일 날짜]" + "최고 기록: N웨이브"
  (N은 브라우저 콘솔에서 `localStorage.getItem('bestWave')`로 확인해서 손으로 넣는다)
- **성공 기준**: N서울타워(파란 원)와 코어(빨간 원), 격자 맵이 조용히 떠 있는 화면. 배속 1x, HUD 골드 200/웨이브 0

---

### 컷 2 — 청계천 특효 데미지 숫자 (4-12s, 8초) ⭐ 차별점 #2, 가장 크게 보여야 함

**D4부터 실제 화면으로 찍을 수 있다** — 타워(회색 사각형)와 미세먼지(작은 원 여럿, swarm)가
둘 다 화면에 보이고, 청계천은 `strongAgainst.dust: 2.0`이라 미세먼지에 자동으로 특효가 뜬다.

- **(A) 실제 코어(권장)**: 기본 URL(플래그 없음). 청계천을 경로 근처(예: 셀 500,250 부근)에 배치 →
  웨이브 1(계절 봄, 미세먼지 비중 80%)이 시작되면 자연스럽게 특효가 여러 번 뜬다. 타이밍이 안 맞으면
  `Controls`의 즉시 웨이브로 앞당긴다
- **(B) Mock 또는 타이밍이 안 맞을 때(백업)**: `?fxtest=1` → `T`(특효+크리) → `W`(특효) 반복 —
  강제 발행이라 화면에 타워/적이 없어도 숫자 자체는 진짜 연출과 동일하게 뜬다
- **배속**: 1x (숫자가 잘 보이게)
- **성공 기준**: 회색 타워 사각형 근처에서 미세먼지(원)에 노란 숫자가 최소 3번 뜨고, "효과가
  굉장했다!" 라벨이 상단 중앙에 최소 1번 보임
- **(A)/(B) 공통** — 코어와 무관(데미지 숫자 연출 자체는 `EventBus` 이벤트 하나로 동일하게 동작)

---

### 컷 3 — 레벨업 드래프트 (12-20s, 8초)

- **(A) `?real=1`**: 3배속으로 전환 후 "즉시 웨이브" 버튼을 연타해서 실제 레벨업이 뜰 때까지 진행 →
  카드 3장 오버레이가 뜨면 배속을 1x로 낮추고 카드 하나를 클릭 (D4 시점엔 안 뜬다 — 위 "시나리오
  판단" 참고, `LevelSystem` 생긴 뒤 재시도)
- **(B) Mock**: `?fxtest=1` → `D` 키 (레벨업 드래프트 3장 강제, 해금 배너까지 같이 뜬다) → 카드 하나 클릭
- **성공 기준**: 카드 3장 + 상단에 "OO 해금!" 배너(레벨이 딱 맞을 때만) + 카드 안에 효과 설명 한 줄이
  다 보임. 클릭하면 0.3초 안에 오버레이가 닫히고 게임이 바로 재개됨(멈춰 있으면 안 됨)

---

### 컷 4 — 통나무 스턴 + 광역기 콤보 (20-28s, 8초) ⚠️ 지금은 촬영 불가 — 생략 권장

**장애물을 배치할 UI 자체가 없다.** `BuildUI.js`는 타워 배치만 처리하고(§0 참고), Mock의
`pickDraftCard`도 장애물 카드를 고르면 카운터만 올릴 뿐(`obstaclePicks++`) 실제로 맵 위에 놓지 않는다 —
그래서 `obstacleTriggered` 이벤트 자체가 Mock에서도, 실제 코어에서도 지금은 절대 발행되지 않는다.
`?fxtest=1`에도 이걸 강제로 쏘는 키가 없다.

**권장: 이 컷은 최종 영상에서 뺀다.** 시간이 남으면 대안 두 가지:
1. A가 D6~D7에 obstacle 배치 흐름(간단한 클릭 배치 + `buildObstacle` 구현)을 만들면 그때 채운다
2. 대신 컷 2(데미지 숫자)를 8초 더 늘리거나, 컷 6(조명 전환)을 조명 1단계씩 나눠서 늘린다

---

### 컷 5 — 보스 등장 → 처치 → 정책 3장 (28-38s, 10초)

- **(A) `?real=1`**: `?debug=1`의 웨이브 점프가 있으면 같이 켜서(`?real=1&debug=1`) 5(또는
  `waves.json`의 `boss.everyWaves`)로 점프. 없으면 3배속 + 즉시 웨이브 연타로 보스 웨이브까지
  도달 → 보스가 뜨면 배속을 낮추고 실제 전투로 처치(타워가 없으면 못 잡는다 — 컷 3 이후 상태를
  이어서 쓰거나, 미리 타워 여러 개를 배치해둔다). **D4에 실측 확인함 — 정책 카드 3장은 실제로 뜬다**
  (`WaveManager.js` 자체 구현이라 `LevelSystem` 유무와 무관)
- **(B) Mock**: `?fxtest=1` → `F` 키 (보스 정책 카드 3장 강제) — 보스 스폰/체력바 연출 자체는
  `B`(조명 2단계 하강, 보스 관통 시뮬)로 대체 시연 가능하지만 정책 카드가 메인이므로 `F` 하나로 충분
- **성공 기준**: 정책 카드 3장(레벨업 카드와 레이아웃은 같지만 해금 배너는 없음)이 뜨고 클릭 시 닫힘.
  (A)라면 추가로 보스 체력바(`bossHpChanged`)가 줄어드는 것도 잡는다

---

### 컷 6 — 조명 4→3→2→빨강 전환 (38-48s, 10초) ⭐ 차별점 #1, 가장 극적인 구간

- **URL**: `?fxtest=1`
- **키 타임라인**:
  - 38s: `1` (혹시 다른 값이면 4단계부터 시작하도록 정렬 — 이미 4면 생략)
  - 40s: `B` (2단계 하강 — 파랑→노랑, 델타 2라 플래시가 크게 침)
  - 43s: `B` (노랑→빨강 방향으로 한 번 더. 이미 2단계면 `R`로 잠깐 3으로 올렸다가 다시 `B`로 내려서
    "하강하는 순간"을 한 번 더 잡아도 됨)
  - 46s: 빨강 상태에서 2초 유지(맥동 연출 확인 — `LIGHT.pulseMsAtRed` 주기로 커졌다 작아짐)
- **성공 기준**: 색이 파랑→노랑→빨강으로 또렷하게 바뀌고, 하강마다 화면이 잠깐 붉게/누렇게 플래시.
  빨강 상태에서는 조명이 두근거리듯 커졌다 작아짐(맥동)이 눈에 보여야 함
- **(A)/(B) 공통** — 코어와 무관

---

### 컷 7 — 게임오버 → 신기록 (48-58s, 10초)

- **URL**: `?fxtest=1`
- **키 타임라인**:
  - 48s: `O` (게임오버 강제 발행. 신기록 여부가 토글되므로 **신기록 있음이 나올 때까지 몇 번 눌러서**
    미리 확인해두고, 실제 촬영 땐 그 상태가 나온 직후 바로 이어서 찍는다)
- **성공 기준**: 화면이 어두워지며(0.25초 이내) 웨이브 숫자가 크게 뜨고, "신기록!" 텍스트가 노란색으로
  맥동. 2초 이내에 "다시 시작 (Enter)" 버튼이 눌리는 것까지 보여주면 절대 사수 조건(2초 재시작)을
  영상으로도 증명하는 셈 — `Enter` 키를 눌러서 `location.reload()`가 실제로 화면을 초기화하는 것까지 잡으면 좋음
- **(A)/(B) 공통** — 코어와 무관(`gameOver` 이벤트를 직접 쏨)

---

### 키 빠른 참조 (촬영 중 헷갈릴 때)

| 키 | 화면 | 용도 |
|---|---|---|
| `1`~`4` | 조명 | 레벨 강제 지정 |
| `B` | 조명 | 2단계 하강(보스 관통 시뮬) |
| `R` | 조명 | 1단계 회복 |
| `W` | 데미지 | 특효(노랑) |
| `T` | 데미지 | 특효+크리 동시 |
| `D` | 드래프트 | 레벨업 3장 강제 |
| `F` | 드래프트 | 보스 정책 3장 강제 |
| `O` | 게임오버 | 강제 발행(신기록 토글) |
| `ESC` | 드래프트 | 강제 닫기(찍다가 꼬이면 이걸로 리셋) |

전부 `?fxtest=1`에서만 동작한다. `?debug=1`(A 영역) 키는 D6~D7에 `Debug.js`가 만들어지기 전까진
존재하지 않는다(위 "시나리오 판단" 참고).

---

### 스크린샷 기준선

`/docs/baseline/`에 D3 시점 정상 화면 5장이 있다 — "화면이 이상한데 원래 이랬나?"를 판단할 유일한
근거다. 뭔가 달라 보이면 여기와 먼저 비교한다.
