import type { DeliveryMethod, DeliverySlot } from './types';

export interface DeliveryWindow {
  id: string;
  label: string;
  weekday: number; // 0 = domingo … 6 = sábado
  startsAt: string; // HH:MM
  endsAt: string;
  cutoffHours: number;
  forDelivery: boolean;
  forPickup: boolean;
  active: boolean;
}

// Argentina no tiene horario de verano: UTC−3 fijo.
const AR_OFFSET_H = 3;

function arDateParts(now: Date) {
  const ar = new Date(now.getTime() - AR_OFFSET_H * 3600_000);
  return { y: ar.getUTCFullYear(), m: ar.getUTCMonth(), d: ar.getUTCDate() };
}

/** Misma lógica que available_delivery_slots() en la base (para el modo demo). */
export function availableSlots(
  windows: DeliveryWindow[],
  method: DeliveryMethod,
  now = new Date(),
  days = 14,
): DeliverySlot[] {
  const { y, m, d } = arDateParts(now);
  const out: DeliverySlot[] = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(Date.UTC(y, m, d + i));
    const dow = day.getUTCDay();
    for (const w of windows) {
      if (!w.active || w.weekday !== dow) continue;
      if (method === 'delivery' ? !w.forDelivery : !w.forPickup) continue;
      const [hh, mm] = w.startsAt.split(':').map(Number);
      const startUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh + AR_OFFSET_H, mm);
      const closes = startUtc - w.cutoffHours * 3600_000;
      if (closes <= now.getTime()) continue;
      out.push({
        windowId: w.id,
        date: day.toISOString().slice(0, 10),
        label: w.label,
        startsAt: w.startsAt.slice(0, 5),
        endsAt: w.endsAt.slice(0, 5),
        closesAt: new Date(closes).toISOString(),
      });
    }
  }
  return out.sort((a, b) => (a.date + a.startsAt).localeCompare(b.date + b.startsAt));
}

const DAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "viernes 9/10" */
export function slotDay(slot: DeliverySlot): string {
  const [y, m, d] = slot.date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY[dow]} ${d}/${m}`;
}

/** "20 a 23 h" */
export function slotHours(slot: DeliverySlot): string {
  const h = (t: string) => {
    const [hh, mm] = t.split(':');
    return mm === '00' ? String(Number(hh)) : `${Number(hh)}:${mm}`;
  };
  return `${h(slot.startsAt)} a ${h(slot.endsAt)} h`;
}

/** "a la noche" (el turno sin el día de la semana) */
export function slotPart(slot: DeliverySlot): string {
  return slot.label.split(' ').slice(1).join(' ');
}

/** "Viernes 9/10 a la noche · 20 a 23 h" — mismo formato que guarda el pedido. */
export function slotLong(slot: DeliverySlot): string {
  const day = slotDay(slot);
  return `${day[0].toUpperCase()}${day.slice(1)} ${slotPart(slot)} · ${slotHours(slot)}`;
}

/** "jueves 8/10, 20 h" */
export function slotDeadlineShort(slot: DeliverySlot): string {
  return slotDeadline(slot).replace(' a las ', ', ');
}

/** "Pedí hasta el jueves 8/10 a las 20 h" */
export function slotDeadline(slot: DeliverySlot): string {
  const c = new Date(new Date(slot.closesAt).getTime() - AR_OFFSET_H * 3600_000);
  const hh = c.getUTCHours();
  const mm = c.getUTCMinutes();
  return `${DAY[c.getUTCDay()]} ${c.getUTCDate()}/${c.getUTCMonth() + 1} a las ${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''} h`;
}
