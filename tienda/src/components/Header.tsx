import { Link, NavLink } from 'react-router-dom';
import { useStore } from '../state/store';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { LocalityForm } from './LocalityForm';

export function Header() {
  const { count, openCart, lookup, method, postalOpen, openPostal, closePostal, settings } = useStore();

  let where: string;
  if (method === 'pickup') where = 'Retirás en Berazategui';
  else if (lookup.status === 'found') where = `Envío a ${lookup.locality.name}`;
  else if (lookup.status === 'not_found') where = 'Todavía no llegamos a tu localidad';
  else where = '¿A dónde te lo llevamos?';

  return (
    <>
      <a className="skip" href="#main">Saltar al contenido</a>
      <header className="site-head">
        <div className="wrap head-row">
          <Link to="/" className="head-logo" aria-label="Ricordo, inicio">
            <Logo />
          </Link>
          <nav className="head-nav" aria-label="Principal">
            <NavLink to="/cajas">Las cajas</NavLink>
            <Link to="/#como-pedir">Cómo pedir</Link>
            <Link to="/#zonas">Zonas</Link>
          </nav>
          <button type="button" className="cart-btn" onClick={openCart} aria-label={`Tu pedido, ${count} ${count === 1 ? 'caja' : 'cajas'}`}>
            <Icon name="bolsa" />
            <span className="cart-label">Tu pedido</span>
            {count > 0 && <span className="cart-count" aria-hidden="true">{count}</span>}
          </button>
        </div>
        <button type="button" className={'cp-strip' + (lookup.status === 'found' || method === 'pickup' ? ' set' : '')} onClick={openPostal}>
          <span className="wrap cp-strip-in">
            <Icon name={method === 'pickup' ? 'local' : 'cp'} size={20} />
            <span>{where}</span>
            <span className="cp-change">{lookup.status === 'empty' && method !== 'pickup' ? (settings?.distanceEnabled ? 'Poné tu dirección' : 'Elegí tu localidad') : 'Cambiar'}</span>
          </span>
        </button>
      </header>
      <Sheet open={postalOpen} onClose={closePostal} title="¿A dónde te lo llevamos?" side="bottom">
        <p className="muted">Con tu localidad te decimos la compra mínima, desde cuántas cajas el envío es gratis, cuánto sale y qué día llega.</p>
        <LocalityForm onDone={closePostal} />
        {settings?.pickupEnabled && <PickupNote />}
      </Sheet>
    </>
  );
}

function PickupNote() {
  const { method, setMethod, closePostal } = useStore();
  if (method === 'pickup') {
    return (
      <p className="pickup-note">
        Elegiste retirar en Berazategui (el horario lo coordinamos por WhatsApp).{' '}
        <button type="button" className="link" onClick={() => setMethod('delivery')}>Prefiero envío</button>
      </p>
    );
  }
  return (
    <p className="pickup-note">
      ¿Preferís pasar a buscarlo?{' '}
      <button type="button" className="link" onClick={() => { setMethod('pickup'); closePostal(); }}>Retiro en Berazategui, sin envío</button>
    </p>
  );
}
