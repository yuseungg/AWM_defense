# HANDOFF.md — B 부재(D4~D7) 인계 문서

> **이 문서는 골격 문서다.** D3까지 기능이 끝날 때마다 채워 넣는다 — 시간이 끊겨도
> 이 시점까지의 인계 내용은 항상 최신 상태로 존재한다.
> 경계 해제 조건·소유권 규칙은 `CLAUDE.md` §3·`SYNC.md` §1이 원본이다. 여기는 그걸
> "지금 당장 뭘 해야 하는가" 관점으로 재구성한 것.

---

## 0. 현재 상태 한눈에

**완성된 것**
- `/src/fx/SeoulTowerLight.js` — 조명 4단계, 색 보간·플래시·맥동·회복 연출
- `/src/fx/DamageNumber.js` — 오브젝트 풀링(200개), 색(특효)/크기(크리) 직교 분리
- `/src/ui/GameScene.js` — 기본 화면(지도+조명+데미지숫자+HUD+드래프트 연결)
- `/src/ui/HUD.js` — 골드/웨이브·계절/레벨+XP바
- `/src/ui/DraftOverlay.js` — 레벨업 3장/보스 정책 3장, 큐 처리, "코어 실패해도 안 멈춤" 안전판
- `/src/ui/MockScene.js`(`?mock=1`), `/src/ui/VerifyScene.js`(`?verify=1`), `/src/ui/mapView.js`(공유 지도 렌더링)
- `/src/main.js` — Phaser 부트 전용(URL 플래그로 씬 선택만 함)
- A: `/src/game/` 9종 완성 — `PathSystem`·`GridSystem`·`Enemy`·`EnemyPool`·`Tower`·`Projectile`·`Combat`·`Economy`·`WaveManager`

**🔴 최우선 — `GameCore.js` 부재**
`/src/game/`의 9개 파일이 전부 완성돼 있지만 **아무 데서도 import하지 않는다.** 헤드리스 브라우저로
네트워크 요청을 직접 찍어서 확인함 — 9개 파일 전부 로드조차 안 됨. `GameScene.js`는 지금 전부
`MockGameCore.js`로 동작 중이다(적 이동·조명·데미지숫자·HUD 전부 Mock의 랜덤값).

**연결 지점은 정확히 한 곳이다**: `GameScene.js:39` 부근 "코어 전환 지점" 주석 아래
`await import('../MockGameCore.js')` 한 줄을 `await import('../GameCore.js')`로 바꾸면 된다.
그 외 `GameScene.js`의 어떤 부분도 바꿀 필요가 없다(`GameCore`의 반환값 규약 `{ok, reason?, instanceId?}`,
좌표=셀 인덱스 규약을 지키기만 하면).

**미완성인 것** — §5에 전체 목록.

---

## 1. URL 플래그 5종

| 플래그 | 씬 | 용도 | 소유 |
|---|---|---|---|
| (기본, 없음) | `GameScene` | 실제 게임 화면 | 공용 |
| `?mock=1` | `MockScene` | Mock 이벤트 모니터(진단용) — "이벤트가 안 오는지 vs UI가 안 그리는지" 구분 | B |
| `?verify=1` | `VerifyScene` | 경로 검증 — 격자 정렬(40k+20)·완주 시간 자동 검사. `speed` 튜닝 시 유일한 회귀 검증 화면 | 공용(A가 주로 씀) |
| `?fxtest=1` | `GameScene` 내부 | FX/드래프트 검증 키 | **B 영역** |
| `?debug=1` | `GameScene` 내부 | 웨이브 점프(1~9)·골드(G)·XP(X)·적전멸(K)·무적(H)·배속 (`CLAUDE.md` §7) | **A 영역** |

`?fxtest=1`과 `?debug=1`은 숫자 키가 겹치면 서로 무력화되므로 **완전히 분리된 플래그**다. 서로 조합해서 켜도 무방(각 씬이 무관한 플래그는 무시).

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

---

## 4. A가 지켜야 할 규칙 (D4~D7 경계 해제 조건)

`SYNC.md` §1 원본 그대로:
1. **`UITheme.js` 상수부터 바꾼다** (§3 표 참고)
2. 그래도 안 되면 로직을 수정하되, 수정 부분에 **`// [A-D5]` 주석**을 남긴다
3. 커밋 prefix는 **`ui(A):`**

**🔴 로직을 손대지 말아야 할 파일 3개 — 이유까지 알아야 결국 안 고친다**

