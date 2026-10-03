import { describe, expect, it } from 'vitest';
import { findZone, quote } from './shipping';
import { SEED_SETTINGS, SEED_ZONES } from './api/seed-data';

describe('findZone', () => {
  it('encuentra la zona por CPA', () => {
    const r = findZone(SEED_ZONES, 'B1884ABC');
    expect(r.status).toBe('found');
    if (r.status === 'found') expect(r.zone.name).toBe('Berazategui');
  });
  it('CP sin zona → not_found (nunca error)', () => expect(findZone(SEED_ZONES, '1900')).toEqual({ status: 'not_found', postalCode: '1900' }));
  it('basura → invalid', () => expect(findZone(SEED_ZONES, 'hola').status).toBe('invalid'));
  it('vacío → empty', () => expect(findZone(SEED_ZONES, '  ').status).toBe('empty'));
});

describe('quote', () => {
  const bera = findZone(SEED_ZONES, '1884'); // envío 1500, mínimo 15000, gratis desde 30000
  it('bajo el mínimo: no deja avanzar y dice cuánto falta', () => {
    const q = quote('delivery', bera, 10000, SEED_SETTINGS);
    expect(q).toMatchObject({ shippingCost: 1500, missingForMin: 5000, missingForFree: 20000, canCheckout: false });
  });
  it('sobre el mínimo: cobra envío', () => expect(quote('delivery', bera, 20000, SEED_SETTINGS)).toMatchObject({ shippingCost: 1500, canCheckout: true }));
  it('desde el umbral: envío gratis', () => expect(quote('delivery', bera, 30000, SEED_SETTINGS)).toMatchObject({ shippingCost: 0, missingForFree: 0 }));
  it('zona sin envío gratis', () => expect(quote('delivery', findZone(SEED_ZONES, '1888'), 50000, SEED_SETTINGS)).toMatchObject({ shippingCost: 3000, missingForFree: null }));
  it('sin CP no se puede cotizar', () => expect(quote('delivery', findZone(SEED_ZONES, ''), 50000, SEED_SETTINGS)).toMatchObject({ shippingCost: null, canCheckout: false }));
  it('retiro: sin envío ni mínimo', () => expect(quote('pickup', findZone(SEED_ZONES, '1900'), 8500, SEED_SETTINGS)).toMatchObject({ shippingCost: 0, canCheckout: true }));
  it('retiro con mínimo configurado', () =>
    expect(quote('pickup', findZone(SEED_ZONES, ''), 8500, { ...SEED_SETTINGS, pickupMinOrder: 10000 })).toMatchObject({ missingForMin: 1500, canCheckout: false }));
  it('carrito vacío nunca habilita', () => expect(quote('pickup', findZone(SEED_ZONES, ''), 0, SEED_SETTINGS).canCheckout).toBe(false));
});
