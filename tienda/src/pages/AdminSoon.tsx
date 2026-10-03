import { useDocumentTitle } from './useDocumentTitle';

export function AdminSoon() {
  useDocumentTitle('Panel · Ricordo');
  return (
    <section className="wrap sec">
      <h1 className="d-xl">Panel de Ricordo</h1>
      <p className="lede">El panel (pedidos en tiempo real, stock, ventas y zonas) llega en la etapa 5, con login obligatorio.</p>
    </section>
  );
}
