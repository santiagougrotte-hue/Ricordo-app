import { useMemo, useState } from 'react';
import { useAdmin } from './AdminContext';
import { adminApi } from '../lib/api/admin';
import { STATUS_FLOW, STATUS_LABEL, type AdminOrder, type OrderStatus } from '../lib/api/adminTypes';
import { money } from '../lib/money';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { ago, arDateTime, arWhatsapp, download, ordersCsv, shortDate, arDay } from './util';

type Filter = 'activos' | OrderStatus | 'todos';
const ACTIVE: OrderStatus[] = ['new', 'confirmed', 'preparing', 'shipped'];

export function Orders() {
  const { orders, loading, unseen, markSeen, alertsOn, enableAlerts } = useAdmin();
  const [filter, setFilter] = useState<Filter>('activos');
  const [day, setDay] = useState<string>('');
  const [openId, setOpenId] = useState<string | null>(null);

  const today = arDay(new Date());
  const deliveryDays = useMemo(
    () => [...new Set(orders.filter((o) => o.status !== 'cancelled' && o.deliveryDate >= today).map((o) => o.deliveryDate))].sort(),
    [orders, today],
  );
  const byStatus = (s: Filter, list = orders) =>
    list.filter((o) => (s === 'todos' ? true : s === 'activos' ? ACTIVE.includes(o.status) : o.status === s));
  const inDay = day ? orders.filter((o) => o.deliveryDate === day) : orders;
  const list = byStatus(filter, inDay);
  const open = orders.find((o) => o.id === openId) ?? null;

  // "Qué preparar": cajas por gusto para el día elegido (sin cancelados).
  const prep = useMemo(() => {
    if (!day) return null;
    const m = new Map<string, number>();
    for (const o of orders) if (o.deliveryDate === day && o.status !== 'cancelled') for (const i of o.items) m.set(i.productName, (m.get(i.productName) ?? 0) + i.quantity);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [orders, day]);

  const filters: Filter[] = ['activos', 'new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'todos'];

  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Pedidos</h1>
        <button type="button" className="btn btn-line" onClick={() => download(`pedidos-${today}.csv`, ordersCsv(list))} disabled={!list.length}>
          Exportar CSV
        </button>
      </div>

      {!alertsOn && (
        <div className="adm-callout">
          <p><b>Activá los avisos</b> para enterarte de cada pedido nuevo con sonido y notificación, aunque estés en otra pestaña.</p>
          <button type="button" className="btn btn-yema" onClick={() => void enableAlerts()}>Activar avisos</button>
        </div>
      )}

      <div className="adm-filters" role="group" aria-label="Filtrar por estado">
        {filters.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'activos' ? 'Activos' : f === 'todos' ? 'Todos' : STATUS_LABEL[f]} <span>{byStatus(f, inDay).length}</span>
          </button>
        ))}
      </div>
      <div className="adm-day">
        <label className="field-label" htmlFor="adm-day">Entrega</label>
        <select id="adm-day" className="input" value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">Todas las fechas</option>
          {deliveryDays.map((d) => <option key={d} value={d}>{shortDate(d)}</option>)}
        </select>
      </div>

      {prep && prep.length > 0 && (
        <section className="adm-prep tag-box" aria-label={`Qué preparar para el ${shortDate(day)}`}>
          <div className="tag-in">
            <p className="label">Qué preparar · {shortDate(day)}</p>
            <ul>{prep.map(([name, q]) => <li key={name}><span>{name}</span><b>{q} {q === 1 ? 'caja' : 'cajas'}</b></li>)}</ul>
          </div>
        </section>
      )}

      {loading ? <p className="muted">Cargando pedidos…</p> : list.length === 0 ? (
        <p className="hand">no hay pedidos {filter === 'activos' ? 'activos' : 'acá'}</p>
      ) : (
        <ul className="adm-orders">
          {list.map((o) => (
            <li key={o.id}>
              <button type="button" className={'adm-order' + (unseen.has(o.id) ? ' unseen' : '') + ` st-${o.status}`} onClick={() => { setOpenId(o.id); markSeen(o.id); }}>
                <span className="adm-order-n">#{o.number}</span>
                <span className="adm-order-who">
                  <b>{o.customerName}</b>
                  <small>{o.deliveryMethod === 'pickup' ? 'Retira' : o.zoneName} · {shortDate(o.deliveryDate)} · {ago(o.createdAt)}</small>
                </span>
                <span className="adm-order-right">
                  <b>{money(o.total)}</b>
                  <span className={`adm-st st-${o.status}`}>{STATUS_LABEL[o.status]}</span>
                  {o.paymentStatus === 'paid' && <span className="adm-paid">Pagado</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? `Pedido #${open.number}` : 'Pedido'}>
        {open && <OrderDetail order={open} />}
      </Sheet>
    </>
  );
}

function OrderDetail({ order: o }: { order: AdminOrder }) {
  const { patchOrder } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wa = arWhatsapp(o.customerPhone);
  const waText = `Hola ${o.customerName.split(' ')[0]}! Te escribimos de Ricordo por tu pedido #${o.number} (${money(o.total)}), para el ${o.windowLabel}.`;
  const idx = STATUS_FLOW.indexOf(o.status);
  const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;

  async function run(f: () => Promise<void>, optimistic: AdminOrder) {
    setBusy(true);
    setErr(null);
    try {
      await f();
      patchOrder(optimistic);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar');
    }
    setBusy(false);
  }

  return (
    <div className="adm-detail">
      <div className="adm-detail-status">
        <span className={`adm-st st-${o.status}`}>{STATUS_LABEL[o.status]}</span>
        <span className="small muted">Entró el {arDateTime(o.createdAt)}</span>
      </div>
      <ol className="adm-steps" aria-label="Estado del pedido">
        {STATUS_FLOW.map((s, i) => <li key={s} className={o.status !== 'cancelled' && i <= idx ? 'done' : ''}>{STATUS_LABEL[s]}</li>)}
      </ol>

      <div className="adm-actions">
        {next && o.status !== 'cancelled' && (
          <button type="button" className="btn btn-ink" disabled={busy} onClick={() => void run(() => adminApi.setOrderStatus(o.id, next), { ...o, status: next })}>
            Pasar a «{STATUS_LABEL[next]}»
          </button>
        )}
        {o.paymentStatus !== 'paid' ? (
          <button type="button" className="btn btn-line" disabled={busy} onClick={() => void run(() => adminApi.setPaymentStatus(o.id, 'paid'), { ...o, paymentStatus: 'paid' })}>
            <Icon name="ok" size={20} /> Marcar pagado
          </button>
        ) : (
          <button type="button" className="btn btn-line" disabled={busy} onClick={() => void run(() => adminApi.setPaymentStatus(o.id, 'pending'), { ...o, paymentStatus: 'pending' })}>
            Pago pendiente
          </button>
        )}
      </div>
      {err && <p className="field-error" role="alert">{err}</p>}

      <section className="adm-block">
        <h3 className="label">Cliente</h3>
        <p className="adm-big">{o.customerName}</p>
        <p><a href={`tel:${o.customerPhone.replace(/[^\d+]/g, '')}`}>{o.customerPhone}</a>{o.customerEmail && <> · <a href={`mailto:${o.customerEmail}`}>{o.customerEmail}</a></>}</p>
        {wa ? (
          <a className="btn btn-ink btn-wide" href={`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
            <Icon name="charla" /> Escribirle por WhatsApp
          </a>
        ) : <p className="small warn">El teléfono no parece un celular argentino válido para WhatsApp.</p>}
      </section>

      <section className="adm-block">
        <h3 className="label">{o.deliveryMethod === 'pickup' ? 'Retira en el local' : 'Envío'}</h3>
        <p className="adm-big">{o.windowLabel}</p>
        {o.deliveryMethod === 'delivery' && (
          <p>
            {o.address} · CP {o.postalCode} · {o.zoneName}{' '}
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}, ${o.postalCode}, Buenos Aires`)}`} target="_blank" rel="noopener noreferrer">Ver mapa</a>
          </p>
        )}
        {o.notes && <p className="adm-notes">“{o.notes}”</p>}
      </section>

      <section className="adm-block">
        <h3 className="label">Cajas</h3>
        <ul className="sum-lines">
          {o.items.map((i) => <li key={i.productId}><span>{i.quantity} × {i.productName}</span><span>{money(i.quantity * i.unitPrice)}</span></li>)}
        </ul>
        <dl className="totals">
          <div><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
          <div><dt>Envío</dt><dd>{o.shippingCost ? money(o.shippingCost) : 'Gratis'}</dd></div>
          <div className="grand"><dt>Total</dt><dd>{money(o.total)}</dd></div>
        </dl>
        <p className="small">Pago: {o.paymentMethod === 'cash' ? 'efectivo' : 'transferencia'} · {o.paymentStatus === 'paid' ? 'pagado' : 'pendiente'}</p>
      </section>

      {o.status !== 'cancelled' && o.status !== 'delivered' && (
        <button
          type="button"
          className="btn btn-line adm-cancel"
          disabled={busy}
          onClick={() => {
            if (confirm(`¿Cancelar el pedido #${o.number}? Las cajas vuelven al stock.`)) void run(() => adminApi.setOrderStatus(o.id, 'cancelled'), { ...o, status: 'cancelled' });
          }}
        >
          Cancelar pedido (devuelve el stock)
        </button>
      )}
    </div>
  );
}
