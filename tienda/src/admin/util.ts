import type { AdminOrder } from '../lib/api/adminTypes';
import { STATUS_LABEL } from '../lib/api/adminTypes';

const AR = 3 * 3600_000; // UTC−3 fijo

/** "YYYY-MM-DD" del día en Buenos Aires. */
export function arDay(iso: string | Date): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(t - AR).toISOString().slice(0, 10);
}
/** "03/10 19:45" */
export function arDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) - AR);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
/** "hace 5 min" */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** "vie 9/10" a partir de "2026-10-09" */
export function shortDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}/${m}`;
}

/** Celular argentino → formato wa.me (549 + área + número, sin 0 ni 15). */
export function arWhatsapp(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // 11 15 5555 1234 → 11 5555 1234 (el 15 va después del código de área)
  for (const area of [2, 3, 4]) {
    if (d.length === 12 && d.slice(area, area + 2) === '15') {
      d = d.slice(0, area) + d.slice(area + 2);
      break;
    }
  }
  return d.length === 10 ? '549' + d : null;
}

// ── CSV (separador ";" y BOM para que Excel en español lo abra bien) ──
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Evita inyección de fórmulas en Excel: un nombre como "=HYPERLINK(...)" queda como texto.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ordersCsv(orders: AdminOrder[]): string {
  return toCsv([
    ['Número', 'Fecha', 'Cliente', 'Teléfono', 'Email', 'Entrega', 'Dirección', 'CP', 'Zona', 'Turno', 'Pago', 'Estado del pago', 'Estado', 'Subtotal', 'Envío', 'Total', 'Detalle', 'Notas'],
    ...orders.map((o) => [
      o.number, arDateTime(o.createdAt), o.customerName, o.customerPhone, o.customerEmail, o.deliveryMethod === 'pickup' ? 'Retiro' : 'Envío',
      o.address, o.postalCode, o.zoneName, o.windowLabel, o.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia',
      o.paymentStatus === 'paid' ? 'Pagado' : o.paymentStatus === 'refunded' ? 'Devuelto' : 'Pendiente', STATUS_LABEL[o.status],
      o.subtotal, o.shippingCost, o.total, o.items.map((i) => `${i.quantity} ${i.productName}`).join(', '), o.notes,
    ]),
  ]);
}

export function salesCsv(orders: AdminOrder[]): string {
  return toCsv([
    ['Número', 'Fecha', 'Producto', 'Cajas', 'Precio por caja', 'Total', 'Zona', 'Estado'],
    ...orders.flatMap((o) =>
      o.items.map((i) => [o.number, arDay(o.createdAt), i.productName, i.quantity, i.unitPrice, i.quantity * i.unitPrice, o.zoneName ?? 'Retiro', STATUS_LABEL[o.status]]),
    ),
  ]);
}

// ── Avisos de pedido nuevo ──
let audio: AudioContext | null = null;
/** El navegador solo deja sonar audio después de un toque del usuario: se "desbloquea" al activar avisos. */
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch { /* sin audio */ }
}
/** Dos notas cortas, tipo timbre. Generado, sin archivos. */
export function ding() {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  [[880, 0], [1318.5, 0.16]].forEach(([f, d]) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
    o.connect(g).connect(audio!.destination);
    o.start(t + d);
    o.stop(t + d + 0.55);
  });
}
export function notifySupported() {
  return typeof Notification !== 'undefined';
}
export function showNotification(o: AdminOrder) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(`Nuevo pedido #${o.number}`, {
      body: `${o.customerName} · $${o.total.toLocaleString('es-AR')} · ${o.windowLabel}`,
      tag: `pedido-${o.number}`,
      icon: '/favicon.svg',
    });
    n.onclick = () => window.focus();
  } catch { /* Android Chrome exige service worker para Notification: se queda con sonido + aviso en pantalla */ }
}
