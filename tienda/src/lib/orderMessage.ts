// Resumen del pedido para WhatsApp: el que manda el cliente desde la confirmación
// y el aviso que te llega a vos. Mismo formato, con secciones y negritas de WhatsApp (*así*).
import { money } from './money';
import { discountLabel } from './shipping';
import type { OrderReceipt } from './types';
import { arWhatsapp } from './whatsapp';

const LINE = '━━━━━━━━━━━━━━━━';
const TZ = 'America/Argentina/Buenos_Aires';

/** "06/10/26 · 18:39 h", en hora de Argentina. */
export function orderDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return `${date} · ${time} h`;
}

/** "11 5259-0251" (si no es un celular argentino reconocible, tal cual). */
export function prettyPhone(phone: string): string {
  const wa = arWhatsapp(phone);
  if (!wa) return phone;
  const n = wa.slice(3);
  return n.startsWith('11') ? `11 ${n.slice(2, 6)}-${n.slice(6)}` : `${n.slice(0, -4)}-${n.slice(-4)}`;
}

export function mapLink(r: OrderReceipt): string | null {
  if (r.lat != null && r.lng != null) return `https://www.google.com/maps?q=${r.lat},${r.lng}`;
  if (!r.address) return null;
  const q = [r.address, r.locality, 'Buenos Aires, Argentina'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export interface MessageOptions {
  /** 'cliente': lo manda el cliente a la tienda. 'aviso': te llega a vos cuando entra el pedido. */
  to: 'cliente' | 'aviso';
  /** Alias o CBU para transferir (Ajustes). */
  transferInfo?: string;
}

export function orderMessage(r: OrderReceipt, { to, transferInfo }: MessageOptions): string {
  const out: string[] = [];
  const add = (...l: (string | false | null | undefined)[]) => out.push(...l.filter((x): x is string => typeof x === 'string'));

  add(to === 'cliente' ? '¡Hola Ricordo! 👋 Te paso el resumen de mi pedido' : '🔔 *¡Entró un pedido nuevo!*', '');

  add(
    `🧾 *Pedido #${r.number}*`,
    r.createdAt && `📅 ${orderDateTime(r.createdAt)}`,
    `👤 ${r.customerName}`,
    r.customerPhone && `📱 ${prettyPhone(r.customerPhone)}`,
    '',
  );

  add(LINE, to === 'cliente' ? '🥟 *Mi pedido*' : '🥟 *Pedido*', '');
  for (const l of r.lines) {
    if (l.unitPrice === 0) {
      add(`🎁 ${l.quantity} × ${l.name} · _de regalo_`);
    } else if (l.quantity > 1) {
      add(`▪️ *${l.quantity} ×* ${l.name}`, `      ${money(l.unitPrice)} c/u · ${money(l.unitPrice * l.quantity)}`);
    } else {
      add(`▪️ *1 ×* ${l.name} · ${money(l.unitPrice)}`);
    }
  }
  if (r.boxCount > 0) add('', `📦 ${r.boxCount} ${r.boxCount === 1 ? 'caja' : 'cajas'} de 12`);
  add('');

  add(LINE);
  if (r.deliveryMethod === 'pickup') {
    add('🏠 *Retiro en Berazategui*', '🕐 Día y horario a coordinar por WhatsApp');
  } else {
    const map = mapLink(r);
    add(
      '🚚 *Envío a domicilio*',
      r.address && `📍 ${r.address}${r.locality ? `, ${r.locality}` : ''}${r.postalCode ? ` · CP ${r.postalCode}` : ''}`,
      map && `🗺️ Ubicación: ${map}`,
      r.windowLabel && `🗓️ *Llega:* ${r.windowLabel}`,
      r.flexibleDelivery && (to === 'cliente' ? '🔁 Si pasan antes por mi zona, me lo pueden llevar otro día' : '🔁 Si pasan antes por la zona, se lo pueden llevar otro día'),
    );
  }
  add(r.notes && `📝 *Nota:* ${r.notes}`, '');

  add(
    LINE,
    '💰 *Resumen*',
    '',
    `Subtotal: ${money(r.subtotal)}`,
    r.discount > 0 && `${discountLabel(r.discountPct)}: −${money(r.discount)}`,
    r.deliveryMethod === 'delivery' && `Envío: ${r.shippingCost > 0 ? `+${money(r.shippingCost)}` : '¡gratis! 🎉'}`,
    `*TOTAL: ${money(r.total)}*`,
    '',
  );

  if (r.paymentMethod === 'transfer') {
    add('💳 *Pago:* Transferencia', transferInfo && `► ${transferInfo}`);
  } else {
    add('💵 *Pago:* Efectivo al recibir');
  }
  add('');

  if (to === 'cliente') {
    add(r.paymentMethod === 'transfer' ? 'Te mando el comprobante de la transferencia 🙌' : null, 'Espero tu respuesta para confirmar mi pedido. ¡Gracias! 😊');
  } else {
    const wa = r.customerPhone ? arWhatsapp(r.customerPhone) : null;
    add(wa && `💬 Escribirle: https://wa.me/${wa}`);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
