// Envío, mínimos y descuentos. Se cuentan CAJAS (solo productos con countsAsBox).
// Cálculo informativo para el carrito: el definitivo lo hace create_order() en la base, con la misma regla.
import type { DeliveryMethod, Locality, Product, ShippingZone, StoreSettings } from './types';

/** "Otra localidad": no está en la lista → se ofrece WhatsApp o retiro. */
export const OTHER_LOCALITY = 'otra';
export type LocalityChoice = number | typeof OTHER_LOCALITY | null;

export type ZoneLookup =
  | { status: 'empty' }
  | { status: 'not_found' }
  | { status: 'found'; zone: ShippingZone; locality: Locality };

/** La zona la define la localidad que elige el cliente. */
export function findZone(zones: ShippingZone[], localities: Locality[], choice: LocalityChoice): ZoneLookup {
  if (choice === null) return { status: 'empty' };
  if (choice === OTHER_LOCALITY) return { status: 'not_found' };
  const locality = localities.find((l) => l.id === choice);
  const zone = locality && zones.find((z) => z.id === locality.zoneId);
  return locality && zone ? { status: 'found', zone, locality } : { status: 'not_found' };
}

/** Localidades agrupadas por partido, para el selector. */
export function byPartido(localities: Locality[]): [string, Locality[]][] {
  const m = new Map<string, Locality[]>();
  for (const l of localities) m.set(l.partido, [...(m.get(l.partido) ?? []), l]);
  return [...m];
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
  /** null = todavía no se puede calcular (falta la localidad o no llegamos). */
  shippingCost: number | null;
  /** El costo es el fijo de la zona pero se ajusta con la dirección (cálculo por distancia). */
  shippingEstimated: boolean;
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

export function quote(method: DeliveryMethod, lookup: ZoneLookup, cart: CartTotals, settings: StoreSettings, distanceCost: number | null = null): Quote {
  const { boxes, subtotal } = cart;
  const pickupOk = settings.pickupEnabled && boxes >= settings.pickupMinBoxes && boxes > 0;
  const base = {
    method, boxes, discountPct: 0, discount: 0, missingForNextDiscount: null, nextDiscountPct: null, suggestPickup: false,
    freeFromBoxes: null, missingForFree: null, shippingEstimated: false,
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
  // Sin clave de OpenRouteService el costo fijo es el definitivo (no es "aproximado").
  const distanceOn = z.distancePricing && settings.distanceEnabled === true;
  const byDistance = distanceOn && distanceCost !== null;
  const shippingCost = free ? 0 : byDistance ? distanceCost : z.shippingCost;
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
    shippingEstimated: !free && distanceOn && !byDistance,
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
  if (lookup.status !== 'found') return 'Decinos dónde te lo llevamos para ver la compra mínima, el envío y el día de entrega.';
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

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const CABA_NAMES = ['caba', 'capital federal', 'capital', 'ciudad de buenos aires', 'ciudad autonoma de buenos aires'];

/** Localidad que escribió el cliente → la de la lista (sin importar tildes ni mayúsculas). null = no llegamos. */
export function matchTypedLocality(text: string, localities: Locality[]): Locality | null {
  const t = plain(text).replace(/^(localidad de|barrio) /, '');
  if (!t) return null;
  if (CABA_NAMES.includes(t)) return localities.find((l) => plain(l.partido) === 'caba') ?? null;
  return localities.find((l) => plain(l.name) === t)
    ?? localities.find((l) => plain(l.name).replace(/^guillermo e\.? /, '') === t) // "Hudson"
    ?? null;
}
