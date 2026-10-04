import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:html` → dist-html/index.html: la tienda entera (modo demo) en un solo archivo.
const SINGLE = !!process.env.VITE_SINGLEFILE;

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

/** En el archivo único, el ícono de la pestaña va embebido (no hay /favicon.svg al lado). */
function inlineFavicon(): Plugin {
  return {
    name: 'ricordo-inline-favicon',
    transformIndexHtml(html) {
      const svg = readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8');
      return html.replace('href="/favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(svg)}"`);
    },
  };
}

export default defineConfig({
  plugins: SINGLE ? [react(), viteSingleFile(), inlineFavicon()] : [react(), preloadFonts()],
  // styles/tokens.css vive en la raíz del repo (fuente de verdad del brand board).
  server: { fs: { allow: ['..'] } },
  // El chunk 3D (three.js) pesa ~590 KB sin comprimir: se carga diferido y solo en equipos capaces.
  build: SINGLE
    ? { target: 'es2020', outDir: 'dist-html', chunkSizeWarningLimit: 4000 }
    : { target: 'es2020', cssCodeSplit: true, chunkSizeWarningLimit: 650 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
