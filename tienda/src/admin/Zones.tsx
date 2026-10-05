import { useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { ShippingZone } from '../lib/types';
import { zoneHasCp } from '../lib/shipping';
import { DAYS } from '../lib/delivery';
import { useLoad } from './useLoad';

type Zone = ShippingZone & { active: boolean };
type Draft = Omit<Zone, 'id' | 'postalCodes' | 'localities'> & { id: string | null; cps: string; locs: string };

/** "1884, 1885 B1886ABC 1000-1499" → ['1884','1885','1886','1000-1499'] + lo que no se entiende. */
export function parseCps(text: string): { cps: string[]; bad: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const cps: string[] = [];
  const bad: string[] = [];
  for (const p of parts) {
    const range = /^(\d{4})-(\d{4})$/.exec(p);
    const m = /^[A-Za-z]?(\d{4})(?:[A-Za-z]{3})?$/.exec(p);
    const v = range && +range[1] <= +range[2] ? p : m ? m[1] : null;
    if (v) { if (!cps.includes(v)) cps.push(v); } else bad.push(p);
  }
  return { cps, bad };
}

const parseLocs = (t: string) => [...new Set(t.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))];
const toDraft = (z: Zone): Draft => ({ ...z, cps: z.postalCodes.join(', '), locs: z.localities.join(', ') });
const NEW: Draft = {
  id: null, name: '', cps: '', locs: '', shippingCost: 0, minBoxes: 3, freeFromBoxes: 4, deliveryWeekday: 6, deliveryMoment: 'a la mañana',
  discountPerBox: 5, discountMax: 10, active: true,
};
const MOMENTS = ['a la mañana', 'a la tarde', 'a la noche', ''];

export function Zones() {
  const { data, reload, error } = useLoad(() => adminApi.listZones());
  const [adding, setAdding] = useState(false);
  if (error) return <p className="field-error">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;
  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Zonas de envío</h1>
        {!adding && <button type="button" className="btn btn-yema" onClick={() => setAdding(true)}>Nueva zona</button>}
      </div>
      <p className="small muted">
        El cliente pone su código postal, la tienda busca la zona y le pide confirmar la localidad. Mínimos y envío gratis se cuentan en cajas
        (las salsas y complementos no suman). Si un CP no está en ninguna zona activa, se le ofrece escribirte por WhatsApp o retirar en Berazategui.
      </p>
      <div className="adm-zones">
        {adding && <ZoneCard initial={NEW} all={data} onSaved={() => { setAdding(false); void reload(); }} onCancel={() => setAdding(false)} />}
        {data.map((z) => <ZoneCard key={z.id} initial={toDraft(z)} all={data} onSaved={() => void reload()} />)}
      </div>
    </>
  );
}

