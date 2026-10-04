import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { canRender3D, onFirstInteraction } from '../motion/capability';
import type { Logo3D } from '../motion/logo3d';

/**
 * Logo del hero. Siempre se pinta en 2D (rápido, accesible, LCP).
 * En equipos capaces, cuando el navegador está libre, se monta el 3D encima y el 2D se desvanece.
 */
export function HeroLogo() {
  const wrap = useRef<HTMLHeadingElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canRender3D()) return;
    let logo: Logo3D | null = null;
    let alive = true;
    const cleanups: (() => void)[] = [];

    const cancelIdle = onFirstInteraction(async () => {
      try {
        const { createLogo3D } = await import('../motion/logo3d');
        if (!alive || !canvas.current) return;
        logo = await createLogo3D(canvas.current, () => alive && setReady(true));
        if (!alive) return logo.destroy();

        // Puntero (desktop): reacción sutil.
        const onMove = (e: PointerEvent) => {
          if (e.pointerType !== 'mouse') return;
          logo?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
        };
        addEventListener('pointermove', onMove, { passive: true });
        cleanups.push(() => removeEventListener('pointermove', onMove));

        // Celular: giroscopio si el navegador lo da sin pedir permiso; si no, el dedo sobre el hero.
        const onTilt = (e: DeviceOrientationEvent) => {
          if (e.gamma == null || e.beta == null) return;
          logo?.setPointer(e.gamma / 30, (e.beta - 45) / 30);
        };
        addEventListener('deviceorientation', onTilt, { passive: true });
        cleanups.push(() => removeEventListener('deviceorientation', onTilt));
        const el = wrap.current!;
        const onTouch = (e: TouchEvent) => {
          const t = e.touches[0];
          const r = el.getBoundingClientRect();
          logo?.setPointer(((t.clientX - r.left) / r.width) * 2 - 1, ((t.clientY - r.top) / r.height) * 2 - 1);
        };
        el.addEventListener('touchmove', onTouch, { passive: true });
        cleanups.push(() => el.removeEventListener('touchmove', onTouch));

        // Scroll: el logo se aleja y gira hacia el catálogo a medida que el hero sale de pantalla.
        let raf = 0;
        const onScroll = () => {
          if (raf) return;
          raf = requestAnimationFrame(() => {
            raf = 0;
            const r = el.getBoundingClientRect();
            logo?.setProgress(Math.max(0, -r.top) / Math.max(r.height + 200, 1));
          });
        };
        addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => removeEventListener('scroll', onScroll));
        onScroll();

        const mq = matchMedia('(prefers-color-scheme: dark)');
        const onScheme = () => logo?.setTheme(mq.matches);
        mq.addEventListener('change', onScheme);
        cleanups.push(() => mq.removeEventListener('change', onScheme));
      } catch {
        /* sin 3D: queda el 2D, que ya está completo */
      }
    });

    return () => {
      alive = false;
      cancelIdle();
      cleanups.forEach((f) => f());
      logo?.destroy();
    };
  }, []);

  return (
    <h1 ref={wrap} className={'hero-logo-wrap' + (ready ? ' is-3d' : '')}>
      <Logo tagline className="hero-logo" />
      <canvas ref={canvas} className="hero-canvas" aria-hidden="true" />
    </h1>
  );
}
