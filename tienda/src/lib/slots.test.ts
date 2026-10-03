import { describe, expect, it } from 'vitest';
import { availableSlots, slotDay, slotDeadline, slotHours } from './slots';
import { SEED_WINDOWS } from './api/seed-data';

// Sábado 3/10/2026 19:09 en Buenos Aires = 22:09 UTC (mismo caso que se probó en la base).
const SAT_EVENING = new Date('2026-10-03T22:09:00Z');

describe('availableSlots', () => {
  it('coincide con available_delivery_slots() de la base', () => {
    const s = availableSlots(SEED_WINDOWS, 'delivery', SAT_EVENING, 14);
    expect(s.map((x) => `${x.date} ${x.label}`)).toEqual([
      '2026-10-09 Viernes a la noche',
      '2026-10-10 Sábado a la mañana',
      '2026-10-16 Viernes a la noche',
      '2026-10-17 Sábado a la mañana',
    ]);
    expect(s[0].closesAt).toBe('2026-10-08T23:00:00.000Z'); // jueves 20 h en AR
  });
  it('el viernes cierra 24 h antes: el jueves 20:01 ya no aparece', () => {
    const thu = new Date('2026-10-08T23:01:00Z');
    expect(availableSlots(SEED_WINDOWS, 'delivery', thu, 3)[0].date).toBe('2026-10-10');
  });
  it('turnos inactivos no aparecen', () => {
    const w = SEED_WINDOWS.map((x) => ({ ...x, active: x.weekday !== 5 }));
    expect(availableSlots(w, 'delivery', SAT_EVENING, 7).every((x) => x.label.startsWith('Sábado'))).toBe(true);
  });
  it('formatos para la UI', () => {
    const [vie] = availableSlots(SEED_WINDOWS, 'delivery', SAT_EVENING, 14);
    expect(slotDay(vie)).toBe('viernes 9/10');
    expect(slotHours(vie)).toBe('20 a 23 h');
    expect(slotDeadline(vie)).toBe('jueves 8/10 a las 20 h');
  });
});
