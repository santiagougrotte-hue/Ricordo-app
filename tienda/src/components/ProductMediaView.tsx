import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Product } from '../lib/types';
import { canAnimate } from '../motion/capability';
import { DEMO } from '../lib/api';
import { Placeholder } from './Placeholder';
import videoAmasado from '../assets/fotos/amasado-masa-nero.mp4';
import posterAmasado from '../assets/fotos/amasado-masa-nero-poster.webp';

/** Portada del producto: foto real si existe, si no el placeholder con la nota para la sesión de fotos. */
export function ProductCover({ product, ratio = '4 / 5', sizes = '(min-width: 900px) 40vw, 90vw', eager = false, tape = true, cycle = false, position = 0 }: {
  product: Product; ratio?: string; sizes?: string; eager?: boolean; tape?: boolean; cycle?: boolean;
  /** Lugar de la tarjeta en la lista: cada una arranca en otra foto, así no se ven todas iguales. */
  position?: number;
}) {
  const photos = product.media.filter((m) => m.kind === 'photo');
  const cover = photos[0];
  if (cycle && photos.length > 1) return <CyclingPhotos photos={photos} ratio={ratio} sizes={sizes} eager={eager} name={product.name} position={position} />;
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

// Un solo reloj para todas las tarjetas: cambian juntas, en cadena (cada una un poco después que la anterior),
// y como cada una arranca en otra foto, las vecinas nunca muestran el mismo tipo de foto.
let tick = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
function startClock() {
  if (timer === undefined && !document.hidden && canAnimate()) {
    timer = window.setInterval(() => { tick++; emit(); }, CYCLE_MS);
  }
}
function stopClock() {
  window.clearInterval(timer);
  timer = undefined;
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.hidden ? stopClock() : listeners.size && startClock()));
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  startClock();
  return () => {
    listeners.delete(fn);
    if (!listeners.size) stopClock();
  };
}
const useTick = () => useSyncExternalStore(subscribe, () => tick, () => 0);

/** Las fotos del gusto van pasando solas (fundido). Con "reducir movimiento" queda fija la foto de arranque.
 *  Las fotos siguientes se piden recién cuando la tarjeta se acerca a la pantalla. */
function CyclingPhotos({ photos, ratio, sizes, eager, name, position }: { photos: Product['media']; ratio: string; sizes: string; eager: boolean; name: string; position: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTick();
  const [seen, setSeen] = useState(false);
  const start = position % photos.length;
  const i = (start + (seen ? t : 0)) % photos.length;
  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="ph has-photo ph-cycle" style={{ aspectRatio: ratio, '--chain': position } as React.CSSProperties}>
      {photos.map((m, n) => (n === start || seen) && (
        <img
          key={m.id}
          className={n === i ? 'on' : undefined}
          src={m.url}
          srcSet={srcSet(m.url)}
          sizes={sizes}
          alt={n === i ? m.alt || name : ''}
          loading={n === start && eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={n === start && eager ? 'high' : 'auto'}
        />
      ))}
    </div>
  );
}

/** Póster de un video: por convención, /fotos/x.mp4 → /fotos/x-poster.webp (así no se ve un recuadro vacío antes de reproducir). */
export function videoPoster(url: string): string | undefined {
  if (url === videoAmasado) return posterAmasado;
  const m = /^(\/fotos\/.+)\.mp4$/.exec(url);
  return m ? `${m[1]}-poster.webp` : undefined;
}

/** Netlify Image CDN: versiones redimensionadas (y en AVIF/WebP según el navegador) de las fotos de /media/. */
export function srcSet(url: string): string | undefined {
  if (DEMO || !/^\/(media|fotos)\//.test(url) || !/\.(webp|jpg|png)$/.test(url)) return undefined;
  return [480, 800, 1200].map((w) => `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=72 ${w}w`).join(', ');
}

/** Video del producto: sin sonido, en loop, y solo mientras se ve (ahorra datos y batería). */
function InViewVideo({ src, poster, label, preload = 'none' }: { src: string; poster?: string; label: string; preload?: 'none' | 'metadata' }) {
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
  return <video ref={ref} className="ph-video" src={src} poster={poster} muted loop playsInline preload={preload} aria-label={`Video: ${label}`} />;
}

export { InViewVideo };
