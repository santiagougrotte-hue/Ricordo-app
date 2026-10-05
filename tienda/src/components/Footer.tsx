import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { whatsappLink } from '../lib/whatsapp';
import { Logo } from './Logo';
import { Icon } from './Icon';

export function Footer() {
  const { settings } = useStore();
  const wa = settings ? whatsappLink(settings.whatsappPhone, 'Hola Ricordo! Tengo una consulta.') : null;
  return (
    <footer className="site-foot">
      <p className="troquel wrap" aria-hidden="true"><Icon name="tijera" size={20} /></p>
      <div className="wrap foot-grid" data-reveal="rise">
        <Logo tagline className="foot-logo" />
        <div>
          <p className="label">Entregas</p>
          <p>El fin de semana, según tu zona: Berazategui, alrededores, CABA y La Plata. Pedidos hasta el jueves 13 h.</p>
        </div>
        <div>
          <p className="label">Hablemos</p>
          {wa ? <a className="foot-link" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="charla" size={20} /> WhatsApp</a> : <p>Pronto por WhatsApp.</p>}
          <p><Link className="foot-link" to="/cajas">Ver las cajas</Link></p>
        </div>
      </div>
      <p className="wrap foot-small">Ricordo · Pasta artesanal sin gluten · Berazategui, Buenos Aires</p>
    </footer>
  );
}
