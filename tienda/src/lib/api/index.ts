import type { StoreApi } from './types';
import { createDemoApi } from './demo';
import { createNetlifyApi } from './netlify';

/** VITE_DEMO=1 (npm run dev / build:html): datos de ejemplo en el navegador. Si no, la tienda real en Netlify. */
export const DEMO = import.meta.env.VITE_DEMO === '1';
export const api: StoreApi = DEMO ? createDemoApi() : createNetlifyApi();
