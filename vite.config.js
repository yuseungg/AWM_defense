import { defineConfig } from 'vite';

export default defineConfig({
  // ★ 저장소 이름과 정확히 일치해야 한다. 앞뒤 슬래시 필수.
  //   이게 틀리면 배포는 성공하는데 화면이 하얗게 뜬다 (에셋 404).
  base: '/AWM_defense/',
  build: { outDir: 'dist' },
  // /assets/<종류>/<id>.png (CLAUDE.md §3 폴더 구조)를 그대로 정적 서빙한다.
  // Vite 기본은 /public/이지만 그 폴더가 없어서 이걸로 대체 — B가 GitHub 웹으로
  // assets/towers/x.png 하나만 올려도 코드 변경 없이 배포에 반영된다(HANDOFF.md §6).
  publicDir: 'assets',
});
