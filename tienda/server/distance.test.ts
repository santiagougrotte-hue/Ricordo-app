import { describe, expect, it } from 'vitest';
import { priceForKm } from './distance';

const BANDS = [{ upToKm: 3, price: 1500 }, { upToKm: 10, price: 2500 }, { upToKm: null, price: 8000 }];

describe('escalones por km', () => {
  it('cada distancia cae en su escalón (el límite entra en el escalón)', () => {
    expect([0.5, 3, 3.1, 10, 10.1, 80].map((km) => priceForKm(km, BANDS))).toEqual([1500, 1500, 2500, 2500, 8000, 8000]);
  });
  it('sin escalón "más lejos", pasando el último → null (se usa el costo fijo de la zona)', () =>
    expect(priceForKm(12, BANDS.slice(0, 2))).toBeNull());
  it('el orden en que se cargan no importa', () => expect(priceForKm(5, [...BANDS].reverse())).toBe(2500));
});
