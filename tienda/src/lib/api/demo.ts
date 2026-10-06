import type { StoreApi } from './types';
import type { OrderInput, OrderResult, ShortItem } from '../types';
import { cartTotals, discountAmount, discountPct, extraBoxes, findZone } from '../shipping';
import { normalizePostalCode } from '../postal';
import { deliveryDateFor, deliveryLabel } from '../delivery';
import { readDb, writeDb } from './demoDb';
import type { AdminOrder } from './adminTypes';

// Modo demo: corre sin servidor. Replica las reglas de create_order() para poder probar el flujo.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const activeZones = () => readDb().zones.filter((z) => z.active !== false);
const activeLocalities = () => {
  const zones = new Set(activeZones().map((z) => z.id));
  return readDb().localities.filter((l) => l.active !== false && zones.has(l.zoneId));
};
export const PICKUP_LABEL = 'Retiro en Berazategui · día y horario a coordinar por WhatsApp';

export function createDemoApi(): StoreApi {
  return {
    mode: 'demo',
    async listProducts() {
      const db = readDb();
      return db.products.filter((p) => !db.inactive.includes(p.id)).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async listZones() {
      return activeZones();
    },
    async listLocalities() {
      return activeLocalities();
    },
    async searchAddress() {
      // En la demo no hay buscador de direcciones: se elige la localidad de la lista.
      return [];
    },
    async quoteShipping() {
      // En la demo no se consulta OpenRouteService: se usa el costo fijo de la zona.
      return { distanceCost: null, km: null };
    },
    async getSettings() {
      const { notifyEmail: _private, ...pub } = readDb().settings;
      void _private;
      return pub;
    },
    async createOrder(input: OrderInput): Promise<OrderResult> {
      await wait(600);
      const db = readDb();
      const byId = new Map(db.products.filter((p) => !db.inactive.includes(p.id)).map((p) => [p.id, p]));

      const phone = input.customerPhone.replace(/\D/g, '');
      if (phone.length < 8 || phone.length > 15) return { ok: false, error: { code: 'RC004', message: 'Teléfono inválido' } };
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

      const totals = cartTotals([...merged].map(([id, quantity]) => ({ product: byId.get(id)!, quantity })));
      const { subtotal, boxes } = totals;
      const s = db.settings;
      let shipping = 0, pct = 0, discount = 0;
      let zoneName: string | null = null, cp: string | null = null, locality: string | null = null, partido: string | null = null;
      let date: string | null = null, label = PICKUP_LABEL;
      if (input.deliveryMethod === 'delivery') {
        const look = findZone(activeZones(), activeLocalities(), input.localityId);
        if (look.status !== 'found') return { ok: false, error: { code: 'RC002', message: 'Todavía no llegamos a esa localidad' } };
        if (input.address.trim().length < 5) return { ok: false, error: { code: 'RC004', message: 'Falta la dirección' } };
        const pc = normalizePostalCode(input.postalCode);
        if (!pc) return { ok: false, error: { code: 'RC004', message: 'Revisá el código postal' } };
        const z = look.zone;
        if (boxes < z.minBoxes) {
          return { ok: false, error: { code: 'RC003', message: 'No alcanza el mínimo de cajas', minBoxes: z.minBoxes, missing: z.minBoxes - boxes, pickupMinBoxes: s.pickupEnabled ? s.pickupMinBoxes : null } };
        }
        const free = z.freeFromBoxes !== null && boxes >= z.freeFromBoxes;
        shipping = free ? 0 : z.shippingCost;
        pct = discountPct(z, boxes);
        discount = discountAmount(totals.boxSubtotal, boxes, extraBoxes(z, boxes), pct);
        zoneName = z.name;
        cp = pc;
        locality = look.locality.name;
        partido = look.locality.partido;
        date = deliveryDateFor(z.deliveryWeekday, s);
        label = deliveryLabel(date, z.deliveryMoment);
      } else {
        if (!s.pickupEnabled) return { ok: false, error: { code: 'RC005', message: 'El retiro no está disponible' } };
        if (boxes < s.pickupMinBoxes) {
          return { ok: false, error: { code: 'RC003', message: 'No alcanza el mínimo de cajas para retiro', minBoxes: s.pickupMinBoxes, missing: s.pickupMinBoxes - boxes, pickupMinBoxes: null } };
        }
      }

      for (const [id, q] of merged) db.products.find((x) => x.id === id)!.stock -= q;
      const number = db.nextNumber;
      const order: AdminOrder = {
        id: `demo-${number}`,
        number,
        createdAt: new Date().toISOString(),
        customerName: input.customerName.trim(),
        customerPhone: phone,
        customerEmail: input.customerEmail.trim() || null,
        deliveryMethod: input.deliveryMethod,
        address: input.deliveryMethod === 'delivery' ? input.address.trim() : null,
        postalCode: cp,
        zoneName,
        locality,
        partido,
        boxCount: boxes,
        deliveryDate: date,
        deliveredOn: null,
        flexibleDelivery: input.deliveryMethod === 'delivery' && input.flexibleDelivery,
        windowLabel: label,
        notes: input.notes.trim() || null,
        subtotal,
        discount,
        discountPct: pct,
        shippingCost: shipping,
        total: subtotal - discount + shipping,
        paymentMethod: input.paymentMethod,
        paymentStatus: 'pending',
        status: 'new',
        items: [...merged].map(([id, q]) => ({ productId: id, productName: byId.get(id)!.name, quantity: q, unitPrice: byId.get(id)!.price })),
      };
      db.orders.push(order);
      db.nextNumber = number + 1;
      writeDb(db, { type: 'order-insert', order });

      return {
        ok: true,
        receipt: {
          orderId: order.id, number, subtotal, discount, discountPct: pct, shippingCost: shipping, total: order.total, boxCount: boxes,
          deliveryMethod: order.deliveryMethod, deliveryDate: date, windowLabel: label, locality, paymentMethod: input.paymentMethod, customerName: order.customerName,
          lines: order.items.map((i) => ({ name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
          createdAt: order.createdAt, customerPhone: phone, address: order.address, postalCode: cp, notes: order.notes,
          flexibleDelivery: order.flexibleDelivery,
        },
      };
    },
  };
}
