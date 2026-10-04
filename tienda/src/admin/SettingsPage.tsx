import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import type { AdminSettings } from '../lib/api/adminTypes';
import type { DeliveryWindow } from '../lib/slots';
import { useLoad } from './useLoad';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function SettingsPage() {
  const settings = useLoad(() => adminApi.getSettings());
  const windows = useLoad(() => adminApi.listWindows());
  const [s, setS] = useState<AdminSettings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (settings.data) setS(settings.data); }, [settings.data]);

  if (settings.error) return <p className="field-error">{settings.error}</p>;
  if (!s || !windows.data) return <p className="muted">Cargando…</p>;

  async function save() {
    if (s!.notifyEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s!.notifyEmail)) return setMsg({ ok: false, text: 'Revisá el email de aviso.' });
    if (s!.whatsappPhone && s!.whatsappPhone.replace(/\D/g, '').length < 12) return setMsg({ ok: false, text: 'El WhatsApp va con código de país: 5491155551234.' });
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
      <section className="adm-form adm-section">
        <h2 className="d-m">Tienda</h2>
        <div className="adm-grid2">
          <div className="field">
            <label className="field-label" htmlFor="s-wa">WhatsApp de Ricordo</label>
            <input id="s-wa" className="input" inputMode="tel" placeholder="5491155551234" value={s.whatsappPhone} onChange={(e) => set('whatsappPhone', e.target.value)} />
            <p className="small muted">Con 54 9 y sin 0 ni 15. Lo usan los botones de WhatsApp de la tienda.</p>
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
        <h3 className="label">Retiro en el local</h3>
        <label className="switch"><input type="checkbox" checked={s.pickupEnabled} onChange={(e) => set('pickupEnabled', e.target.checked)} /><span>Ofrecer retiro en el local</span></label>
        <div className="adm-grid2">
          <div className="field">
            <label className="field-label" htmlFor="s-addr">Dirección o indicación</label>
            <input id="s-addr" className="input" value={s.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="s-pmin">Compra mínima para retiro ($)</label>
            <input id="s-pmin" className="input" type="number" min={0} inputMode="numeric" value={s.pickupMinOrder} onChange={(e) => set('pickupMinOrder', Math.max(0, Math.floor(+e.target.value)))} />
          </div>
        </div>
        {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
        <button type="button" className="btn btn-ink" onClick={() => void save()}>Guardar ajustes</button>
      </section>

      <section className="adm-section">
        <h2 className="d-m">Turnos de entrega</h2>
        <p className="small muted">"Pedí hasta" = cuántas horas antes del turno se cierra la toma de pedidos (24 = el día anterior a la misma hora).</p>
        <div className="adm-zones">
          {windows.data.map((w) => <WindowCard key={w.id} initial={w} onSaved={() => void windows.reload()} />)}
          <WindowCard initial={{ id: '', label: '', weekday: 6, startsAt: '09:00', endsAt: '13:00', cutoffHours: 24, forDelivery: true, forPickup: true, active: true }} isNew onSaved={() => void windows.reload()} />
        </div>
      </section>
    </>
  );
}

function WindowCard({ initial, isNew, onSaved }: { initial: DeliveryWindow; isNew?: boolean; onSaved: () => void }) {
  const [w, setW] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const k = initial.id || 'nuevo';
  async function save() {
    if (!w.label.trim()) return setMsg({ ok: false, text: 'Poné un nombre, por ejemplo "Sábado a la mañana".' });
    if (w.endsAt <= w.startsAt) return setMsg({ ok: false, text: 'La hora de fin tiene que ser después del inicio.' });
    try {
      await adminApi.saveWindow({ ...w, id: isNew ? null : w.id, label: w.label.trim() });
      setMsg({ ok: true, text: 'Guardado.' });
      if (isNew) setW(initial);
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
  }
  return (
    <section className={'adm-zone tag-box' + (w.active ? '' : ' off')} aria-label={w.label || 'Turno nuevo'}>
      <div className="tag-in adm-form">
        {isNew && <p className="label">Agregar turno</p>}
        <div className="adm-grid2">
          <div className="field"><label className="field-label" htmlFor={`w-l-${k}`}>Nombre</label><input id={`w-l-${k}`} className="input" value={w.label} onChange={(e) => setW({ ...w, label: e.target.value })} placeholder="Sábado a la mañana" /></div>
          <div className="field"><label className="field-label" htmlFor={`w-d-${k}`}>Día</label>
            <select id={`w-d-${k}`} className="input" value={w.weekday} onChange={(e) => setW({ ...w, weekday: +e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </div>
        </div>
        <div className="adm-grid3">
          <div className="field"><label className="field-label" htmlFor={`w-s-${k}`}>Desde</label><input id={`w-s-${k}`} className="input" type="time" value={w.startsAt} onChange={(e) => setW({ ...w, startsAt: e.target.value })} /></div>
          <div className="field"><label className="field-label" htmlFor={`w-e-${k}`}>Hasta</label><input id={`w-e-${k}`} className="input" type="time" value={w.endsAt} onChange={(e) => setW({ ...w, endsAt: e.target.value })} /></div>
          <div className="field"><label className="field-label" htmlFor={`w-c-${k}`}>Pedí hasta (horas antes)</label><input id={`w-c-${k}`} className="input" type="number" min={0} inputMode="numeric" value={w.cutoffHours} onChange={(e) => setW({ ...w, cutoffHours: Math.max(0, Math.floor(+e.target.value)) })} /></div>
        </div>
        <div className="stack-row">
          <label className="switch"><input type="checkbox" checked={w.forDelivery} onChange={(e) => setW({ ...w, forDelivery: e.target.checked })} /><span>Envíos</span></label>
          <label className="switch"><input type="checkbox" checked={w.forPickup} onChange={(e) => setW({ ...w, forPickup: e.target.checked })} /><span>Retiro</span></label>
          <label className="switch"><input type="checkbox" checked={w.active} onChange={(e) => setW({ ...w, active: e.target.checked })} /><span>Activo</span></label>
        </div>
        {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
        <button type="button" className="btn btn-ink" onClick={() => void save()}>{isNew ? 'Agregar' : 'Guardar'}</button>
      </div>
    </section>
  );
}
