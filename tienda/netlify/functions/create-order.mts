import type { Config, Context } from '@netlify/functions';
import { handleCreateOrder } from '../../server/createOrder';
import { query } from '../../server/db';

export default async (req: Request, context: Context) => {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* body inválido: lo rechaza la validación */
  }
  const env = {
    TURNSTILE_SECRET_KEY: Netlify.env.get('TURNSTILE_SECRET_KEY'),
    SESSION_SECRET: Netlify.env.get('SESSION_SECRET'),
    RESEND_API_KEY: Netlify.env.get('RESEND_API_KEY'),
    NOTIFY_FROM: Netlify.env.get('NOTIFY_FROM'),
    TELEGRAM_BOT_TOKEN: Netlify.env.get('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_CHAT_ID: Netlify.env.get('TELEGRAM_CHAT_ID'),
    CALLMEBOT_APIKEY: Netlify.env.get('CALLMEBOT_APIKEY'),
    WHATSAPP_NOTIFY_PHONE: Netlify.env.get('WHATSAPP_NOTIFY_PHONE'),
    SITE_URL: Netlify.env.get('URL'),
  };
  const result = await handleCreateOrder(body, env, { query, fetch, ip: context.ip, log: (m, x) => console.error('[create-order]', m, x ?? '') });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
};

export const config: Config = { path: '/api/create-order', method: 'POST' };
