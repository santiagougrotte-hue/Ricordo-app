import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { ShippingConfig } from '../lib/api/adminTypes';
import type { Locality, ShippingZone } from '../lib/types';
import { DAYS } from '../lib/delivery';
import { money } from '../lib/money';
import { useLoad } from './useLoad';

type Zone = ShippingZone & { active: boolean };
type Loc = Locality & { active: boolean };
type Draft = Omit<Zone, 'id'> & { id: string | null };

const NEW: Draft = {
  id: null, name: '', shippingCost: 0, minBoxes: 3, freeFromBoxes: 4, deliveryWeekday: 6, deliveryMoment: 'a la mañana',
  discountPerBox: 5, discountMax: 10, distancePricing: true, tollRoundTrip: 0, avgOrdersPerRoute: 1, active: true,
};
const MOMENTS = ['a la mañana', 'a la tarde', 'a la noche', ''];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function Zones() {
  const zones = useLoad(() => adminApi.listZones());
  const locs = useLoad(() => adminApi.listLocalities());
  const [adding, setAdding] = useState(false);
  if (zones.error || locs.error) return <p className="field-error">{zones.error ?? locs.error}</p>;
  if (!zones.data || !locs.data) return <p className="muted">Cargando…</p>;
  const reload = () => { void zones.reload(); void locs.reload(); };
  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Zonas de envío</h1>
        {!adding && <button type="button" className="btn btn-yema" onClick={() => setAdding(true)}>Nueva zona</button>}
      </div>
      <p className="small muted">
        La zona la define la <b>localidad</b> que elige el cliente (los códigos postales se superponen entre localidades). Mínimos y envío gratis
        se cuentan en cajas. Si la localidad no está en la lista, el cliente elige "Otra localidad" y se le ofrece WhatsApp o retiro.
      </p>
      <div className="adm-zones">
        {adding && <ZoneCard initial={NEW} locs={[]} onSaved={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
        {zones.data.map((z) => <ZoneCard key={z.id} initial={z} locs={locs.data!.filter((l) => l.zoneId === z.id)} onSaved={reload} />)}
      </div>
      <Localities zones={zones.data} list={locs.data} onSaved={reload} />
      <DistanceConfig />
    </>
  );
}

function ZoneCard({ initial, locs, onSaved, onCancel }: { initial: Draft; locs: Loc[]; onSaved: () => void; onCancel?: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = initial.id ?? 'nueva';
  const num = (k: 'shippingCost' | 'minBoxes' | 'discountPerBox' | 'discountMax' | 'tollRoundTrip', max = Infinity) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, [k]: Math.min(max, Math.max(0, Math.floor(+e.target.value || 0))) });

  async function save() {
    if (!d.name.trim()) return setMsg({ ok: false, text: 'Poné un nombre a la zona.' });
    if (d.freeFromBoxes !== null && d.freeFromBoxes <= d.minBoxes) return setMsg({ ok: false, text: 'El envío gratis tiene que empezar con más cajas que el mínimo.' });
    try {
      await adminApi.saveZone({ ...d, name: d.name.trim(), deliveryMoment: d.deliveryMoment.trim() });
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
        {initial.id && <p className="small muted">Localidades: {locs.length ? locs.map((l) => l.name).join(', ') : 'ninguna (asignalas abajo)'}</p>}
        <div className="adm-grid3">
          <div className="field">
            <label className="field-label" htmlFor={`z-d-${id}`}>Día de entrega</label>
            <select id={`z-d-${id}`} className="input" value={d.deliveryWeekday} onChange={(e) => setD({ ...d, deliveryWeekday: +e.target.value })}>
              {DAYS.map((x, i) => <option key={x} value={i}>{cap(x)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`z-mo-${id}`}>Momento</label>
            <select id={`z-mo-${id}`} className="input" value={MOMENTS.includes(d.deliveryMoment) ? d.deliveryMoment : ''} onChange={(e) => setD({ ...d, deliveryMoment: e.target.value })}>
              {MOMENTS.map((m) => <option key={m} value={m}>{m || '(sin horario)'}</option>)}
            </select>
          </div>
          <div />
        </div>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor={`z-m-${id}`}>Mínimo (cajas)</label><input id={`z-m-${id}`} className="input" type="number" min={1} inputMode="numeric" value={d.minBoxes} onChange={num('minBoxes')} /></div>
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
        <p className="label">Costo de envío</p>
        <label className="switch"><input type="checkbox" checked={d.distancePricing} onChange={(e) => setD({ ...d, distancePricing: e.target.checked })} /><span>Calcular por distancia (nafta + peaje)</span></label>
        <div className="adm-grid3">
          <div className="field">
            <label className="field-label" htmlFor={`z-s-${id}`}>{d.distancePricing ? 'Costo fijo de respaldo ($)' : 'Costo fijo ($)'}</label>
            <input id={`z-s-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.shippingCost} onChange={num('shippingCost')} />
          </div>
          {d.distancePricing && (
            <>
              <div className="field"><label className="field-label" htmlFor={`z-t-${id}`}>Peaje ida y vuelta ($)</label><input id={`z-t-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.tollRoundTrip} onChange={num('tollRoundTrip')} /></div>
              <div className="field">
                <label className="field-label" htmlFor={`z-a-${id}`}>Pedidos promedio por ruta</label>
                <input id={`z-a-${id}`} className="input" type="number" min={1} step={0.5} inputMode="decimal" value={d.avgOrdersPerRoute} onChange={(e) => setD({ ...d, avgOrdersPerRoute: Math.max(1, Math.round(+e.target.value * 10) / 10 || 1) })} />
              </div>
            </>
          )}
        </div>
        {d.distancePricing && <p className="small muted">El respaldo se usa si no se puede ubicar la dirección. Con varios pedidos por ruta, el viaje se reparte entre ellos.</p>}
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

/** Localidades: cada una apunta a una zona. */
function Localities({ zones, list, onSaved }: { zones: Zone[]; list: Loc[]; onSaved: () => void }) {
  const [draft, setDraft] = useState({ name: '', partido: '', zoneId: zones[0]?.id ?? '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(f: () => Promise<void>, ok: string) {
    try { await f(); setMsg({ ok: true, text: ok }); onSaved(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' }); }
  }
  return (
    <section className="adm-section" aria-labelledby="h-locs">
      <h2 id="h-locs" className="d-m">Localidades</h2>
      <p className="small muted">El cliente elige su localidad de esta lista, agrupada por partido. Cambiá la zona de una localidad y se guarda al instante.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th scope="col">Localidad</th><th scope="col">Partido</th><th scope="col">Zona</th><th scope="col">Activa</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} className={l.active ? '' : 'off'}>
                <th scope="row">{l.name}</th>
                <td>{l.partido}</td>
                <td>
                  <select className="input" aria-label={`Zona de ${l.name}`} value={l.zoneId} onChange={(e) => void run(() => adminApi.saveLocality({ ...l, zoneId: e.target.value }), `${l.name} pasó a otra zona.`)}>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" aria-label={`${l.name} activa`} checked={l.active} onChange={(e) => void run(() => adminApi.saveLocality({ ...l, active: e.target.checked }), 'Guardado.')} /></td>
                <td><button type="button" className="link" onClick={() => { if (confirm(`¿Borrar ${l.name}?`)) void run(() => adminApi.deleteLocality(l.id), 'Borrada.'); }}>Borrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="adm-form adm-loc-add" onSubmit={(e) => { e.preventDefault(); void run(async () => { await adminApi.saveLocality({ id: null, ...draft, name: draft.name.trim(), partido: draft.partido.trim(), active: true }); setDraft({ ...draft, name: '' }); }, 'Localidad agregada.'); }}>
        <p className="label">Agregar localidad</p>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor="l-n">Localidad</label><input id="l-n" className="input" required minLength={2} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="El Pato" /></div>
          <div className="field"><label className="field-label" htmlFor="l-p">Partido</label><input id="l-p" className="input" required minLength={2} value={draft.partido} onChange={(e) => setDraft({ ...draft, partido: e.target.value })} placeholder="Berazategui" /></div>
          <div className="field"><label className="field-label" htmlFor="l-z">Zona</label>
            <select id="l-z" className="input" value={draft.zoneId} onChange={(e) => setDraft({ ...draft, zoneId: e.target.value })}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
          </div>
        </div>
        <button type="submit" className="btn btn-ink">Agregar</button>
      </form>
      {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
    </section>
  );
}

/** Datos del cálculo por distancia. Privado: la ubicación de origen nunca se muestra en la tienda. */
function DistanceConfig() {
  const cfg = useLoad(() => adminApi.getShippingConfig());
  const [c, setC] = useState<ShippingConfig | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (cfg.data) setC(cfg.data); }, [cfg.data]);
  if (cfg.error) return <p className="field-error">{cfg.error}</p>;
  if (!c) return null;
  const n = (k: keyof ShippingConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: Number(e.target.value) });
  const ex = (km: number) => Math.ceil((km * (c.consumption100km / 100) * c.fuelPrice) / c.rounding) * c.rounding;
  return (
    <section className="adm-section adm-form" aria-labelledby="h-dist">
      <h2 id="h-dist" className="d-m">Cálculo por distancia</h2>
      <p className="small muted">
        Envío = (km ida y vuelta × consumo × nafta + peaje de la zona) ÷ pedidos promedio por ruta, redondeado hacia arriba.
        Las direcciones se ubican con OpenRouteService (variable <code>ORS_API_KEY</code> en Netlify); sin esa clave se usa el costo fijo de cada zona.
        Este dato es privado: no se muestra en la tienda.
      </p>
      <div className="adm-grid2">
        <div className="field"><label className="field-label" htmlFor="c-lat">Latitud de origen</label><input id="c-lat" className="input" type="number" step="0.000001" value={c.originLat} onChange={n('originLat')} /></div>
        <div className="field"><label className="field-label" htmlFor="c-lng">Longitud de origen</label><input id="c-lng" className="input" type="number" step="0.000001" value={c.originLng} onChange={n('originLng')} /></div>
      </div>
      <p className="small muted">Las sacás de Google Maps: tocá y mantené sobre tu casa y copiá los dos números (el primero es la latitud).</p>
      <div className="adm-grid3">
        <div className="field"><label className="field-label" htmlFor="c-f">Nafta ($ por litro)</label><input id="c-f" className="input" type="number" min={1} inputMode="numeric" value={c.fuelPrice} onChange={n('fuelPrice')} /></div>
        <div className="field"><label className="field-label" htmlFor="c-c">Consumo (litros cada 100 km)</label><input id="c-c" className="input" type="number" min={1} step={0.1} inputMode="decimal" value={c.consumption100km} onChange={n('consumption100km')} /></div>
        <div className="field"><label className="field-label" htmlFor="c-r">Redondear de a ($)</label><input id="c-r" className="input" type="number" min={1} inputMode="numeric" value={c.rounding} onChange={n('rounding')} /></div>
      </div>
      <p className="small muted">Ejemplo sin peaje, 1 pedido por ruta: 10 km → {money(ex(10))} · 30 km → {money(ex(30))} · 60 km → {money(ex(60))}.</p>
      {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
      <button type="button" className="btn btn-ink" onClick={async () => {
        try { await adminApi.saveShippingConfig(c); setMsg({ ok: true, text: 'Guardado. Las distancias se vuelven a medir con este origen.' }); }
        catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' }); }
      }}>Guardar cálculo</button>
    </section>
  );
}
