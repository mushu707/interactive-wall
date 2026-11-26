import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 前端构建产物输出到 dist/，由 server/index.js 直接托管。
// 开发时 vite 跑 5173，/api 与 /uploads 代理到后端 3000。
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3000', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200
  }
})
