import type { Config } from '@netlify/functions';
import { runReminders } from '../../server/reminders';
import { query } from '../../server/db';

// Todos los días a las 10 de Argentina (13 UTC): recordatorio por mail con cupón a quien pidió novedades.
export default async () => {
  const r = await runReminders({
    query, fetch,
    env: { RESEND_API_KEY: Netlify.env.get('RESEND_API_KEY'), NOTIFY_FROM: Netlify.env.get('NOTIFY_FROM'), SESSION_SECRET: Netlify.env.get('SESSION_SECRET'), SITE_URL: Netlify.env.get('URL') },
    log: (m) => console.log('[reminders]', m),
  });
  console.log('[reminders]', JSON.stringify(r));
};

export const config: Config = { schedule: '0 13 * * *' };
