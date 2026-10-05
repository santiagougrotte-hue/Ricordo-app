import { useEffect, useState } from 'react';

/**
 * ¿Hay una versión nueva publicada? El panel suele quedar abierto días: si se publica un cambio,
 * la pestaña vieja podría hablar con un servidor que ya cambió. Se revisa al volver a la pestaña y cada 5 minutos.
 */
export function useNewVersion(enabled: boolean): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (alive && build && build !== __BUILD_ID__) setStale(true);
      } catch { /* sin conexión: se vuelve a intentar más tarde */ }
    };
    const onVis = () => { if (!document.hidden) void check(); };
    void check();
    const id = window.setInterval(check, 5 * 60_000);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled]);
  return stale;
}
