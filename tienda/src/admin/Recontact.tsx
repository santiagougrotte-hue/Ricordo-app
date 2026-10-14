import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api/admin';
import type { RecontactCustomer } from '../lib/api/adminTypes';
import { money } from '../lib/money';
import { prettyPhone } from '../lib/orderMessage';

const dm = (iso: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' }).format(new Date(iso));
const daysAgo = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86400_000);

/** Clientes que hace rato no compran: WhatsApp con mensaje armado (y cupón personal si se quiere). */
export function Recontact() {
  const [minOrders, setMinOrders] = useState(1);
  const [zone, setZone] = useState('');
  const [all, setAll] = useState(false);
  const [coupon, setCoupon] = useState(true);
  const [data, setData] = useState<{ days: number; couponPct: number; zones: string[]; customers: RecontactCustomer[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setData(await adminApi.recontactList({ minOrders, zone: zone || null, all }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    }
  }, [minOrders, zone, all]);
  useEffect(() => { void load(); }, [load]);

  async function contact(c: RecontactCustomer) {
    // La pestaña se abre ya (en el celular, si se abre después de esperar, el navegador la bloquea).
    const tab = window.open('', '_blank');
    setBusy(c.phone);
    try {
      const r = await adminApi.recontactContact(c.phone, coupon);
      if (tab) tab.location.href = r.url; else window.location.href = r.url;
      setDone((d) => ({ ...d, [c.phone]: r.couponCode ? `Cupón ${r.couponCode}` : 'Sin cupón' }));
      setData((x) => x && { ...x, customers: x.customers.map((y) => (y.phone === c.phone ? { ...y, contactedAt: new Date().toISOString() } : y)) });
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'No se pudo armar el mensaje');
    }
    setBusy(null);
  }

  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Para recontactar</h1>
        <Link to="/admin/ajustes" className="btn btn-line">Mensaje y días</Link>
      </div>
      <p className="small muted">
        Clientes cuya última compra fue hace más de {data?.days ?? '…'} días. Al tocar WhatsApp se abre el chat con el mensaje armado y queda
        “contactado el” para no volver a escribirle antes de {data?.days ?? '…'} días.
      </p>
      <div className="adm-filters adm-recontact-filters" role="group" aria-label="Filtros">
        <label className="field-label">Compras
          <select className="input" value={minOrders} onChange={(e) => setMinOrders(+e.target.value)}>
            <option value={1}>Todos</option>
            <option value={2}>2 o más</option>
            <option value={3}>3 o más</option>
            <option value={5}>5 o más</option>
          </select>
        </label>
        <label className="field-label">Zona
          <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Todas</option>
            {data?.zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="switch"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Incluir contactados hace poco</span></label>
        <label className="switch"><input type="checkbox" checked={coupon} onChange={(e) => setCoupon(e.target.checked)} /><span>Generar cupón personal ({data?.couponPct ?? 10}%, 15 días)</span></label>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!data ? <p className="muted">Cargando…</p> : data.customers.length === 0 ? (
        <p className="muted">No hay clientes para recontactar con estos filtros.</p>
      ) : (
        <div className="adm-table-wrap"><table className="adm-table adm-recontact">
          <thead><tr><th>Cliente</th><th>Última compra</th><th>Pedidos</th><th>Ticket promedio</th><th>Lo que más compra</th><th>Contactado</th><th><span className="sr">WhatsApp</span></th></tr></thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.phone}>
                <td><b>{c.name}</b><br /><span className="small muted">{prettyPhone(c.rawPhone)}{c.zone ? ` · ${c.zone}` : ''}</span></td>
                <td>{dm(c.lastOrderAt)}<br /><span className="small muted">hace {daysAgo(c.lastOrderAt)} días</span></td>
                <td>{c.orders}</td>
                <td>{money(c.avgTotal)}</td>
                <td className="small">{c.topProducts.join(', ') || '—'}</td>
                <td className="small">{c.contactedAt ? `contactado el ${dm(c.contactedAt)}` : '—'}{done[c.phone] && <><br />{done[c.phone]}</>}</td>
                <td><button type="button" className="btn btn-ink" disabled={busy === c.phone} onClick={() => void contact(c)}>{busy === c.phone ? 'Armando…' : 'WhatsApp'}</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
