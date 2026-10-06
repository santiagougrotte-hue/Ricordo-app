import type { Config, Context } from '@netlify/functions';
import { handleAdmin } from '../../server/admin';
import { query } from '../../server/db';
import { netlifyMedia } from '../../server/media';

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  try {
    return await handleAdmin(
      req,
      path,
      { ADMIN_EMAIL: Netlify.env.get('ADMIN_EMAIL'), ADMIN_PASSWORD: Netlify.env.get('ADMIN_PASSWORD'), SESSION_SECRET: Netlify.env.get('SESSION_SECRET'),
        CALLMEBOT_APIKEY: Netlify.env.get('CALLMEBOT_APIKEY'), WHATSAPP_NOTIFY_PHONE: Netlify.env.get('WHATSAPP_NOTIFY_PHONE'), ORS_API_KEY: Netlify.env.get('ORS_API_KEY'), SITE_URL: Netlify.env.get('SITE_URL') ?? Netlify.env.get('URL') },
      { query, media: netlifyMedia, ip: context.ip, secure: new URL(req.url).protocol === 'https:' },
    );
  } catch (e) {
    console.error('[admin]', path, e);
    return Response.json({ error: 'Error del servidor' }, { status: 500 });
  }
};

export const config: Config = { path: '/api/admin/*' };
