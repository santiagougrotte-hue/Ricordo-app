import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import { useSlots } from '../state/useSlots';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { normalizePostalCode } from '../lib/postal';
import { findZone, quote } from '../lib/shipping';
import { slotDay, slotDeadline, slotHours, slotPart } from '../lib/slots';
import type { OrderError, PaymentMethod } from '../lib/types';
import { Icon } from '../components/Icon';
import { MethodToggle } from '../components/MethodToggle';
import { Turnstile, type TurnstileHandle } from '../components/Turnstile';

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
// En modo demo no hay servidor que valide, así que no se carga el captcha.
const NEEDS_CAPTCHA = api.mode === 'live';
import { useDocumentTitle } from './useDocumentTitle';

interface Form {
  name: string; phone: string; email: string; address: string; postalCode: string; notes: string;
  payment: PaymentMethod | ''; slot: string; // "windowId|date"
}
type Errors = Partial<Record<keyof Form, string>>;

export const RECEIPT_KEY = 'ricordo-last-receipt';

export function Checkout() {
  useDocumentTitle('Tu pedido · Ricordo');
  const s = useStore();
  const { items, subtotal, method, settings, zones, postalCode, setPostalCode, status, setQuantity, reload } = s;
  const navigate = useNavigate();
  const { slots, refresh: refreshSlots } = useSlots(method);
  const [f, setF] = useState<Form>(() => ({
    name: '', phone: '', email: '', address: '', postalCode: normalizePostalCode(postalCode) ?? postalCode, notes: '', payment: '', slot: '',
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);

  // El CP del checkout manda: recalcula zona y envío en vivo.
  const lookup = useMemo(() => findZone(zones, f.postalCode), [zones, f.postalCode]);
  const q = settings ? quote(method, lookup, subtotal, settings) : null;

  // Precarga la confirmación: si no, el router muestra el checkout vacío mientras baja ese código.
  useEffect(() => {
    void import('./Confirmation');
  }, []);

  // Si el turno elegido desaparece (cerró o cambió la modalidad), se limpia.
  useEffect(() => {
    if (slots && f.slot && !slots.some((x) => `${x.windowId}|${x.date}` === f.slot)) setF((v) => ({ ...v, slot: '' }));
  }, [slots, f.slot]);

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
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  function validate(): Errors {
    const e: Errors = {};
    if (f.name.trim().length < 2) e.name = 'Contanos tu nombre.';
    const digits = f.phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) e.phone = 'Necesitamos un teléfono con WhatsApp, con característica (ej. 11 5555 1234).';
    if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Revisá el email (o dejalo vacío).';
    if (method === 'delivery') {
      if (f.address.trim().length < 5) e.address = 'Calle, número y piso/depto si tiene.';
      if (!normalizePostalCode(f.postalCode)) e.postalCode = 'Escribí 4 números (1884) o el CP completo (B1884ABC).';
      else if (lookup.status === 'not_found') e.postalCode = `Todavía no llegamos al ${lookup.postalCode}. Podés elegir "Lo retiro" arriba.`;
    }
    if (q && q.missingForMin > 0 && !e.postalCode) setServerError(`Te faltan ${money(q.missingForMin)} para la compra mínima (${money(q.minOrder)}). Sumá alguna caja y volvé.`);
    if (!f.slot) e.slot = 'Elegí cuándo lo querés.';
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
      case 'RC002': return 'Todavía no llegamos a ese código postal. Podés elegir retiro en el local.';
      case 'RC003': return `Te faltan ${money(err.missing)} para la compra mínima (${money(err.minOrder)}).`;
      case 'RC006':
        void refreshSlots();
        return 'El turno que elegiste ya cerró. Elegí otro y confirmá de nuevo.';
      case 'CAPTCHA': return 'No pudimos verificar que no sos un robot. Recargá la página y probá de nuevo.';
      case 'NETWORK': return err.message;
      default: return 'Algo no cerró con los datos del pedido. Revisalos y probá de nuevo; si sigue, escribinos por WhatsApp.';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (!first && q && q.missingForMin > 0) return;
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    if (NEEDS_CAPTCHA && !token) {
      setServerError(TURNSTILE_KEY
        ? 'Estamos verificando que no sos un robot. Esperá un segundo y tocá "Confirmar" de nuevo.'
        : 'La tienda todavía no tiene configurado el captcha (VITE_TURNSTILE_SITE_KEY).');
      return;
    }
    const [windowId, date] = f.slot.split('|');
    setSending(true);
    const res = await api.createOrder({
      customerName: f.name, customerPhone: f.phone, customerEmail: f.email,
      deliveryMethod: method, address: method === 'delivery' ? f.address : '', postalCode: method === 'delivery' ? f.postalCode : '',
      notes: f.notes, paymentMethod: f.payment as PaymentMethod, deliveryDate: date, deliveryWindowId: windowId,
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
    if (method === 'delivery') setPostalCode(f.postalCode);
    try {
      sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(res.receipt));
    } catch { /* sin storage */ }
    // El carrito lo vacía la confirmación al montarse: así el checkout nunca muestra "vacío" en la transición.
    navigate(`/pedido/${res.receipt.number}`, { state: { receipt: res.receipt, fresh: true }, replace: true });
  }

  const total = q && q.shippingCost !== null ? subtotal + q.shippingCost : null;
  const err = (k: keyof Form) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `e-${k}` } : {});

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
            <Field id="phone" label="Celular (WhatsApp)" error={errors.phone}>
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
                <Field id="address" label="Dirección" error={errors.address}>
                  <input id="f-address" className="input" autoComplete="street-address" placeholder="Calle 14 1234, 2°B" value={f.address} onChange={set('address')} {...err('address')} />
                </Field>
                <Field id="postalCode" label="Código postal" error={errors.postalCode} hint={lookup.status === 'found' ? `Zona ${lookup.zone.name}` : undefined}>
                  <input id="f-postalCode" className="input input-cp" autoComplete="postal-code" value={f.postalCode} onChange={set('postalCode')} {...err('postalCode')} />
                </Field>
              </>
            ) : (
              <p className="pickup-note">Retirás en {settings?.pickupAddress || 'el local'}. Te pasamos los detalles por WhatsApp.</p>
            )}

            <div className="field" role="radiogroup" aria-labelledby="slot-label" aria-describedby={errors.slot ? 'e-slot' : undefined}>
              <p id="slot-label" className="field-label">¿Cuándo?</p>
              {slots === null && <p className="muted">Buscando turnos…</p>}
              {slots?.length === 0 && <p className="block-reason">No hay turnos abiertos ahora. Escribinos por WhatsApp y lo coordinamos.</p>}
              <div className="slots">
                {slots?.slice(0, 4).map((x, i) => {
                  const v = `${x.windowId}|${x.date}`;
                  return (
                    <label key={v} className={'slot' + (f.slot === v ? ' on' : '')}>
                      <input type="radio" name="slot" id={i === 0 ? 'f-slot' : undefined} value={v} checked={f.slot === v} onChange={set('slot')} />
                      <span className="slot-day">{slotDay(x)}</span>
                      <span className="slot-label">{slotPart(x)} · {slotHours(x)}</span>
                      <span className="slot-close">pedí hasta el {slotDeadline(x)}</span>
                    </label>
                  );
                })}
              </div>
              {errors.slot && <p id="e-slot" className="field-error">{errors.slot}</p>}
            </div>
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
              <p className="label tag-title">Resumen</p>
              <ul className="sum-lines">
                {items.map(({ product, quantity }) => (
                  <li key={product.id}><span>{quantity} × {product.name}</span><span>{money(product.price * quantity)}</span></li>
                ))}
              </ul>
              <dl className="totals">
                <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
                <div>
                  <dt>{method === 'pickup' ? 'Retiro' : lookup.status === 'found' ? `Envío a ${lookup.zone.name}` : 'Envío'}</dt>
                  <dd>{!q || q.shippingCost === null ? '—' : q.shippingCost === 0 ? 'Gratis' : money(q.shippingCost)}</dd>
                </div>
                <div className="grand"><dt>Total</dt><dd>{total === null ? '—' : money(total)}</dd></div>
              </dl>
              {method === 'delivery' && lookup.status !== 'found' && (
                <p className="block-reason">Completá tu código postal para calcular el envío.</p>
              )}
              {q && q.missingForMin > 0 && (
                <p className="block-reason">Te faltan {money(q.missingForMin)} para la compra mínima ({money(q.minOrder)}). <Link to="/cajas">Sumar cajas</Link></p>
              )}
            </div>
          </div>
          {NEEDS_CAPTCHA && TURNSTILE_KEY && <Turnstile ref={captcha} siteKey={TURNSTILE_KEY} onToken={setToken} />}
          {serverError && <p id="server-error" className="server-error" tabIndex={-1} role="alert">{serverError}</p>}
          <button type="submit" className="btn btn-ink btn-wide btn-big" disabled={sending} aria-busy={sending}>
            {sending ? 'Enviando…' : <>Confirmar pedido {total !== null && `· ${money(total)}`}</>}
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
