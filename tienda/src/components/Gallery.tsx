import { useRef, useState } from 'react';
import type { Product } from '../lib/types';
import { Placeholder } from './Placeholder';
import { srcSet } from './ProductMediaView';

/** Galería con scroll-snap: swipe nativo en el celular, puntos y flechas accesibles. */
export function Gallery({ product }: { product: Product }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const media = product.media;

  if (media.length === 0) {
    return (
      <div className="gallery">
        <Placeholder note={product.shotNote ?? product.name} ratio="4 / 5" />
      </div>
    );
  }

  function go(i: number) {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(i, media.length - 1));
    el.scrollTo({ left: n * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  return (
    <div className="gallery" aria-roledescription="carrusel" aria-label={`Fotos de ${product.name}`}>
      <div
        ref={track}
        className="gallery-track"
        tabIndex={0}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(index + 1);
          if (e.key === 'ArrowLeft') go(index - 1);
        }}
      >
        {media.map((m, i) => (
          <figure key={m.id} className="gallery-slide" aria-label={`${i + 1} de ${media.length}`}>
            {m.kind === 'video' ? (
              <video src={m.url} muted playsInline loop autoPlay={i === 0} preload={i === 0 ? 'metadata' : 'none'} aria-label={m.alt || product.name} />
            ) : (
              <img src={m.url} srcSet={srcSet(m.url)} sizes="(min-width: 900px) 50vw, 100vw" alt={m.alt || product.name} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" />
            )}
          </figure>
        ))}
      </div>
      {media.length > 1 && (
        <div className="gallery-dots">
          {media.map((m, i) => (
            <button key={m.id} type="button" aria-label={`Ver foto ${i + 1}`} aria-current={i === index} onClick={() => go(i)} />
          ))}
        </div>
      )}
    </div>
  );
}
