import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { money } from '../lib/money';
import { Sheet } from './Sheet';
import { Qty } from './Qty';
import { Ruler } from './Ruler';
import { Icon } from './Icon';
import { PostalForm } from './PostalForm';
import { MethodToggle } from './MethodToggle';
import { ProductCover } from './ProductMediaView';

export function CartDrawer() {
  const s = useStore();
  const { items, subtotal, quote: q, method, lookup, settings, cartOpen, closeCart, setQuantity } = s;
  const navigate = useNavigate();
  const empty = items.length === 0;

  const reason = blockReason();
  function blockReason(): string | null {
    if (empty || !q) return null;
    if (method === 'delivery') {
      if (lookup.status !== 'found') return 'Poné tu código postal para calcular el envío.';
      if (q.missingForMin > 0) return `Te faltan ${money(q.missingForMin)} para la compra mínima de envío a ${lookup.zone.name} (${money(q.minOrder)}).`;
    } else {
      if (!settings?.pickupEnabled) return 'El retiro en el local no está disponible por ahora.';
      if (q.missingForMin > 0) return `Te faltan ${money(q.missingForMin)} para la compra mínima de retiro (${money(q.minOrder)}).`;
    }
    return null;
  }

  const total = q?.shippingCost !== null && q ? subtotal + q.shippingCost : null;

  const footer = empty ? null : (
    <>
      <dl className="totals">
        <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
        <div>
          <dt>{method === 'pickup' ? 'Retiro en el local' : lookup.status === 'found' ? `Envío a ${lookup.zone.name}` : 'Envío'}</dt>
          <dd>{q?.shippingCost === null || !q ? '—' : q.shippingCost === 0 ? 'Gratis' : money(q.shippingCost)}</dd>
        </div>
        <div className="grand"><dt>Total</dt><dd>{total === null ? '—' : money(total)}</dd></div>
      </dl>
      {reason && <p className="block-reason" id="cart-block">{reason}</p>}
      <button
        type="button"
        className="btn btn-ink btn-wide"
        disabled={!q?.canCheckout}
        aria-describedby={reason ? 'cart-block' : undefined}
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
          {method === 'delivery' && lookup.status !== 'found' && <PostalForm compact />}

          <ul className="cart-lines">
            {items.map(({ product, quantity }) => (
              <li key={product.id} className="cart-line">
                <div className="cart-thumb"><ProductCover product={product} ratio="1 / 1" sizes="72px" tape={false} /></div>
                <div className="cart-info">
                  <p className="cart-name">{product.name}</p>
                  <p className="muted small">{money(product.price)} la caja · {product.pastaType}</p>
                  {quantity >= product.stock && <p className="small warn">No hay más cajas de este gusto.</p>}
                </div>
                <div className="cart-qty">
                  <Qty value={quantity} max={product.stock} name={product.name} onChange={(n) => setQuantity(product.id, n)} />
                  <p className="cart-line-total">{money(product.price * quantity)}</p>
                </div>
              </li>
            ))}
          </ul>

          {q && (method === 'pickup' ? q.minOrder > 0 : lookup.status === 'found') && (
            <div className="progress">
              <Ruler subtotal={subtotal} minOrder={q.minOrder} freeFrom={method === 'pickup' ? null : q.freeShippingFrom} />
              <p className="hand progress-note" aria-live="polite">{progressNote()}</p>
            </div>
          )}
        </>
      )}
    </Sheet>
  );

  function progressNote(): string {
    if (!q) return '';
    if (q.missingForMin > 0) return `te faltan ${money(q.missingForMin)} para el mínimo`;
    if (method === 'delivery' && q.missingForFree !== null) {
      return q.missingForFree > 0 ? `¡te faltan ${money(q.missingForFree)} para el envío gratis!` : '¡envío gratis!';
    }
    return '¡listo para pedir!';
  }
}
