// Promos (Día de la Madre u otras): cartel de arriba, sección de la portada, corazones y avisos del carrito.
// Todo se muestra solo mientras la promo está vigente (se prende/apaga desde Ajustes).
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { cutoffWithDate } from '../lib/delivery';
import { promoActive, tierText, type Quote } from '../lib/shipping';
import type { Promo } from '../lib/types';

const cajas = (n: number) => `${n} ${n === 1 ? 'caja' : 'cajas'}`;

export function useActivePromo(): Promo | null {
  const { settings } = useStore();
  const p = settings?.promo;
  return promoActive(p) ? p : null;
}

export function Heart({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={'heart' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4h2c.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z" fill="currentColor" />
    </svg>
  );
}

/** Corazones que flotan de fondo (decorativos; quietos si el usuario pide menos movimiento). */
export function FloatingHearts({ count = 9 }: { count?: number }) {
  return (
    <div className="hearts-float" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ '--i': i } as React.CSSProperties}><Heart size={14 + ((i * 7) % 18)} /></span>
      ))}
    </div>
  );
}

/** Resumen de la promo: "10% off en toda tu compra", "hasta 15% off + salsas de regalo". */
export function promoSummary(promo: Promo): string {
  const maxPct = Math.max(...promo.tiers.map((t) => t.pct));
  const gifts = promo.tiers.some((t) => t.gifts > 0);
  const single = promo.tiers.length === 1 && promo.tiers[0].minBoxes <= 1;
  const pct = maxPct > 0 ? `${single ? '' : 'hasta '}${maxPct}% off${single ? ' en toda tu compra' : ''}` : '';
  return [pct, gifts ? 'salsas de regalo' : ''].filter(Boolean).join(' + ');
}

/** Cartel arriba de todo, en todas las páginas. */
export function PromoBanner() {
  const promo = useActivePromo();
  if (!promo) return null;
  const madre = promo.theme === 'madre';
  return (
    <aside className={'promo-bar' + (madre ? '' : ' promo-bar-general')} aria-label={`Promo ${promo.name}`}>
      {madre ? <Heart size={16} /> : <span className="promo-bar-pct" aria-hidden="true">%</span>}
      <span><b>{promo.name}</b> · {promo.message || promoSummary(promo)}</span>
      <Link to="/#promo" className="promo-bar-link">Ver promo</Link>
      {madre && <Heart size={16} />}
    </aside>
  );
}

const FRASES = [
  'Tené un almuerzo especial con mamá',
  'Para la que nos enseñó que la pasta del domingo se comparte',
  'Este domingo, que mamá no cocine',
  'Gracias, ma, por cada domingo en la mesa',
];

