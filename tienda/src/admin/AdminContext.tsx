import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { adminApi } from '../lib/api/admin';
import type { AdminOrder } from '../lib/api/adminTypes';
import { ding, notifySupported, showNotification, unlockAudio } from './util';

const ALERTS_KEY = 'ricordo-admin-alerts';

interface Ctx {
  orders: AdminOrder[];
  loading: boolean;
  reloadOrders: () => Promise<void>;
  patchOrder: (o: AdminOrder) => void;
  unseen: Set<string>;
  markSeen: (id: string) => void;
  alertsOn: boolean;
  enableAlerts: () => Promise<void>;
  disableAlerts: () => void;
  toast: string | null;
}
const C = createContext<Ctx | null>(null);

const SINCE_DAYS = 400;

export function AdminProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  const [alertsOn, setAlertsOn] = useState(() => {
    try { return localStorage.getItem(ALERTS_KEY) === '1'; } catch { return false; }
  });
  const [toast, setToast] = useState<string | null>(null);
  const alertsRef = useRef(alertsOn);
  alertsRef.current = alertsOn;

  const reloadOrders = useCallback(async () => {
    const since = new Date(Date.now() - SINCE_DAYS * 86400_000).toISOString();
    setOrders(await adminApi.listOrders(since));
    setLoading(false);
  }, []);

  useEffect(() => {
    void reloadOrders();
    const off = adminApi.subscribeOrders(({ type, order }) => {
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === order.id);
        return exists ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
      });
      if (type === 'insert') {
        setUnseen((s) => new Set(s).add(order.id));
        setToast(`Nuevo pedido #${order.number} · ${order.customerName}`);
        setTimeout(() => setToast(null), 6000);
        if (alertsRef.current) {
          ding();
          showNotification(order);
        }
      }
    });
    // Al volver a la pestaña se resincroniza por si se perdió algún evento.
    const onVis = () => document.visibilityState === 'visible' && void reloadOrders();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reloadOrders]);

  // Título de la pestaña con la cantidad de pedidos sin ver.
  useEffect(() => {
    document.title = unseen.size ? `(${unseen.size}) Pedidos · Ricordo` : 'Panel · Ricordo';
  }, [unseen]);

  const enableAlerts = useCallback(async () => {
    unlockAudio();
    if (notifySupported() && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* */ }
    }
    setAlertsOn(true);
    try { localStorage.setItem(ALERTS_KEY, '1'); } catch { /* */ }
    ding();
  }, []);
  const disableAlerts = useCallback(() => {
    setAlertsOn(false);
    try { localStorage.setItem(ALERTS_KEY, '0'); } catch { /* */ }
  }, []);

  // El audio necesita un gesto del usuario en cada carga: el primer toque lo desbloquea.
  useEffect(() => {
    if (!alertsOn) return;
    const once = () => unlockAudio();
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, [alertsOn]);

  const value: Ctx = {
    orders, loading, reloadOrders,
    patchOrder: (o) => setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x))),
    unseen,
    markSeen: (id) => setUnseen((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    }),
    alertsOn, enableAlerts, disableAlerts, toast,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useAdmin() {
  const v = useContext(C);
  if (!v) throw new Error('useAdmin fuera de AdminProvider');
  return v;
}
