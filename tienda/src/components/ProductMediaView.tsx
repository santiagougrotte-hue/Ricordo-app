import { useEffect, useRef, useState } from 'react';
import type { Product } from '../lib/types';
import { canAnimate } from '../motion/capability';
import { DEMO } from '../lib/api';
import { Placeholder } from './Placeholder';

/** Portada del producto: foto real si existe, si no el placeholder con la nota para la sesión de fotos. */
export function ProductCover({ product, ratio = '4 / 5', sizes = '(min-width: 900px) 40vw, 90vw', eager = false, tape = true, cycle = false }: {
  product: Product; ratio?: string; sizes?: string; eager?: boolean; tape?: boolean; cycle?: boolean;
}) {
  const photos = product.media.filter((m) => m.kind === 'photo');
  const cover = photos[0];
  if (cycle && photos.length > 1) return <CyclingPhotos photos={photos} ratio={ratio} sizes={sizes} eager={eager} name={product.name} />;
  const video = product.media.find((m) => m.kind === 'video');
  if (!cover && !video) return <Placeholder note={product.shotNote ?? `${product.name}, plano cenital`} ratio={ratio} tape={tape} />;
  if (!cover && video) return <div className="ph has-photo" style={{ aspectRatio: ratio }}><InViewVideo src={video.url} label={product.name} /></div>;
  if (!cover) return null;
  // En las tarjetas va la foto (vende más que el video); el video vive en la galería del producto.
  return (
    <div className="ph has-photo" style={{ aspectRatio: ratio }}>
      <img
        src={cover.url}
        srcSet={srcSet(cover.url)}
        sizes={sizes}
        alt={cover.alt || product.name}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : 'auto'}
      />
    </div>
  );
}

const CYCLE_MS = 4200;

/** Las fotos del gusto van pasando solas (fundido), solo mientras la tarjeta se ve y si no se pidió reducir movimiento.
 *  Las fotos siguientes se piden recién cuando la tarjeta entra en pantalla. */
function CyclingPhotos({ photos, ratio, sizes, eager, name }: { photos: Product['media']; ratio: string; sizes: string; eager: boolean; name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState(false);
  const count = photos.length;
  const seed = photos[0].id;
  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    let timer: number | undefined;
    let visible = false;
    // Cada tarjeta cambia en su propio momento: así no saltan todas juntas.
    const offset = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 3 * 1300;
    const stop = () => { window.clearTimeout(timer); timer = undefined; };
    const tick = (wait: number) => {
      timer = window.setTimeout(() => { setI((n) => (n + 1) % count); tick(CYCLE_MS); }, wait);
    };
    const start = () => {
      if (timer !== undefined || !visible || document.hidden) return;
      tick(CYCLE_MS + offset);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) { setSeen(true); start(); } else stop();
    }, { rootMargin: '200px 0px' });
    const onVis = () => (document.hidden ? stop() : start());
    io.observe(el);
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); io.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [count, seed]);
  return (
    <div ref={ref} className="ph has-photo ph-cycle" style={{ aspectRatio: ratio }}>
      {photos.map((m, n) => (n === 0 || seen) && (
        <img
          key={m.id}
          className={n === i ? 'on' : undefined}
          src={m.url}
          srcSet={srcSet(m.url)}
          sizes={sizes}
          alt={n === i ? m.alt || name : ''}
          loading={n === 0 && eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={n === 0 && eager ? 'high' : 'auto'}
        />
      ))}
    </div>
  );
}

/** Netlify Image CDN: versiones redimensionadas (y en AVIF/WebP según el navegador) de las fotos de /media/. */
export function srcSet(url: string): string | undefined {
  if (DEMO || !/^\/(media|fotos)\//.test(url) || !/\.(webp|jpg|png)$/.test(url)) return undefined;
  return [480, 800, 1200].map((w) => `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=72 ${w}w`).join(', ');
}

/** Video del producto: sin sonido, en loop, y solo mientras se ve (ahorra datos y batería). */
function InViewVideo({ src, poster, label }: { src: string; poster?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !canAnimate()) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.6] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} className="ph-video" src={src} poster={poster} muted loop playsInline preload="none" aria-label={`Video: ${label}`} />;
}

export { InViewVideo };
