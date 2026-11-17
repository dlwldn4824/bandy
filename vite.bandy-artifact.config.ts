import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 밴디 데모를 Claude Artifact로 올리기 위한 빌드(한 묶음 JS + CSS). 결과는 dist-bandy-artifact/
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_BANDY_DEMO': JSON.stringify('true') },
  build: {
    outDir: 'dist-bandy-artifact',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'bandy-artifact.html',
      output: { inlineDynamicImports: true },
    },
  },
})
