import { useId } from 'react';
import { useStore } from '../state/store';
import { byPartido, findZone, OTHER_LOCALITY, type LocalityChoice } from '../lib/shipping';
import { deliverySentence } from '../lib/delivery';
import { money } from '../lib/money';
import { whatsappLink } from '../lib/whatsapp';
import type { Locality, ShippingZone } from '../lib/types';
import { Icon } from './Icon';

const cajas = (n: number) => `${n} ${n === 1 ? 'caja' : 'cajas'}`;

/** "mínimo 3 cajas · envío aprox. $2.500 · gratis desde 4 cajas" */
export function zoneTerms(z: ShippingZone, distanceEnabled = false): string {
  return [
    z.minBoxes > 0 && `mínimo ${cajas(z.minBoxes)}`,
    `envío ${z.distancePricing && distanceEnabled ? 'aprox. ' : ''}${money(z.shippingCost)}`,
    z.freeFromBoxes !== null && `gratis desde ${cajas(z.freeFromBoxes)}`,
  ].filter(Boolean).join(' · ');
}

/** Selector de localidad, agrupado por partido, con "Otra localidad" al final. */
export function LocalitySelect({ localities, value, onChange, id, error }: {
  localities: Locality[]; value: LocalityChoice; onChange: (c: LocalityChoice) => void; id: string; error?: string;
}) {
  return (
    <select
      id={id}
      className="input"
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === OTHER_LOCALITY ? OTHER_LOCALITY : Number(e.target.value))}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-err` : undefined}
    >
      <option value="">Elegí tu localidad</option>
      {byPartido(localities).map(([partido, list]) => (
        <optgroup key={partido} label={partido}>
          {list.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </optgroup>
      ))}
      <option value={OTHER_LOCALITY}>Otra localidad</option>
    </select>
  );
}

/** ¿Llegamos? El cliente elige su localidad (la zona la define la localidad, no el CP). */
export function LocalityForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { zones, localities, localityChoice, setLocalityChoice, setMethod, settings } = useStore();
  const id = useId();
  const result = findZone(zones, localities, localityChoice);
  const wa = settings && result.status === 'not_found'
    ? whatsappLink(settings.whatsappPhone, 'Hola Ricordo! Quería saber si llegan a mi localidad: ')
    : null;

  return (
    <div className={'postal-form' + (compact ? ' compact' : '')}>
      <label htmlFor={id} className="label">Tu localidad</label>
      <LocalitySelect
        id={id}
        localities={localities}
        value={localityChoice}
        onChange={(c) => {
          setLocalityChoice(c);
          if (typeof c === 'number') {
            setMethod('delivery');
            onDone?.();
          }
        }}
      />
      <div className="postal-msg" aria-live="polite">
        {result.status === 'found' && (
          <>
            <p className="ok"><Icon name="ok" size={20} /> Llegamos a {result.locality.name}: {zoneTerms(result.zone, settings?.distanceEnabled)}.</p>
            {settings && <p className="small">{deliverySentence(result.zone, settings)}.</p>}
          </>
        )}
        {result.status === 'not_found' && (
          <div className="not-found">
            <p>Todavía no llegamos a tu zona, escribinos por WhatsApp.</p>
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
    </div>
  );
}
