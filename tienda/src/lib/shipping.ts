import type { DeliveryMethod, ShippingZone, StoreSettings } from './types';
import { normalizePostalCode } from './postal';

export type ZoneLookup =
  | { status: 'empty' }
  | { status: 'invalid'; raw: string }
  | { status: 'not_found'; postalCode: string }
  | { status: 'found'; postalCode: string; zone: ShippingZone };

export function findZone(zones: ShippingZone[], raw: string): ZoneLookup {
  if (!raw.trim()) return { status: 'empty' };
  const cp = normalizePostalCode(raw);
  if (!cp) return { status: 'invalid', raw };
  const zone = zones.find((z) => z.postalCodes.includes(cp));
  return zone ? { status: 'found', postalCode: cp, zone } : { status: 'not_found', postalCode: cp };
}

export interface Quote {
  /** null = todavía no se puede calcular (falta CP o no llegamos). */
  shippingCost: number | null;
  minOrder: number;
  missingForMin: number;
  freeShippingFrom: number | null;
  missingForFree: number | null;
  canCheckout: boolean;
}

/** Cálculo informativo para el carrito. El definitivo lo hace create_order() en el servidor. */
export function quote(
  method: DeliveryMethod,
  lookup: ZoneLookup,
  subtotal: number,
  settings: StoreSettings,
): Quote {
  if (method === 'pickup') {
    const min = settings.pickupMinOrder;
    const missing = Math.max(min - subtotal, 0);
    return {
      shippingCost: 0,
      minOrder: min,
      missingForMin: missing,
      freeShippingFrom: null,
      missingForFree: null,
      canCheckout: settings.pickupEnabled && subtotal > 0 && missing === 0,
    };
  }
  if (lookup.status !== 'found') {
    return { shippingCost: null, minOrder: 0, missingForMin: 0, freeShippingFrom: null, missingForFree: null, canCheckout: false };
  }
  const z = lookup.zone;
  const free = z.freeShippingFrom !== null && subtotal >= z.freeShippingFrom;
  const missing = Math.max(z.minOrder - subtotal, 0);
  return {
    shippingCost: free ? 0 : z.shippingCost,
    minOrder: z.minOrder,
    missingForMin: missing,
    freeShippingFrom: z.freeShippingFrom,
    missingForFree: z.freeShippingFrom === null ? null : Math.max(z.freeShippingFrom - subtotal, 0),
    canCheckout: subtotal > 0 && missing === 0,
  };
}
