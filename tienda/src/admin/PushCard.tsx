import { useEffect, useState } from 'react';
import { adminApi } from '../lib/api/admin';
import { disablePush, enablePush, isIOS, pushState, type PushState } from './push';

/** Ajustes → "Avisos en este celular": notificaciones de pedidos nuevos aunque el panel esté cerrado. */
export function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    setState(await pushState().catch(() => 'unsupported' as const));
    if (adminApi.mode === 'live') adminApi.getPush().then((p) => setDevices(p.devices), () => {});
  }
  useEffect(() => { void refresh(); }, []);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo' });
    }
    await refresh();
    setBusy(false);
  }

  return (
    <section className="adm-form adm-section" aria-labelledby="h-push">
      <h2 className="d-m" id="h-push">Avisos en este celular</h2>
      <p className="small muted">
        Te llega una notificación cada vez que entra un pedido, aunque el panel esté cerrado. Activalo en cada celular o compu donde lo quieras.
        {devices !== null && devices > 0 && ` Hoy está activado en ${devices === 1 ? '1 dispositivo' : `${devices} dispositivos`}.`}
      </p>

      {state === 'ios-install' && (
        <div className="adm-push-steps">
          <p><strong>En iPhone hay un paso antes</strong> (lo pide Apple):</p>
          <ol>
            <li>Abrí este panel en <strong>Safari</strong>.</li>
            <li>Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha) → <strong>Agregar a inicio</strong>.</li>
            <li>Abrí <strong>Ricordo</strong> desde el ícono nuevo, entrá a Ajustes y tocá <strong>Activar avisos</strong>.</li>
          </ol>
        </div>
      )}
      {state === 'unsupported' && <p className="field-error">Este navegador no permite notificaciones. Probá con Chrome en Android, o Safari en iPhone.</p>}
      {state === 'denied' && (
        <p className="field-error">
          Las notificaciones están bloqueadas para este sitio. {isIOS() ? 'Activalas en Ajustes del iPhone → Notificaciones → Ricordo.' : 'Tocá el candado de la barra de direcciones → Permisos → Notificaciones → Permitir.'} Después volvé acá.
        </p>
      )}

      <div className="adm-push-actions">
        {state === 'off' && (
          <button type="button" className="btn btn-ink" disabled={busy} onClick={() => run(async () => { await enablePush(); return 'Listo: los avisos quedaron activados en este celular. Probalo con el botón de abajo.'; })}>
            {busy ? 'Activando…' : 'Activar avisos'}
          </button>
        )}
        {state === 'on' && (
          <>
            <p className="field-hint" role="status">✓ Activados en este celular.</p>
            <button type="button" className="btn btn-ink" disabled={busy} onClick={() => run(() => adminApi.testPush())}>{busy ? 'Enviando…' : 'Probar aviso'}</button>
            <button type="button" className="link" disabled={busy} onClick={() => run(async () => { await disablePush(); return 'Desactivados en este celular.'; })}>Desactivar</button>
          </>
        )}
      </div>
      {msg && <p className={msg.ok ? 'field-hint' : 'field-error'} role="status">{msg.text}</p>}
      {state === 'on' && (
        <p className="small muted">
          Si no te llega: revisá que el celular no esté en "No molestar" y que el modo ahorro de batería no bloquee {isIOS() ? 'a Ricordo' : 'al navegador'}.
        </p>
      )}
    </section>
  );
}
