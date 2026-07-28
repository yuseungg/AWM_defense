# SETUP.md — 저장소 세팅 (P0에서 30분)

> **저장소는 하나만 만든다.** 둘이 각자 파면 협업이 불가능하다.
> 한 명(=저장소 주인)이 1~6단계를 하고, 상대는 7단계부터 시작한다.

---

## 0. 준비

- 둘 다 GitHub 계정 · Git 설치 · **Node.js 20 이상**
- 확인: `node -v` → `v20.x` 이상이면 OK

---

## 1. 저장소 생성 (주인만)

GitHub → **New repository**

| 항목 | 값 |
|---|---|
| Repository name | `AWM_defense` ✅ **이미 생성됨** (`yuseungg/AWM_defense`) |
| 공개 범위 | **Public** ← 심사 편의 + Pages 무료 |
| Add README | ✅ |
| .gitignore | **Node** 선택 |

> 비공개로 해야 한다면 나중에 심사 계정 `dl_gameai_reviewer@nhn.com`을 협업자로 초대한다. 그냥 Public이 안전하다.

---

## 2. 상대 초대 (주인만)

**Settings → Collaborators → Add people** → 상대 GitHub 아이디 입력

⚠️ **상대가 이메일이나 GitHub 알림에서 초대를 수락해야 push가 된다.** 이거 안 하면 나중에 "권한 없음" 에러가 난다.

---

## 3. 프로젝트 셋업 (주인만)

```bash
git clone https://github.com/yuseungg/AWM_defense.git
cd AWM_defense

# Vite 프로젝트 생성 (현재 폴더에)
npm create vite@latest . -- --template vanilla
#  → "폴더가 비어있지 않다"고 물으면 'Ignore files and continue' 선택

npm install
npm install phaser
```

### `vite.config.js` 생성 ⚠️ 가장 중요

```js
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/AWM_defense/',   // ★ 저장소 이름과 정확히 일치. 앞뒤 슬래시 필수
  build: { outDir: 'dist' },
});
```

> **이걸 빼먹으면 배포는 성공했는데 화면이 하얗게 뜬다.**
> GitHub Pages는 `계정.github.io/저장소이름/` 경로로 서비스되는데, `base`가 없으면
> 브라우저가 에셋을 `/assets/...`(루트)에서 찾다가 전부 404를 낸다.
> 저장소 이름을 바꾸면 여기도 반드시 같이 바꾼다.

### `.gitignore` 확인

```
node_modules
dist
.DS_Store
```

---

## 4. 폴더 구조 + 문서 만들기

```bash
mkdir -p data src/game src/ui src/fx assets .github/workflows
```

저장소 루트에 문서 5개를 넣는다:
`CLAUDE.md` · `GAME_DESIGN.md` · `TASKS_A.md` · `TASKS_B.md` · `SYNC.md`

---

## 5. 자동 배포 설정

`.github/workflows/deploy.yml` 파일을 추가한다 (이미 만들어져 있음).
`main`에 push할 때마다 자동으로 빌드 → 배포된다.

그다음 **Settings → Pages → Source → `GitHub Actions` 선택.**

```bash
git add -A
git commit -m "chore: 프로젝트 셋업 + 기획 문서"
git push
```

**Actions 탭**에서 초록불이 뜨면 성공. 링크:
```
https://yuseungg.github.io/AWM_defense/
```

> ⚠️ **첫 배포는 P0(첫날)에 반드시 뚫어둔다.** 빈 화면이라도 링크가 살아 있어야 한다.
> 마지막 날 배포가 안 돼서 제출을 못 하는 게 이런 프로젝트의 가장 흔한 실패다.

---

## 6. 브랜치 생성

```bash
git checkout -b feat/game-core && git push -u origin feat/game-core   # A
git checkout main
git checkout -b feat/ui        && git push -u origin feat/ui          # B
```

---

## 7. 상대(초대받은 쪽) 시작

```bash
git clone https://github.com/yuseungg/AWM_defense.git
cd AWM_defense
npm install
git checkout feat/ui        # 또는 feat/game-core
npm run dev                 # http://localhost:5173 열림
```

---

## 8. 일상 명령어

### 세션 시작
```bash
git checkout main && git pull        # 최신 받기
git checkout feat/ui && git merge main   # 내 브랜치에 반영
npm run dev
```
→ 그다음 `SYNC.md` 읽기 (§1 상태 · §2 답변 대기)

### 세션 종료
```bash
npm run build                        # ★ 빌드 되는지 먼저 확인

git add -A
git commit -m "feat: 드래프트 오버레이 3장 표시"

git checkout main && git pull
git merge feat/ui                    # main에 합치기
git push                             # → 자동 배포 시작

git checkout feat/ui                 # 내 브랜치로 복귀
```
→ 그다음 `SYNC.md`에 세션 로그 + 상태 갱신

> **빌드가 깨지면 머지하지 않는다.** 자기 브랜치에 두고 `SYNC.md` §1에 "브랜치에 있음"이라고 적는다.
> 깨진 `main`을 상대가 pull 받으면 몇 시간이 날아간다.

---

## 9. 충돌 났을 때

```bash
git merge main
# CONFLICT (content): Merge conflict in src/ui/HUD.js
```

1. 해당 파일을 열면 이렇게 표시된다:
```
<<<<<<< HEAD
내 코드
=======
상대 코드
>>>>>>> main
```
2. **`<<<<<<<`, `=======`, `>>>>>>>` 줄을 지우고** 남길 코드를 정한다
3. `git add {파일}` → `git commit`

**충돌이 자주 나면 분업이 잘못된 것이다.** `CLAUDE.md` §3 담당 경계를 다시 확인한다.
**`/data/*.json`에서 충돌이 나면 혼자 해결하지 말고** `SYNC.md` §3에 올린다.

---

## 10. 커밋 메시지 규칙

공모전 심사에 **커밋 기록이 포함된다.** AI가 준 코드를 통짜로 한 번에 붓지 않는다.

```
feat: First 타겟팅 구현
fix: 투사체 풀 반환 누락
balance: 미세먼지 체력 20→18
chore: 에셋 교체
docs: SYNC 세션 로그
```

---

## 체크리스트

- [ ] 저장소 생성 (Public, 이름 확정)
- [ ] 상대 협업자 초대 → **상대가 수락**
- [ ] Vite + Phaser 설치
- [ ] **`vite.config.js`의 `base` = 저장소 이름** ⚠️
- [ ] 폴더 구조 + 문서 5개 커밋
- [ ] `deploy.yml` 추가 + **Settings → Pages → Source = GitHub Actions**
- [ ] **배포 링크 접속 성공** → `SYNC.md` §1에 링크 기록
- [ ] 브랜치 2개 생성
- [ ] 둘 다 로컬에서 `npm run dev` 성공
