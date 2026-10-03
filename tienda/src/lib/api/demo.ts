import type { StoreApi } from './types';
import type { OrderInput, OrderResult, Product, ShortItem } from '../types';
import { SEED_PRODUCTS, SEED_SETTINGS, SEED_WINDOWS, SEED_ZONES } from './seed-data';
import { availableSlots, slotLong } from '../slots';
import { findZone } from '../shipping';

// Modo demo: corre sin Supabase. Replica las reglas de create_order() para poder probar el flujo.
const STOCK_KEY = 'ricordo-demo-stock';
const NUMBER_KEY = 'ricordo-demo-order-number';

function readStock(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STOCK_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeStock(s: Record<string, number>) {
  try {
    localStorage.setItem(STOCK_KEY, JSON.stringify(s));
  } catch {
    /* sin storage: el stock vuelve al inicial al recargar */
  }
}
function products(): Product[] {
  const stock = readStock();
  return SEED_PRODUCTS.map((p) => ({ ...p, stock: stock[p.id] ?? p.stock }));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createDemoApi(): StoreApi {
  return {
    mode: 'demo',
    async listProducts() {
      return products().sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async listZones() {
      return SEED_ZONES;
    },
    async getSettings() {
      return SEED_SETTINGS;
    },
    async listSlots(method) {
      return availableSlots(SEED_WINDOWS, method);
    },
    async createOrder(input: OrderInput): Promise<OrderResult> {
      await wait(600);
      const all = products();
      const byId = new Map(all.map((p) => [p.id, p]));

      const merged = new Map<string, number>();
      for (const it of input.items) merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.quantity);
      if (merged.size === 0 || [...merged.values()].some((q) => !Number.isInteger(q) || q < 1 || q > 99)) {
        return { ok: false, error: { code: 'RC004', message: 'Carrito vacío o inválido' } };
      }
      const short: ShortItem[] = [];
      for (const [id, q] of merged) {
        const p = byId.get(id);
        if (!p || p.stock < q) short.push({ product_id: id, name: p?.name ?? null, requested: q, available: p?.stock ?? 0 });
      }
      if (short.length) return { ok: false, error: { code: 'RC001', message: 'Sin stock suficiente', short } };

      const subtotal = [...merged].reduce((s, [id, q]) => s + byId.get(id)!.price * q, 0);
      let shipping = 0;
      if (input.deliveryMethod === 'delivery') {
        const look = findZone(SEED_ZONES, input.postalCode);
        if (look.status !== 'found') return { ok: false, error: { code: 'RC002', message: 'No llegamos a ese código postal' } };
        if (input.address.trim().length < 5) return { ok: false, error: { code: 'RC004', message: 'Falta la dirección' } };
        const z = look.zone;
        if (subtotal < z.minOrder) {
          return { ok: false, error: { code: 'RC003', message: 'No alcanza la compra mínima', minOrder: z.minOrder, missing: z.minOrder - subtotal } };
        }
        shipping = z.freeShippingFrom !== null && subtotal >= z.freeShippingFrom ? 0 : z.shippingCost;
      } else if (subtotal < SEED_SETTINGS.pickupMinOrder) {
        const min = SEED_SETTINGS.pickupMinOrder;
        return { ok: false, error: { code: 'RC003', message: 'No alcanza la compra mínima para retiro', minOrder: min, missing: min - subtotal } };
      }

      const slot = availableSlots(SEED_WINDOWS, input.deliveryMethod, new Date(), 60).find(
        (s) => s.windowId === input.deliveryWindowId && s.date === input.deliveryDate,
      );
      if (!slot) return { ok: false, error: { code: 'RC006', message: 'Ese turno de entrega ya cerró o no existe' } };

      const stock = readStock();
      for (const [id, q] of merged) stock[id] = byId.get(id)!.stock - q;
      writeStock(stock);

      let number = 1001;
      try {
        number = Number(localStorage.getItem(NUMBER_KEY) || '1000') + 1;
        localStorage.setItem(NUMBER_KEY, String(number));
      } catch {
        /* sin storage */
      }
      return {
        ok: true,
        receipt: {
          orderId: `demo-${number}`,
          number,
          subtotal,
          shippingCost: shipping,
          total: subtotal + shipping,
          deliveryMethod: input.deliveryMethod,
          windowLabel: slotLong(slot),
          paymentMethod: input.paymentMethod,
          lines: [...merged].map(([id, q]) => ({ name: byId.get(id)!.name, quantity: q, unitPrice: byId.get(id)!.price })),
          customerName: input.customerName.trim(),
        },
      };
    },
  };
}
