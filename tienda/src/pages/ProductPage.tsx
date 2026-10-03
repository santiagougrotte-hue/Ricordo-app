import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { PASTA_LABEL } from '../lib/types';
import { money } from '../lib/money';
import { Gallery } from '../components/Gallery';
import { Icon } from '../components/Icon';
import { Qty } from '../components/Qty';
import { Stamp } from '../components/Stamp';
import { ProductLabel } from '../components/ProductLabel';
import { useDocumentTitle } from './useDocumentTitle';
import { NotFound } from './NotFound';

export function ProductPage() {
  const { slug } = useParams();
  const { products, status, quantityOf, add, openCart } = useStore();
  const product = products.find((p) => p.slug === slug);
  const [qty, setQty] = useState(1);
  useDocumentTitle(product ? `${PASTA_LABEL[product.pastaType]} de ${product.name} · Ricordo` : 'Ricordo');

  if (status === 'loading') return <p className="wrap sec muted">Cargando…</p>;
  if (!product) return <NotFound />;

  const inCart = quantityOf(product.id);
  const left = Math.max(product.stock - inCart, 0);
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.stock <= product.lowStockThreshold;
  const others = products.filter((p) => p.id !== product.id && p.stock > 0).slice(0, 2);

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
          <p className="label">{PASTA_LABEL[product.pastaType]} · caja x {product.unitsPerBox}</p>
          <h1 className="d-xl pdp-name">{product.name}</h1>
          <p className="pdp-filling">{product.filling}</p>
          <p className="pdp-desc">{product.description}</p>

          <div className="tag-box pdp-tag">
            <div className="tag-in">
              <div className="tag-row"><span className="label">Unidades</span><span className="fill">12 por caja</span></div>
              <div className="tag-row"><span className="label">Conservación</span><span className="fill">freezer, hasta 3 meses</span></div>
              <div className="tag-row"><span className="label">Cocción</span><span className="fill">del freezer a la olla</span></div>
              <div className="tag-row">
                <span className="label">Stock</span>
                <span className="fill">{soldOut ? 'agotado' : low ? `quedan ${product.stock}` : 'hay'}</span>
              </div>
            </div>
          </div>

          <div className="pdp-buy">
            <p className="price price-l">{money(product.price)}<small> la caja</small></p>
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
          </div>
        </div>
      </article>
      {others.length > 0 && (
        <section className="wrap sec" aria-labelledby="h-otros">
          <h2 id="h-otros" className="d-l">Para sumar a la caja</h2>
          <div className="others">
            {others.map((p) => <ProductLabel key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </>
  );
}
