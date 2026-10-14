import type { Config } from '@netlify/functions';
import { handleUnsubscribe } from '../../server/reminders';
import { query } from '../../server/db';

// Baja de los mails de novedades: link firmado, sin iniciar sesión (GET desde el mail, POST "one-click" del cliente de correo).
export default async (req: Request) => {
  const r = await handleUnsubscribe(new URL(req.url), query, Netlify.env.get('SESSION_SECRET') ?? '');
  return new Response(r.html, { status: r.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
};

export const config: Config = { path: '/api/unsubscribe', method: ['GET', 'POST'] };
