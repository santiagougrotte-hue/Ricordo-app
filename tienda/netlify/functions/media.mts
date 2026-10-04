import type { Config } from '@netlify/functions';
import { netlifyMedia } from '../../server/media';

// Fotos y videos de productos guardados en Netlify Blobs. Las claves no cambian nunca: caché de un año.
export default async (req: Request) => {
  const key = decodeURIComponent(new URL(req.url).pathname.replace(/^\/media\//, ''));
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg|png|mp4|webm)$/.test(key)) return new Response('No encontrado', { status: 404 });
  const file = await (await netlifyMedia()).get(key);
  if (!file) return new Response('No encontrado', { status: 404 });
  return new Response(file.data, {
    headers: { 'Content-Type': file.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' },
  });
};

export const config: Config = { path: '/media/*', method: 'GET' };
