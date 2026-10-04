import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // styles/tokens.css vive en la raíz del repo (fuente de verdad del brand board).
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', cssCodeSplit: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
