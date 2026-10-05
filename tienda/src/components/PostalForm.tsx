import { useId, useState, type FormEvent } from 'react';
import { useStore } from '../state/store';
import { normalizePostalCode } from '../lib/postal';
import { findZone } from '../lib/shipping';
import { deliverySentence } from '../lib/delivery';
import { money } from '../lib/money';
import { whatsappLink } from '../lib/whatsapp';
import type { ShippingZone } from '../lib/types';
import { Icon } from './Icon';

const cajas = (n: number) => `${n} ${n === 1 ? 'caja' : 'cajas'}`;

/** "Mínimo 3 cajas · envío $1.500 · gratis desde 4 cajas" */
export function zoneTerms(z: ShippingZone): string {
  return [
    z.minBoxes > 0 && `mínimo ${cajas(z.minBoxes)}`,
    `envío ${money(z.shippingCost)}`,
    z.freeFromBoxes !== null && `gratis desde ${cajas(z.freeFromBoxes)}`,
  ].filter(Boolean).join(' · ');
}

/** Formulario de CP con respuesta inmediata. Nunca un error genérico. Después del CP, el cliente confirma su localidad. */
export function PostalForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { zones, postalCode, setPostalCode, setMethod, settings, locality, setLocality } = useStore();
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
      if (r.zone.localities.length <= 1) onDone?.();
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
          <>
            <p className="ok">
              <Icon name="ok" size={20} /> Llegamos a {result.zone.name}: {zoneTerms(result.zone)}.
            </p>
            {settings && <p className="small">{deliverySentence(result.zone, settings)}.</p>}
            {result.zone.localities.length > 1 && (
              <LocalityPicker
                localities={result.zone.localities}
                value={locality}
                onChange={(l) => {
                  setLocality(l);
                  if (l) onDone?.();
                }}
              />
            )}
          </>
        )}
        {result?.status === 'not_found' && (
          <div className="not-found">
            <p>
              Todavía no llegamos a tu zona (<strong>{result.postalCode}</strong>), escribinos por WhatsApp.
            </p>
            <div className="stack-row">
              {wa && (
                <a className="btn btn-ink" href={wa} target="_blank" rel="noopener noreferrer">
                  <Icon name="charla" /> Escribir por WhatsApp
                </a>
              )}
              {settings?.pickupEnabled && (
                <button type="button" className="btn btn-line" onClick={() => { setMethod('pickup'); onDone?.(); }}>
                  <Icon name="local" /> Lo retiro en Berazategui
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

/** El CP puede abarcar varias localidades: el cliente confirma la suya. */
export function LocalityPicker({ localities, value, onChange, error, id: idProp }: {
  localities: string[]; value: string; onChange: (l: string) => void; error?: string; id?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>Tu localidad</label>
      <select
        id={id}
        className="input"
        value={localities.includes(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      >
        <option value="">Elegí de la lista</option>
        {localities.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </div>
  );
}

export function postalSummary(cp: string, zoneName: string | null): string {
  const n = normalizePostalCode(cp);
  return zoneName ? `${n} · ${zoneName}` : n ?? cp;
}
