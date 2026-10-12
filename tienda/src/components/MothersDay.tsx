// Promo del Día de la Madre: banner, sección de la portada, corazones y avisos del carrito.
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

/** Franja arriba de todo, en todas las páginas. */
export function PromoBanner() {
  const promo = useActivePromo();
  if (!promo) return null;
  const maxPct = Math.max(...promo.tiers.map((t) => t.pct));
  const gifts = promo.tiers.some((t) => t.gifts > 0);
  return (
    <aside className="promo-bar" aria-label={`Promo ${promo.name}`}>
      <Heart size={16} />
      <span><b>{promo.name}</b> · hasta {maxPct}% off{gifts ? ' + salsas de regalo' : ''}</span>
      <Link to="/#promo-madre" className="promo-bar-link">Ver promo</Link>
      <Heart size={16} />
    </aside>
  );
}

const FRASES = [
  'Tené un almuerzo especial con mamá',
  'Para la que nos enseñó que la pasta del domingo se comparte',
  'Este domingo, que mamá no cocine',
  'Gracias, ma, por cada domingo en la mesa',
];

/** Sección de la portada con las tres opciones. */
export function PromoSection() {
  const promo = useActivePromo();
  const { settings } = useStore();
  if (!promo) return null;
  const end = new Date(new Date(promo.endsAt).getTime() - 1);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', ...o }).format(end);
  const day = `${f({ weekday: 'long' })} ${f({ day: 'numeric' })}/${f({ month: 'numeric' })}`;
  return (
    <section id="promo-madre" className="wrap sec-promo" aria-labelledby="h-promo">
      <div className="promo-madre">
      <FloatingHearts />
      <div className="promo-in">
        <p className="hand promo-hand">feliz día, ma</p>
        <h2 id="h-promo" className="d-xl">{FRASES[0]}</h2>
        <p className="lede">Promo {promo.name}: sorrentinos sin TACC hechos a mano, para que el domingo la mesa sea de ella.</p>
        <ol className="promo-tiers">
          {promo.tiers.map((t, i) => (
            <li key={t.minBoxes} className={'promo-tier tag-box' + (i === promo.tiers.length - 1 ? ' best' : '')}>
              <span className="label">Opción {i + 1}</span>
              <p className="promo-boxes">Desde {cajas(t.minBoxes)}</p>
              <p className="promo-pct">{t.pct > 0 ? `${t.pct}% off` : 'Regalo'}</p>
              <p className="small">
                {t.pct > 0 ? 'sobre el total de la compra' : ''}
                {t.gifts > 0 && <><br /><b>+ {t.gifts} {(promo.giftName ?? 'salsa').toLowerCase().startsWith('salsa') ? (t.gifts === 1 ? 'salsa de tomate' : 'salsas de tomate') : promo.giftName} de regalo</b></>}
              </p>
              {i === promo.tiers.length - 1 && <Heart className="promo-badge" size={28} />}
            </li>
          ))}
        </ol>
        <ul className="promo-frases" aria-label="Frases para mamá">
          {FRASES.slice(1).map((f) => <li key={f}><Heart size={14} /> {f}</li>)}
        </ul>
        <p className="small promo-when">
          {settings ? <>Pedí hasta el {cutoffWithDate(settings)} y llega antes del domingo. </> : null}
          Promo válida hasta el {day}. No se suma al descuento por cajas extra.
        </p>
        <Link to="/cajas" className="btn btn-yema btn-big">Armar el pedido para mamá <Heart size={18} /></Link>
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
        ? <>Sumá {cajas(q.promoNext.missing)} más y tenés {tierText(q.promoNext.tier, gift)}{q.promoName ? '' : ` por el ${promo.name}`}.</>
        : q.promoName ? '¡Llegaste a la mejor opción!' : null}
      {q.promoExcluded && <> La lasaña ya tiene su precio de lanzamiento: no suma cajas ni lleva el descuento de la promo.</>}
    </p>
  );
}
