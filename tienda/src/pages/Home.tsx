import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { useSlots } from '../state/useSlots';
import { money } from '../lib/money';
import { slotDay, slotDeadline, slotDeadlineShort, slotHours, slotPart } from '../lib/slots';
import { Logo } from '../components/Logo';
import { Icon } from '../components/Icon';
import { Stamp } from '../components/Stamp';
import { ProductLabel } from '../components/ProductLabel';
import { PostalForm } from '../components/PostalForm';
import { Placeholder } from '../components/Placeholder';
import { useDocumentTitle } from './useDocumentTitle';

export function Home() {
  useDocumentTitle('Ricordo · Pasta rellena sin TACC en Berazategui');
  const { products, zones, settings, status } = useStore();
  const { slots } = useSlots('delivery');
  const next = slots?.[0];
  const featured = products.filter((p) => p.featured).slice(0, 3);

  return (
    <>
      <section className="hero wrap">
        <div className="hero-brand">
          <Logo tagline className="hero-logo" />
          <p className="hero-kicker">Pasta rellena hecha a mano, sin TACC. En cajas de 12, directo a tu freezer.</p>
          <div className="stack-row">
            <Link to="/cajas" className="btn btn-yema btn-big">Ver las cajas <Icon name="flecha" size={20} /></Link>
          </div>
        </div>
        <div className="hero-tag">
          <div className="tag-box tilt-r">
            <span className="tape" aria-hidden="true" />
            <div className="tag-in">
              <p className="label tag-title">Ricordo · próxima entrega</p>
              <div className="tag-row"><span className="label">Día</span><span className="fill">{next ? `${slotDay(next)} ${slotPart(next)}` : '…'}</span></div>
              <div className="tag-row"><span className="label">Horario</span><span className="fill">{next ? slotHours(next) : '…'}</span></div>
              <div className="tag-row"><span className="label">Pedí hasta</span><span className="fill">{next ? slotDeadlineShort(next) : '…'}</span></div>
            </div>
            <Stamp className="hero-stamp" ring="SIN TACC · HECHO A MANO · BERAZATEGUI ·" lines={['R']} />
          </div>
        </div>
      </section>

      <section className="sec wrap" aria-labelledby="h-dest">
        <header className="sec-head">
          <span className="sec-n" aria-hidden="true">01</span>
          <div>
            <h2 id="h-dest" className="d-xl">Las que más salen</h2>
            <p className="lede">Cada caja trae 12. Se cocinan del freezer a la olla, sin descongelar.</p>
          </div>
        </header>
        {status === 'loading' && <p className="muted">Cargando las cajas…</p>}
        <div className="featured">
          {featured.map((p, i) => (
            <ProductLabel key={p.id} product={p} size={i === 0 ? 'l' : 'm'} eager={i === 0} />
          ))}
        </div>
        <p className="more-link"><Link to="/cajas" className="link-big">Ver todos los gustos <Icon name="flecha" /></Link></p>
      </section>

      <section id="como-pedir" className="sec band-kraft" aria-labelledby="h-como">
        <div className="wrap">
          <header className="sec-head">
            <span className="sec-n" aria-hidden="true">02</span>
            <div>
              <h2 id="h-como" className="d-xl">Cómo pedir</h2>
              <p className="lede">Tres pasos y el viernes o el sábado lo tenés en tu casa.</p>
            </div>
          </header>
          <ol className="steps">
            <li>
              <Icon name="caja" size={32} />
              <h3>Armá tu pedido</h3>
              <p>Elegí los gustos y cuántas cajas. Si mezclás, mejor.</p>
            </li>
            <li>
              <Icon name="reloj" size={32} />
              <h3>Elegí el turno</h3>
              <p>Viernes a la noche o sábado a la mañana. {next && <>El próximo cierra el {slotDeadline(next)}.</>}</p>
            </li>
            <li>
              <Icon name="transfer" size={32} />
              <h3>Pagás como prefieras</h3>
              <p>Transferencia o efectivo. Te confirmamos por WhatsApp.</p>
            </li>
          </ol>
          <div className="cook">
            <Placeholder note="manos cerrando sorrentinos sobre la mesada" ratio="16 / 10" />
            <p className="hand cook-note">del freezer a la olla: agua hirviendo con sal, 4 a 6 minutos y listo.</p>
          </div>
        </div>
      </section>

      <section id="zonas" className="sec wrap" aria-labelledby="h-zonas">
        <header className="sec-head">
          <span className="sec-n" aria-hidden="true">03</span>
          <div>
            <h2 id="h-zonas" className="d-xl">¿Llegamos a tu casa?</h2>
            <p className="lede">Repartimos en Berazategui y alrededores. Poné tu código postal y te decimos cuánto sale.</p>
          </div>
        </header>
        <div className="zones">
          <div className="zones-form">
            <PostalForm />
          </div>
          <table className="zone-table">
            <caption className="sr">Zonas de entrega, costo y compra mínima</caption>
            <thead>
              <tr><th scope="col">Zona</th><th scope="col">Envío</th><th scope="col">Mínimo</th></tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <th scope="row">
                    {z.name}
                    <span className="cps">CP {z.postalCodes.join(', ')}</span>
                  </th>
                  <td>
                    {money(z.shippingCost)}
                    {z.freeShippingFrom !== null && <span className="cps">gratis desde {money(z.freeShippingFrom)}</span>}
                  </td>
                  <td>{money(z.minOrder)}</td>
                </tr>
              ))}
              {settings?.pickupEnabled && (
                <tr>
                  <th scope="row">Retiro en el local<span className="cps">{settings.pickupAddress}</span></th>
                  <td>Sin cargo</td>
                  <td>{settings.pickupMinOrder > 0 ? money(settings.pickupMinOrder) : 'Sin mínimo'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
