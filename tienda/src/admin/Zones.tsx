import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { ShippingConfig } from '../lib/api/adminTypes';
import type { Locality, ShippingZone } from '../lib/types';
import { DAYS } from '../lib/delivery';
import { money } from '../lib/money';
import { marginShipping } from '../lib/shipping';
import { useLoad } from './useLoad';

type Zone = ShippingZone & { active: boolean };
type Loc = Locality & { active: boolean };
type Draft = Omit<Zone, 'id'> & { id: string | null };

const NEW: Draft = {
  id: null, name: '', shippingCost: 0, minBoxes: 3, freeFromBoxes: 4, deliveryWeekday: 6, deliveryMoment: 'a la mañana',
  discountPerBox: 5, discountMax: 10, distancePricing: true, tollRoundTrip: 0, avgOrdersPerRoute: 1, minFee: 1000, active: true,
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
  const num = (k: 'shippingCost' | 'minBoxes' | 'discountPerBox' | 'discountMax' | 'tollRoundTrip' | 'minFee', max = Infinity) => (e: React.ChangeEvent<HTMLInputElement>) =>
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
        <label className="switch"><input type="checkbox" checked={d.distancePricing} onChange={(e) => setD({ ...d, distancePricing: e.target.checked })} /><span>Calcular por distancia (km reales hasta la dirección)</span></label>
        <div className="adm-grid3">
          <div className="field">
            <label className="field-label" htmlFor={`z-s-${id}`}>{d.distancePricing ? 'Envío de respaldo / pedido mínimo ($)' : 'Costo fijo ($)'}</label>
            <input id={`z-s-${id}`} className="input" type="number" min={0} inputMode="numeric" value={d.shippingCost} onChange={num('shippingCost')} />
          </div>
          {d.distancePricing && (
            <div className="field">
              <label className="field-label" htmlFor={`z-mf-${id}`}>Envío mínimo hasta el gratis ($)</label>
              <input id={`z-mf-${id}`} className="input" type="number" min={0} step={500} inputMode="numeric" value={d.minFee ?? 0} onChange={num('minFee')} />
            </div>
          )}
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
        {d.distancePricing && <p className="small muted">Si no se puede ubicar la dirección: con "Por cajas", es el envío del pedido mínimo (baja con cada caja); con los otros cálculos, es el envío fijo. El peaje cuenta en "Por cajas" y en "Nafta + peaje"; los pedidos por ruta, solo en "Nafta + peaje".</p>}
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
  const [draft, setDraft] = useState({ name: '', partido: '', zoneId: zones[0]?.id ?? '', km: '', toll: '0' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(f: () => Promise<void>, ok: string) {
    try { await f(); setMsg({ ok: true, text: ok }); onSaved(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' }); }
  }
  return (
    <section className="adm-section" aria-labelledby="h-locs">
      <h2 id="h-locs" className="d-m">Localidades</h2>
      <p className="small muted">
        El cliente elige su localidad de esta lista, agrupada por partido. Los <b>km ida y vuelta</b> (desde tu casa) y el <b>peaje ida y vuelta</b> definen
        el costo del viaje para el envío. Los cambios se guardan al instante (los km y el peaje, al salir del casillero).
      </p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th scope="col">Localidad</th><th scope="col">Partido</th><th scope="col">Zona</th><th scope="col">Km ida y vuelta</th><th scope="col">Peaje i/v ($)</th><th scope="col">Activa</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
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
                <td>
                  <input className="input adm-num" type="number" min={0} step={0.5} inputMode="decimal" aria-label={`Km ida y vuelta a ${l.name}`} defaultValue={l.kmRoundTrip ?? ''}
                    onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (l.kmRoundTrip ?? null)) void run(() => adminApi.saveLocality({ ...l, kmRoundTrip: v }), `Km de ${l.name} guardados.`); }} />
                </td>
                <td>
                  <input className="input adm-num" type="number" min={0} step={500} inputMode="numeric" aria-label={`Peaje ida y vuelta a ${l.name}`} defaultValue={l.tollRoundTrip ?? 0}
                    onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== (l.tollRoundTrip ?? 0)) void run(() => adminApi.saveLocality({ ...l, tollRoundTrip: v }), `Peaje de ${l.name} guardado.`); }} />
                </td>
                <td><input type="checkbox" aria-label={`${l.name} activa`} checked={l.active} onChange={(e) => void run(() => adminApi.saveLocality({ ...l, active: e.target.checked }), 'Guardado.')} /></td>
                <td><button type="button" className="link" onClick={() => { if (confirm(`¿Borrar ${l.name}?`)) void run(() => adminApi.deleteLocality(l.id), 'Borrada.'); }}>Borrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="adm-form adm-loc-add" onSubmit={(e) => { e.preventDefault(); void run(async () => { await adminApi.saveLocality({ id: null, name: draft.name.trim(), partido: draft.partido.trim(), zoneId: draft.zoneId, active: true, kmRoundTrip: draft.km === '' ? null : Number(draft.km), tollRoundTrip: Math.round(Number(draft.toll) || 0) }); setDraft({ ...draft, name: '', km: '' }); }, 'Localidad agregada.'); }}>
        <p className="label">Agregar localidad</p>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor="l-n">Localidad</label><input id="l-n" className="input" required minLength={2} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="El Pato" /></div>
          <div className="field"><label className="field-label" htmlFor="l-p">Partido</label><input id="l-p" className="input" required minLength={2} value={draft.partido} onChange={(e) => setDraft({ ...draft, partido: e.target.value })} placeholder="Berazategui" /></div>
          <div className="field"><label className="field-label" htmlFor="l-z">Zona</label>
            <select id="l-z" className="input" value={draft.zoneId} onChange={(e) => setDraft({ ...draft, zoneId: e.target.value })}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
          </div>
          <div className="field"><label className="field-label" htmlFor="l-k">Km ida y vuelta</label><input id="l-k" className="input" type="number" min={0} step={0.5} inputMode="decimal" value={draft.km} onChange={(e) => setDraft({ ...draft, km: e.target.value })} placeholder="24" /></div>
          <div className="field"><label className="field-label" htmlFor="l-t">Peaje ida y vuelta ($)</label><input id="l-t" className="input" type="number" min={0} step={500} inputMode="numeric" value={draft.toll} onChange={(e) => setDraft({ ...draft, toll: e.target.value })} /></div>
        </div>
        <button type="submit" className="btn btn-ink">Agregar</button>
      </form>
      {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
    </section>
  );
}

