import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',   // ⭐ 중요
  plugins: [react()],
  optimizeDeps: {
    include: ['xlsx'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/firestore', 'firebase/storage'],
        },
      },
    },
    // 이미지 최적화를 위한 설정
    assetsInlineLimit: 4096, // 4kb 이하 이미지는 base64로 인라인화
    chunkSizeWarningLimit: 2000, // 청크 크기 경고 임계값을 2MB로 증가
  },
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    proxy: {
      /**
       * `changeOrigin` 을 꺼 둡니다 — Host 헤더를 그대로 넘겨야 합니다.
       *
       * 켜져 있으면 프록시가 Host 를 localhost:3001 로 바꿔 버립니다. 그러면
       * 카카오 로그인이 로컬에서만 막힙니다 — 서버는 「돌아올 주소가 내
       * 주소인가」 를 Host 로 확인하는데(kakaoAuthApi.js allowedRedirect),
       * 브라우저가 보낸 주소는 :5190 이고 서버가 보는 Host 는 :3001 이라
       * 남의 주소로 읽힙니다.
       */
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
    // HMR 클라이언트 포트는 고정하지 않습니다 — 다른 포트(미리보기용)로 띄웠을 때
    // ws 연결이 실패해 Vite 가 페이지를 몇 초마다 새로고침해 버립니다.
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
})

