import { useSearchParams } from 'react-router-dom';
import { useStore } from '../state/store';
import { PASTA_LABEL, type PastaType } from '../lib/types';
import { ProductLabel } from '../components/ProductLabel';
import { useDocumentTitle } from './useDocumentTitle';

const TYPES: PastaType[] = ['ravioles', 'sorrentinos', 'cappellacci'];

export function Catalog() {
  useDocumentTitle('Las cajas · Ricordo');
  const { products, status } = useStore();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tipo');
  const active = TYPES.includes(raw as PastaType) ? (raw as PastaType) : null;
  const list = products.filter((p) => !active || p.pastaType === active);
  // Primero lo que hay; lo agotado al final.
  const sorted = [...list].sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0) || a.sortOrder - b.sortOrder);

  return (
    <section className="sec wrap catalog" aria-labelledby="h-cat">
      <header className="sec-head">
        <span className="sec-n" aria-hidden="true">{String(sorted.length).padStart(2, '0')}</span>
        <div>
          <h1 id="h-cat" className="d-xl">{active ? PASTA_LABEL[active] : 'Las cajas'}</h1>
          <p className="lede">Todas de 12 unidades, sin TACC. Se guardan en el freezer hasta 3 meses.</p>
        </div>
      </header>
      <nav className="filters" aria-label="Filtrar por tipo de pasta">
        <button type="button" aria-pressed={!active} onClick={() => setParams({})}>
          Todas <span>{products.length}</span>
        </button>
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={active === t} onClick={() => setParams({ tipo: t })}>
            {PASTA_LABEL[t]} <span>{products.filter((p) => p.pastaType === t).length}</span>
          </button>
        ))}
      </nav>
      {status === 'loading' && <p className="muted">Cargando las cajas…</p>}
      {status === 'ready' && sorted.length === 0 && <p className="hand">no hay cajas de este tipo por ahora</p>}
      <div className="cat-grid" aria-live="polite">
        {sorted.map((p, i) => (
          <ProductLabel key={p.id} product={p} size={i % 5 === 0 ? 'l' : 'm'} eager={i < 2} level={2} />
        ))}
      </div>
    </section>
  );
}