type Band = { upToKm: number | null; price: number };

/** Datos del cálculo por distancia. Privado: la ubicación de origen nunca se muestra en la tienda. */
function DistanceConfig() {
  const cfg = useLoad(() => adminApi.getShippingConfig());
  const [c, setC] = useState<ShippingConfig | null>(null);
  const [bands, setBands] = useState<{ km: string; price: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!cfg.data) return;
    const { enabled: _e, bands: b, ...rest } = cfg.data;
    void _e;
    setC(rest);
    setBands((b ?? []).map((x) => ({ km: x.upToKm === null ? '' : String(x.upToKm), price: String(x.price) })));
  }, [cfg.data]);
  if (cfg.error) return <p className="field-error">{cfg.error}</p>;
  if (!c) return null;
  const n = (k: keyof ShippingConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: Number(e.target.value) });
  const ex = (km: number) => Math.ceil((km * (c.consumption100km / 100) * c.fuelPrice) / c.rounding) * c.rounding;

  function parsedBands(): Band[] | string {
    const out: Band[] = [];
    for (const b of bands) {
      if (b.km.trim() === '' && b.price.trim() === '') continue;
      const price = Number(b.price);
      const km = b.km.trim() === '' ? null : Number(b.km.replace(',', '.'));
      if (!Number.isInteger(price) || price < 0) return 'Los precios van en pesos enteros.';
      if (km !== null && !(km > 0)) return 'Los km tienen que ser mayores a 0.';
      out.push({ upToKm: km, price });
    }
    if (!out.length) return 'Cargá al menos un escalón.';
    if (out.filter((b) => b.upToKm === null).length > 1) return 'Solo puede haber un escalón "más lejos" (sin km).';
    const kms = out.filter((b) => b.upToKm !== null).map((b) => b.upToKm);
    if (new Set(kms).size !== kms.length) return 'Hay dos escalones con los mismos km.';
    return out.sort((a, b) => (a.upToKm ?? Infinity) - (b.upToKm ?? Infinity));
  }

  async function save() {
    const b = parsedBands();
    if (typeof b === 'string') return setMsg({ ok: false, text: b });
    try {
      await adminApi.saveShippingConfig({ ...c!, bands: b });
      setBands(b.map((x) => ({ km: x.upToKm === null ? '' : String(x.upToKm), price: String(x.price) })));
      setMsg({ ok: true, text: 'Guardado.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
  }

  return (
    <section className="adm-section adm-form" aria-labelledby="h-dist">
      <h2 id="h-dist" className="d-m">Costo por distancia</h2>
      {cfg.data?.enabled !== undefined && (
        <p className={cfg.data.enabled ? 'adm-flex' : 'adm-callout'} role="status">
          {cfg.data.enabled
            ? 'Activo: la tienda mide los km reales (por calles) desde tu casa hasta la dirección de cada cliente.'
            : 'Inactivo: falta la clave de OpenRouteService (ORS_API_KEY) en Netlify. Mientras tanto se cobra el costo fijo de cada zona.'}
        </p>
      )}
      <p className="small muted">Se aplica a las zonas que tienen "Calcular por distancia". Si la dirección no se puede ubicar, se usa el costo fijo de la zona. Esto es privado: la ubicación de tu casa no se muestra en la tienda.</p>
      <div className="adm-grid2">
        <div className="field"><label className="field-label" htmlFor="c-lat">Latitud de tu casa</label><input id="c-lat" className="input" type="number" step="0.000001" value={c.originLat} onChange={n('originLat')} /></div>
        <div className="field"><label className="field-label" htmlFor="c-lng">Longitud de tu casa</label><input id="c-lng" className="input" type="number" step="0.000001" value={c.originLng} onChange={n('originLng')} /></div>
      </div>
      <p className="small muted">Las sacás de Google Maps: tocá y mantené sobre tu casa y copiá los dos números (el primero es la latitud).</p>

      <fieldset className="method adm-mode">
        <legend className="field-label">Cómo se calcula</legend>
        <label className={c.pricingMode === 'bands' ? 'on' : ''}><input type="radio" name="mode" checked={c.pricingMode === 'bands'} onChange={() => setC({ ...c, pricingMode: 'bands' })} /> Escalones por km</label>
        <label className={c.pricingMode === 'fuel' ? 'on' : ''}><input type="radio" name="mode" checked={c.pricingMode === 'fuel'} onChange={() => setC({ ...c, pricingMode: 'fuel' })} /> Nafta + peaje</label>
        <label className={c.pricingMode === 'boxes' ? 'on' : ''}><input type="radio" name="mode" checked={c.pricingMode === 'boxes'} onChange={() => setC({ ...c, pricingMode: 'boxes' })} /> Por localidad</label>
      </fieldset>

      {c.pricingMode === 'bands' ? (
        <>
          <p className="small muted">Km de ida desde tu casa, medidos por calles. El último escalón sin km es "más lejos".</p>
          <table className="adm-table adm-bands">
            <thead><tr><th scope="col">Hasta (km)</th><th scope="col">Envío ($)</th><th scope="col"><span className="sr">Quitar</span></th></tr></thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i}>
                  <td><input className="input" inputMode="decimal" aria-label={`Escalón ${i + 1}: hasta cuántos km`} placeholder="más lejos" value={b.km} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, km: e.target.value } : x)))} /></td>
                  <td><input className="input" inputMode="numeric" aria-label={`Escalón ${i + 1}: precio`} value={b.price} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} /></td>
                  <td><button type="button" className="link" onClick={() => setBands(bands.filter((_, j) => j !== i))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-line" onClick={() => setBands([...bands, { km: '', price: '' }])}>Agregar escalón</button>
        </>
      ) : c.pricingMode === 'boxes' ? (
        <>
          <p className="small muted">
            Viaje = km ida y vuelta de la localidad × consumo × nafta + peaje de la localidad. El envío cuida que cada pedido te deje al menos el
            margen mínimo, aunque vayas por un solo pedido: si las cajas no alcanzan a cubrir el viaje, el envío cobra lo justo; si alcanzan, se cobra
            el envío mínimo de la zona hasta el envío gratis. Los km y el peaje se cargan en la tabla de Localidades.
          </p>
          <div className="adm-grid2">
            <div className="field"><label className="field-label" htmlFor="c-pm">Margen de tus cajas (%)</label><input id="c-pm" className="input" type="number" min={0} max={100} inputMode="numeric" value={c.productMarginPct ?? 43} onChange={n('productMarginPct')} /><p className="small muted">Después de insumos y tu mano de obra.</p></div>
            <div className="field"><label className="field-label" htmlFor="c-mm">Margen mínimo por pedido (%)</label><input id="c-mm" className="input" type="number" min={0} max={99} inputMode="numeric" value={c.minMarginPct ?? 28} onChange={n('minMarginPct')} /></div>
            <div className="field"><label className="field-label" htmlFor="c-mx">Tope de envío ($)</label><input id="c-mx" className="input" type="number" min={0} step={500} inputMode="numeric" value={c.maxShipping ?? 0} onChange={n('maxShipping')} /><p className="small muted">Ningún envío cobra más que esto (0 = sin tope). En zonas lejanas, si vas por un solo pedido, el margen puede quedar más bajo.</p></div>
            <div className="field"><label className="field-label" htmlFor="c-f">Nafta ($ por litro)</label><input id="c-f" className="input" type="number" min={1} inputMode="numeric" value={c.fuelPrice} onChange={n('fuelPrice')} /></div>
            <div className="field"><label className="field-label" htmlFor="c-c">Consumo (litros cada 100 km)</label><input id="c-c" className="input" type="number" min={1} step={0.1} inputMode="decimal" value={c.consumption100km} onChange={n('consumption100km')} /></div>
            <div className="field"><label className="field-label" htmlFor="c-r">Redondear de a ($)</label><input id="c-r" className="input" type="number" min={1} inputMode="numeric" value={c.rounding} onChange={n('rounding')} /></div>
          </div>
          <BoxesExample c={c} />
        </>
      ) : (
        <>
          <p className="small muted">Envío = (km ida y vuelta × consumo × nafta + peaje de la zona) ÷ pedidos promedio por ruta, redondeado hacia arriba.</p>
          <div className="adm-grid3">
            <div className="field"><label className="field-label" htmlFor="c-f">Nafta ($ por litro)</label><input id="c-f" className="input" type="number" min={1} inputMode="numeric" value={c.fuelPrice} onChange={n('fuelPrice')} /></div>
            <div className="field"><label className="field-label" htmlFor="c-c">Consumo (litros cada 100 km)</label><input id="c-c" className="input" type="number" min={1} step={0.1} inputMode="decimal" value={c.consumption100km} onChange={n('consumption100km')} /></div>
            <div className="field"><label className="field-label" htmlFor="c-r">Redondear de a ($)</label><input id="c-r" className="input" type="number" min={1} inputMode="numeric" value={c.rounding} onChange={n('rounding')} /></div>
          </div>
          <p className="small muted">Ejemplo sin peaje, 1 pedido por ruta: 10 km → {money(ex(10))} · 30 km → {money(ex(30))} · 60 km → {money(ex(60))}.</p>
        </>
      )}
      {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
      <button type="button" className="btn btn-ink" onClick={() => void save()}>Guardar</button>
    </section>
  );
}

/** Ejemplo en vivo: Quilmes Centro (40 km ida y vuelta, $8.000 de peaje), cajas de $12.000, envío mínimo $1.000, gratis desde 6. */
function BoxesExample({ c }: { c: ShippingConfig }) {
  const trip = Math.round(40 * (c.consumption100km / 100) * c.fuelPrice + 8000);
  const cfg = { productMarginPct: c.productMarginPct, minMarginPct: c.minMarginPct, maxShipping: c.maxShipping, rounding: c.rounding || 1 };
  const z = { freeFromBoxes: 6, minFee: 1000 };
  return (
    <p className="small muted">
      Ejemplo, 40 km ida y vuelta con $8.000 de peaje (viaje {money(trip)}), cajas de $12.000:{' '}
      {[4, 6, 10, 15].map((b) => { const v = marginShipping(trip, b * 12000, b, z, cfg).shipping; return `${b} cajas → ${v === 0 ? 'gratis' : money(v)}`; }).join(' · ')}.
    </p>
  );
}
