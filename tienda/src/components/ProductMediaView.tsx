import type { Product } from '../lib/types';
import { Placeholder } from './Placeholder';

/** Portada del producto: foto real si existe, si no el placeholder con la nota para la sesión de fotos. */
export function ProductCover({ product, ratio = '4 / 5', sizes = '(min-width: 900px) 40vw, 90vw', eager = false, tape = true }: {
  product: Product; ratio?: string; sizes?: string; eager?: boolean; tape?: boolean;
}) {
  const cover = product.media.find((m) => m.kind === 'photo');
  if (!cover) return <Placeholder note={product.shotNote ?? `${product.name}, plano cenital`} ratio={ratio} tape={tape} />;
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

/** Supabase Storage sirve versiones redimensionadas con /render/image/. Solo aplica a URLs de Storage. */
export function srcSet(url: string): string | undefined {
  if (!url.includes('/storage/v1/object/public/')) return undefined;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  return [480, 800, 1200].map((w) => `${base}?width=${w}&quality=72 ${w}w`).join(', ');
}
