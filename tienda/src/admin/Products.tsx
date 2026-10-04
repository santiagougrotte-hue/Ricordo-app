import { Link } from 'react-router-dom';
import { adminApi } from '../lib/api/admin';
import { PASTA_LABEL } from '../lib/types';
import { money } from '../lib/money';
import { useLoad } from './useLoad';

export function Products() {
  const { data, error } = useLoad(() => adminApi.listProducts());
  if (error) return <p className="field-error">{error}</p>;
  return (
    <>
      <div className="adm-title-row">
        <h1 className="d-l">Productos</h1>
        <Link to="/admin/productos/nuevo" className="btn btn-yema">Nuevo producto</Link>
      </div>
      {!data ? <p className="muted">Cargando…</p> : (
        <ul className="adm-plist">
          {data.map((p) => {
            const cover = p.media.find((m) => m.isCover && m.kind === 'photo') ?? p.media.find((m) => m.kind === 'photo');
            return (
              <li key={p.id}>
                <Link to={`/admin/productos/${p.id}`} className={'adm-pitem' + (p.active ? '' : ' off')}>
                  <span className="adm-thumb">{cover ? <img src={cover.url} alt="" loading="lazy" /> : <span className="small muted">sin foto</span>}</span>
                  <span>
                    <b>{p.name}</b>
                    <small>{PASTA_LABEL[p.pastaType]} · {money(p.price)} · {p.stock} cajas{p.featured ? ' · destacado' : ''}{p.active ? '' : ' · oculto'}</small>
                  </span>
                  <span className="small">{p.media.length} {p.media.length === 1 ? 'archivo' : 'archivos'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
