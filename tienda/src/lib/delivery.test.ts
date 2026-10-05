import { describe, expect, it } from 'vitest';
import { cutoffWithDate, deliveryDateFor, deliveryLabel, deliverySentence, nextCutoff } from './delivery';
import { SEED_SETTINGS, SEED_ZONES } from './api/seed-data';

// Horas de Buenos Aires (UTC−3). Octubre 2026: jueves 8, viernes 9, sábado 10, domingo 11.
const ar = (s: string) => new Date(s + '-03:00');
const S = SEED_SETTINGS; // cierre jueves 13 h

describe('cierre de pedidos', () => {
  it('el lunes: cierra este jueves 13 h', () => expect(cutoffWithDate(S, ar('2026-10-05T10:00'))).toBe('jueves 8/10, 13 h'));
  it('el jueves 12:59 todavía entra', () => expect(deliveryDateFor(6, S, ar('2026-10-08T12:59'))).toBe('2026-10-10'));
  it('el jueves 13:00 ya pasa al fin de semana siguiente', () => expect(deliveryDateFor(6, S, ar('2026-10-08T13:00'))).toBe('2026-10-17'));
  it('el viernes: el fin de semana siguiente', () => expect(deliveryDateFor(5, S, ar('2026-10-09T09:00'))).toBe('2026-10-16'));
  it('cada zona en su día: viernes, sábado, domingo', () => {
    const now = ar('2026-10-06T18:00');
    expect([5, 6, 0].map((d) => deliveryDateFor(d, S, now))).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
  });
  it('a medianoche UTC sigue siendo el día de Buenos Aires', () => {
    // miércoles 7, 22 h en Buenos Aires = jueves 8, 01 h UTC
    expect(nextCutoff(S, ar('2026-10-07T22:00')).toISOString().slice(0, 16)).toBe('2026-10-08T13:00');
  });
});

describe('textos', () => {
  const bera = SEED_ZONES.find((z) => z.name === 'Berazategui')!;
  const lp = SEED_ZONES.find((z) => z.name.startsWith('La Plata'))!;
  it('frase del checkout', () => {
    expect(deliverySentence(bera, S, ar('2026-10-05T10:00'))).toBe('Pedí hasta el jueves 13 h y te llega el sábado 10 a la mañana');
    expect(deliverySentence(lp, S, ar('2026-10-05T10:00'))).toBe('Pedí hasta el jueves 13 h y te llega el domingo 11');
  });
  it('etiqueta guardada en el pedido', () => expect(deliveryLabel('2026-10-09', 'a la noche')).toBe('Viernes 9/10 a la noche'));
});
