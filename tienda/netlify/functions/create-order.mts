import type { Config, Context } from '@netlify/functions';
import { handleCreateOrder } from '../../server/createOrder';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* body inválido: lo rechaza la validación */
  }
  const env = {
    SUPABASE_URL: Netlify.env.get('SUPABASE_URL') ?? Netlify.env.get('VITE_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    TURNSTILE_SECRET_KEY: Netlify.env.get('TURNSTILE_SECRET_KEY'),
    RESEND_API_KEY: Netlify.env.get('RESEND_API_KEY'),
    NOTIFY_FROM: Netlify.env.get('NOTIFY_FROM'),
    TELEGRAM_BOT_TOKEN: Netlify.env.get('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_CHAT_ID: Netlify.env.get('TELEGRAM_CHAT_ID'),
    SITE_URL: Netlify.env.get('URL'),
  };
  const result = await handleCreateOrder(body, env, { fetch, ip: context.ip, log: (m, x) => console.error('[create-order]', m, x ?? '') });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
};

export const config: Config = { path: '/api/create-order', method: 'POST' };
