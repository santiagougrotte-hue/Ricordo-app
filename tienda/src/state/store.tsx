import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { CartLine, DeliveryMethod, Locality, Product, ShippingZone, StoreSettings } from '../lib/types';
import { cartTotals, findZone, quote, type CartTotals, type LocalityChoice, type Quote, type ZoneLookup } from '../lib/shipping';

const CART_KEY = 'ricordo-cart';
const METHOD_KEY = 'ricordo-method';
const LOCALITY_KEY = 'ricordo-localidad';

function load<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    const v = storage().getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado / storage bloqueado: sigue funcionando en memoria */
  }
}
const local = () => localStorage;
const session = () => sessionStorage;

export interface CartItem {
  product: Product;
  quantity: number;
}

interface StoreState {
  status: 'loading' | 'ready' | 'error';
  products: Product[];
  zones: ShippingZone[];
  localities: Locality[];
  settings: StoreSettings | null;
  reload: () => Promise<void>;

  /** Localidad elegida (define la zona), "otra" o null si todavía no eligió. */
  localityChoice: LocalityChoice;
  setLocalityChoice: (c: LocalityChoice) => void;
  lookup: ZoneLookup;
  method: DeliveryMethod;
  setMethod: (m: DeliveryMethod) => void;

  items: CartItem[];
  count: number;
  subtotal: number;
  totals: CartTotals;
  quote: Quote | null;
  quantityOf: (productId: string) => number;
  /** Devuelve la cantidad realmente agregada (limitada por stock). */
  add: (productId: string, qty?: number) => number;
  setQuantity: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;

  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  postalOpen: boolean;
  openPostal: () => void;
  closePostal: () => void;
  announce: string;
}

const Ctx = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StoreState['status']>('loading');
  const [products, setProducts] = useState<Product[]>([]);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [lines, setLines] = useState<CartLine[]>(() => load(local, CART_KEY, []));
  const [method, setMethodState] = useState<DeliveryMethod>(() => load(session, METHOD_KEY, 'delivery'));
  const [localityChoice, setLocalityChoiceState] = useState<LocalityChoice>(() => load<LocalityChoice>(local, LOCALITY_KEY, null));
  const [cartOpen, setCartOpen] = useState(false);
  const [postalOpen, setPostalOpen] = useState(false);
  const [announce, setAnnounce] = useState('');

  const reload = useCallback(async () => {
    try {
      const [p, z, l, s] = await Promise.all([api.listProducts(), api.listZones(), api.listLocalities(), api.getSettings()]);
      setProducts(p);
      setZones(z);
      setLocalities(l);
      setSettings(s);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => save(local, CART_KEY, lines), [lines]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Si cambió el stock (o un producto se desactivó), el carrito se ajusta solo.
  useEffect(() => {
    if (status !== 'ready') return;
    setLines((prev) => {
      const next = prev
        .map((l) => ({ ...l, quantity: Math.min(l.quantity, byId.get(l.productId)?.stock ?? 0) }))
        .filter((l) => l.quantity > 0);
      return next.length === prev.length && next.every((l, i) => l.quantity === prev[i].quantity) ? prev : next;
    });
  }, [status, byId]);

  const linesRef = useRef(lines);
  linesRef.current = lines;

  const setLocalityChoice = useCallback((c: LocalityChoice) => {
    setLocalityChoiceState(c);
    save(local, LOCALITY_KEY, c);
  }, []);
  const setMethod = useCallback((m: DeliveryMethod) => {
    setMethodState(m);
    save(session, METHOD_KEY, m);
  }, []);

  const quantityOf = useCallback((id: string) => lines.find((l) => l.productId === id)?.quantity ?? 0, [lines]);

  const add = useCallback(
    (productId: string, qty = 1) => {
      const p = byId.get(productId);
      if (!p) return 0;
      const current = linesRef.current.find((l) => l.productId === productId)?.quantity ?? 0;
      const target = Math.min(current + qty, p.stock, 99);
      const added = Math.max(target - current, 0);
      if (added > 0) {
        setLines((prev) =>
          prev.some((l) => l.productId === productId)
            ? prev.map((l) => (l.productId === productId ? { ...l, quantity: target } : l))
            : [...prev, { productId, quantity: target }],
        );
        setAnnounce(`Agregaste ${added} ${added === 1 ? 'caja' : 'cajas'} de ${p.name}.`);
      } else {
        setAnnounce(`No quedan más cajas de ${p.name}.`);
      }
      return added;
    },
    [byId],
  );

  const setQuantity = useCallback(
    (productId: string, qty: number) => {
      const p = byId.get(productId);
      const max = Math.min(p?.stock ?? 0, 99);
      const q = Math.max(0, Math.min(Math.floor(qty), max));
      setLines((prev) =>
        q === 0 ? prev.filter((l) => l.productId !== productId) : prev.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)),
      );
    },
    [byId],
  );
  const remove = useCallback((productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId)), []);
  const clear = useCallback(() => setLines([]), []);

  const items = useMemo(
    () => lines.flatMap((l) => (byId.get(l.productId) ? [{ product: byId.get(l.productId)!, quantity: l.quantity }] : [])),
    [lines, byId],
  );
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const totals = useMemo(() => cartTotals(items), [items]);
  const subtotal = totals.subtotal;
  const lookup = useMemo(() => findZone(zones, localities, localityChoice), [zones, localities, localityChoice]);
  // Si la localidad guardada ya no existe (la desactivaron), se vuelve a pedir.
  useEffect(() => {
    if (status === 'ready' && typeof localityChoice === 'number' && !localities.some((l) => l.id === localityChoice)) setLocalityChoice(null);
  }, [status, localities, localityChoice, setLocalityChoice]);
  const q = useMemo(() => (settings ? quote(method, lookup, totals, settings) : null), [method, lookup, totals, settings]);

  const value: StoreState = {
    status, products, zones, localities, settings, reload,
    localityChoice, setLocalityChoice, lookup, method, setMethod,
    items, count, subtotal, totals, quote: q, quantityOf, add, setQuantity, remove, clear,
    cartOpen, openCart: () => setCartOpen(true), closeCart: () => setCartOpen(false),
    postalOpen, openPostal: () => setPostalOpen(true), closePostal: () => setPostalOpen(false),
    announce,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fuera de StoreProvider');
  return v;
}
