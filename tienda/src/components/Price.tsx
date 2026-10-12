import { money } from '../lib/money';
import { soldByUnit, type Product } from '../lib/types';

/** Precio con el anterior tachado cuando hay precio especial (lanzamientos). */
export function Price({ product, large = false }: { product: Pick<Product, 'price' | 'listPrice' | 'countsAsBox' | 'pastaType'>; large?: boolean }) {
  const was = product.listPrice && product.listPrice > product.price ? product.listPrice : null;
  return (
    <p className={'price' + (large ? ' price-l' : '') + (was ? ' price-deal' : '')}>
      {was && <><s className="price-was"><span className="sr">Antes </span>{money(was)}</s> <span className="sr">Ahora </span></>}
      {money(product.price)}<small>{soldByUnit(product) ? ' c/u' : ' la caja'}</small>
    </p>
  );
}
