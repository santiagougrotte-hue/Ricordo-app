import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import { byPartido, findZone, matchTypedLocality, OTHER_LOCALITY, type LocalityChoice } from '../lib/shipping';
import { deliverySentence } from '../lib/delivery';
import { money } from '../lib/money';
import { whatsappLink } from '../lib/whatsapp';
import type { AddressSuggestion, Locality, ShippingZone } from '../lib/types';
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

/** Lo que el cliente quiere saber: mínimo, desde cuándo el envío es gratis y, si no llega, cuánto sale. */
export function ShippingFacts() {
  const { lookup, method, quote: q, totals, distance, distanceOn, settings } = useStore();
  if (method !== 'delivery' || lookup.status !== 'found') return null;
  const z = lookup.zone;
  const free = z.freeFromBoxes !== null && totals.boxes >= z.freeFromBoxes;
  const cost = q?.shippingCost ?? (distanceOn && distance.cost !== null ? distance.cost : z.shippingCost);
  return (
    <div className="ship-facts">
      <p className="ok"><Icon name="ok" size={20} /> Llegamos a {lookup.locality.name}</p>
      <dl>
        <div><dt>Compra mínima</dt><dd>{cajas(z.minBoxes)}</dd></div>
        <div><dt>Envío gratis</dt><dd>{z.freeFromBoxes === null ? 'no aplica' : `desde ${cajas(z.freeFromBoxes)}`}</dd></div>
        <div>
          <dt>Envío</dt>
          <dd>
            {free ? '¡gratis!'
              : distance.loading ? 'calculando…'
              : `${money(cost ?? z.shippingCost)}${distanceOn && distance.cost === null ? ' aprox.' : ''}`}
          </dd>
        </div>
      </dl>
      {settings && <p className="small">{deliverySentence(z, settings)}.</p>}
    </div>
  );
}

/**
 * ¿Llegamos? El cliente escribe su dirección y elige una sugerencia: la tienda detecta la localidad y la zona.
 * Si no hay buscador (falta la clave o la demo) o no encuentra la dirección, elige la localidad de la lista.
 */
export function LocalityForm({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { zones, localities, localityChoice, setLocalityChoice, setMethod, settings, address, setAddress } = useStore();
  const id = useId();
  const result = findZone(zones, localities, localityChoice);
  const searchable = settings?.distanceEnabled === true;
  // Si la dirección no dice la localidad (o no aparece), el cliente la escribe.
  const [askTown, setAskTown] = useState(false);
  const wa = settings && result.status === 'not_found'
    ? whatsappLink(settings.whatsappPhone, `Hola Ricordo! Quería saber si llegan a mi dirección: ${address.street}`)
    : null;

  function pickLocality(c: LocalityChoice) {
    setLocalityChoice(c);
    setAskTown(false);
    if (typeof c === 'number') {
      setMethod('delivery');
      onDone?.();
    }
  }

  return (
    <div className={'postal-form' + (compact ? ' compact' : '')}>
      {searchable && (
        <AddressSearch
          id={`${id}-addr`}
          initial={address.street}
          onText={(v) => setAddress({ street: v, postalCode: null })}
          onPick={(s) => {
            setAddress({ street: s.address, postalCode: s.postalCode });
            if (s.match.status === 'found') pickLocality(s.match.localityId);
            else if (s.match.status === 'not_found') pickLocality(OTHER_LOCALITY);
            else { setLocalityChoice(null); setAskTown(true); }
          }}
        />
      )}
      {searchable ? (
        askTown ? (
          <TownInput id={`${id}-town`} localities={localities} onDone={pickLocality} />
        ) : (
          <button type="button" className="link small" onClick={() => setAskTown(true)}>¿No aparece tu dirección? Escribí tu localidad</button>
        )
      ) : (
        <div className="field">
          <label htmlFor={id} className="label">Tu localidad</label>
          <LocalitySelect id={id} localities={localities} value={localityChoice} onChange={pickLocality} />
        </div>
      )}
      <div className="postal-msg" aria-live="polite">
        {result.status === 'found' && <ShippingFacts />}
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

/** "¿En qué localidad queda?": la escribe el cliente (con tus localidades como sugerencia mientras tipea). */
export function TownInput({ id, localities, onDone }: { id: string; localities: Locality[]; onDone: (c: LocalityChoice) => void }) {
  const [text, setText] = useState('');
  const listId = `${id}-opts`;
  function submit() {
    if (!text.trim()) return;
    const hit = matchTypedLocality(text, localities);
    onDone(hit ? hit.id : OTHER_LOCALITY);
  }
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>¿En qué localidad queda?</label>
      <div className="postal-row">
        <input
          id={id}
          className="input"
          list={listId}
          autoComplete="address-level2"
          placeholder="Ej.: Ranelagh"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        />
        <button type="button" className="btn btn-ink" onClick={submit}>Listo</button>
      </div>
      <datalist id={listId}>{localities.map((l) => <option key={l.id} value={l.name} />)}</datalist>
    </div>
  );
}

/** Campo de dirección con sugerencias (combobox accesible: flechas, Enter, Esc). */
export function AddressSearch({ id, initial, onPick, onText, label = 'Tu dirección', error }: {
  id: string; initial: string; onPick: (s: AddressSuggestion) => void; onText?: (v: string) => void; label?: string; error?: string;
}) {
  const [text, setText] = useState(initial);
  const [list, setList] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setText(initial), [initial]);

  function change(v: string) {
    setText(v);
    onText?.(v);
    window.clearTimeout(timer.current);
    if (v.trim().length < 4) { setList([]); setOpen(false); return; }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const r = await api.searchAddress(v);
      setList(r);
      setOpen(true);
      setActive(-1);
      setLoading(false);
      setSearched(v);
    }, 400);
  }
  function pick(s: AddressSuggestion) {
    setText(s.address);
    setOpen(false);
    setList([]);
    onPick(s);
  }
  const listId = `${id}-list`;
  return (
    <div className="field addr">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="addr-box">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open && list.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : `${id}-hint`}
        autoComplete="street-address"
        placeholder="Calle y número, ej.: Calle 14 1234"
        value={text}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(list[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && list.length > 0 && (
        <ul id={listId} role="listbox" className="addr-list" aria-label="Direcciones sugeridas">
          {list.map((s, i) => (
            <li
              key={s.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : undefined}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
      </div>
      <p id={`${id}-hint`} className="field-hint" aria-live="polite">
        {loading ? 'Buscando…' : open && !list.length && searched ? 'No encontramos esa dirección. Probá con calle y número, o elegí tu localidad.' : 'Escribí tu dirección y elegila de la lista.'}
      </p>
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </div>
  );
}
