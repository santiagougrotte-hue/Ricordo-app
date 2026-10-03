import { useId, useState, type FormEvent } from 'react';
import { useStore } from '../state/store';
import { normalizePostalCode } from '../lib/postal';
import { findZone } from '../lib/shipping';
import { money } from '../lib/money';
import { whatsappLink } from '../lib/whatsapp';
import { Icon } from './Icon';

/** Formulario de CP con respuesta inmediata. Nunca un error genérico. */
export function PostalForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { zones, postalCode, setPostalCode, setMethod, settings } = useStore();
  const [value, setValue] = useState(postalCode);
  const [submitted, setSubmitted] = useState(postalCode !== '');
  const id = useId();
  const result = submitted ? findZone(zones, value) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const r = findZone(zones, value);
    if (r.status === 'found') {
      setPostalCode(value.trim());
      setMethod('delivery');
      onDone?.();
    } else if (r.status === 'not_found') {
      setPostalCode(value.trim());
    }
  }

  const wa = settings && result?.status === 'not_found'
    ? whatsappLink(settings.whatsappPhone, `Hola Ricordo! Quería saber si llegan al código postal ${result.postalCode}.`)
    : null;

  return (
    <form className={'postal-form' + (compact ? ' compact' : '')} onSubmit={submit} noValidate>
      <label htmlFor={id} className="label">Tu código postal</label>
      <div className="postal-row">
        <input
          id={id}
          className="input"
          inputMode="text"
          autoComplete="postal-code"
          placeholder="1884 o B1884ABC"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSubmitted(false);
          }}
          aria-describedby={`${id}-msg`}
          aria-invalid={result?.status === 'invalid' || undefined}
        />
        <button type="submit" className="btn btn-ink">Ver envío</button>
      </div>
      <div id={`${id}-msg`} className="postal-msg" aria-live="polite">
        {result?.status === 'invalid' && <p>Escribilo con 4 números (por ejemplo 1884) o como figura en tus boletas (B1884ABC).</p>}
        {result?.status === 'empty' && <p>Escribí tu código postal para ver el costo de envío.</p>}
        {result?.status === 'found' && (
          <p className="ok">
            <Icon name="ok" size={20} /> Llegamos a {result.zone.name}. Envío {money(result.zone.shippingCost)}
            {result.zone.minOrder > 0 && <>, compra mínima {money(result.zone.minOrder)}</>}
            {result.zone.freeShippingFrom !== null && <>, gratis desde {money(result.zone.freeShippingFrom)}</>}.
          </p>
        )}
        {result?.status === 'not_found' && (
          <div className="not-found">
            <p>
              Todavía no llegamos al <strong>{result.postalCode}</strong>. Pero no te quedes sin tus pastas:
            </p>
            <div className="stack-row">
              {settings?.pickupEnabled && (
                <button type="button" className="btn btn-line" onClick={() => { setMethod('pickup'); onDone?.(); }}>
                  <Icon name="local" /> Lo retiro en el local
                </button>
              )}
              {wa && (
                <a className="btn btn-line" href={wa} target="_blank" rel="noopener noreferrer">
                  <Icon name="charla" /> Preguntar por WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

export function postalSummary(cp: string, zoneName: string | null): string {
  const n = normalizePostalCode(cp);
  return zoneName ? `${n} · ${zoneName}` : n ?? cp;
}
