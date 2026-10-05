import type { AdminApi, AdminOrder, AdminProduct } from './adminTypes';
import { onDemoChange, readDb, writeDb } from './demoDb';

const SESSION = 'ricordo-demo-admin';
export const DEMO_PASSWORD = 'ricordo';

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });
}

export function createAdminDemo(): AdminApi {
  const product = (id: string) => {
    const db = readDb();
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new Error('Producto inexistente');
    return { db, p };
  };
  return {
    mode: 'demo',
    async getSession() {
      try {
        const e = sessionStorage.getItem(SESSION);
        return e ? { email: e } : null;
      } catch {
        return null;
      }
    },
    async signIn(email, password) {
      if (password !== DEMO_PASSWORD) return 'Email o contraseña incorrectos.';
      try { sessionStorage.setItem(SESSION, email || 'demo@ricordo'); } catch { /* */ }
      return null;
    },
    async signOut() {
      try { sessionStorage.removeItem(SESSION); } catch { /* */ }
    },

    async listOrders(sinceIso) {
      return readDb().orders.filter((o) => o.createdAt >= sinceIso).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    subscribeOrders(fn) {
      return onDemoChange((c) => {
        if (c.type === 'order-insert') fn({ type: 'insert', order: c.order });
        if (c.type === 'order-update') fn({ type: 'update', order: c.order });
      });
    },
    async setOrderStatus(id, status) {
      const db = readDb();
      const o = db.orders.find((x) => x.id === id);
      if (!o) throw new Error('Pedido inexistente');
      if (o.status === 'cancelled' && status !== 'cancelled') throw new Error('Un pedido cancelado no se reabre.');
      if (status === 'cancelled' && o.status !== 'cancelled') {
        for (const it of o.items) {
          const p = db.products.find((x) => x.id === it.productId);
          if (p) p.stock += it.quantity; // devuelve stock (una sola vez)
        }
      }
      o.status = status;
      writeDb(db, { type: 'order-update', order: o });
    },
    async setPaymentStatus(id, status) {
      const db = readDb();
      const o = db.orders.find((x) => x.id === id) as AdminOrder;
      o.paymentStatus = status;
      writeDb(db, { type: 'order-update', order: o });
    },
    async setDeliveredOn(id, date) {
      const db = readDb();
      const o = db.orders.find((x) => x.id === id) as AdminOrder;
      o.deliveredOn = date;
      writeDb(db, { type: 'order-update', order: o });
    },

    async listProducts() {
      const db = readDb();
      return db.products.map((p): AdminProduct => ({ ...p, active: !db.inactive.includes(p.id) })).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async saveProduct(d) {
      const db = readDb();
      const id = d.id ?? crypto.randomUUID();
      const existing = db.products.find((p) => p.id === id);
      const base = existing ?? { id, unitsPerBox: 12, media: [] };
      const next = { ...base, ...d, id, unitsPerBox: 12 } as AdminProduct;
      const { active, ...prod } = next;
      db.products = existing ? db.products.map((p) => (p.id === id ? prod : p)) : [...db.products, prod];
      db.inactive = active ? db.inactive.filter((x) => x !== id) : [...new Set([...db.inactive, id])];
      writeDb(db, { type: 'catalog' });
      return id;
    },
    async updateStock(id, patch) {
      const { db, p } = product(id);
      if (patch.stock !== undefined) p.stock = patch.stock;
      if (patch.lowStockThreshold !== undefined) p.lowStockThreshold = patch.lowStockThreshold;
      if (patch.active !== undefined) db.inactive = patch.active ? db.inactive.filter((x) => x !== id) : [...new Set([...db.inactive, id])];
      writeDb(db, { type: 'catalog' });
    },
    async uploadMedia(productId, file, kind, alt) {
      if (file.size > 1_500_000) throw new Error('En modo demo las fotos se guardan en el navegador: máximo 1,5 MB.');
      const { db, p } = product(productId);
      const url = await blobToDataUrl(file);
      p.media.push({ id: crypto.randomUUID(), url, kind, alt, isCover: !p.media.some((m) => m.isCover), sortOrder: p.media.length });
      try {
        writeDb(db, { type: 'catalog' });
      } catch {
        throw new Error('Se llenó el espacio del navegador para el modo demo.');
      }
    },
    async deleteMedia(productId, mediaId) {
      const { db, p } = product(productId);
      const wasCover = p.media.find((m) => m.id === mediaId)?.isCover;
      p.media = p.media.filter((m) => m.id !== mediaId);
      if (wasCover && p.media[0]) p.media[0].isCover = true;
      writeDb(db, { type: 'catalog' });
    },
    async setCover(productId, mediaId) {
      const { db, p } = product(productId);
      p.media.forEach((m) => (m.isCover = m.id === mediaId));
      writeDb(db, { type: 'catalog' });
    },
    async moveMedia(productId, mediaId, dir) {
      const { db, p } = product(productId);
      const list = [...p.media].sort((a, b) => a.sortOrder - b.sortOrder);
      const i = list.findIndex((m) => m.id === mediaId);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      list.forEach((m, k) => (m.sortOrder = k));
      p.media = list;
      writeDb(db, { type: 'catalog' });
    },

    async listZones() {
      return readDb().zones.map((z) => ({ ...z, active: z.active !== false }));
    },
    async saveZone(z) {
      const db = readDb();
      const id = z.id ?? crypto.randomUUID();
      const zone = { ...z, id };
      db.zones = db.zones.some((x) => x.id === id) ? db.zones.map((x) => (x.id === id ? zone : x)) : [...db.zones, zone];
      writeDb(db, { type: 'catalog' });
    },
    async deleteZone(id) {
      const db = readDb();
      db.zones = db.zones.filter((z) => z.id !== id);
      writeDb(db, { type: 'catalog' });
    },

    async getSettings() {
      return readDb().settings;
    },
    async testWhatsapp() {
      return 'En modo demo no se mandan mensajes. En la tienda publicada te llega un WhatsApp de prueba.';
    },
    async saveSettings(s) {
      const db = readDb();
      db.settings = s;
      writeDb(db, { type: 'catalog' });
    },
  };
}
