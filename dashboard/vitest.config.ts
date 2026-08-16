import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'web/test/**/*.test.{ts,tsx}'],
    setupFiles: ['web/test/setup.ts'],
    css: false,
  },
});
