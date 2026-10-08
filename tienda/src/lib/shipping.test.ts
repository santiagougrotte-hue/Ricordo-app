import { describe, expect, it } from 'vitest';
import { byPartido, cartMessage, stepShipping, discountAmount, matchTypedLocality, cartTotals, discountPct, findZone as find, OTHER_LOCALITY, quote, type LocalityChoice } from './shipping';
import { SEED_LOCALITIES, SEED_SETTINGS, SEED_ZONES as REAL_ZONES } from './api/seed-data';

// Estas pruebas se escribieron con los valores anteriores a "envío por cajas" (fijos 1500…6000, CABA fijo).
const LEGACY: Record<string, { shippingCost: number; freeFromBoxes: number; distancePricing: boolean; tollRoundTrip: number }> = {
  'Hudson / Plátanos / Ranelagh': { shippingCost: 1500, freeFromBoxes: 4, distancePricing: true, tollRoundTrip: 0 },
  Berazategui: { shippingCost: 2500, freeFromBoxes: 4, distancePricing: true, tollRoundTrip: 0 },
  'Quilmes / Bernal / Wilde': { shippingCost: 4500, freeFromBoxes: 6, distancePricing: true, tollRoundTrip: 0 },
  CABA: { shippingCost: 5000, freeFromBoxes: 6, distancePricing: false, tollRoundTrip: 0 },
  'City Bell / La Plata': { shippingCost: 6000, freeFromBoxes: 8, distancePricing: true, tollRoundTrip: 0 },
};
const SEED_ZONES = REAL_ZONES.map((z) => ({ ...z, ...LEGACY[z.name] }));
const loc = (name: string) => SEED_LOCALITIES.find((l) => l.name === name)!.id;
const findZone = (_z: unknown, c: LocalityChoice) => find(SEED_ZONES, SEED_LOCALITIES, c);
const realZone = (c: LocalityChoice) => find(REAL_ZONES, SEED_LOCALITIES, c);

const caja = (price = 10000, countsAsBox = true) => ({ price, countsAsBox });
const cart = (boxes: number, extras = 0) =>
  cartTotals([{ product: caja(), quantity: boxes }, ...(extras ? [{ product: caja(3000, false), quantity: extras }] : [])]);

describe('zona por localidad', () => {
  it('la localidad define la zona (Ranelagh es viernes a la noche, aunque comparta CP con Berazategui)', () => {
    const r = findZone(0, loc('Ranelagh'));
    expect(r.status === 'found' && [r.zone.name, r.locality.partido]).toEqual(['Hudson / Plátanos / Ranelagh', 'Berazategui']);
    const w = findZone(0, loc('Wilde'));
    expect(w.status === 'found' && [w.zone.name, w.locality.partido]).toEqual(['Quilmes / Bernal / Wilde', 'Avellaneda']);
  });
  it('"Otra localidad" → not_found (WhatsApp o retiro), nunca error', () => expect(findZone(0, OTHER_LOCALITY)).toEqual({ status: 'not_found' }));
  it('sin elegir → empty', () => expect(findZone(0, null).status).toBe('empty'));
  it('localidad que ya no existe → not_found', () => expect(findZone(0, 999).status).toBe('not_found'));
  it('agrupa por partido para el selector', () => expect(byPartido(SEED_LOCALITIES).map(([p]) => p)).toEqual(['Berazategui', 'Quilmes', 'Avellaneda', 'CABA', 'La Plata']));
});

describe('qué cuenta como caja', () => {
  it('las salsas no suman cajas ni entran en el descuento', () => {
    expect(cart(3, 2)).toEqual({ subtotal: 36000, boxes: 3, boxSubtotal: 30000, hasExtras: true });
  });
});

describe('descuento por volumen', () => {
  const caba = SEED_ZONES.find((z) => z.name === 'CABA')!; // gratis desde 6
  it('CABA: 6 cajas 0 %, 7 cajas 5 %, 8 o más 10 % (tope)', () => {
    expect([6, 7, 8, 12].map((n) => discountPct(caba, n))).toEqual([0, 5, 10, 10]);
  });
  it('el % por caja y el tope se respetan por zona', () => {
    expect(discountPct({ ...caba, discountPerBox: 3, discountMax: 7 }, 9)).toBe(7);
    expect(discountPct({ ...caba, freeFromBoxes: null }, 20)).toBe(0);
  });
});

