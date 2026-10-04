// "Base de datos" del modo demo, en localStorage. La comparten la tienda y el panel,
// así lo que se compra en la tienda aparece en el panel y lo que se edita en el panel se ve en la tienda.
import type { Product, ShippingZone, StoreSettings } from '../types';
import type { DeliveryWindow } from '../slots';
import { EXAMPLE_IDS, SEED_PRODUCTS, SEED_SETTINGS, SEED_WINDOWS, SEED_ZONES } from './seed-data';
import type { AdminOrder, AdminSettings } from './adminTypes';

const KEY = 'ricordo-demo-db-v5';
const CHANNEL = 'ricordo-demo';

export interface DemoDb {
  products: Product[];
  zones: (ShippingZone & { active?: boolean })[];
  windows: DeliveryWindow[];
  settings: AdminSettings;
  orders: AdminOrder[];
  nextNumber: number;
  /** Productos desactivados (la tienda no los muestra). */
  inactive: string[];
}

function fresh(): DemoDb {
  return {
    products: structuredClone(SEED_PRODUCTS),
    zones: structuredClone(SEED_ZONES),
    windows: structuredClone(SEED_WINDOWS),
    settings: { ...(SEED_SETTINGS as StoreSettings), notifyEmail: '' },
    orders: [],
    nextNumber: 1001,
    inactive: [...EXAMPLE_IDS],
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
