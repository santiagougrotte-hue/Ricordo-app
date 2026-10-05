import { describe, expect, it } from 'vitest';
import { cartMessage, cartTotals, discountPct, findZone, quote, zoneHasCp } from './shipping';
import { SEED_SETTINGS, SEED_ZONES } from './api/seed-data';

const caja = (price = 10000, countsAsBox = true) => ({ price, countsAsBox });
const cart = (boxes: number, extras = 0) =>
  cartTotals([{ product: caja(), quantity: boxes }, ...(extras ? [{ product: caja(3000, false), quantity: extras }] : [])]);

describe('findZone', () => {
  it('encuentra la zona por CPA', () => {
    const r = findZone(SEED_ZONES, 'B1884ABC');
    expect(r.status === 'found' && r.zone.name).toBe('Berazategui');
  });
  it('rangos: CABA 1000 a 1499', () => {
    expect(zoneHasCp(['1000-1499'], '1000')).toBe(true);
    expect(zoneHasCp(['1000-1499'], '1499')).toBe(true);
    expect(zoneHasCp(['1000-1499'], '1500')).toBe(false);
    const r = findZone(SEED_ZONES, 'C1425ABC');
    expect(r.status === 'found' && r.zone.name).toBe('CABA');
  });
  it('CP sin zona → not_found (nunca error)', () => expect(findZone(SEED_ZONES, '1888')).toEqual({ status: 'not_found', postalCode: '1888' }));
  it('basura → invalid', () => expect(findZone(SEED_ZONES, 'hola').status).toBe('invalid'));
  it('vacío → empty', () => expect(findZone(SEED_ZONES, '  ').status).toBe('empty'));
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
  const bera = findZone(SEED_ZONES, '1884'); // mínimo 3, gratis desde 4, envío 1500
  const caba = findZone(SEED_ZONES, '1425');
  it('bajo el mínimo: no deja avanzar, dice cuántas cajas faltan y sugiere retiro', () => {
    const q = quote('delivery', bera, cart(2), SEED_SETTINGS);
    expect(q).toMatchObject({ missingForMin: 1, shippingCost: 1500, canCheckout: false, suggestPickup: true });
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
    expect(q).toMatchObject({ shippingCost: 1500, missingForFree: 1, canCheckout: true, total: 31500 });
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
  it('sin CP no se puede cotizar', () => expect(quote('delivery', findZone(SEED_ZONES, ''), cart(5), SEED_SETTINGS)).toMatchObject({ shippingCost: null, canCheckout: false }));
  it('CP sin zona: mensaje de WhatsApp', () => {
    const nf = findZone(SEED_ZONES, '1888');
    expect(cartMessage(quote('delivery', nf, cart(5), SEED_SETTINGS), nf)).toBe('Todavía no llegamos a tu zona, escribinos por WhatsApp.');
  });
  it('retiro: mínimo 2 cajas, sin envío ni zona, sin descuento', () => {
    expect(quote('pickup', findZone(SEED_ZONES, '1888'), cart(1), SEED_SETTINGS)).toMatchObject({ missingForMin: 1, canCheckout: false });
    expect(quote('pickup', findZone(SEED_ZONES, ''), cart(9), SEED_SETTINGS)).toMatchObject({ shippingCost: 0, discount: 0, canCheckout: true, total: 90000 });
  });
  it('carrito vacío nunca habilita', () => expect(quote('pickup', findZone(SEED_ZONES, ''), cart(0), { ...SEED_SETTINGS, pickupMinBoxes: 0 }).canCheckout).toBe(false));
});
