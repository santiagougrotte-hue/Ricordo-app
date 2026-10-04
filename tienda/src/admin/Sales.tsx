import { useMemo, useState } from 'react';
import { useAdmin } from './AdminContext';
import { money } from '../lib/money';
import { arDay, download, ordersCsv, salesCsv, shortDate } from './util';

type Period = 'hoy' | '7d' | 'mes' | 'mes-pasado';
const LABEL: Record<Period, string> = { hoy: 'Hoy', '7d': 'Últimos 7 días', mes: 'Este mes', 'mes-pasado': 'Mes pasado' };

function range(p: Period): [string, string] {
  const today = arDay(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  switch (p) {
    case 'hoy': return [today, today];
    case '7d': return [iso(Date.UTC(y, m - 1, d - 6)), today];
    case 'mes': return [iso(Date.UTC(y, m - 1, 1)), today];
    case 'mes-pasado': return [iso(Date.UTC(y, m - 2, 1)), iso(Date.UTC(y, m - 1, 0))];
  }
}
function daysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += 86400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function Sales() {
  const { orders } = useAdmin();
  const [period, setPeriod] = useState<Period>('mes');
  const [from, to] = range(period);

  const s = useMemo(() => {
    const inRange = orders.filter((o) => { const d = arDay(o.createdAt); return d >= from && d <= to; });
    const valid = inRange.filter((o) => o.status !== 'cancelled');
    const total = valid.reduce((a, o) => a + o.total, 0);
    const boxes = valid.reduce((a, o) => a + o.items.reduce((b, i) => b + i.quantity, 0), 0);
    const byDay = new Map(daysBetween(from, to).map((d) => [d, 0]));
    const byProduct = new Map<string, { boxes: number; amount: number }>();
    const byZone = new Map<string, number>();
    for (const o of valid) {
      const d = arDay(o.createdAt);
      byDay.set(d, (byDay.get(d) ?? 0) + o.total);
      const z = o.deliveryMethod === 'pickup' ? 'Retiro en el local' : o.zoneName ?? 'Sin zona';
      byZone.set(z, (byZone.get(z) ?? 0) + o.total);
      for (const i of o.items) {
        const p = byProduct.get(i.productName) ?? { boxes: 0, amount: 0 };
        p.boxes += i.quantity;
        p.amount += i.quantity * i.unitPrice;
        byProduct.set(i.productName, p);
      }
    }
    return {
      inRange, valid, total, boxes, count: valid.length, avg: valid.length ? Math.round(total / valid.length) : 0,
      cancelled: inRange.length - valid.length,
      days: [...byDay].map(([d, v]) => ({ label: shortDate(d), value: v })),
      products: [...byProduct].map(([label, v]) => ({ label, value: v.boxes, extra: money(v.amount) })).sort((a, b) => b.value - a.value),
      zones: [...byZone].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    };
  }, [orders, from, to]);

  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Ventas</h1>
        <div className="stack-row">
          <button type="button" className="btn btn-line" onClick={() => download(`pedidos-${from}_${to}.csv`, ordersCsv(s.inRange))} disabled={!s.inRange.length}>Pedidos CSV</button>
          <button type="button" className="btn btn-line" onClick={() => download(`ventas-${from}_${to}.csv`, salesCsv(s.valid))} disabled={!s.valid.length}>Ventas CSV</button>
        </div>
      </div>
      <div className="adm-filters" role="group" aria-label="Período">
        {(Object.keys(LABEL) as Period[]).map((p) => (
          <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{LABEL[p]}</button>
        ))}
      </div>

      <div className="adm-kpis">
        <Kpi label="Vendido" value={money(s.total)} />
        <Kpi label="Pedidos" value={String(s.count)} note={s.cancelled ? `${s.cancelled} cancelado${s.cancelled > 1 ? 's' : ''} aparte` : undefined} />
        <Kpi label="Ticket promedio" value={money(s.avg)} />
        <Kpi label="Cajas" value={String(s.boxes)} />
      </div>

      {s.count === 0 ? (
        <p className="hand">sin ventas en este período</p>
      ) : (
        <div className="adm-charts">
          {s.days.length > 1 && <ChartCard title="Vendido por día" rows={s.days} kind="columns" format={money} />}
          <ChartCard title="Gustos más vendidos (cajas)" rows={s.products} kind="bars" format={(v) => `${v}`} />
          <ChartCard title="Vendido por zona" rows={s.zones} kind="bars" format={money} />
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="adm-kpi">
      <p className="label">{label}</p>
      <p className="adm-kpi-v">{value}</p>
      {note && <p className="small muted">{note}</p>}
    </div>
  );
}

interface Row { label: string; value: number; extra?: string }

/** Una sola serie, un solo color (bordó): sin leyenda; el título la nombra. Tabla como alternativa accesible. */
function ChartCard({ title, rows, kind, format }: { title: string; rows: Row[]; kind: 'bars' | 'columns'; format: (v: number) => string }) {
  const [table, setTable] = useState(false);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <section className="adm-chart">
      <div className="adm-chart-head">
        <h2 className="d-m">{title}</h2>
        <button type="button" className="link" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? 'Ver gráfico' : 'Ver tabla'}</button>
      </div>
      {table ? (
        <table className="zone-table">
          <thead><tr><th scope="col">{kind === 'columns' ? 'Día' : 'Nombre'}</th><th scope="col">Valor</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{format(r.value)}{r.extra && ` · ${r.extra}`}</td></tr>)}</tbody>
        </table>
      ) : kind === 'bars' ? (
        <ul className="hbars">
          {rows.map((r) => (
            <li key={r.label} tabIndex={0} data-tip={`${r.label}: ${format(r.value)}${r.extra ? ' · ' + r.extra : ''}`}>
              <span className="hbars-label">{r.label}</span>
              <span className="hbars-track"><span className="hbars-bar" style={{ width: `${(r.value / max) * 100}%` }} /></span>
              <span className="hbars-v">{format(r.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="cols" role="img" aria-label={`${title}. Máximo ${format(max)}. Usá "Ver tabla" para los valores.`}>
          <span className="cols-max">{format(max)}</span>
          <div className="cols-plot">
            {rows.map((r, i) => (
              <span key={r.label} className="cols-col" tabIndex={0} data-tip={`${r.label}: ${format(r.value)}`} aria-label={`${r.label}: ${format(r.value)}`}>
                <span className="cols-bar" style={{ height: `${(r.value / max) * 100}%` }} />
                {(i === 0 || i === rows.length - 1 || rows.length <= 8) && <span className="cols-x">{r.label}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
