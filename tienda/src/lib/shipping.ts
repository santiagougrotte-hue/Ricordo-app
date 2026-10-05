// Envío, mínimos y descuentos. Se cuentan CAJAS (solo productos con countsAsBox).
// Cálculo informativo para el carrito: el definitivo lo hace create_order() en la base, con la misma regla.
import type { DeliveryMethod, Product, ShippingZone, StoreSettings } from './types';
import { normalizePostalCode } from './postal';

export type ZoneLookup =
  | { status: 'empty' }
  | { status: 'invalid'; raw: string }
  | { status: 'not_found'; postalCode: string }
  | { status: 'found'; postalCode: string; zone: ShippingZone };

/** '1884' o rango '1000-1499'. */
export function zoneHasCp(codes: string[], cp: string): boolean {
  return codes.some((c) => {
    if (c === cp) return true;
    const m = /^(\d{4})-(\d{4})$/.exec(c);
    return !!m && +cp >= +m[1] && +cp <= +m[2];
  });
}

export function findZone(zones: ShippingZone[], raw: string): ZoneLookup {
  if (!raw.trim()) return { status: 'empty' };
  const cp = normalizePostalCode(raw);
  if (!cp) return { status: 'invalid', raw };
  const zone = zones.find((z) => zoneHasCp(z.postalCodes, cp));
  return zone ? { status: 'found', postalCode: cp, zone } : { status: 'not_found', postalCode: cp };
}

export interface CartTotals {
  subtotal: number;
  /** Cajas que cuentan para mínimos, envío gratis y descuento. */
  boxes: number;
  /** Subtotal de esas cajas: el descuento se aplica sobre esto. */
  boxSubtotal: number;
  /** Hay salsas o complementos (no suman cajas). */
  hasExtras: boolean;
}

export function cartTotals(items: { product: Pick<Product, 'price' | 'countsAsBox'>; quantity: number }[]): CartTotals {
  let subtotal = 0, boxes = 0, boxSubtotal = 0, hasExtras = false;
  for (const { product: p, quantity: q } of items) {
    subtotal += p.price * q;
    if (p.countsAsBox) { boxes += q; boxSubtotal += p.price * q; } else hasExtras = true;
  }
  return { subtotal, boxes, boxSubtotal, hasExtras };
}

/** % de descuento: X por cada caja arriba del umbral de envío gratis, con tope. */
export function discountPct(zone: Pick<ShippingZone, 'freeFromBoxes' | 'discountPerBox' | 'discountMax'>, boxes: number): number {
  if (zone.freeFromBoxes === null || boxes <= zone.freeFromBoxes) return 0;
  return Math.min(zone.discountMax, zone.discountPerBox * (boxes - zone.freeFromBoxes));
}

/** Igual que round() de Postgres para positivos. */
export const discountAmount = (boxSubtotal: number, pct: number) => Math.round((boxSubtotal * pct) / 100);

export interface Quote {
  method: DeliveryMethod;
  boxes: number;
  minBoxes: number;
  missingForMin: number;
  /** null = todavía no se puede calcular (falta CP o no llegamos). */
  shippingCost: number | null;
  freeFromBoxes: number | null;
  missingForFree: number | null;
  discountPct: number;
  discount: number;
  /** Cajas que faltan para el siguiente escalón de descuento (null si no hay más). */
  missingForNextDiscount: number | null;
  nextDiscountPct: number | null;
  total: number | null;
  canCheckout: boolean;
  /** Con envío no llega al mínimo, pero sí al de retiro: sugerir retiro. */
  suggestPickup: boolean;
}

