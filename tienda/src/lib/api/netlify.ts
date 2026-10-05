import type { StoreApi } from './types';
import type { OrderResult, Product, ShippingZone, StoreSettings } from '../types';

interface Catalog { products: Product[]; zones: ShippingZone[]; settings: StoreSettings }

// La tienda lee todo de las funciones de Netlify (la base nunca se expone al navegador).
export function createNetlifyApi(): StoreApi {
  let catalog: Promise<Catalog> | null = null;
  const load = () => {
    catalog ??= fetch('/api/catalog').then((r) => {
      if (!r.ok) throw new Error('catalog');
      return r.json() as Promise<Catalog>;
    });
    return catalog.catch((e) => {
      catalog = null; // reintenta la próxima vez
      throw e;
    });
  };
  return {
    mode: 'live',
    async listProducts() {
      catalog = null; // siempre fresco (stock)
      return (await load()).products;
    },
    async listZones() {
      return (await load()).zones;
    },
    async getSettings() {
      return (await load()).settings;
    },
    async createOrder(input): Promise<OrderResult> {
      try {
        const res = await fetch('/api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        return (await res.json()) as OrderResult;
      } catch {
        return { ok: false, error: { code: 'NETWORK', message: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' } };
      }
    },
  };
}
