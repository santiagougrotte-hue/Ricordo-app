import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { normalizePostalCode } from '../lib/postal';
import { cartMessage, discountLabel, findZone, OTHER_LOCALITY, quote } from '../lib/shipping';
import { deliverySentence } from '../lib/delivery';
import { whatsappLink } from '../lib/whatsapp';
import type { OrderError, PaymentMethod } from '../lib/types';
import { Icon } from '../components/Icon';
import { MethodToggle } from '../components/MethodToggle';
import { AddressSearch, LocalitySelect, TownInput } from '../components/LocalityForm';
import { Turnstile, type TurnstileHandle } from '../components/Turnstile';
import { useDocumentTitle } from './useDocumentTitle';

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
// En modo demo no hay servidor que valide, así que no se carga el captcha.
const NEEDS_CAPTCHA = api.mode === 'live';

interface Form {
  name: string; phone: string; email: string; address: string; postalCode: string; notes: string;
  payment: PaymentMethod | ''; flexible: boolean;
}
type Errors = Partial<Record<keyof Form | 'locality', string>>;

export const RECEIPT_KEY = 'ricordo-last-receipt';
const cajas = (n: number) => `${n} ${n === 1 ? 'caja' : 'cajas'}`;

export function Checkout() {
  useDocumentTitle('Tu pedido · Ricordo');
  const s = useStore();
  const { items, subtotal, totals, method, setMethod, settings, zones, localities, localityChoice, setLocalityChoice, status, setQuantity, reload, address, setAddress, distance, distanceOn } = s;
  const navigate = useNavigate();
  const [f, setF] = useState<Form>(() => ({
    name: '', phone: '', email: '', address: address.street, postalCode: address.postalCode ?? '', notes: '', payment: '', flexible: false,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [unit, setUnit] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);

  // La localidad define la zona: mínimo, envío, descuento y fecha se recalculan en vivo.
  const lookup = useMemo(() => findZone(zones, localities, localityChoice), [zones, localities, localityChoice]);
  const zone = method === 'delivery' && lookup.status === 'found' ? lookup.zone : null;
  const localityId = lookup.status === 'found' ? lookup.locality.id : null;

  // El envío por distancia lo calcula la tienda con la dirección guardada (la misma que ve en el carrito).
  const distanceCost = distance.cost;
  const measuring = distance.loading;
  const q = settings ? quote(method, lookup, totals, settings, distanceCost) : null;

  // Precarga la confirmación: si no, el router muestra el checkout vacío mientras baja ese código.
  useEffect(() => {
    void import('./Confirmation');
  }, []);

  if (status === 'ready' && items.length === 0) {
    return (
      <section className="wrap sec">
        <h1 className="d-xl">Tu pedido está vacío</h1>
        <p className="lede">Sumá alguna caja y volvé.</p>
        <Link to="/cajas" className="btn btn-yema">Ver las cajas</Link>
      </section>
    );
  }

  const set = (k: keyof Form) => (e: { target: { value: string } }) => {
    setF((v) => ({ ...v, [k]: e.target.value }));
    if (k === 'address') setAddress({ street: e.target.value, postalCode: address.postalCode });
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  function validate(): Errors {
    const e: Errors = {};
    if (f.name.trim().length < 2) e.name = 'Contanos tu nombre.';
    const digits = f.phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) e.phone = 'Necesitamos un celular con WhatsApp, con característica (ej. 11 5555 1234).';
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Revisá el email (o dejalo vacío).';
    if (method === 'delivery') {
      if (f.address.trim().length < 5) e.address = 'Calle, número y piso/depto si tiene.';
      if (!normalizePostalCode(f.postalCode)) e.postalCode = 'Escribí 4 números (1884) o el CP completo (B1884ABC).';
      if (lookup.status === 'empty') e.locality = settings?.distanceEnabled ? 'Escribí tu dirección y elegila de la lista (o escribí tu localidad).' : 'Elegí tu localidad.';
      else if (lookup.status === 'not_found') e.locality = 'Todavía no llegamos a tu zona, escribinos por WhatsApp. También podés elegir retiro en Berazategui.';
    }
    if (!f.payment) e.payment = 'Elegí cómo pagás.';
    return e;
  }

  function explain(err: OrderError): string {
    switch (err.code) {
      case 'RC001': {
        for (const it of err.short) setQuantity(it.product_id, it.available);
        void reload();
        const parts = err.short.map((it) => (it.available > 0 ? `${it.name}: quedan ${it.available}` : `${it.name ?? 'Un gusto'}: se agotó`));
        return `Mientras armabas el pedido se vendieron algunas cajas. ${parts.join(' · ')}. Ya ajustamos tu pedido, revisalo y confirmá de nuevo.`;
      }
      case 'RC002': return 'Todavía no llegamos a tu zona, escribinos por WhatsApp. También podés elegir retiro en Berazategui.';
      case 'RC003': return `Sumá ${cajas(err.missing)} más: el mínimo es de ${cajas(err.minBoxes)}.`;
      case 'CAPTCHA': return 'No pudimos verificar que no sos un robot. Recargá la página y probá de nuevo.';
      case 'NETWORK': return err.message;
      default: return err.message && err.code === 'RC004' && /localidad|Teléfono|dirección/i.test(err.message)
        ? `${err.message}.`
        : 'Algo no cerró con los datos del pedido. Revisalos y probá de nuevo; si sigue, escribinos por WhatsApp.';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    if (q && !q.canCheckout) {
      setServerError(q ? cartMessage(q, lookup) : null);
      return;
    }
    if (NEEDS_CAPTCHA && !token) {
      setServerError(TURNSTILE_KEY
        ? 'Estamos verificando que no sos un robot. Esperá un segundo y tocá "Confirmar" de nuevo.'
        : 'La tienda todavía no tiene configurado el captcha (VITE_TURNSTILE_SITE_KEY).');
      return;
    }
    setSending(true);
    const delivery = method === 'delivery';
    const res = await api.createOrder({
      customerName: f.name, customerPhone: f.phone.replace(/\D/g, ''), customerEmail: f.email,
      deliveryMethod: method, address: delivery ? f.address : '',
      postalCode: delivery ? f.postalCode : '', localityId: delivery ? localityId : null,
      // piso/depto va en las notas: la dirección queda limpia para ubicarla en el mapa
      notes: [unit.trim() && method === 'delivery' ? `Piso/depto: ${unit.trim()}` : '', f.notes].filter(Boolean).join(' · '), paymentMethod: f.payment as PaymentMethod, flexibleDelivery: delivery && f.flexible,
      items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      turnstileToken: token ?? undefined,
    });
    setSending(false);
    if (!res.ok) {
      captcha.current?.reset(); // el token de Turnstile sirve una sola vez
      setServerError(explain(res.error));
      requestAnimationFrame(() => document.getElementById('server-error')?.focus());
      return;
    }
    try {
      sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(res.receipt));
    } catch { /* sin storage */ }
    // El carrito lo vacía la confirmación al montarse: así el checkout nunca muestra "vacío" en la transición.
    navigate(`/pedido/${res.receipt.number}`, { state: { receipt: res.receipt, fresh: true }, replace: true });
  }

  const err = (k: keyof Form) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `e-${k}` } : {});
  const wa = settings && method === 'delivery' && lookup.status === 'not_found'
    ? whatsappLink(settings.whatsappPhone, 'Hola Ricordo! Quería hacer un pedido y mi localidad no está en la lista: ')
    : null;
  const blocked = q && !q.canCheckout && (method === 'pickup' || zone) ? cartMessage(q, lookup) : null;

  return (
    <section className="wrap sec checkout">
      <header className="sec-head">
        <span className="sec-n" aria-hidden="true"><Icon name="caja" size={48} /></span>
        <div>
          <h1 className="d-xl">Cerramos la caja</h1>
          <p className="lede">Completá tus datos. Te confirmamos el pedido por WhatsApp.</p>
        </div>
      </header>

      <form className="co-grid" onSubmit={submit} noValidate>
        <div className="co-form">
          <fieldset className="co-block">
            <legend><span className="co-n">1</span> Tus datos</legend>
            <Field id="name" label="Nombre y apellido" error={errors.name}>
              <input id="f-name" className="input" autoComplete="name" value={f.name} onChange={set('name')} {...err('name')} />
            </Field>
            <Field id="phone" label="Celular con WhatsApp" error={errors.phone} hint="Por acá te confirmamos el pedido.">
              <input id="f-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="11 5555 1234" value={f.phone} onChange={set('phone')} {...err('phone')} />
            </Field>
            <Field id="email" label="Email (opcional)" error={errors.email}>
              <input id="f-email" className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} {...err('email')} />
            </Field>
          </fieldset>

          <fieldset className="co-block">
            <legend><span className="co-n">2</span> Entrega</legend>
            <MethodToggle />
            {method === 'delivery' ? (
              <>
                {wa && (
                  <p className="stack-row">
                    <a className="btn btn-ink" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="charla" /> Escribir por WhatsApp</a>
                    {settings?.pickupEnabled && <button type="button" className="btn btn-line" onClick={() => setMethod('pickup')}><Icon name="local" /> Retiro en Berazategui</button>}
                  </p>
                )}
                {settings?.distanceEnabled ? (
                  <AddressSearch
                    id="f-address"
                    label="Dirección"
                    initial={f.address}
                    error={errors.address}
                    onText={(v) => {
                      setF((x) => ({ ...x, address: v }));
                      setAddress({ street: v, postalCode: address.postalCode });
                      if (errors.address) setErrors((x) => ({ ...x, address: undefined }));
                    }}
                    onPick={(sg) => {
                      setF((v) => ({ ...v, address: sg.address, postalCode: sg.postalCode ?? v.postalCode }));
                      setAddress({ street: sg.address, postalCode: sg.postalCode });
                      if (sg.match.status === 'found') setLocalityChoice(sg.match.localityId);
                      else if (sg.match.status === 'not_found') setLocalityChoice(OTHER_LOCALITY);
                      else setLocalityChoice(null); // la escribe abajo
                      if (errors.address) setErrors((x) => ({ ...x, address: undefined }));
                    }}
                  />
                ) : (
                  <Field id="address" label="Dirección" error={errors.address}>
                    <input id="f-address" className="input" autoComplete="street-address" placeholder="Calle 14 1234, 2°B" value={f.address} onChange={set('address')} {...err('address')} />
                  </Field>
                )}
                {settings?.distanceEnabled ? (
                  // Con buscador: la localidad sale de la dirección; si no, la escribe el cliente.
                  lookup.status === 'found' ? (
                    <p className="co-loc">
                      Localidad: <b>{lookup.locality.name}</b> <span className="muted">(zona {lookup.zone.name})</span>{' '}
                      <button type="button" className="link" onClick={() => setLocalityChoice(null)}>no es esa</button>
                    </p>
                  ) : lookup.status === 'empty' && f.address.trim().length >= 5 ? (
                    <>
                      <TownInput id="f-locality" localities={localities} onDone={(c) => { setLocalityChoice(c); setErrors((x) => ({ ...x, locality: undefined })); }} />
                      {errors.locality && <p id="f-locality-err" className="field-error">{errors.locality}</p>}
                    </>
                  ) : errors.locality ? <p id="f-locality-err" className="field-error">{errors.locality}</p> : null
                ) : (
                  <div className="field">
                  <label className="field-label" htmlFor="f-locality">Localidad</label>
                  <LocalitySelect
                    id="f-locality"
                    localities={localities}
                    value={localityChoice}
                    error={errors.locality}
                    onChange={(c) => {
                      setLocalityChoice(c);
                      if (errors.locality) setErrors((x) => ({ ...x, locality: undefined }));
                    }}
                  />
                  {zone && !errors.locality && <p className="field-hint">Zona {zone.name}</p>}
                  {errors.locality && <p id="f-locality-err" className="field-error">{errors.locality}</p>}
                </div>
                )}
                <Field id="unit" label="Piso / depto / entre calles (opcional)">
                  <input id="f-unit" className="input" placeholder="2°B, entre 15 y 16" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </Field>
                <Field id="postalCode" label="Código postal" error={errors.postalCode}>
                  <input id="f-postalCode" className="input input-cp" autoComplete="postal-code" placeholder="1884" value={f.postalCode} onChange={set('postalCode')} {...err('postalCode')} />
                </Field>
                {distanceOn && (
                  <p className="small muted" aria-live="polite">
                    {measuring ? 'Calculando el envío según la distancia…'
                      : distanceCost !== null ? `Envío según la distancia a tu dirección${distance.km ? ` (${String(Math.round(distance.km * 5) / 10).replace('.', ',')} km)` : ''}.`
                      : f.address.trim().length >= 5 ? 'No pudimos ubicar la dirección con precisión: usamos el costo de la zona.'
                      : 'Con tu dirección calculamos el envío según la distancia.'}
                  </p>
                )}
                {zone && settings && (
                  <p className="co-when"><Icon name="moto" size={20} /> <span>{deliverySentence(zone, settings)}.</span></p>
                )}
                <label className="check">
                  <input type="checkbox" checked={f.flexible} onChange={(e) => setF((v) => ({ ...v, flexible: e.target.checked }))} />
                  <span>Si pasamos por tu zona antes, ¿te lo podemos llevar otro día? Te avisamos por WhatsApp.</span>
                </label>
              </>
            ) : (
              <p className="co-when"><Icon name="local" size={20} /> <span>Retirás en Berazategui, sin costo de envío. El día y el horario los coordinamos por WhatsApp.</span></p>
            )}
          </fieldset>

          <fieldset className="co-block">
            <legend><span className="co-n">3</span> Pago</legend>
            <div className="pay" role="radiogroup" aria-label="Cómo pagás" aria-describedby={errors.payment ? 'e-payment' : undefined}>
              <label className={'pay-opt' + (f.payment === 'transfer' ? ' on' : '')}>
                <input type="radio" name="payment" id="f-payment" value="transfer" checked={f.payment === 'transfer'} onChange={set('payment')} />
                <Icon name="transfer" /> <span><b>Transferencia</b><small>Te pasamos el alias al confirmar.</small></span>
              </label>
              <label className={'pay-opt' + (f.payment === 'cash' ? ' on' : '')}>
                <input type="radio" name="payment" value="cash" checked={f.payment === 'cash'} onChange={set('payment')} />
                <Icon name="efectivo" /> <span><b>Efectivo</b><small>{method === 'pickup' ? 'Pagás al retirar.' : 'Pagás cuando llega.'}</small></span>
              </label>
            </div>
            {errors.payment && <p id="e-payment" className="field-error">{errors.payment}</p>}
            <Field id="notes" label="Notas (opcional)">
              <textarea id="f-notes" className="input" rows={3} maxLength={1000} placeholder="Timbre que no anda, entre calles, etc." value={f.notes} onChange={set('notes')} />
            </Field>
          </fieldset>
        </div>

        <aside className="co-summary" aria-label="Resumen del pedido">
          <div className="tag-box">
            <div className="tag-in">
              <p className="label tag-title">Resumen · {cajas(totals.boxes)}</p>
              <ul className="sum-lines">
                {items.map(({ product, quantity }) => (
                  <li key={product.id}><span>{quantity} × {product.name}</span><span>{money(product.price * quantity)}</span></li>
                ))}
              </ul>
              <dl className="totals">
                <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
                {q && q.discount > 0 && <div className="discount"><dt>{discountLabel(q.discountPct, q.discountBoxes)}</dt><dd>−{money(q.discount)}</dd></div>}
                <div>
                  <dt>{method === 'pickup' ? 'Retiro' : zone ? `Envío a ${zone.name}` : 'Envío'}</dt>
                  <dd>{!q || q.shippingCost === null ? '—' : q.shippingCost === 0 ? 'Gratis' : `${q.shippingEstimated ? 'aprox. ' : ''}${money(q.shippingCost)}`}</dd>
                </div>
                <div className="grand"><dt>Total</dt><dd>{!q || q.total === null ? '—' : money(q.total)}</dd></div>
              </dl>
              {method === 'delivery' && lookup.status !== 'found' && lookup.status !== 'not_found' && (
                <p className="block-reason">Elegí tu localidad para calcular el envío.</p>
              )}
              {q && method === 'delivery' && zone && q.canCheckout && <p className="small">{cartMessage(q, lookup)}</p>}
              {blocked && (
                <p className="block-reason">{blocked} <Link to="/cajas">Sumar cajas</Link></p>
              )}
              {q?.suggestPickup && (
                <button type="button" className="btn btn-line btn-wide" onClick={() => setMethod('pickup')}><Icon name="local" /> Retirar en Berazategui</button>
              )}
            </div>
          </div>
          {NEEDS_CAPTCHA && TURNSTILE_KEY && <Turnstile ref={captcha} siteKey={TURNSTILE_KEY} onToken={setToken} />}
          {serverError && <p id="server-error" className="server-error" tabIndex={-1} role="alert">{serverError}</p>}
          <button type="submit" className="btn btn-ink btn-wide btn-big" disabled={sending} aria-busy={sending}>
            {sending ? 'Enviando…' : <>Confirmar pedido {q && q.total !== null && `· ${money(q.total)}`}</>}
          </button>
          <p className="small muted center">El total final lo confirma el sistema al enviar.</p>
        </aside>
      </form>
    </section>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${id}`}>{label}</label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p id={`e-${id}`} className="field-error">{error}</p>}
    </div>
  );
}
