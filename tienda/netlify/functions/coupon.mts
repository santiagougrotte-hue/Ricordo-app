import type { Config, Context } from '@netlify/functions';
import { checkCoupon } from '../../server/coupons';
import { query } from '../../server/db';

// Valida un cupón para el checkout (informativo: create_order lo vuelve a validar).
export default async (req: Request, context: Context) => {
  const body = await req.json().catch(() => null);
  const r = await checkCoupon(body, { query, ip: context.ip, secret: Netlify.env.get('SESSION_SECRET') ?? 'ricordo' }).catch((e) => {
    console.error('[coupon]', e);
    return { status: 500, body: { ok: false as const, message: 'No pudimos revisar el cupón. Probá de nuevo en un momento.' } };
  });
  return Response.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
};

export const config: Config = { path: '/api/coupon', method: 'POST' };
