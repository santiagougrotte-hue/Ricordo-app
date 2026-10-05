import { describe, expect, it } from 'vitest';
import { byPartido, cartMessage, matchTypedLocality, cartTotals, discountPct, findZone as find, OTHER_LOCALITY, quote, type LocalityChoice } from './shipping';
import { SEED_LOCALITIES, SEED_SETTINGS, SEED_ZONES } from './api/seed-data';

const loc = (name: string) => SEED_LOCALITIES.find((l) => l.name === name)!.id;
const findZone = (_z: unknown, c: LocalityChoice) => find(SEED_ZONES, SEED_LOCALITIES, c);

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
  const bera = findZone(0, loc('Berazategui')); // mínimo 3, gratis desde 4, envío fijo 2500 (por distancia)
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
  it('CABA con 7 cajas: envío gratis y 5 % sobre las cajas', () => {
    const q = quote('delivery', caba, cart(7, 1), SEED_SETTINGS);
    expect(q).toMatchObject({ shippingCost: 0, discountPct: 5, discount: 3500, total: 73000 - 3500, missingForNextDiscount: 1, nextDiscountPct: 10 });
    expect(cartMessage(q, caba)).toBe('¡Envío gratis y 5% de descuento! Sumá 1 caja más y llegás al 10%.');
  });
  it('CABA con 6 cajas: gratis y avisa el descuento', () => {
    expect(cartMessage(quote('delivery', caba, cart(6), SEED_SETTINGS), caba)).toBe('¡Envío gratis! Sumá 1 caja más y tenés 5% de descuento.');
  });
  it('CABA con 9 cajas: tope 10 %', () => {
    const q = quote('delivery', caba, cart(9), SEED_SETTINGS);
    expect(q).toMatchObject({ discountPct: 10, discount: 9000, missingForNextDiscount: null });
    expect(cartMessage(q, caba)).toBe('¡Envío gratis y 10% de descuento!');
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
