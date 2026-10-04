import { Link } from 'react-router-dom';
import type { Product } from '../lib/types';
import { PASTA_LABEL } from '../lib/types';
import { money } from '../lib/money';
import { useStore } from '../state/store';
import { ProductCover } from './ProductMediaView';
import { Icon } from './Icon';
import { Qty } from './Qty';
import { Stamp } from './Stamp';

/** Mientras cargan los productos: misma forma que la etiqueta, así nada salta al llegar los datos. */
export function ProductSkeleton({ size = 'm' }: { size?: 'l' | 'm' }) {
  return (
    <div className={`prod prod-${size} prod-skeleton`} aria-hidden="true">
      <div className="prod-photo"><div className="ph" style={{ aspectRatio: size === 'l' ? '4 / 4.4' : '4 / 5' }} /></div>
      <div className="tag-box"><div className="tag-in"><span className="sk sk-s" /><span className="sk sk-l" /><span className="sk sk-m" /></div></div>
    </div>
  );
}

/** La "card" de Ricordo: foto pegada + etiqueta de caja montada encima. */
export function ProductLabel({ product, size = 'm', eager = false, level = 3, parallax = false }: { product: Product; size?: 'l' | 'm'; eager?: boolean; level?: 2 | 3; parallax?: boolean }) {
  const H = level === 2 ? 'h2' : 'h3';
  const { quantityOf, add, setQuantity } = useStore();
  const qty = quantityOf(product.id);
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.stock <= product.lowStockThreshold;
  const href = `/cajas/${product.slug}`;

  return (
    <article className={`prod prod-${size}` + (soldOut ? ' sold-out' : '')} data-reveal="paper">
      <Link to={href} className="prod-photo" tabIndex={-1} aria-hidden="true" data-parallax={parallax || undefined}>
        <ProductCover product={product} ratio={size === 'l' ? '4 / 4.4' : '4 / 5'} eager={eager} />
        {soldOut && <Stamp className="stamp-out" lines={['SIN', 'STOCK']} />}
      </Link>
      <div className="tag-box">
        <div className="tag-in">
          <p className="label">{PASTA_LABEL[product.pastaType]} · caja x {product.unitsPerBox}</p>
          <H className="prod-name"><Link to={href}>{product.name}</Link></H>
          {size === 'l' && <p className="prod-desc">{product.description}</p>}
          {low && <p className="hand low">¡quedan {product.stock}!</p>}
          <div className="prod-buy">
            <p className="price">{money(product.price)}<small> la caja</small></p>
            {soldOut ? (
              <span className="sold-note">Vuelve pronto</span>
            ) : qty > 0 ? (
              <Qty value={qty} max={product.stock} name={product.name} onChange={(n) => setQuantity(product.id, n)} />
            ) : (
              <button type="button" className="btn btn-yema" onClick={() => add(product.id)}>
                <Icon name="mas" size={20} /> Agregar
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
