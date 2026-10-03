import { Link, NavLink } from 'react-router-dom';
import { useStore } from '../state/store';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { PostalForm } from './PostalForm';

export function Header() {
  const { count, openCart, lookup, method, postalOpen, openPostal, closePostal, settings } = useStore();

  let where: string;
  if (method === 'pickup') where = 'Retirás en el local';
  else if (lookup.status === 'found') where = `Envío a ${lookup.postalCode} · ${lookup.zone.name}`;
  else if (lookup.status === 'not_found') where = `Todavía no llegamos al ${lookup.postalCode}`;
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
            <a href="/#como-pedir">Cómo pedir</a>
            <a href="/#zonas">Zonas</a>
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
            <span className="cp-change">{lookup.status === 'empty' && method !== 'pickup' ? 'Poné tu CP' : 'Cambiar'}</span>
          </span>
        </button>
      </header>
      <Sheet open={postalOpen} onClose={closePostal} title="¿A dónde te lo llevamos?" side="bottom">
        <p className="muted">Con tu código postal te decimos cuánto sale el envío y cuál es la compra mínima de tu zona.</p>
        <PostalForm onDone={closePostal} />
        {settings?.pickupEnabled && <PickupNote />}
      </Sheet>
    </>
  );
}

function PickupNote() {
  const { method, setMethod, closePostal, settings } = useStore();
  if (method === 'pickup') {
    return (
      <p className="pickup-note">
        Elegiste retirar en el local{settings?.pickupAddress ? ` (${settings.pickupAddress})` : ''}.{' '}
        <button type="button" className="link" onClick={() => setMethod('delivery')}>Prefiero envío</button>
      </p>
    );
  }
  return (
    <p className="pickup-note">
      ¿Preferís pasar a buscarlo?{' '}
      <button type="button" className="link" onClick={() => { setMethod('pickup'); closePostal(); }}>Retiro en el local, sin envío</button>
    </p>
  );
}
