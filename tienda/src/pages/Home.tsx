import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { useSlots } from '../state/useSlots';
import { money } from '../lib/money';
import { slotDay, slotDeadline, slotDeadlineShort, slotHours, slotPart } from '../lib/slots';
import { HeroLogo } from '../components/HeroLogo';
import { Icon } from '../components/Icon';
import { Stamp } from '../components/Stamp';
import { ProductLabel, ProductSkeleton } from '../components/ProductLabel';
import { PostalForm } from '../components/PostalForm';
import { srcSet, InViewVideo as AutoVideo } from '../components/ProductMediaView';
import { PASTA_LABEL } from '../lib/types';
import fotoIngredientes from '../assets/fotos/cabutia-ingredientes.webp';
import videoAmasado from '../assets/fotos/amasado-masa-nero.mp4';
import posterAmasado from '../assets/fotos/amasado-masa-nero-poster.webp';
import { useDocumentTitle } from './useDocumentTitle';
import { useReveal } from '../motion/useMotion';

export function Home() {
  useDocumentTitle('Ricordo · Pasta rellena sin TACC en Berazategui');
  const { products, zones, settings, status } = useStore();
  const { slots } = useSlots('delivery');
  const next = slots?.[0];
  const featured = products.filter((p) => p.featured).slice(0, 3);
  // Con un solo gusto destacado, la sección se arma como nota editorial alrededor de ese gusto.
  const single = featured.length === 1 ? featured[0] : null;
  const second = single?.media.filter((m) => m.kind === 'photo')[1];
  useReveal(status);

  return (
    <>
      <section className="hero wrap">
        <div className="hero-brand">
          <HeroLogo />
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
        <header className="sec-head" data-reveal="rise">
          <span className="sec-n" aria-hidden="true">01</span>
          <div>
            <h2 id="h-dest" className="d-xl">{single ? `${PASTA_LABEL[single.pastaType]} de ${single.name.toLowerCase()}` : 'Las que más salen'}</h2>
            <p className="lede">{single ? `${single.filling}. Caja de 12.` : 'Cada caja trae 12. Se cocinan del freezer a la olla, sin descongelar.'}</p>
          </div>
        </header>
        <div className={'featured' + (single ? ' featured-single' : '')} aria-busy={status === 'loading'}>
          {status === 'loading' && [0, 1, 2].map((i) => <ProductSkeleton key={i} size={i === 0 ? 'l' : 'm'} />)}
          {featured.map((p, i) => (
            <ProductLabel key={p.id} product={p} size={i === 0 ? 'l' : 'm'} eager={i === 0} parallax={i === 0} />
          ))}
          {single && (
            <div className="feature-side">
              <p className="hand feature-note" data-reveal="hand">¿ya los probaste?</p>
              {second && (
                <figure className="taped feature-cut" data-reveal="paper">
                  <span className="tape" aria-hidden="true" />
                  <img src={second.url} srcSet={srcSet(second.url)} sizes="(min-width: 900px) 30vw, 80vw" alt={second.alt} loading="lazy" decoding="async" />
                </figure>
              )}
              {single.slug === 'sorrentinos-cabutia' && (
                <figure className="taped feature-collage" data-reveal="paper" data-parallax>
                  <span className="tape" aria-hidden="true" />
                  <img
                    src={fotoIngredientes}
                    srcSet={srcSet('/fotos/cabutia-ingredientes.webp')}
                    sizes="(min-width: 900px) 28vw, 70vw"
                    alt="Lo que lleva: cabutia asada, sardo, almendras, muzzarella y ajo asado, alrededor de un sorrentino de masa nero"
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              )}
            </div>
          )}
        </div>
        {!single && <p className="more-link" data-reveal="rise"><Link to="/cajas" className="link-big">Ver todos los gustos <Icon name="flecha" /></Link></p>}
      </section>

      <section id="como-pedir" className="sec band-kraft" aria-labelledby="h-como">
        <div className="wrap">
          <header className="sec-head" data-reveal="rise">
            <span className="sec-n" aria-hidden="true">02</span>
            <div>
              <h2 id="h-como" className="d-xl">Cómo pedir</h2>
              <p className="lede">Tres pasos y el viernes o el sábado lo tenés en tu casa.</p>
            </div>
          </header>
          <ol className="steps">
            <li data-reveal="rise">
              <Icon name="caja" size={32} />
              <h3>Armá tu pedido</h3>
              <p>Elegí los gustos y cuántas cajas. Si mezclás, mejor.</p>
            </li>
            <li data-reveal="rise">
              <Icon name="reloj" size={32} />
              <h3>Elegí el turno</h3>
              <p>Viernes a la noche o sábado a la mañana. {next && <>El próximo cierra el {slotDeadline(next)}.</>}</p>
            </li>
            <li data-reveal="rise">
              <Icon name="transfer" size={32} />
              <h3>Pagás como prefieras</h3>
              <p>Transferencia o efectivo. Te confirmamos por WhatsApp.</p>
            </li>
          </ol>
          <div className="cook">
            <figure className="taped cook-video" data-parallax>
              <span className="tape" aria-hidden="true" />
              <AutoVideo src={videoAmasado} poster={posterAmasado} label="Amasando la masa nero a mano y sorrentinos recién cerrados" />
            </figure>
            <p className="hand cook-note" data-reveal="hand">del freezer a la olla: agua hirviendo con sal, 4 a 6 minutos y listo.</p>
          </div>
        </div>
      </section>

      <section id="zonas" className="sec wrap" aria-labelledby="h-zonas">
        <header className="sec-head" data-reveal="rise">
          <span className="sec-n" aria-hidden="true">03</span>
          <div>
            <h2 id="h-zonas" className="d-xl">¿Llegamos a tu casa?</h2>
            <p className="lede">Repartimos en Berazategui y alrededores. Poné tu código postal y te decimos cuánto sale.</p>
          </div>
        </header>
        <div className="zones">
          <div className="zones-form" data-reveal="rise">
            <PostalForm />
          </div>
          <table className="zone-table" data-reveal="rise">
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
