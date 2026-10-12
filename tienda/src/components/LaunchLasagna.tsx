// Lanzamiento en la portada: producto con precio especial (precio anterior tachado), con su foto y su video.
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { Price } from './Price';
import { Qty } from './Qty';
import { Icon } from './Icon';
import { InViewVideo, srcSet } from './ProductMediaView';

export function LaunchLasagna() {
  const { products, quantityOf, add, setQuantity, settings } = useStore();
  const p = products.find((x) => x.pastaType === 'lasagna' && x.listPrice && x.listPrice > x.price);
  if (!p) return null;
  const photo = p.media.find((m) => m.kind === 'photo');
  const video = p.media.find((m) => m.kind === 'video');
  const qty = quantityOf(p.id);
  const href = `/cajas/${p.slug}`;
  const promoOn = !!settings?.promo?.enabled;
  return (
    <section className="launch wrap" aria-labelledby="h-launch">
      <div className="launch-media">
        {photo && (
          <figure className="taped launch-photo">
            <span className="tape" aria-hidden="true" />
            <img src={photo.url} srcSet={srcSet(photo.url)} sizes="(min-width: 900px) 22vw, 45vw" alt={photo.alt} loading="lazy" decoding="async" />
          </figure>
        )}
        {video && (
          <figure className="taped launch-video">
            <span className="tape" aria-hidden="true" />
            <InViewVideo src={video.url} preload="metadata" label={video.alt || p.name} />
          </figure>
        )}
      </div>
      <div className="launch-text">
        <p className="label launch-kicker">Nuevo en el catálogo · lanzamiento</p>
        <h2 id="h-launch" className="d-xl launch-title">Lasaña para compartir</h2>
        <p className="lede">{p.filling}. Bandeja de 800 g, para 2 personas, sin TACC.</p>
        <p className="hand launch-hand">precio de lanzamiento</p>
        <Price product={p} large />
        <div className="stack-row">
          {p.stock <= 0 ? (
            <p className="block-reason">Esta semana ya no quedan. Stock limitado: volvé pronto.</p>
          ) : qty > 0 ? (
            <Qty value={qty} max={p.stock} name={p.name} onChange={(n) => setQuantity(p.id, n)} />
          ) : (
            <button type="button" className="btn btn-yema btn-big" onClick={() => add(p.id)}><Icon name="mas" size={20} /> Agregar lasaña</button>
          )}
          <Link to={href} className="btn btn-line">Ver más</Link>
        </div>
        <p className="small muted">Stock limitado por semana.{promoOn ? ' Su promo es el precio de lanzamiento: no entra en la promo del Día de la Madre.' : ''}</p>
      </div>
    </section>
  );
}
