import { useEffect, useRef } from 'react';
import type { Product } from '../lib/types';
import { canAnimate } from '../motion/capability';
import { DEMO } from '../lib/api';
import { Placeholder } from './Placeholder';

/** Portada del producto: foto real si existe, si no el placeholder con la nota para la sesión de fotos. */
export function ProductCover({ product, ratio = '4 / 5', sizes = '(min-width: 900px) 40vw, 90vw', eager = false, tape = true }: {
  product: Product; ratio?: string; sizes?: string; eager?: boolean; tape?: boolean;
}) {
  const cover = product.media.find((m) => m.kind === 'photo');
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
