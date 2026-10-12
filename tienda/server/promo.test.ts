// Promo Día de la Madre: create_order (Postgres real) y el carrito tienen que dar lo mismo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Query } from './db';
import { freshDb, TEST_DB } from './testdb';
import { mapPromo, PROMO_SQL } from './catalog';
import { cartTotals, quote } from '../src/lib/shipping';
import type { StoreSettings } from '../src/lib/types';

const P1 = '00000000-0000-4000-8000-000000000001';
const SALSA = '00000000-0000-4000-8000-000000000020';

describe.skipIf(!TEST_DB)('promo por cajas en create_order', () => {
  let q: Query;
  let pool: pg.Pool;
  let price = 0;

  const order = async (boxes: number, extra: { productId: string; quantity: number }[] = []) => {
    const items = [{ product_id: P1, quantity: boxes }, ...extra.map((e) => ({ product_id: e.productId, quantity: e.quantity }))];
    const [r] = await q<{ order_id: string }>(
      `select * from create_order('Ana', '1155551234', null, 'pickup', null, null, null, null, 'cash', $1::jsonb)`, [JSON.stringify(items)]);
    const [o] = await q<{ subtotal: number; discount: number; discount_pct: number; total: number; promo_name: string | null; gift_count: number }>(
      'select subtotal, discount, discount_pct, total, promo_name, gift_count from orders where id = $1', [r.order_id]);
    const gifts = await q<{ quantity: number }>('select quantity from order_items where order_id = $1 and unit_price = 0', [r.order_id]);
    return { ...o, giftLines: gifts.map((g) => g.quantity) };
  };

  beforeAll(async () => {
    ({ q, pool } = await freshDb());
    await q(`update store_settings set promo_enabled = true, promo_starts_at = now() - interval '1 day', promo_ends_at = now() + interval '1 day', pickup_min_boxes = 1`);
    await q(`update products set stock = 99, active = true where id = $1`, [P1]);
    await q(`update products set stock = 1, active = true where id = $1`, [SALSA]);
    price = (await q<{ price: number }>('select price from products where id = $1', [P1]))[0].price;
  });
  afterAll(async () => pool?.end());

  it('con 2 cajas no hay promo', async () => {
    const o = await order(2);
    expect(o).toMatchObject({ discount: 0, promo_name: null, gift_count: 0, giftLines: [] });
  });

  it('desde 3 cajas: 10% sobre el total, sin regalo', async () => {
    const o = await order(3);
    expect(o).toMatchObject({ discount_pct: 10, discount: Math.round(price * 3 * 0.1), promo_name: 'Día de la Madre', gift_count: 0, giftLines: [] });
    expect(o.total).toBe(o.subtotal - o.discount);
  });

  it('desde 4 cajas: 15% + 1 salsa de regalo; el % incluye las salsas compradas', async () => {
    const salsaPrice = (await q<{ price: number }>('select price from products where id = $1', [SALSA]))[0].price;
    await q('update products set stock = 5 where id = $1', [SALSA]);
    const o = await order(4, [{ productId: SALSA, quantity: 1 }]);
    expect(o.subtotal).toBe(price * 4 + salsaPrice);
    expect(o).toMatchObject({ discount_pct: 15, discount: Math.round((price * 4 + salsaPrice) * 0.15), gift_count: 1, giftLines: [1] });
    // 1 comprada + 1 de regalo
    expect((await q<{ stock: number }>('select stock from products where id = $1', [SALSA]))[0].stock).toBe(3);
  });

  it('desde 5 cajas: 15% + 2 salsas; sin stock suficiente igual figuran y el stock queda en 0', async () => {
    await q('update products set stock = 1 where id = $1', [SALSA]);
    const o = await order(6);
    expect(o).toMatchObject({ discount_pct: 15, gift_count: 2, giftLines: [2] });
    expect((await q<{ stock: number }>('select stock from products where id = $1', [SALSA]))[0].stock).toBe(0);
  });

  it('el carrito calcula lo mismo que la base', async () => {
    const [row] = await q(PROMO_SQL);
    const settings = { pickupEnabled: true, pickupMinBoxes: 1, pickupAddress: '', whatsappPhone: '', transferInfo: '', cutoffWeekday: 4, cutoffTime: '13:00', promo: mapPromo(row) } as StoreSettings;
    for (const boxes of [2, 3, 4, 5, 7]) {
      const cart = cartTotals([{ product: { price, countsAsBox: true }, quantity: boxes }]);
      const qt = quote('pickup', { status: 'empty' }, cart, settings);
      const o = await order(boxes);
      expect([qt.discount, qt.discountPct, qt.promoGifts, qt.total]).toEqual([o.discount, o.discount_pct, o.gift_count, o.total]);
    }
    const qt3 = quote('pickup', { status: 'empty' }, cartTotals([{ product: { price, countsAsBox: true }, quantity: 3 }]), settings);
    expect(qt3.promoNext).toMatchObject({ missing: 1, tier: { minBoxes: 4, pct: 15, gifts: 1 } });
  });

  it('la lasaña (oculta al principio) cuenta como caja para la promo', async () => {
    const LASANA = '00000000-0000-4000-8000-000000000021';
    expect((await q<{ active: boolean; price: number; units_per_box: number }>('select active, price, units_per_box from products where id = $1', [LASANA]))[0])
      .toEqual({ active: false, price: 18000, units_per_box: 1 });
    await q('update products set active = true, stock = 5 where id = $1', [LASANA]);
    const o = await order(2, [{ productId: LASANA, quantity: 1 }]);
    expect(o).toMatchObject({ discount_pct: 10, discount: Math.round((price * 2 + 18000) * 0.1) });
  });

  it('apagada o vencida no aplica', async () => {
    await q(`update store_settings set promo_ends_at = now() - interval '1 minute'`);
    expect(await order(5)).toMatchObject({ discount: 0, promo_name: null, gift_count: 0 });
    await q(`update store_settings set promo_ends_at = now() + interval '1 day', promo_enabled = false`);
    expect(await order(5)).toMatchObject({ discount: 0, promo_name: null, gift_count: 0 });
  });
});
