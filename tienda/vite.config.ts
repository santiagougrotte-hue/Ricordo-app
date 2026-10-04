import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** Precarga las dos fuentes que pintan lo primero (Gloock y DM Sans): menos salto de texto al cargar. */
function preloadFonts(): Plugin {
  return {
    name: 'ricordo-preload-fonts',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(gloock-latin-400-normal|dm-sans-latin-wght-normal)-[\w-]+\.woff2$/.test(f));
      return {
        html,
        tags: files.map((f) => ({ tag: 'link', injectTo: 'head-prepend' as const, attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: '/' + f, crossorigin: '' } })),
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), preloadFonts()],
  // styles/tokens.css vive en la raíz del repo (fuente de verdad del brand board).
  server: { fs: { allow: ['..'] } },
  // El chunk 3D (three.js) pesa ~590 KB sin comprimir: se carga diferido y solo en equipos capaces.
  build: { target: 'es2020', cssCodeSplit: true, chunkSizeWarningLimit: 650 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
