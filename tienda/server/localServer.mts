// Servidor local que imita a Netlify para probar el build real (pruebas E2E): sirve dist/ y corre las funciones.
// Uso: DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... SESSION_SECRET=... npx tsx server/localServer.mts
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { query } from './db';
import { getCatalog } from './catalog';
import { handleCreateOrder } from './createOrder';
import { handleAdmin } from './admin';
import { memoryMedia } from './media';

const DIST = new URL('../dist/', import.meta.url).pathname;
const media = memoryMedia();
const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.txt': 'text/plain' };
// Turnstile local: acepta solo el token de prueba de Cloudflare.
const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).includes('siteverify')) return Response.json({ success: new URLSearchParams(String(init?.body)).get('response') === 'XXXX.DUMMY.TOKEN.XXXX' });
  return Response.json({ ok: true });
}) as typeof fetch;

createServer(async (nreq, nres) => {
  const url = new URL(nreq.url ?? '/', 'http://localhost');
  const chunks: Buffer[] = [];
  for await (const c of nreq) chunks.push(c as Buffer);
  const req = new Request(url, { method: nreq.method, headers: nreq.headers as Record<string, string>, body: ['GET', 'HEAD'].includes(nreq.method!) ? undefined : Buffer.concat(chunks) });
  let res: Response;
  try {
    if (url.pathname === '/api/catalog') res = Response.json(await getCatalog(query));
    else if (url.pathname === '/api/create-order') {
      const r = await handleCreateOrder(await req.json().catch(() => null), { TURNSTILE_SECRET_KEY: 'test', SESSION_SECRET: process.env.SESSION_SECRET }, { query, fetch: fakeFetch, ip: String(Math.random()) });
      res = Response.json(r.body, { status: r.status });
    } else if (url.pathname.startsWith('/api/admin/')) {
      res = await handleAdmin(req, url.pathname.replace(/^\/api\/admin\/?/, ''), process.env, { query, media: async () => media, ip: '127.0.0.1', secure: false });
    } else if (url.pathname === '/.netlify/images') {
      // Sustituto del Image CDN: devuelve el original sin redimensionar.
      const src = url.searchParams.get('url') ?? '';
      res = new Response(null, { status: 302, headers: { Location: src } });
    } else if (url.pathname.startsWith('/media/')) {
      const f = await media.get(url.pathname.slice(7));
      res = f ? new Response(f.data, { headers: { 'Content-Type': f.contentType } }) : new Response('404', { status: 404 });
    } else {
      const file = url.pathname === '/' || !extname(url.pathname) ? 'index.html' : url.pathname.slice(1);
      try {
        res = new Response(await readFile(join(DIST, file)), { headers: { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' } });
      } catch {
        res = new Response(await readFile(join(DIST, 'index.html')), { headers: { 'Content-Type': 'text/html' } });
      }
    }
  } catch (e) {
    console.error(e);
    res = Response.json({ error: String(e) }, { status: 500 });
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  nres.writeHead(res.status, headers);
  nres.end(Buffer.from(await res.arrayBuffer()));
}).listen(Number(process.env.PORT ?? 8888), () => console.log('listo'));
