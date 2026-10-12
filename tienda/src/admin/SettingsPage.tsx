import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { AdminSettings } from '../lib/api/adminTypes';
import { DAYS, cutoffWithDate } from '../lib/delivery';
import { useLoad } from './useLoad';
import { PushCard } from './PushCard';
import type { Promo } from '../lib/types';
import { promoActive } from '../lib/shipping';

const TZ_OFFSET = '-03:00';
/** ISO → "2026-10-18" (día en Argentina). */
const arDay = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const nextDay = (d: string) => new Date(new Date(`${d}T00:00:00${TZ_OFFSET}`).getTime() + 86400_000).toISOString();

/** Promo por cajas (Día de la Madre): prender/apagar, fechas y opciones. */
function PromoFields({ promo, onChange }: { promo: Promo; onChange: (p: Promo) => void }) {
  const set = <K extends keyof Promo>(k: K, v: Promo[K]) => onChange({ ...promo, [k]: v });
  const lastDay = arDay(new Date(new Date(promo.endsAt).getTime() - 1).toISOString());
  const now = new Date();
  const active = promoActive(promo as Promo | null, now);
  const state = active ? 'Se ve en la tienda ahora.' : !promo.enabled ? 'Apagada.'
    : now < new Date(promo.startsAt) ? 'Todavía no empezó.' : 'Ya terminó: no se ve en la tienda.';
  return (
    <>
      <h3 className="label">Promo {promo.name}</h3>
      <label className="switch"><input type="checkbox" checked={promo.enabled} onChange={(e) => set('enabled', e.target.checked)} /><span>Promo prendida (descuento, regalos y decoración)</span></label>
      <p className="small muted">{state} El descuento va sobre el total de los productos y reemplaza al de cajas extra. Los regalos salen del stock de {promo.giftName ?? 'la salsa'}; si no hay, igual figuran en el pedido.</p>
      <div className="adm-grid2">
        <div className="field">
          <label className="field-label" htmlFor="s-pfrom">Desde</label>
          <input id="s-pfrom" className="input" type="date" value={arDay(promo.startsAt)} onChange={(e) => e.target.value && set('startsAt', new Date(`${e.target.value}T00:00:00${TZ_OFFSET}`).toISOString())} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="s-pto">Último día (termina a la noche)</label>
          <input id="s-pto" className="input" type="date" value={lastDay} onChange={(e) => e.target.value && set('endsAt', nextDay(e.target.value))} />
        </div>
      </div>
      <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr><th>Opción</th><th>Desde (cajas)</th><th>Descuento %</th><th>Salsas de regalo</th></tr></thead>
        <tbody>
          {promo.tiers.map((t, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              {(['minBoxes', 'pct', 'gifts'] as const).map((k) => (
                <td key={k}>
                  <input className="input" type="number" min={k === 'minBoxes' ? 1 : 0} max={k === 'pct' ? 50 : undefined} inputMode="numeric" aria-label={`Opción ${i + 1}: ${k === 'minBoxes' ? 'desde cajas' : k === 'pct' ? 'descuento' : 'regalos'}`}
                    value={t[k]} onChange={(e) => set('tiers', promo.tiers.map((x, j) => (j === i ? { ...x, [k]: Math.max(0, Math.floor(+e.target.value || 0)) } : x)))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

export function SettingsPage() {
  const settings = useLoad(() => adminApi.getSettings());
  const [s, setS] = useState<AdminSettings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [waMsg, setWaMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  useEffect(() => { if (settings.data) setS(settings.data); }, [settings.data]);

  if (settings.error) return <p className="field-error">{settings.error}</p>;
  if (!s) return <p className="muted">Cargando…</p>;

  async function save() {
    if (s!.notifyEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s!.notifyEmail)) return setMsg({ ok: false, text: 'Revisá el email de aviso.' });
    if (s!.whatsappPhone && s!.whatsappPhone.replace(/\D/g, '').length < 12) return setMsg({ ok: false, text: 'El WhatsApp va con código de país: 5491155551234.' });
    if (!/^\d{2}:\d{2}$/.test(s!.cutoffTime)) return setMsg({ ok: false, text: 'Revisá la hora de cierre.' });
    try {
      await adminApi.saveSettings({ ...s!, whatsappPhone: s!.whatsappPhone.replace(/\D/g, '') });
      setMsg({ ok: true, text: 'Guardado.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
  }
  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) => setS({ ...s!, [k]: v });

  return (
    <>
      <h1 className="d-l">Ajustes</h1>
      <PushCard />
      <section className="adm-form adm-section">
        <h2 className="d-m">Tienda</h2>
        <div className="adm-grid2">
          <div className="field">
            <label className="field-label" htmlFor="s-wa">WhatsApp de Ricordo</label>
            <input id="s-wa" className="input" inputMode="tel" placeholder="5491155551234" value={s.whatsappPhone} onChange={(e) => set('whatsappPhone', e.target.value)} />
            <p className="small muted">Con 54 9 y sin 0 ni 15. Lo usan los botones de WhatsApp de la tienda y ahí te llega cada pedido nuevo.</p>
            <button type="button" className="btn btn-line" disabled={waBusy} onClick={async () => {
              setWaBusy(true);
              setWaMsg(null);
              try { setWaMsg({ ok: true, text: await adminApi.testWhatsapp() }); } catch (e) { setWaMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo enviar' }); }
              setWaBusy(false);
            }}>{waBusy ? 'Enviando…' : 'Probar aviso de WhatsApp'}</button>
            <p className="small muted">Guardá el número antes de probar.</p>
            {waMsg && <p className={waMsg.ok ? 'field-hint' : 'field-error'} role="status">{waMsg.text}</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="s-mail">Email de aviso de pedidos</label>
            <input id="s-mail" className="input" type="email" value={s.notifyEmail} onChange={(e) => set('notifyEmail', e.target.value)} />
            <p className="small muted">Privado: no se muestra en la tienda.</p>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="s-tr">Datos para transferir</label>
          <input id="s-tr" className="input" value={s.transferInfo} onChange={(e) => set('transferInfo', e.target.value)} placeholder="Alias: RICORDO.PASTAS · Titular: …" />
        </div>
        <h3 className="label">Cierre de pedidos</h3>
        <p className="small muted">
          Antes del cierre, el pedido sale ese fin de semana (el día de cada zona). Después, el fin de semana siguiente. Hora de Argentina.
          Próximo cierre: {cutoffWithDate(s)}.
        </p>
        <div className="adm-grid2">
          <div className="field">
            <label className="field-label" htmlFor="s-cday">Día</label>
            <select id="s-cday" className="input" value={s.cutoffWeekday} onChange={(e) => set('cutoffWeekday', +e.target.value)}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="s-ctime">Hora</label>
            <input id="s-ctime" className="input" type="time" value={s.cutoffTime} onChange={(e) => set('cutoffTime', e.target.value)} />
          </div>
        </div>
        <h3 className="label">Retiro en Berazategui</h3>
        <label className="switch"><input type="checkbox" checked={s.pickupEnabled} onChange={(e) => set('pickupEnabled', e.target.checked)} /><span>Ofrecer retiro (sin envío y sin restricción de zona)</span></label>
        <div className="adm-grid2">
          <div className="field">
            <label className="field-label" htmlFor="s-addr">Dirección o indicación</label>
            <input id="s-addr" className="input" value={s.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} />
            <p className="small muted">El día y el horario se coordinan por WhatsApp.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="s-pmin">Mínimo para retiro (cajas)</label>
            <input id="s-pmin" className="input" type="number" min={0} inputMode="numeric" value={s.pickupMinBoxes} onChange={(e) => set('pickupMinBoxes', Math.max(0, Math.floor(+e.target.value || 0)))} />
          </div>
        </div>
        {s.promo && <PromoFields promo={s.promo} onChange={(p) => set('promo', p)} />}
        {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
        <button type="button" className="btn btn-ink" onClick={() => void save()}>Guardar ajustes</button>
      </section>

    </>
  );
}
