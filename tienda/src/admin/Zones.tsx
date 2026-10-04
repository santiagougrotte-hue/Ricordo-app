import { useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { ShippingZone } from '../lib/types';
import { useLoad } from './useLoad';

type Zone = ShippingZone & { active: boolean };
type Draft = Omit<Zone, 'id' | 'postalCodes'> & { id: string | null; cps: string };

/** "1884, 1885 1886" → ['1884','1885','1886'] + errores legibles. */
export function parseCps(text: string): { cps: string[]; bad: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const cps: string[] = [];
  const bad: string[] = [];
  for (const p of parts) {
    const m = /^[A-Za-z]?(\d{4})(?:[A-Za-z]{3})?$/.exec(p);
    if (m) { if (!cps.includes(m[1])) cps.push(m[1]); } else bad.push(p);
  }
  return { cps, bad };
}

const toDraft = (z: Zone): Draft => ({ ...z, cps: z.postalCodes.join(', ') });
const NEW: Draft = { id: null, name: '', cps: '', shippingCost: 0, minOrder: 0, freeShippingFrom: null, active: true };

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
      <p className="small muted">El cliente pone su código postal y la tienda busca la zona. Si un CP no está en ninguna zona activa, se le ofrece retiro en el local o escribirte por WhatsApp.</p>
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
  const dup = cps.filter((cp) => all.some((z) => z.id !== d.id && z.active && z.postalCodes.includes(cp)));
  const id = initial.id ?? 'nueva';
  const num = (k: 'shippingCost' | 'minOrder') => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: Math.max(0, Math.floor(+e.target.value)) });

  async function save() {
    if (!d.name.trim()) return setMsg({ ok: false, text: 'Poné un nombre a la zona.' });
    if (!cps.length) return setMsg({ ok: false, text: 'Agregá al menos un código postal.' });
    if (bad.length) return setMsg({ ok: false, text: `Revisá: ${bad.join(', ')} (tienen que ser 4 números).` });
    try {
      await adminApi.saveZone({ id: d.id, name: d.name.trim(), postalCodes: cps, shippingCost: d.shippingCost, minOrder: d.minOrder, freeShippingFrom: d.freeShippingFrom, active: d.active });
      setMsg({ ok: true, text: 'Guardada.' });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
  }

  return (
    <section className={'adm-zone tag-box' + (d.active ? '' : ' off')} aria-label={d.name || 'Zona nueva'}>
      <div className="tag-in adm-form">
        <div className="field"><label className="field-label" htmlFor={`z-n-${id}`}>Nombre</label><input id={`z-n-${id}`} className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div className="field">
          <label className="field-label" htmlFor={`z-c-${id}`}>Códigos postales</label>
          <textarea id={`z-c-${id}`} className="input" rows={2} value={d.cps} onChange={(e) => setD({ ...d, cps: e.target.value })} placeholder="1884, 1885, 1886" />
          <p className="small muted">{cps.length} CP{cps.length === 1 ? '' : 's'}{bad.length ? ` · no entiendo: ${bad.join(', ')}` : ''}</p>
          {dup.length > 0 && <p className="small warn">Ojo: {dup.join(', ')} ya está en otra zona activa (se usa la primera).</p>}
        </div>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor={`z-s-${id}`}>Envío ($)</label><input id={`z-s-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.shippingCost} onChange={num('shippingCost')} /></div>
          <div className="field"><label className="field-label" htmlFor={`z-m-${id}`}>Compra mínima ($)</label><input id={`z-m-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.minOrder} onChange={num('minOrder')} /></div>
          <div className="field">
            <label className="field-label" htmlFor={`z-f-${id}`}>Envío gratis desde ($)</label>
            <input id={`z-f-${id}`} className="input" type="number" min={0} inputMode="numeric" placeholder="sin envío gratis" value={d.freeShippingFrom ?? ''} onChange={(e) => setD({ ...d, freeShippingFrom: e.target.value === '' ? null : Math.max(0, Math.floor(+e.target.value)) })} />
          </div>
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