export function quote(method: DeliveryMethod, lookup: ZoneLookup, cart: CartTotals, settings: StoreSettings): Quote {
  const { boxes, subtotal } = cart;
  const pickupOk = settings.pickupEnabled && boxes >= settings.pickupMinBoxes && boxes > 0;
  const base = {
    method, boxes, discountPct: 0, discount: 0, missingForNextDiscount: null, nextDiscountPct: null, suggestPickup: false,
    freeFromBoxes: null, missingForFree: null,
  };
  if (method === 'pickup') {
    const missing = Math.max(settings.pickupMinBoxes - boxes, 0);
    return {
      ...base, minBoxes: settings.pickupMinBoxes, missingForMin: missing, shippingCost: 0, total: subtotal,
      canCheckout: settings.pickupEnabled && subtotal > 0 && missing === 0,
    };
  }
  if (lookup.status !== 'found') {
    return { ...base, minBoxes: 0, missingForMin: 0, shippingCost: null, total: null, canCheckout: false };
  }
  const z = lookup.zone;
  const free = z.freeFromBoxes !== null && boxes >= z.freeFromBoxes;
  const missing = Math.max(z.minBoxes - boxes, 0);
  const pct = discountPct(z, boxes);
  const discount = discountAmount(cart.boxSubtotal, pct);
  const shippingCost = free ? 0 : z.shippingCost;
  let missingForNextDiscount: number | null = null;
  let nextDiscountPct: number | null = null;
  if (z.freeFromBoxes !== null && z.discountPerBox > 0 && pct < z.discountMax) {
    const target = Math.max(boxes, z.freeFromBoxes) + 1;
    missingForNextDiscount = target - boxes;
    nextDiscountPct = discountPct(z, target);
  }
  return {
    ...base,
    minBoxes: z.minBoxes,
    missingForMin: missing,
    shippingCost,
    freeFromBoxes: z.freeFromBoxes,
    missingForFree: z.freeFromBoxes === null ? null : Math.max(z.freeFromBoxes - boxes, 0),
    discountPct: pct,
    discount,
    missingForNextDiscount,
    nextDiscountPct,
    total: subtotal - discount + shippingCost,
    canCheckout: subtotal > 0 && missing === 0,
    suggestPickup: missing > 0 && pickupOk,
  };
}

const cajas = (n: number) => `${n} ${n === 1 ? 'caja' : 'cajas'}`;

/** Mensaje del carrito, en vivo. */
export function cartMessage(q: Quote, lookup: ZoneLookup): string {
  if (q.method === 'pickup') {
    if (q.missingForMin > 0) return `Sumá ${cajas(q.missingForMin)} más para retirar en Berazategui (mínimo ${cajas(q.minBoxes)}).`;
    return 'Retirás en Berazategui, sin costo de envío. El horario lo coordinamos por WhatsApp.';
  }
  if (lookup.status === 'not_found') return 'Todavía no llegamos a tu zona, escribinos por WhatsApp.';
  if (lookup.status !== 'found') return 'Poné tu código postal para ver el envío, el mínimo y el día de entrega.';
  const zone = lookup.zone.name;
  if (q.missingForMin > 0) {
    const pick = q.suggestPickup ? ` O retiralo en Berazategui: con ${cajas(q.boxes)} ya podés.` : '';
    return `Sumá ${cajas(q.missingForMin)} más para hacer tu pedido con envío a ${zone}.${pick}`;
  }
  if (q.missingForFree !== null && q.missingForFree > 0) return `Sumá ${cajas(q.missingForFree)} más y el envío a ${zone} es gratis.`;
  if (q.freeFromBoxes === null) return `Listo para pedir. Envío a ${zone}.`;
  if (q.discountPct === 0) {
    return q.missingForNextDiscount !== null
      ? `¡Envío gratis! Sumá ${cajas(q.missingForNextDiscount)} más y tenés ${q.nextDiscountPct}% de descuento.`
      : '¡Envío gratis!';
  }
  return q.missingForNextDiscount !== null
    ? `¡Envío gratis y ${q.discountPct}% de descuento! Sumá ${cajas(q.missingForNextDiscount)} más y llegás al ${q.nextDiscountPct}%.`
    : `¡Envío gratis y ${q.discountPct}% de descuento!`;
}

/** Cantidad de cajas desde la que se llega al tope de descuento (null si la zona no tiene descuento). */
export function maxDiscountAt(z: Pick<ShippingZone, 'freeFromBoxes' | 'discountPerBox' | 'discountMax'>): number | null {
  if (z.freeFromBoxes === null || z.discountPerBox <= 0 || z.discountMax <= 0) return null;
  return z.freeFromBoxes + Math.ceil(z.discountMax / z.discountPerBox);
}
