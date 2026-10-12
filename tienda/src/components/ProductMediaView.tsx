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
  // Fotos ya descargadas: solo se pasa a una foto cuando está lista (nunca un recuadro vacío en conexiones lentas).
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [shown, setShown] = useState(position % photos.length);
  const start = position % photos.length;
  const want = (start + (seen ? t : 0)) % photos.length;
  useEffect(() => {
    if (loaded.has(want)) setShown(want);
  }, [want, loaded]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !canAnimate()) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const markLoaded = (n: number) => setLoaded((prev) => (prev.has(n) ? prev : new Set(prev).add(n)));
  return (
    <div ref={ref} className="ph has-photo ph-cycle" style={{ aspectRatio: ratio, '--chain': position } as React.CSSProperties}>
      {photos.map((m, n) => (n === start || seen) && (
        <img
          key={m.id}
          className={n === shown ? 'on' : undefined}
          src={m.url}
          srcSet={srcSet(m.url)}
          sizes={sizes}
          alt={n === shown ? m.alt || name : ''}
          // La de arranque respeta lazy; las siguientes se piden ya (la tarjeta está por verse).
          loading={n === start ? (eager ? 'eager' : 'lazy') : 'eager'}
          decoding="async"
          fetchPriority={n === start && eager ? 'high' : 'auto'}
          ref={(img) => { if (img?.complete && img.naturalWidth > 0) markLoaded(n); }}
          onLoad={() => markLoaded(n)}
        />
      ))}
    </div>
  );
}

/** Póster de un video: por convención, /fotos/x.mp4 → /fotos/x-poster.webp (así no se ve un recuadro vacío antes de reproducir). */
export function videoPoster(url: string): string | undefined {
  if (url === videoAmasado) return posterAmasado;
  // Solo los videos que tienen su póster en /fotos (los demás muestran el primer cuadro).
  return url === '/fotos/amasado-masa-nero.mp4' ? '/fotos/amasado-masa-nero-poster.webp' : undefined;
}

/** Netlify Image CDN: versiones redimensionadas (y en AVIF/WebP según el navegador) de las fotos de /media/. */
export function srcSet(url: string): string | undefined {
  if (DEMO || !/^\/(media|fotos)\//.test(url) || !/\.(webp|jpg|png)$/.test(url)) return undefined;
  return [480, 800, 1200].map((w) => `/.netlify/images?url=${encodeURIComponent(url)}&w=${w}&q=72 ${w}w`).join(', ');
}

/** Video del producto: sin sonido, en loop, y solo mientras se ve (ahorra datos y batería). */
function InViewVideo({ src, poster, label, preload = 'none' }: { src: string; poster?: string; label: string; preload?: 'none' | 'metadata' }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Si el celular no deja reproducir solo (ahorro de batería, reducir movimiento), se muestran los controles para darle play.
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!canAnimate()) { setManual(true); return; }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.5) void v.play().catch(() => setManual(true));
        else v.pause();
      },
      { threshold: [0, 0.5] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);
  // Sin póster, "#t=0.001" hace que el navegador (Safari incluido) muestre el primer cuadro en vez de un recuadro vacío.
  const url = poster || src.includes('#') ? src : `${src}#t=0.001`;
  return <video ref={ref} className="ph-video" src={url} poster={poster} muted loop playsInline controls={manual} preload={poster ? preload : 'metadata'} aria-label={`Video: ${label}`} />;
}

export { InViewVideo };