| 파일 | 왜 위험한가 |
|---|---|
| `SeoulTowerLight.js` | 색 보간 tween과 델타(하강 폭) 티어 판정이 맞물려 있다. 과거 실제 버그(`camera.flash`의 `force` 기본값이 `false`라 보스급 플래시가 조용히 씹힘)가 이 파일에서 나왔다 — 상수 하나 잘못 옮겨도 "보스 관통인데 일반 관통처럼 보인다"는 발견하기 어려운 시그널 손실이 생긴다 |
| `DamageNumber.js` | 프리 리스트/활성 리스트 풀링(스왑 삭제, "가장 오래된 것" 축출, eviction 스로틀)이 정교하게 맞물려 있다. 로직을 잘못 옮기면 웨이브 40+에서야 터지는 조용한 메모리 누수나 "숫자가 안 사라짐" 버그가 생긴다 — 심사 직전에 나오면 못 고친다 |
| `DraftOverlay.js` | **이 프로젝트에서 유일하게 "게임이 통째로 멈추는" 실패 모드를 가진 파일이다.** `pick()`이 `closeCurrent()`를 호출하지 않는 경로가 생기면 `setPaused(true)` 상태로 게임이 영구 정지한다. 큐 순서(레벨업→정책)나 안전판(반환값 무관 항상 닫기, `destroy()`의 강제 unpause)을 건드리면 겉보기엔 멀쩡해 보이다가 특정 순서에서만 멈춘다 |

---

## 5. 알려진 미완성 목록

**"이건 버그인가 미구현인가"로 시간 태우지 않게 전부 적는다.**

- **`GameCore.js` 자체가 아직 없다.** B가 요청함(1단계). 도착하면 `buildTower`/`canBuild`/`getState`/`setPaused`는 구현되지만 `buildSupport`/`buildObstacle`/`pickDraftCard`/`pickPolicy` 4개는 스텁(`{ok:false, reason:'notImplemented'}`)으로 남을 예정 — `DraftOverlay`는 이미 이 실패를 흡수하도록 만들어져 있으니 손댈 필요 없다(§4)
- **적 스프라이트 렌더러가 없다.** `enemySpawned`/`enemyKilled` 이벤트는 발행되지만(Mock이든 실제 `WaveManager`든) 화면에 적 그래픽 자체가 없다. Mock으로 테스트해도 안 보이는 게 정상이다
- **건설 UI가 없다.** `BuildUI.js` 미착수 — 클릭으로 타워/서포터/장애물을 지을 방법 자체가 아직 없다
- **`Particles.js`/`StatusFx.js`/`SkyTint.js`/`BossAlert.js` 파일 자체가 없다.** `UITheme.js`의 `PARTICLE`/`SHAKE` 상수는 존재하지만 아무 코드도 이걸 읽지 않는다(§3에 표시해둠)
- **`TitleScene.js`/`GameOverScene.js`/`UpgradeUI.js`/`CodexUI.js`/`Controls.js` 미착수**
- A 쪽 `LevelSystem.js`/`PerkSystem.js`/`DraftSystem.js`/`Supporter.js`/`Obstacle.js`/`Debug.js` 미착수
- **정책/드래프트 픽이 실제로 반영되는지 검증 불가.** `MockGameCore`에서는 반영되지만(퍼크 누적 등) 실제 `GameCore`는 아직 스텁이라 확인할 방법이 없다
- `assets/` 폴더 자체가 없다 (§6)

---

## 6. 에셋 교체 규약

`assets/<종류>/<id>.png` = 해당 `json`의 `id` 필드와 1:1 대응 (예: `assets/towers/cheonggyecheon.png`).

**🔴 `assets/` 폴더 자체가 아직 없다.** 로드 실패 시 폴백(placeholder 도형 등) 처리도 **미구현**이다 —
지금 에셋을 넣으면 경로가 안 맞을 때 조용히 안 뜨기만 할 뿐 에러도 안 남을 수 있다(Phaser 기본 동작
확인 필요). 에셋을 받으면 로더에 `onerror`/`load-error` 핸들러부터 넣는 걸 권장.

---

## 7. 밸런싱 합격 기준 (P4를 A 혼자 판정하는 기준)

- 웨이브 1~5 총 소요 **3분 이내**
- 웨이브 5 이전 **레벨업 최소 2회**
- 특효(노란) 숫자가 **화면 어디를 봐도 인지됨**
- 조명 4→3 전환을 **모르고 지나칠 수 없음**
- 웨이브 20에서 **화면 오브젝트 100+ 상태로 프레임 유지**

---

## 8. 촬영 대본

*(골격만. §7 밸런싱이 확정된 뒤 채운다.)*

- [ ] 오프닝 컷
- [ ] 코어 게임플레이 컷
- [ ] 드래프트/레벨업 컷
- [ ] 보스전 컷
- [ ] 게임오버/기록 컷