function ZoneCard({ initial, all, onSaved, onCancel }: { initial: Draft; all: Zone[]; onSaved: () => void; onCancel?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { cps, bad } = parseCps(d.cps);
  const locs = parseLocs(d.locs);
  // CP sueltos que ya cubre otra zona activa (los rangos se avisan si chocan en sus extremos).
  const dup = cps.filter((cp) => all.some((z) => z.id !== d.id && z.active && cp.split('-').some((c) => zoneHasCp(z.postalCodes, c))));
  const id = initial.id ?? 'nueva';
  const num = (k: 'shippingCost' | 'minBoxes' | 'discountPerBox' | 'discountMax', max = Infinity) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: Math.min(max, Math.max(0, Math.floor(+e.target.value || 0))) });

  async function save() {
    if (!d.name.trim()) return setMsg({ ok: false, text: 'Poné un nombre a la zona.' });
    if (!cps.length) return setMsg({ ok: false, text: 'Agregá al menos un código postal.' });
    if (bad.length) return setMsg({ ok: false, text: `Revisá: ${bad.join(', ')} (4 números, o un rango como 1000-1499).` });
    if (d.freeFromBoxes !== null && d.freeFromBoxes < d.minBoxes) return setMsg({ ok: false, text: 'El envío gratis no puede empezar antes del mínimo.' });
    try {
      const { cps: _c, locs: _l, ...rest } = d;
      void _c; void _l;
      await adminApi.saveZone({ ...rest, name: d.name.trim(), postalCodes: cps, localities: locs, deliveryMoment: d.deliveryMoment.trim() });
      setMsg({ ok: true, text: 'Guardada.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
  }

  const ex = d.freeFromBoxes !== null && d.discountPerBox > 0 && d.discountMax > 0
    ? `Ej.: con ${d.freeFromBoxes + 1} cajas, ${Math.min(d.discountMax, d.discountPerBox)}% · con ${d.freeFromBoxes + 2}, ${Math.min(d.discountMax, d.discountPerBox * 2)}%.`
    : 'Sin descuento por volumen.';

  return (
    <section className={'adm-zone tag-box' + (d.active ? '' : ' off')} aria-label={d.name || 'Zona nueva'}>
      <div className="tag-in adm-form">
        <div className="field"><label className="field-label" htmlFor={`z-n-${id}`}>Nombre</label><input id={`z-n-${id}`} className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div className="field">
          <label className="field-label" htmlFor={`z-c-${id}`}>Códigos postales</label>
          <textarea id={`z-c-${id}`} className="input" rows={2} value={d.cps} onChange={(e) => setD({ ...d, cps: e.target.value })} placeholder="1884, 1886 o un rango: 1000-1499" />
          <p className="small muted">{cps.length} {cps.length === 1 ? 'entrada' : 'entradas'}{bad.length ? ` · no entiendo: ${bad.join(', ')}` : ''}</p>
          {dup.length > 0 && <p className="small warn">Ojo: {dup.join(', ')} ya está en otra zona activa (se usa la primera de la lista).</p>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`z-l-${id}`}>Localidades (el cliente elige la suya)</label>
          <textarea id={`z-l-${id}`} className="input" rows={2} value={d.locs} onChange={(e) => setD({ ...d, locs: e.target.value })} placeholder="Quilmes, Bernal, Wilde" />
          <p className="small muted">{locs.length ? `${locs.length} · separadas por coma` : 'Vacío: no se pide localidad.'}</p>
        </div>
        <div className="adm-grid3">
          <div className="field">
            <label className="field-label" htmlFor={`z-d-${id}`}>Día de entrega</label>
            <select id={`z-d-${id}`} className="input" value={d.deliveryWeekday} onChange={(e) => setD({ ...d, deliveryWeekday: +e.target.value })}>
              {DAYS.map((x, i) => <option key={x} value={i}>{x[0].toUpperCase() + x.slice(1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`z-mo-${id}`}>Momento</label>
            <select id={`z-mo-${id}`} className="input" value={MOMENTS.includes(d.deliveryMoment) ? d.deliveryMoment : ''} onChange={(e) => setD({ ...d, deliveryMoment: e.target.value })}>
              {MOMENTS.map((m) => <option key={m} value={m}>{m || '(sin horario)'}</option>)}
            </select>
          </div>
          <div className="field"><label className="field-label" htmlFor={`z-s-${id}`}>Costo de envío ($)</label><input id={`z-s-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.shippingCost} onChange={num('shippingCost')} /></div>
        </div>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor={`z-m-${id}`}>Mínimo (cajas)</label><input id={`z-m-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.minBoxes} onChange={num('minBoxes')} /></div>
          <div className="field">
            <label className="field-label" htmlFor={`z-f-${id}`}>Envío gratis desde (cajas)</label>
            <input id={`z-f-${id}`} className="input" type="number" min={1} inputMode="numeric" placeholder="sin envío gratis" value={d.freeFromBoxes ?? ''} onChange={(e) => setD({ ...d, freeFromBoxes: e.target.value === '' ? null : Math.max(1, Math.floor(+e.target.value)) })} />
          </div>
          <div />
        </div>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor={`z-dp-${id}`}>Descuento por caja extra (%)</label><input id={`z-dp-${id}`} className="input" type="number" min={0} max={100} inputMode="numeric" value={d.discountPerBox} onChange={num('discountPerBox', 100)} /></div>
          <div className="field"><label className="field-label" htmlFor={`z-dm-${id}`}>Tope de descuento (%)</label><input id={`z-dm-${id}`} className="input" type="number" min={0} max={100} inputMode="numeric" value={d.discountMax} onChange={num('discountMax', 100)} /></div>
          <p className="small muted adm-zone-ex">Cada caja que pasa el envío gratis suma el %. {ex}</p>
        </div>
        <label className="switch"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /><span>Zona activa</span></label>
        {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
        <div className="stack-row">
          <button type="button" className="btn btn-ink" onClick={() => void save()}>Guardar</button>
          {onCancel && <button type="button" className="btn btn-line" onClick={onCancel}>Cancelar</button>}
          {initial.id && (
            <button type="button" className="link" onClick={async () => {
              if (!confirm(`¿Borrar la zona ${d.name}? Si solo querés pausarla, desactivala.`)) return;
              try { await adminApi.deleteZone(initial.id!); onSaved(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo borrar' }); }
            }}>Borrar</button>
          )}
        </div>
      </div>
    </section>
  );
}
