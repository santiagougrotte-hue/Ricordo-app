import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { adminApi } from '../lib/api/admin';
import { DEMO_PASSWORD } from '../lib/api/adminDemo';
import { Logo } from '../components/Logo';
import { Icon } from '../components/Icon';
import { AdminProvider, useAdmin } from './AdminContext';
import { Orders } from './Orders';
import { Sales } from './Sales';
import { Stock } from './Stock';
import { Products } from './Products';
import { ProductEdit } from './ProductEdit';
import { Zones } from './Zones';
import { SettingsPage } from './SettingsPage';
import './admin.css';

export function AdminRoot() {
  const [session, setSession] = useState<{ email: string } | null | undefined>(undefined);
  useEffect(() => {
    void adminApi.getSession().then(setSession);
  }, []);

  if (session === undefined) return <p className="adm-wrap muted">Cargando…</p>;
  if (!session) return <Login onDone={(email) => setSession({ email })} />;
  return (
    <AdminProvider>
      <Shell email={session.email} onSignOut={async () => { await adminApi.signOut(); setSession(null); }} />
    </AdminProvider>
  );
}

function Shell({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const { unseen, alertsOn, enableAlerts, disableAlerts, toast } = useAdmin();
  return (
    <div className="adm">
      <header className="adm-head">
        <div className="adm-wrap adm-head-row">
          <Link to="/admin" className="adm-logo" aria-label="Panel de Ricordo"><Logo /><span className="label">Panel</span></Link>
          <div className="adm-head-actions">
            <button type="button" className={'adm-chip' + (alertsOn ? ' on' : '')} onClick={alertsOn ? disableAlerts : () => void enableAlerts()} aria-pressed={alertsOn}>
              <Icon name="reloj" size={18} /> {alertsOn ? 'Avisos on' : 'Avisos off'}
            </button>
            <button type="button" className="adm-chip" onClick={onSignOut} title={email}>Salir</button>
          </div>
        </div>
        <nav className="adm-nav adm-wrap" aria-label="Secciones del panel">
          <NavLink to="/admin/pedidos">Pedidos{unseen.size > 0 && <span className="adm-badge">{unseen.size}</span>}</NavLink>
          <NavLink to="/admin/ventas">Ventas</NavLink>
          <NavLink to="/admin/stock">Stock</NavLink>
          <NavLink to="/admin/productos">Productos</NavLink>
          <NavLink to="/admin/zonas">Zonas</NavLink>
          <NavLink to="/admin/ajustes">Ajustes</NavLink>
        </nav>
      </header>
      {adminApi.mode === 'demo' && (
        <p className="demo-bar">Panel en modo demo: los pedidos que hagas en la tienda (en otra pestaña) aparecen acá al instante.</p>
      )}
      <main className="adm-wrap adm-main" id="main">
        <Routes>
          <Route index element={<Navigate to="pedidos" replace />} />
          <Route path="pedidos" element={<Orders />} />
          <Route path="ventas" element={<Sales />} />
          <Route path="stock" element={<Stock />} />
          <Route path="productos" element={<Products />} />
          <Route path="productos/:id" element={<ProductEdit />} />
          <Route path="zonas" element={<Zones />} />
          <Route path="ajustes" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="pedidos" replace />} />
        </Routes>
      </main>
      <div className="adm-toast" role="status" aria-live="assertive">{toast}</div>
    </div>
  );
}

function Login({ onDone }: { onDone: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Entrar · Panel Ricordo'; }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await adminApi.signIn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else onDone(email.trim() || 'demo');
  }
  return (
    <main className="adm-login" id="main">
      <form className="tag-box adm-login-box" onSubmit={submit}>
        <div className="tag-in">
          <Logo className="adm-login-logo" />
          <h1 className="d-m">Panel de pedidos</h1>
          <div className="field">
            <label className="field-label" htmlFor="adm-email">Email</label>
            <input id="adm-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required={adminApi.mode === 'supabase'} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="adm-pass">Contraseña</label>
            <input id="adm-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-ink btn-wide" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          {adminApi.mode === 'demo' && <p className="small muted">Modo demo: cualquier email y la contraseña <b>{DEMO_PASSWORD}</b>.</p>}
          <p className="small"><Link to="/">← Volver a la tienda</Link></p>
        </div>
      </form>
    </main>
  );
}