describe('quote', () => {
  const bera = findZone(0, loc('Berazategui Centro')); // mínimo 3, gratis desde 4, envío fijo 2500 (por distancia)
  const caba = findZone(0, loc('CABA')); // costo fijo 5000, gratis desde 6
  it('bajo el mínimo: no deja avanzar, dice cuántas cajas faltan y sugiere retiro', () => {
    const q = quote('delivery', bera, cart(2), SEED_SETTINGS);
    expect(q).toMatchObject({ missingForMin: 1, shippingCost: 2500, shippingEstimated: false, canCheckout: false, suggestPickup: true });
    expect(cartMessage(q, bera)).toBe('Sumá 1 caja más para hacer tu pedido con envío a Berazategui. O retiralo en Berazategui: con 2 cajas ya podés.');
  });
  it('con 1 caja no alcanza ni para retiro: no sugiere retiro', () => {
    expect(quote('delivery', bera, cart(1), SEED_SETTINGS).suggestPickup).toBe(false);
  });
  it('las salsas no ayudan a llegar al mínimo', () => {
    expect(quote('delivery', bera, cart(2, 5), SEED_SETTINGS).missingForMin).toBe(1);
  });
  it('en el mínimo: cobra envío y dice cuánto falta para gratis', () => {
    const q = quote('delivery', bera, cart(3), SEED_SETTINGS);
    expect(q).toMatchObject({ shippingCost: 2500, missingForFree: 1, canCheckout: true, total: 32500 });
    expect(cartMessage(q, bera)).toBe('Sumá 1 caja más y el envío a Berazategui es gratis.');
  });
  it('CABA con 7 cajas: envío gratis y 5 % solo sobre la caja extra; la salsa no entra', () => {
    const q = quote('delivery', caba, cart(7, 1), SEED_SETTINGS);
    expect(q).toMatchObject({ shippingCost: 0, discountPct: 5, discountBoxes: 1, discount: 500, total: 73000 - 500, missingForNextDiscount: 1, nextDiscountPct: 10 });
    expect(cartMessage(q, caba)).toBe('¡Envío gratis! Tus cajas extra tienen 5% de descuento. Sumá 1 caja más y llegás al 10%.');
  });
  it('CABA con 6 cajas: gratis y avisa desde qué caja hay descuento', () => {
    expect(cartMessage(quote('delivery', caba, cart(6), SEED_SETTINGS), caba)).toBe('¡Envío gratis! Las cajas que sumes después de la 6.ª tienen hasta 10% de descuento.');
  });
  it('CABA con 9 cajas: tope 10 % sobre las 3 extra; no muestra más mensajes de descuento', () => {
    const q = quote('delivery', caba, cart(9), SEED_SETTINGS);
    expect(q).toMatchObject({ discountPct: 10, discountBoxes: 3, discount: 3000, missingForNextDiscount: null });
    expect(cartMessage(q, caba)).toBe('¡Envío gratis!');
  });
  it('gratis desde 4: umbral +1 = 5 % de 1 caja, +2 = 10 % de 2, +3 = 10 % de 3, +5 = 10 % de 5', () => {
    expect([5, 6, 7, 9].map((n) => quote('delivery', bera, cart(n), SEED_SETTINGS).discount)).toEqual([500, 2000, 3000, 5000]);
  });
  it('precio promedio de las cajas cuando hay gustos con precios distintos', () => {
    expect(discountAmount(4 * 9800 + 3 * 8900, 7, 1, 5)).toBe(471); // 65900 / 7 × 5 % = 470,71
    expect(discountAmount(30000, 3, 0, 10)).toBe(0);
  });
  it('envío por distancia: usa el costo calculado; si todavía no hay, el fijo como aproximado', () => {
    const on = { ...SEED_SETTINGS, distanceEnabled: true };
    expect(quote('delivery', bera, cart(3), on, 1800)).toMatchObject({ shippingCost: 1800, shippingEstimated: false, total: 31800 });
    expect(quote('delivery', bera, cart(3), on, null)).toMatchObject({ shippingCost: 2500, shippingEstimated: true });
    expect(quote('delivery', bera, cart(4), on, 1800)).toMatchObject({ shippingCost: 0, shippingEstimated: false });
    // CABA no calcula por distancia: siempre el fijo
    expect(quote('delivery', caba, cart(5), on, 1800)).toMatchObject({ shippingCost: 5000, shippingEstimated: false });
    // Sin clave de OpenRouteService: el fijo es el definitivo
    expect(quote('delivery', bera, cart(3), SEED_SETTINGS, 1800)).toMatchObject({ shippingCost: 2500, shippingEstimated: false });
  });
  it('sin localidad no se puede cotizar', () => expect(quote('delivery', findZone(0, null), cart(5), SEED_SETTINGS)).toMatchObject({ shippingCost: null, canCheckout: false }));
  it('"Otra localidad": mensaje de WhatsApp', () => {
    const nf = findZone(0, OTHER_LOCALITY);
    expect(cartMessage(quote('delivery', nf, cart(5), SEED_SETTINGS), nf)).toBe('Todavía no llegamos a tu zona, escribinos por WhatsApp.');
  });
  it('retiro: mínimo 2 cajas, sin envío ni zona, sin descuento', () => {
    expect(quote('pickup', findZone(0, OTHER_LOCALITY), cart(1), SEED_SETTINGS)).toMatchObject({ missingForMin: 1, canCheckout: false });
    expect(quote('pickup', findZone(0, null), cart(9), SEED_SETTINGS)).toMatchObject({ shippingCost: 0, discount: 0, canCheckout: true, total: 90000 });
  });
  it('carrito vacío nunca habilita', () => expect(quote('pickup', findZone(0, null), cart(0), { ...SEED_SETTINGS, pickupMinBoxes: 0 }).canCheckout).toBe(false));
});

