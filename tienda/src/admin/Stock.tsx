import { useState } from 'react';
import { adminApi } from '../lib/api/admin';
import { PASTA_LABEL } from '../lib/types';
import type { AdminProduct } from '../lib/api/adminTypes';
import { useLoad } from './useLoad';

export function Stock() {
  const { data, setData, error } = useLoad(() => adminApi.listProducts());
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function patch(p: AdminProduct, change: Partial<Pick<AdminProduct, 'stock' | 'lowStockThreshold' | 'active'>>) {
    setSaving(p.id);
    try {
      await adminApi.updateStock(p.id, change);
      setData((list) => list!.map((x) => (x.id === p.id ? { ...x, ...change } : x)));
      setMsg(`Guardado: ${p.name}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo guardar');
    }
    setSaving(null);
  }

  if (error) return <p className="field-error">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;
  const low = data.filter((p) => p.active && p.stock <= p.lowStockThreshold);

  return (
    <>
      <div className="adm-title-row"><h1 className="d-l">Stock</h1></div>
      {low.length > 0 && (
        <div className="adm-callout warn-box" role="status">
          <p><b>Stock bajo:</b> {low.map((p) => `${p.name} (${p.stock})`).join(', ')}.</p>
        </div>
      )}
      <p className="small muted">Las cajas se descuentan solas con cada pedido y vuelven si cancelás. Acá corregís el stock real después de producir.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th scope="col">Producto</th><th scope="col">Cajas</th><th scope="col">Avisar con</th><th scope="col">En la tienda</th></tr></thead>
          <tbody>
            {data.map((p) => {
              const state = p.stock <= 0 ? 'Agotado' : p.stock <= p.lowStockThreshold ? 'Bajo' : null;
              return (
                <tr key={p.id} className={!p.active ? 'off' : ''}>
                  <th scope="row">
                    {p.name}<span className="cps">{PASTA_LABEL[p.pastaType]}{state && <b className={'adm-stock-flag ' + (p.stock <= 0 ? 'out' : '')}> · {state}</b>}</span>
                  </th>
                  <td data-label="Cajas"><NumberCell label={`Cajas de ${p.name}`} value={p.stock} onSave={(v) => patch(p, { stock: v })} disabled={saving === p.id} /></td>
                  <td data-label="Avisar con"><NumberCell label={`Umbral de aviso de ${p.name}`} value={p.lowStockThreshold} onSave={(v) => patch(p, { lowStockThreshold: v })} disabled={saving === p.id} /></td>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={p.active} onChange={(e) => void patch(p, { active: e.target.checked })} disabled={saving === p.id} />
                      <span>{p.active ? 'Visible' : 'Oculto'}</span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sr" aria-live="polite">{msg}</p>
    </>
  );
}

function NumberCell({ value, onSave, label, disabled }: { value: number; onSave: (v: number) => void; label: string; disabled?: boolean }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    const n = Math.max(0, Math.floor(Number(v)));
    if (Number.isFinite(n) && n !== value) onSave(n);
    else setV(String(value));
  };
  return (
    <input
      className="input input-num" type="number" inputMode="numeric" min={0} aria-label={label} value={v} disabled={disabled}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
