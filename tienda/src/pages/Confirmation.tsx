import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { money } from '../lib/money';
import { orderMessage } from '../lib/orderMessage';
import { discountLabel } from '../lib/shipping';
import { whatsappLink } from '../lib/whatsapp';
import type { OrderReceipt } from '../lib/types';
import { Icon } from '../components/Icon';
import { Stamp } from '../components/Stamp';
import { RECEIPT_KEY } from './Checkout';
import { useDocumentTitle } from './useDocumentTitle';

export function Confirmation() {
  const { number } = useParams();
  useDocumentTitle(`Pedido ${number} · Ricordo`);
  const { settings, clear, reload } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { receipt: OrderReceipt; fresh?: boolean } | null;
  let r = state?.receipt ?? null;

  // Pedido recién creado: vaciar el carrito, refrescar stock y marcar el estado como ya procesado.
  useEffect(() => {
    if (!state?.fresh) return;
    clear();
    void reload();
    navigate(location.pathname, { replace: true, state: { receipt: state.receipt } });
  }, [state, clear, reload, navigate, location.pathname]);

  if (!r) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) || 'null') as OrderReceipt | null;
      if (saved && String(saved.number) === number) r = saved;
    } catch { /* nada */ }
  }

  const msg = r
    ? orderMessage(r, { to: 'cliente', transferInfo: settings?.transferInfo })
    : `¡Hola Ricordo! 👋 Hice el pedido #${number}.`;
  const wa = settings ? whatsappLink(settings.whatsappPhone, msg) : null;

  return (
    <section className="wrap sec confirm">
      <div className="confirm-head">
        <Stamp className="confirm-stamp" ring="RICORDO · PEDIDO RECIBIDO · GRACIAS ·" lines={[`#${number}`]} label={`Pedido ${number} recibido`} />
        <div>
          <p className="label">Pedido recibido</p>
          <h1 className="d-xl">¡Listo! Tu pedido es el {number}.</h1>
          <p className="lede">Te escribimos por WhatsApp para confirmarlo. Si querés, escribinos vos primero y lo dejamos cerrado.</p>
        </div>
      </div>

      <div className="confirm-grid">
        {r && (
          <div className="tag-box">
            <div className="tag-in">
              <p className="label tag-title">Caja Nº {r.number}</p>
              <ul className="sum-lines">
                {r.lines.map((l) => <li key={l.name}><span>{l.quantity} × {l.name}</span><span>{money(l.unitPrice * l.quantity)}</span></li>)}
              </ul>
              <dl className="totals">
                <div><dt>Subtotal</dt><dd>{money(r.subtotal)}</dd></div>
                {r.discount > 0 && <div className="discount"><dt>{discountLabel(r.discountPct)}</dt><dd>−{money(r.discount)}</dd></div>}
                <div><dt>{r.deliveryMethod === 'pickup' ? 'Retiro' : 'Envío'}</dt><dd>{r.shippingCost === 0 ? 'Gratis' : money(r.shippingCost)}</dd></div>
                <div className="grand"><dt>Total</dt><dd>{money(r.total)}</dd></div>
              </dl>
              <div className="tag-when">
                <span className="label">{r.deliveryMethod === 'pickup' ? 'Retirás' : 'Llega'}</span>
                <p>{r.windowLabel}</p>
              </div>
            </div>
          </div>
        )}
        <div className="confirm-next">
          <h2 className="d-m">Qué sigue</h2>
          <ol className="next-steps">
            {r?.deliveryMethod === 'delivery' && !r.address && (
              <li><strong>Mandanos tu dirección por WhatsApp</strong> (calle, número, piso/depto y entre calles): tocá el botón de abajo, completala en el mensaje y envialo.</li>
            )}
            {r?.paymentMethod === 'transfer' ? (
              <li>Transferí {money(r.total)}{settings?.transferInfo ? <> a <strong>{settings.transferInfo}</strong></> : ''} y mandanos el comprobante.</li>
            ) : (
              <li>Tené {r ? money(r.total) : 'el total'} en efectivo para cuando {r?.deliveryMethod === 'pickup' ? 'pases a retirar' : 'llegue el pedido'}.</li>
            )}
            <li>Te confirmamos el pedido por WhatsApp.</li>
            <li>Al llegar, directo al freezer.</li>
          </ol>
          {wa && (
            <a className="btn btn-ink btn-big btn-wide" href={wa} target="_blank" rel="noopener noreferrer">
              <Icon name="charla" /> {r?.deliveryMethod === 'delivery' && !r.address ? 'Mandar mi dirección por WhatsApp' : 'Escribir por WhatsApp'}
            </a>
          )}
          <p className="center"><Link to="/cajas" className="link">Seguir mirando</Link></p>
        </div>
      </div>
    </section>
  );
}
