import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './state/store';
import { api } from './lib/api';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { ProductPage } from './pages/ProductPage';
import { NotFound } from './pages/NotFound';

const Checkout = lazy(() => import('./pages/Checkout').then((m) => ({ default: m.Checkout })));
const Confirmation = lazy(() => import('./pages/Confirmation').then((m) => ({ default: m.Confirmation })));
const AdminSoon = lazy(() => import('./pages/AdminSoon').then((m) => ({ default: m.AdminSoon })));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function App() {
  const { status, reload, announce } = useStore();
  return (
    <>
      <ScrollToTop />
      {api.mode === 'demo' && (
        <p className="demo-bar">Modo demo: datos de ejemplo, los pedidos no se guardan en ningún lado.</p>
      )}
      <Header />
      <main id="main" tabIndex={-1}>
        {status === 'error' ? (
          <section className="wrap sec">
            <h1 className="d-xl">Se nos cortó la conexión</h1>
            <p className="lede">No pudimos cargar las cajas. Probá de nuevo en un ratito.</p>
            <button type="button" className="btn btn-yema" onClick={() => void reload()}>Reintentar</button>
          </section>
        ) : (
          <Suspense fallback={<p className="wrap sec muted">Cargando…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cajas" element={<Catalog />} />
              <Route path="/cajas/:slug" element={<ProductPage />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/pedido/:number" element={<Confirmation />} />
              <Route path="/admin/*" element={<AdminSoon />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        )}
      </main>
      <Footer />
      <CartDrawer />
      <p className="sr" aria-live="polite">{announce}</p>
    </>
  );
}