describe('localidad escrita por el cliente', () => {
  it('sin tildes ni mayúsculas', () => {
    expect(matchTypedLocality('villa espana', SEED_LOCALITIES)?.name).toBe('Villa España');
    expect(matchTypedLocality('  RANELAGH ', SEED_LOCALITIES)?.name).toBe('Ranelagh');
    expect(matchTypedLocality('Hudson', SEED_LOCALITIES)?.name).toBe('Guillermo E. Hudson');
    expect(matchTypedLocality('Capital Federal', SEED_LOCALITIES)?.name).toBe('CABA');
  });
  it('si no está en la lista → null (no llegamos)', () => expect(matchTypedLocality('Florencio Varela', SEED_LOCALITIES)).toBeNull());
});

describe('envío por localidad: con el pedido mínimo, la mitad del viaje; baja con cada caja hasta el gratis', () => {
  const S = { ...SEED_SETTINGS, shippingByBoxes: { absorbPerBox: 3500, rounding: 500, fuelPrice: 2080, consumption100km: 7, clientSharePct: 50 } };
  const ship = (name: string, boxes: number) => quote('delivery', realZone(loc(name)), cart(boxes), S).shippingCost;
  it('cada localidad paga distinto según sus km y su peaje (pedido mínimo)', () => {
    expect(ship('Berazategui Centro', 3)).toBe(1000); // 8 km → viaje $1.165 → mitad $583 → mínimo $1.000
    expect(ship('Plátanos', 3)).toBe(1500); // 17 km → $2.475 → $1.238
    expect(ship('Ezpeleta', 4)).toBe(1000); // 11 km → $1.602 → $801
    expect(ship('Quilmes Oeste', 4)).toBe(2500); // 28 km → $4.077 → $2.038
    expect(ship('Quilmes Centro', 4)).toBe(7000); // 40 km + $8.000 → $13.824 → $6.912
    expect(ship('Avellaneda', 4)).toBe(9500); // 75 km + $8.000 → $18.920 → $9.460
    expect(ship('CABA', 5)).toBe(12500); // 85 km + $12.000 → $24.376 → $12.188
    expect(ship('La Plata', 5)).toBe(14000); // 80 km + $16.000 → $27.648 → $13.824
  });
  it('cada caja extra lo baja en partes iguales hasta el envío gratis', () => {
    expect([4, 5, 6].map((b) => ship('Quilmes Centro', b))).toEqual([7000, 3500, 0]);
    expect([5, 6, 7, 8].map((b) => ship('CABA', b))).toEqual([12500, 8500, 4500, 0]);
    expect([4, 5, 6].map((b) => ship('Quilmes Oeste', b))).toEqual([2500, 1500, 0]); // nunca menos que el mínimo
    expect([3, 4].map((b) => ship('Berazategui Centro', b))).toEqual([1000, 0]);
  });
  it('el carrito avisa cuánto baja con una caja más', () => {
    const qc = realZone(loc('Quilmes Centro'));
    const q4 = quote('delivery', qc, cart(4), S);
    expect(q4).toMatchObject({ shippingCost: 7000, nextBoxShipping: 3500, missingForFree: 2, shippingEstimated: false });
    expect(cartMessage(q4, qc)).toBe('Sumá 1 caja más y el envío a Quilmes / Bernal / Wilde baja a $3.500. Con 2 cajas más, es gratis.');
    expect(cartMessage(quote('delivery', qc, cart(5), S), qc)).toBe('Sumá 1 caja más y el envío a Quilmes / Bernal / Wilde es gratis.');
  });
  it('localidad sin km cargados: usa el envío de la zona como envío del pedido mínimo', () => {
    const z = realZone(loc('CABA'));
    if (z.status !== 'found') throw new Error();
    expect(quote('delivery', { ...z, locality: { ...z.locality, kmRoundTrip: null } }, cart(5), S).shippingCost).toBe(7500);
  });
  it('las salsas no cuentan como caja para bajar el envío', () => {
    expect(quote('delivery', realZone(loc('Quilmes Centro')), cart(4, 3), S).shippingCost).toBe(7000);
  });
  it('stepShipping: cuentas enteras, sin errores de redondeo', () => {
    expect(stepShipping(6912, 5, { minBoxes: 4, freeFromBoxes: 6 }, 1000, 500)).toBe(3500);
    expect(stepShipping(3000, 5, { minBoxes: 4, freeFromBoxes: 6 }, 1000, 500)).toBe(1500);
    expect(stepShipping(3000, 4, { minBoxes: 4, freeFromBoxes: null }, 1000, 500)).toBe(3000);
  });
});
