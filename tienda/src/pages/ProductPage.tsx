import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { PASTA_LABEL } from '../lib/types';
import { money } from '../lib/money';
import { Gallery } from '../components/Gallery';
import { InViewVideo, srcSet, videoPoster } from '../components/ProductMediaView';
import { cutoffWithDate, deliverySentence } from '../lib/delivery';
import { Icon } from '../components/Icon';
import { Qty } from '../components/Qty';
import { Stamp } from '../components/Stamp';
import { ProductLabel } from '../components/ProductLabel';
import { useDocumentTitle } from './useDocumentTitle';
import { NotFound } from './NotFound';
import { useReveal } from '../motion/useMotion';

export function ProductPage() {
  const { slug } = useParams();
  const { products, status, quantityOf, add, openCart, settings, lookup, openPostal } = useStore();
  const product = products.find((p) => p.slug === slug);
  const [qty, setQty] = useState(1);
  useReveal(`${status}-${slug}`);
  useDocumentTitle(product ? `${PASTA_LABEL[product.pastaType]} de ${product.name} · Ricordo` : 'Ricordo');

  if (status === 'loading') {
    return (
      <div className="wrap pdp" aria-busy="true" style={{ paddingTop: 'var(--space-16)' }}>
        <div className="pdp-media"><div className="ph" style={{ aspectRatio: '4 / 5' }} /></div>
        <div className="pdp-info" aria-hidden="true"><span className="sk sk-s" /><span className="sk sk-l" /><span className="sk sk-m" /><span className="sk sk-l" /></div>
      </div>
    );
  }
  if (!product) return <NotFound />;

  const inCart = quantityOf(product.id);
  const left = Math.max(product.stock - inCart, 0);
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.stock <= product.lowStockThreshold;
  const others = products.filter((p) => p.id !== product.id && p.stock > 0).slice(0, 2);
  const zone = lookup.status === 'found' ? lookup.zone : null;

  return (
    <>
      <div className="wrap crumbs">
        <Link to={`/cajas?tipo=${product.pastaType}`}><Icon name="volver" size={20} /> {PASTA_LABEL[product.pastaType]}</Link>
      </div>
      <article className="wrap pdp">
        <div className="pdp-media">
          <Gallery product={product} />
          <Stamp className="pdp-stamp" lines={['SIN', 'TACC']} label="Sin TACC" />
        </div>
        <div className="pdp-info">
          <p className="label">{product.countsAsBox === false ? PASTA_LABEL[product.pastaType] : `${PASTA_LABEL[product.pastaType]} · caja x ${product.unitsPerBox}`}</p>
          <h1 className="d-xl pdp-name">{product.name}</h1>
          <p className="label pdp-lleva">Lo que lleva</p>
          <p className="pdp-filling">{product.filling}</p>
          <p className="pdp-desc">{product.description}</p>

          {product.countsAsBox !== false && <div className="tag-box pdp-tag" data-reveal="paper">
            <div className="tag-in">
              <div className="tag-row"><span className="label">Unidades</span><span className="fill">12 por caja</span></div>
              <div className="tag-row"><span className="label">Conservación</span><span className="fill">freezer, hasta 3 meses</span></div>
              <div className="tag-row"><span className="label">Cocción</span><span className="fill">del freezer a la olla, 4 minutos</span></div>
            </div>
          </div>}

          <div className="pdp-buy">
            <p className="price price-l">{money(product.price)}<small>{product.countsAsBox === false ? ' c/u' : ' la caja'}</small></p>
            {low && <p className="hand low">¡quedan {product.stock}!</p>}
            {soldOut ? (
              <p className="block-reason">Este gusto se agotó. Volvemos a tenerlo en la próxima tanda.</p>
            ) : left === 0 ? (
              <>
                <p className="block-reason">Ya tenés en tu pedido todas las cajas que quedan ({inCart}).</p>
                <button type="button" className="btn btn-line" onClick={openCart}>Ver tu pedido</button>
              </>
            ) : (
              <div className="pdp-add">
                <Qty value={Math.min(qty, left)} max={left} min={1} name={product.name} onChange={(n) => setQty(Math.max(1, n))} />
                <button
                  type="button"
                  className="btn btn-yema btn-big"
                  onClick={() => {
                    if (add(product.id, Math.min(qty, left)) > 0) {
                      setQty(1);
                      openCart();
                    }
                  }}
                >
                  <Icon name="mas" size={20} /> Agregar {Math.min(qty, left) > 1 ? `${Math.min(qty, left)} cajas` : 'al pedido'}
                </button>
              </div>
            )}
            {inCart > 0 && left > 0 && <p className="small muted">Ya tenés {inCart} en tu pedido.</p>}
            {settings && (
              <p className="pdp-when small">
                <Icon name="moto" size={20} />
                <span>
                  {zone ? <>{deliverySentence(zone, settings)}.</> : <>Pedí hasta el {cutoffWithDate(settings)} y te llega ese fin de semana, el día de tu zona. </>}
                  {!zone && <button type="button" className="link" onClick={openPostal}>Elegí tu localidad</button>}
                </span>
              </p>
            )}
          </div>
        </div>
      </article>
      {product.media.length > 1 && (
        <section className="wrap sec pdp-photos" aria-labelledby="h-fotos">
          <h2 id="h-fotos" className="d-l">Todas las fotos</h2>
          <ul className="photo-wall">
            {product.media.map((m, i) => (
              <li key={m.id} className={'taped' + (i % 2 ? ' tilt-r' : '')} data-reveal="paper">
                <span className="tape" aria-hidden="true" />
                {m.kind === 'video' ? (
                  <InViewVideo src={m.url} poster={videoPoster(m.url)} preload="metadata" label={m.alt || product.name} />
                ) : (
                  <img src={m.url} srcSet={srcSet(m.url)} sizes="(min-width: 900px) 33vw, 50vw" alt={m.alt || product.name} loading="lazy" decoding="async" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section className="wrap sec" aria-labelledby="h-otros">
          <h2 id="h-otros" className="d-l">Para sumar a la caja</h2>
          <div className="others">
            {others.map((p, i) => <ProductLabel key={p.id} product={p} position={i + 1} />)}
          </div>
        </section>
      )}
    </>
  );
}
