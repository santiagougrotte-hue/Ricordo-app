// "Base de datos" del modo demo, en localStorage. La comparten la tienda y el panel,
// así lo que se compra en la tienda aparece en el panel y lo que se edita en el panel se ve en la tienda.
import type { Locality, Product, ShippingZone, StoreSettings } from '../types';
import { EXAMPLE_IDS, SEED_LOCALITIES, SEED_PRODUCTS, SEED_SETTINGS, SEED_ZONES } from './seed-data';
import type { AdminOrder, AdminSettings, ShippingConfig } from './adminTypes';

const KEY = 'ricordo-demo-db-v16';
const CHANNEL = 'ricordo-demo';

export interface DemoDb {
  products: Product[];
  zones: (ShippingZone & { active?: boolean })[];
  localities: (Locality & { active?: boolean })[];
  shippingConfig: ShippingConfig;
  settings: AdminSettings;
  orders: AdminOrder[];
  nextNumber: number;
  /** Productos desactivados (la tienda no los muestra). */
  inactive: string[];
}

function fresh(): DemoDb {
  return {
    // Igual que la migración borrar-inactivos: los productos de ejemplo ya no están.
    products: structuredClone(SEED_PRODUCTS.filter((p) => !EXAMPLE_IDS.includes(p.id))),
    zones: structuredClone(SEED_ZONES),
    localities: structuredClone(SEED_LOCALITIES),
    shippingConfig: { originLat: -34.765, originLng: -58.212, pricingMode: 'boxes', absorbPerBox: 3500, clientSharePct: 50, fuelPrice: 2080, consumption100km: 7, rounding: 500,
      bands: [{ upToKm: 3, price: 1500 }, { upToKm: 6, price: 2000 }, { upToKm: 10, price: 2500 }, { upToKm: 15, price: 3500 }, { upToKm: 25, price: 4500 }, { upToKm: 40, price: 6000 }, { upToKm: null, price: 8000 }] },
    settings: { ...(SEED_SETTINGS as StoreSettings), notifyEmail: '' },
    orders: [],
    nextNumber: 1001,
    inactive: [],
  };
}

let memory: DemoDb | null = null;

export function readDb(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return (memory = { ...fresh(), ...JSON.parse(raw) });
  } catch { /* storage bloqueado: memoria */ }
  return (memory ??= fresh());
}

type Change = { type: 'order-insert' | 'order-update'; order: AdminOrder } | { type: 'catalog' };
let bc: BroadcastChannel | null = null;
try {
  bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
} catch { bc = null; }
const local = new Set<(c: Change) => void>();

export function writeDb(db: DemoDb, change?: Change) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch { /* memoria */ }
  if (change) {
    local.forEach((f) => f(change));
    bc?.postMessage(change);
  }
}

/** Avisos de cambios (misma pestaña + otras pestañas). Es el "realtime" del modo demo. */
export function onDemoChange(fn: (c: Change) => void): () => void {
  local.add(fn);
  const h = (e: MessageEvent<Change>) => fn(e.data);
  bc?.addEventListener('message', h);
  return () => {
    local.delete(fn);
    bc?.removeEventListener('message', h);
  };
}

export function resetDemo() {
  writeDb(fresh(), { type: 'catalog' });
}
