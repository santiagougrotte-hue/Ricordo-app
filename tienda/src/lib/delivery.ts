// Cierre semanal y fecha de entrega. Misma lógica que next_cutoff() y delivery_date_for() en la base.
// Pedidos hasta el jueves 13 h (editable): antes del corte se entrega ese fin de semana, después, el siguiente.
import type { ShippingZone, StoreSettings } from './types';

// Argentina no tiene horario de verano: UTC−3 fijo.
const AR_OFFSET_MS = 3 * 3600_000;
const DAY_MS = 86400_000;

export const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Hora local de Buenos Aires representada como fecha UTC (para usar getUTC*). */
const arLocal = (d: Date) => new Date(d.getTime() - AR_OFFSET_MS);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Próximo cierre, en hora local (como fecha UTC "falsa"). Exactamente a la hora del corte ya está cerrado. */
export function nextCutoff(s: Pick<StoreSettings, 'cutoffWeekday' | 'cutoffTime'>, now = new Date()): Date {
  const n = arLocal(now);
  const [hh, mm] = s.cutoffTime.split(':').map(Number);
  const days = (s.cutoffWeekday - n.getUTCDay() + 7) % 7;
  let cut = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + days, hh, mm || 0);
  if (cut <= n.getTime()) cut += 7 * DAY_MS;
  return new Date(cut);
}

/** Fecha (YYYY-MM-DD) del primer día de entrega de la zona después del próximo cierre. */
export function deliveryDateFor(weekday: number, s: Pick<StoreSettings, 'cutoffWeekday' | 'cutoffTime'>, now = new Date()): string {
  const cut = nextCutoff(s, now);
  const add = ((weekday - s.cutoffWeekday + 6) % 7) + 1;
  return iso(new Date(Date.UTC(cut.getUTCFullYear(), cut.getUTCMonth(), cut.getUTCDate() + add)));
}

const parts = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return { dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), d, m };
};

/** "Sábado 10/10 a la mañana" — lo mismo que guarda el pedido. */
export function deliveryLabel(date: string, moment: string): string {
  const p = parts(date);
  return `${cap(DAYS[p.dow])} ${p.d}/${p.m}${moment ? ' ' + moment : ''}`;
}

/** "Sábado a la mañana" (el día de la zona, sin fecha). */
export function zoneDay(z: Pick<ShippingZone, 'deliveryWeekday' | 'deliveryMoment'>): string {
  return `${cap(DAYS[z.deliveryWeekday])}${z.deliveryMoment ? ' ' + z.deliveryMoment : ''}`;
}

/** "jueves 13 h" / "jueves 13:30 h" */
export function cutoffShort(s: Pick<StoreSettings, 'cutoffWeekday' | 'cutoffTime'>): string {
  const [hh, mm] = s.cutoffTime.split(':');
  return `${DAYS[s.cutoffWeekday]} ${Number(hh)}${mm && mm !== '00' ? ':' + mm : ''} h`;
}

/** "Pedí hasta el jueves 13 h y te llega el sábado 10 a la mañana" */
export function deliverySentence(zone: ShippingZone, s: StoreSettings, now = new Date()): string {
  const p = parts(deliveryDateFor(zone.deliveryWeekday, s, now));
  return `Pedí hasta el ${cutoffShort(s)} y te llega el ${DAYS[p.dow]} ${p.d}${zone.deliveryMoment ? ' ' + zone.deliveryMoment : ''}`;
}

/** "jueves 8/10, 13 h" — el próximo cierre con fecha. */
export function cutoffWithDate(s: Pick<StoreSettings, 'cutoffWeekday' | 'cutoffTime'>, now = new Date()): string {
  const c = nextCutoff(s, now);
  const mm = c.getUTCMinutes();
  return `${DAYS[c.getUTCDay()]} ${c.getUTCDate()}/${c.getUTCMonth() + 1}, ${c.getUTCHours()}${mm ? ':' + String(mm).padStart(2, '0') : ''} h`;
}
