import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev server proxies /api and /export to the Fastify backend on 4310 so the
// frontend always talks same-origin, exactly like production.
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4310',
      '/export': 'http://127.0.0.1:4310',
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'charts';
          if (id.includes('node_modules/react')) return 'react';
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['web/test/**/*.test.{ts,tsx}'],
    setupFiles: ['web/test/setup.ts'],
    css: false,
    globals: false,
  },
});