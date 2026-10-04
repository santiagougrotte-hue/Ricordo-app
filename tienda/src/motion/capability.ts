// Quién recibe la capa pesada (3D, scroll suave, animaciones). Todo lo demás ve la versión estática, completa.
type NavExtra = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function saveData(): boolean {
  const c = (navigator as NavExtra).connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
}

/** Animaciones con GSAP + Lenis: casi todos, salvo reducir movimiento. */
export function canAnimate(): boolean {
  return typeof window !== 'undefined' && !prefersReducedMotion();
}

let webgl: boolean | null = null;
function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Logo 3D: WebGL + equipo con aire + sin ahorro de datos + sin reducir movimiento. */
export function canRender3D(): boolean {
  if (!canAnimate() || saveData() || !hasWebGL()) return false;
  const n = navigator as NavExtra;
  if (n.deviceMemory !== undefined && n.deviceMemory < 4) return false;
  if (n.hardwareConcurrency !== undefined && n.hardwareConcurrency < 4) return false;
  return true;
}

/** Scroll suave (Lenis): solo con mouse. En pantallas táctiles el scroll nativo es mejor y no gasta batería. */
export function canSmoothScroll(): boolean {
  return canAnimate() && matchMedia('(pointer: fine)').matches;
}

/**
 * Corre `fn` recién con la primera interacción real (mover el mouse, tocar, scrollear, tecla) y con el navegador libre.
 * Así lo pesado (3D) nunca compite con la carga ni con el primer toque.
 */
export function onFirstInteraction(fn: () => void): () => void {
  const evs = ['pointermove', 'pointerdown', 'touchstart', 'wheel', 'scroll', 'keydown'] as const;
  let cancelIdle: (() => void) | null = null;
  const go = () => {
    evs.forEach((e) => removeEventListener(e, go));
    cancelIdle = whenIdle(fn, 1500);
  };
  evs.forEach((e) => addEventListener(e, go, { passive: true, once: true }));
  return () => {
    evs.forEach((e) => removeEventListener(e, go));
    cancelIdle?.();
  };
}

/** Corre algo cuando el navegador está libre (después de pintar lo importante). */
export function whenIdle(fn: () => void, timeout = 2500): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 1200);
  return () => clearTimeout(id);
}
