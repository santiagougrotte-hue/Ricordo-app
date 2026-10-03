import { Link } from 'react-router-dom';
import { useDocumentTitle } from './useDocumentTitle';

export function NotFound() {
  useDocumentTitle('No encontrado · Ricordo');
  return (
    <section className="wrap sec">
      <h1 className="d-xl">Esta caja no existe</h1>
      <p className="hand">capaz la sacamos del menú…</p>
      <Link to="/cajas" className="btn btn-yema">Ver las cajas</Link>
    </section>
  );
}
