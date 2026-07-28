import { defineConfig } from 'vite';

export default defineConfig({
  // ★ 저장소 이름과 정확히 일치해야 한다. 앞뒤 슬래시 필수.
  //   이게 틀리면 배포는 성공하는데 화면이 하얗게 뜬다 (에셋 404).
  base: '/AWM_defense/',
  build: { outDir: 'dist' },
});
