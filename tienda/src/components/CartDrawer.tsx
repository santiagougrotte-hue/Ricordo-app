import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { money } from '../lib/money';
import { cartMessage, discountLabel, maxDiscountAt } from '../lib/shipping';
import { PASTA_LABEL } from '../lib/types';
import { Sheet } from './Sheet';
import { Qty } from './Qty';
import { Ruler } from './Ruler';
import { Icon } from './Icon';
import { LocalityForm, ShippingFacts } from './LocalityForm';
import { MethodToggle } from './MethodToggle';
import { ProductCover } from './ProductMediaView';

export function CartDrawer() {
  const s = useStore();
  const { items, subtotal, totals, quote: q, method, setMethod, lookup, cartOpen, closeCart, setQuantity, setLocalityChoice } = s;
  const navigate = useNavigate();
  const empty = items.length === 0;
  const msg = q ? cartMessage(q, lookup) : '';
  // CP sin zona: el formulario de CP ya muestra el aviso con el botón de WhatsApp.
  const notFound = method === 'delivery' && lookup.status === 'not_found';
  const zone = method === 'delivery' && lookup.status === 'found' ? lookup.zone : null;

  const footer = empty ? null : (
    <>
      <dl className="totals">
        <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
        {q && q.discount > 0 && <div className="discount"><dt>{discountLabel(q.discountPct, q.discountBoxes)}</dt><dd>−{money(q.discount)}</dd></div>}
        <div>
          <dt>{method === 'pickup' ? 'Retiro en Berazategui' : zone ? `Envío a ${zone.name}` : 'Envío'}</dt>
          <dd>{!q || q.shippingCost === null ? '—' : q.shippingCost === 0 ? 'Gratis' : `${q.shippingEstimated ? 'aprox. ' : ''}${money(q.shippingCost)}`}</dd>
        </div>
        <div className="grand"><dt>Total</dt><dd>{!q || q.total === null ? '—' : money(q.total)}</dd></div>
      </dl>
      {q?.shippingEstimated && <p className="small muted">El envío se ajusta según la distancia a tu dirección; lo ves exacto al completar el pedido.</p>}
      <button
        type="button"
        className="btn btn-ink btn-wide"
        disabled={!q?.canCheckout}
        aria-describedby={!q?.canCheckout ? 'cart-msg' : undefined}
        onClick={() => {
          closeCart();
          navigate('/checkout');
        }}
      >
        Hacer el pedido <Icon name="flecha" size={20} />
      </button>
    </>
  );

  return (
    <Sheet open={cartOpen} onClose={closeCart} title="Tu pedido" footer={footer}>
      {empty ? (
        <div className="cart-empty">
          <p className="hand">la caja está vacía…</p>
          <p className="muted">Elegí tus gustos. Cada caja trae 12 unidades.</p>
          <Link to="/cajas" className="btn btn-yema" onClick={closeCart}>Ver las cajas</Link>
        </div>
      ) : (
        <>
          <MethodToggle />
          {method === 'delivery' && lookup.status !== 'found' && <LocalityForm compact />}
          {zone && lookup.status === 'found' && (
            <p className="cart-zone small">
              <Icon name="moto" size={20} /> Envío a {s.address.street ? `${s.address.street}, ` : ''}{lookup.locality.name} ·{' '}
              <button type="button" className="link" onClick={() => setLocalityChoice(null)}>cambiar</button>
            </p>
          )}
          {zone && <ShippingFacts />}

          <ul className="cart-lines">
            {items.map(({ product, quantity }) => (
              <li key={product.id} className="cart-line">
                <div className="cart-thumb"><ProductCover product={product} ratio="1 / 1" sizes="72px" tape={false} /></div>
                <div className="cart-info">
                  <p className="cart-name">{product.name}</p>
                  <p className="muted small">{money(product.price)} la caja · {PASTA_LABEL[product.pastaType].toLowerCase()}</p>
                  {quantity >= product.stock && <p className="small warn">No hay más cajas de este gusto.</p>}
                </div>
                <div className="cart-qty">
                  <Qty value={quantity} max={product.stock} name={product.name} onChange={(n) => setQuantity(product.id, n)} />
                  <p className="cart-line-total">{money(product.price * quantity)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="progress">
            {q && (method === 'pickup' ? q.minBoxes > 0 : !!zone) && (
              <Ruler boxes={totals.boxes} min={q.minBoxes} free={zone ? zone.freeFromBoxes : null} maxDiscountAt={zone ? maxDiscountAt(zone) : null} />
            )}
            <p id="cart-msg" className={'cart-msg' + (notFound ? ' sr' : '')} aria-live="polite">{msg}</p>
            {q?.suggestPickup && (
              <button type="button" className="btn btn-line" onClick={() => setMethod('pickup')}>
                <Icon name="local" /> Retirar en Berazategui
              </button>
            )}
            {totals.hasExtras && <p className="small muted">Las salsas y complementos no suman cajas para el mínimo, el envío gratis ni el descuento.</p>}
          </div>
        </>
      )}
    </Sheet>
  );
}
