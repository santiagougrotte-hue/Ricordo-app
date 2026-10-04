import { useEffect } from 'react';
import { canAnimate, canSmoothScroll, onFirstInteraction, whenIdle } from './capability';

let mod: Promise<typeof import('./motion')> | null = null;
export const loadMotion = () => (mod ??= import('./motion'));

/** Arranca el scroll suave una vez, cuando el navegador está libre. */
export function useSmoothScroll(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !canSmoothScroll()) return;
    return onFirstInteraction(() => void loadMotion().then((m) => m.initSmoothScroll()));
  }, [enabled]);
}

/** Revela al hacer scroll lo marcado con data-reveal en <main>. `key` re-ejecuta (cambio de datos o de ruta). */
export function useReveal(key: unknown) {
  useEffect(() => {
    if (!canAnimate()) return;
    let off: (() => void) | undefined;
    let alive = true;
    const cancel = whenIdle(() => {
      void loadMotion().then((m) => {
        const main = document.getElementById('main');
        if (alive && main) off = m.reveal(main);
      });
    }, 800);
    return () => {
      alive = false;
      cancel();
      off?.();
    };
  }, [key]);
}
