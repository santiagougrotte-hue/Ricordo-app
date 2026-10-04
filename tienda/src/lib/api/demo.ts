import type { StoreApi } from './types';
import type { OrderInput, OrderResult, ShortItem } from '../types';
import { availableSlots, slotLong } from '../slots';
import { findZone } from '../shipping';
import { readDb, writeDb } from './demoDb';
import type { AdminOrder } from './adminTypes';

// Modo demo: corre sin servidor. Replica las reglas de create_order() para poder probar el flujo.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const activeZones = () => readDb().zones.filter((z) => z.active !== false);

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
    async getSettings() {
      const { notifyEmail: _private, ...pub } = readDb().settings;
      void _private;
      return pub;
    },
    async listSlots(method) {
      return availableSlots(readDb().windows, method);
    },
    async createOrder(input: OrderInput): Promise<OrderResult> {
      await wait(600);
      const db = readDb();
      const byId = new Map(db.products.filter((p) => !db.inactive.includes(p.id)).map((p) => [p.id, p]));

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
      let zoneName: string | null = null;
      let cp: string | null = null;
      if (input.deliveryMethod === 'delivery') {
        const look = findZone(activeZones(), input.postalCode);
        if (look.status !== 'found') return { ok: false, error: { code: 'RC002', message: 'No llegamos a ese código postal' } };
        if (input.address.trim().length < 5) return { ok: false, error: { code: 'RC004', message: 'Falta la dirección' } };
        const z = look.zone;
        if (subtotal < z.minOrder) {
          return { ok: false, error: { code: 'RC003', message: 'No alcanza la compra mínima', minOrder: z.minOrder, missing: z.minOrder - subtotal } };
        }
        shipping = z.freeShippingFrom !== null && subtotal >= z.freeShippingFrom ? 0 : z.shippingCost;
        zoneName = z.name;
        cp = look.postalCode;
      } else {
        if (!db.settings.pickupEnabled) return { ok: false, error: { code: 'RC005', message: 'El retiro en el local no está disponible' } };
        if (subtotal < db.settings.pickupMinOrder) {
          const min = db.settings.pickupMinOrder;
          return { ok: false, error: { code: 'RC003', message: 'No alcanza la compra mínima para retiro', minOrder: min, missing: min - subtotal } };
        }
      }

      const slot = availableSlots(db.windows, input.deliveryMethod, new Date(), 60).find(
        (s) => s.windowId === input.deliveryWindowId && s.date === input.deliveryDate,
      );
      if (!slot) return { ok: false, error: { code: 'RC006', message: 'Ese turno de entrega ya cerró o no existe' } };

      for (const [id, q] of merged) {
        const p = db.products.find((x) => x.id === id)!;
        p.stock -= q;
      }
      const number = db.nextNumber;
      const order: AdminOrder = {
        id: `demo-${number}`,
        number,
        createdAt: new Date().toISOString(),
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        customerEmail: input.customerEmail.trim() || null,
        deliveryMethod: input.deliveryMethod,
        address: input.deliveryMethod === 'delivery' ? input.address.trim() : null,
        postalCode: cp,
        zoneName,
        deliveryDate: slot.date,
        windowLabel: slotLong(slot),
        notes: input.notes.trim() || null,
        subtotal,
        shippingCost: shipping,
        total: subtotal + shipping,
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
          orderId: order.id, number, subtotal, shippingCost: shipping, total: order.total, deliveryMethod: order.deliveryMethod,
          windowLabel: order.windowLabel, paymentMethod: input.paymentMethod, customerName: order.customerName,
          lines: order.items.map((i) => ({ name: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
        },
      };
    },
  };
}
