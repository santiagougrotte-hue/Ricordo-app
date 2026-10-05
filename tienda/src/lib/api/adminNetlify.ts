import type { AdminApi, AdminOrder, AdminProduct, AdminSettings } from './adminTypes';
import type { ShippingZone } from '../types';

// Panel contra /api/admin/* (cookie de sesión HttpOnly). Los pedidos nuevos llegan consultando cambios cada pocos segundos.
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'x-ricordo': 'panel', ...(init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401 && path !== 'login') window.dispatchEvent(new Event('ricordo-admin-logout'));
    throw new Error(data.error ?? 'No se pudo completar');
  }
  return data;
}
const post = <T = unknown>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const POLL_MS = 8000;

export function createAdminNetlify(): AdminApi {
  let serverTime: string | null = null;
  return {
    mode: 'live',
    async getSession() {
      const r = await api<{ email: string | null }>('session');
      return r.email ? { email: r.email } : null;
    },
    async signIn(email, password) {
      try {
        await post('login', { email, password });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'No se pudo entrar';
      }
    },
    async signOut() {
      await post('logout').catch(() => {});
    },

    async listOrders(sinceIso) {
      const r = await api<{ orders: AdminOrder[]; serverTime: string }>(`orders?since=${encodeURIComponent(sinceIso)}`);
      serverTime = r.serverTime;
      return r.orders;
    },
    subscribeOrders(fn) {
      const known = new Set<string>();
      let stopped = false;
      let timer = 0;
      const tick = async () => {
        if (stopped) return;
        if (document.visibilityState === 'visible' && serverTime) {
          try {
            const r = await api<{ orders: AdminOrder[]; serverTime: string }>(`orders?changedAfter=${encodeURIComponent(serverTime)}`);
            serverTime = r.serverTime;
            // De más viejo a más nuevo, así el aviso sale en orden.
            for (const o of [...r.orders].reverse()) {
              const fresh = Date.parse(o.createdAt) > Date.now() - 10 * 60_000 && !known.has(o.id);
              known.add(o.id);
              fn({ type: fresh && o.status === 'new' ? 'insert' : 'update', order: o });
            }
          } catch { /* reintenta en el próximo ciclo */ }
        }
        timer = window.setTimeout(tick, POLL_MS);
      };
      timer = window.setTimeout(tick, POLL_MS);
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },
    async setOrderStatus(id, status) {
      await post(`orders/${id}/status`, { status });
    },
    async setPaymentStatus(id, status) {
      await post(`orders/${id}/payment`, { status });
    },
    async setDeliveredOn(id, date) {
      await post(`orders/${id}/delivered-on`, { date });
    },

    async listProducts() {
      return (await api<{ products: AdminProduct[] }>('products')).products;
    },
    async saveProduct(d) {
      return (await post<{ id: string }>('products', d)).id;
    },
    async updateStock(id, patch) {
      await post(`products/${id}/stock`, patch);
    },
    async uploadMedia(productId, file, _kind, alt) {
      await api(`products/${productId}/media?alt=${encodeURIComponent(alt)}`, { method: 'POST', body: file, headers: { 'Content-Type': file.type } });
    },
    async deleteMedia(_productId, mediaId) {
      await api(`media/${mediaId}`, { method: 'DELETE' });
    },
    async setCover(_productId, mediaId) {
      await post(`media/${mediaId}/cover`);
    },
    async moveMedia(_productId, mediaId, dir) {
      await post(`media/${mediaId}/move`, { dir });
    },

    async listZones() {
      return (await api<{ zones: (ShippingZone & { active: boolean })[] }>('zones')).zones;
    },
    async saveZone(z) {
      await post('zones', z);
    },
    async deleteZone(id) {
      await api(`zones/${id}`, { method: 'DELETE' });
    },
    async getSettings() {
      return (await api<{ settings: AdminSettings }>('settings')).settings;
    },
    async saveSettings(s) {
      await post('settings', s);
    },
    async testWhatsapp() {
      return (await post<{ message: string }>('notify-test')).message;
    },
  };
}
