import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置：dev server 5173，所有 /api 与 /data 请求代理到后端 8001
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/data': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
