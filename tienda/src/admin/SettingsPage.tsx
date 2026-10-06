import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { AdminSettings } from '../lib/api/adminTypes';
import { DAYS, cutoffWithDate } from '../lib/delivery';
import { useLoad } from './useLoad';
import { PushCard } from './PushCard';

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
        {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
        <button type="button" className="btn btn-ink" onClick={() => void save()}>Guardar ajustes</button>
      </section>

    </>
  );
}