/** Sección de la portada con las opciones de la promo. */
export function PromoSection() {
  const promo = useActivePromo();
  const { settings } = useStore();
  if (!promo) return null;
  const madre = promo.theme === 'madre';
  const end = new Date(new Date(promo.endsAt).getTime() - 1);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', ...o }).format(end);
  const day = `${f({ weekday: 'long' })} ${f({ day: 'numeric' })}/${f({ month: 'numeric' })}`;
  const single = promo.tiers.length === 1 && promo.tiers[0].minBoxes <= 1;
  const giftText = (n: number) => `${n} ${(promo.giftName ?? 'salsa').toLowerCase().startsWith('salsa') ? (n === 1 ? 'salsa de tomate' : 'salsas de tomate') : promo.giftName} de regalo`;
  return (
    <section id="promo" className="wrap sec-promo" aria-labelledby="h-promo">
      <div className={'promo-madre' + (madre ? '' : ' promo-general')}>
      {madre && <FloatingHearts />}
      <div className="promo-in">
        <p className="hand promo-hand">{madre ? 'feliz día, ma' : 'promo'}</p>
        <h2 id="h-promo" className="d-xl">{madre ? FRASES[0] : promo.name}</h2>
        <p className="lede">
          {madre
            ? `Promo ${promo.name}: sorrentinos sin TACC hechos a mano, para que el domingo la mesa sea de ella.`
            : promo.message || (single ? 'Por tiempo limitado, en tus pastas sin TACC hechas a mano.' : `${promoSummary(promo)[0].toUpperCase()}${promoSummary(promo).slice(1)}.`)}
        </p>
        {single ? (
          <div className="promo-tier tag-box best promo-single">
            <p className="promo-pct">{promo.tiers[0].pct > 0 ? `${promo.tiers[0].pct}% off` : 'Regalo'}</p>
            <p className="small">{promo.tiers[0].pct > 0 ? 'en el total de tu compra' : ''}{promo.tiers[0].gifts > 0 && <><br /><b>+ {giftText(promo.tiers[0].gifts)}</b></>}</p>
          </div>
        ) : (
          <ol className="promo-tiers">
            {promo.tiers.map((t, i) => (
              <li key={t.minBoxes} className={'promo-tier tag-box' + (i === promo.tiers.length - 1 ? ' best' : '')}>
                <span className="label">Opción {i + 1}</span>
                <p className="promo-boxes">Desde {cajas(t.minBoxes)}</p>
                <p className="promo-pct">{t.pct > 0 ? `${t.pct}% off` : 'Regalo'}</p>
                <p className="small">
                  {t.pct > 0 ? 'sobre el total de la compra' : ''}
                  {t.gifts > 0 && <><br /><b>+ {giftText(t.gifts)}</b></>}
                </p>
                {madre && i === promo.tiers.length - 1 && <Heart className="promo-badge" size={28} />}
              </li>
            ))}
          </ol>
        )}
        {madre && (
          <ul className="promo-frases" aria-label="Frases para mamá">
            {FRASES.slice(1).map((f) => <li key={f}><Heart size={14} /> {f}</li>)}
          </ul>
        )}
        <p className="small promo-when">
          {settings ? <>Pedí hasta el {cutoffWithDate(settings)}{madre ? ' y llega antes del domingo' : ''}. </> : null}
          Promo válida hasta el {day}. No se suma al descuento por cajas extra ni a los productos que ya tienen precio especial.
        </p>
        <Link to="/cajas" className="btn btn-yema btn-big">{madre ? <>Armar el pedido para mamá <Heart size={18} /></> : 'Ver nuestros productos'}</Link>
      </div>
      </div>
    </section>
  );
}

/** Renglón de regalo en los totales. */
export function PromoGiftRow({ gifts }: { gifts: number }) {
  const promo = useActivePromo();
  const name = promo?.giftName ?? 'Salsa de tomate';
  return (
    <div className="gift"><dt>🎁 {gifts} × {name} de regalo</dt><dd>$0</dd></div>
  );
}

/** Aviso del carrito: qué escalón tiene y cuánto falta para el siguiente. */
export function PromoCartNote({ q }: { q: Quote }) {
  const promo = useActivePromo();
  if (!promo || (!q.promoName && !q.promoNext && !q.promoExcluded)) return null;
  const gift = promo.giftName ?? 'salsa';
  return (
    <p className="promo-note small" aria-live="polite">
      <Heart size={14} />{' '}
      {q.promoName && <><b>Promo {promo.name}:</b> {tierText({ minBoxes: 0, pct: q.discountPct, gifts: q.promoGifts }, gift)}. </>}
      {q.promoNext
        ? <>Sumá {cajas(q.promoNext.missing)} más y tenés {tierText(q.promoNext.tier, gift)}{q.promoName ? '' : ` (promo ${promo.name})`}.</>
        : q.promoName ? '¡Llegaste a la mejor opción!' : null}
      {q.promoExcluded && <> Los productos con precio especial (como la lasaña de lanzamiento) no suman cajas ni llevan el descuento de la promo.</>}
    </p>
  );
}
