import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { Coupon, CouponDraft, CouponUse } from '../lib/api/adminTypes';
import { money } from '../lib/money';
import { orderDateTime, prettyPhone } from '../lib/orderMessage';
import { useLoad } from './useLoad';

const EMPTY: CouponDraft = {
  code: '', type: 'porcentaje', value: 10, minPurchase: null, expiresOn: null, maxUses: null,
  onePerCustomer: true, customerPhone: null, active: true,
};

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "10% off · desde $30.000 · vence 31/10 · 3/10 usos · 1 por cliente · personal" */
export function couponSummary(c: Coupon): string {
  const parts = [c.type === 'porcentaje' ? `${c.value}% off` : `${money(c.value)} off`];
  if (c.minPurchase) parts.push(`desde ${money(c.minPurchase)}`);
  if (c.expiresOn) parts.push(`vence ${dm(c.expiresOn)}`);
  parts.push(c.maxUses ? `${c.uses}/${c.maxUses} usos` : `${c.uses} ${c.uses === 1 ? 'uso' : 'usos'}`);
  if (c.onePerCustomer) parts.push('1 por cliente');
  if (c.customerPhone) parts.push(`personal (${prettyPhone(c.customerPhone)})`);
  return parts.join(' · ');
}

function F({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label>{children}{hint && <p className="small muted">{hint}</p>}</div>;
}

export function Coupons() {
  const { data, error, reload } = useLoad(() => adminApi.listCoupons());
  const [d, setD] = useState<CouponDraft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uses, setUses] = useState<CouponUse[] | null>(null);
  useEffect(() => {
    setUses(null);
    if (d?.id != null) void adminApi.couponUses(d.id).then(setUses).catch(() => setUses([]));
  }, [d?.id]);

  if (error) return <p className="field-error">{error}</p>;
  const set = <K extends keyof CouponDraft>(k: K, v: CouponDraft[K]) => setD({ ...d!, [k]: v });
  const optNum = (v: string) => (v === '' ? null : Math.max(0, Math.floor(+v)));

  async function save(next = d!) {
    setBusy(true);
    setMsg(null);
    try {
      const id = await adminApi.saveCoupon({ ...next, code: next.code.trim().toUpperCase() });
      setD({ ...next, id });
      setMsg({ ok: true, text: 'Guardado.' });
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
    setBusy(false);
  }

  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Cupones</h1>
        <button type="button" className="btn btn-yema" onClick={() => { setD(EMPTY); setMsg(null); }}>Nuevo cupón</button>
      </div>
      <p className="small muted">El cliente escribe el código en el checkout. El descuento va sobre los productos (sin envío ni los de precio especial) y no se suma a la promo ni al descuento por cajas: queda el mayor.</p>

      {d && (
        <form className="adm-form adm-section adm-coupon-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <h2 className="d-m">{d.id != null ? `Cupón ${d.code}` : 'Nuevo cupón'}</h2>
          <div className="adm-grid3">
            <F label="Código" id="c-code" hint="Letras y números, sin espacios. Ej.: VUELVE10">
              <input id="c-code" className="input" value={d.code} maxLength={30} autoCapitalize="characters" onChange={(e) => set('code', e.target.value.toUpperCase())} />
            </F>
            <F label="Tipo" id="c-type">
              <select id="c-type" className="input" value={d.type} onChange={(e) => set('type', e.target.value as CouponDraft['type'])}>
                <option value="porcentaje">% de descuento</option>
                <option value="monto">Monto fijo ($)</option>
              </select>
            </F>
            <F label={d.type === 'porcentaje' ? 'Descuento (%)' : 'Descuento ($)'} id="c-value">
              <input id="c-value" className="input" type="number" inputMode="numeric" min={1} max={d.type === 'porcentaje' ? 100 : undefined} value={d.value} onChange={(e) => set('value', Math.max(0, Math.floor(+e.target.value || 0)))} />
            </F>
          </div>
          <div className="adm-grid3">
            <F label="Compra mínima ($, opcional)" id="c-min">
              <input id="c-min" className="input" type="number" inputMode="numeric" min={0} placeholder="Sin mínimo" value={d.minPurchase ?? ''} onChange={(e) => set('minPurchase', optNum(e.target.value))} />
            </F>
            <F label="Vence el (opcional)" id="c-exp" hint="Vale hasta ese día inclusive.">
              <input id="c-exp" className="input" type="date" value={d.expiresOn ?? ''} onChange={(e) => set('expiresOn', e.target.value || null)} />
            </F>
            <F label="Usos máximos (opcional)" id="c-max">
              <input id="c-max" className="input" type="number" inputMode="numeric" min={0} placeholder="Sin límite" value={d.maxUses ?? ''} onChange={(e) => set('maxUses', optNum(e.target.value))} />
            </F>
          </div>
          <div className="adm-grid2">
            <F label="Celular del cliente (opcional)" id="c-tel" hint="Para un cupón personal: solo lo puede usar ese celular.">
              <input id="c-tel" className="input" type="tel" inputMode="tel" placeholder="11 5555 1234" value={d.customerPhone ?? ''} onChange={(e) => set('customerPhone', e.target.value || null)} />
            </F>
            <div className="adm-checks">
              <label className="switch"><input type="checkbox" checked={d.onePerCustomer} onChange={(e) => set('onePerCustomer', e.target.checked)} /><span>Un solo uso por cliente (por celular)</span></label>
              <label className="switch"><input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} /><span>Activo</span></label>
            </div>
          </div>
          {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
          <div className="adm-actions">
            <button type="submit" className="btn btn-ink" disabled={busy}>{busy ? 'Guardando…' : d.id != null ? 'Guardar cambios' : 'Crear cupón'}</button>
            {d.id != null && d.active && <button type="button" className="btn btn-line" disabled={busy} onClick={() => void save({ ...d, active: false })}>Desactivar</button>}
            <button type="button" className="btn btn-line" onClick={() => setD(null)}>Cerrar</button>
          </div>
          {d.id != null && (
            <div className="adm-block">
              <h3 className="label">Usos</h3>
              {!uses ? <p className="muted small">Cargando…</p> : uses.length === 0 ? <p className="muted small">Todavía nadie lo usó.</p> : (
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Descontado</th><th>Total</th></tr></thead>
                  <tbody>
                    {uses.map((u) => (
                      <tr key={u.orderNumber}>
                        <td>{orderDateTime(u.date)}</td><td>#{u.orderNumber}</td><td>{u.customerName} · {prettyPhone(u.phone)}</td>
                        <td>−{money(u.discount)}</td><td>{money(u.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          )}
        </form>
      )}

      {!data ? <p className="muted">Cargando…</p> : data.length === 0 ? (
        <p className="muted">Todavía no hay cupones. Creá el primero con “Nuevo cupón”.</p>
      ) : (
        <ul className="adm-plist">
          {data.map((c) => (
            <li key={c.id}>
              <button type="button" className={'adm-pitem adm-coupon' + (c.active ? '' : ' off')} onClick={() => {
                const { id, code, type, value, minPurchase, expiresOn, maxUses, onePerCustomer, customerPhone, active } = c;
                setD({ id, code, type, value, minPurchase, expiresOn, maxUses, onePerCustomer, customerPhone, active });
                setMsg(null);
              }}>
                <span>
                  <b>{c.code}</b>{c.active ? '' : ' · inactivo'}
                  <small>{couponSummary(c)}</small>
                </span>
                <span className="small">{c.totalDiscounted > 0 ? `−${money(c.totalDiscounted)}` : 'sin usos'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
