// Búsqueda global (Sección 35 del pedido de evolución) — capa pura: busca por nombre/id en las
// entidades principales de todos los módulos a la vez, sin duplicar ningún dato (lee directo de
// RicordoDataV2, nunca arma un índice paralelo que pueda desincronizarse).

import type { RicordoDataV2 } from "./types-v2";

export type TipoResultadoBusqueda = "cliente" | "insumo" | "producto" | "proveedor" | "pedido";

export interface ResultadoBusqueda {
  tipo: TipoResultadoBusqueda;
  id: string;
  titulo: string;
  subtitulo: string;
  /** Clave de navegación (lib/nav.ts) del módulo donde vive esta entidad. */
  pagina: string;
}

const TIPO_LABEL: Record<TipoResultadoBusqueda, string> = {
  cliente: "Cliente",
  insumo: "Insumo",
  producto: "Producto",
  proveedor: "Proveedor",
  pedido: "Pedido",
};

export function labelTipoResultado(tipo: TipoResultadoBusqueda): string {
  return TIPO_LABEL[tipo];
}

/** Requiere al menos 2 caracteres — evita devolver medio catálogo con una sola letra. Nunca
 * inventa coincidencias: solo substring case-insensitive sobre nombres/ids reales. */
export function buscarGlobal(data: RicordoDataV2, query: string, limite = 40): ResultadoBusqueda[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const resultados: ResultadoBusqueda[] = [];

  for (const c of data.clientes) {
    if (c.nombre.toLowerCase().includes(q)) {
      resultados.push({ tipo: "cliente", id: c.id, titulo: c.nombre, subtitulo: `Cliente · ${c.canal}`, pagina: "ventas" });
    }
  }

  for (const i of data.insumos) {
    if (i.nombre.toLowerCase().includes(q)) {
      resultados.push({ tipo: "insumo", id: i.id, titulo: i.nombre, subtitulo: `Insumo · ${i.tipo}`, pagina: "inventario" });
    }
  }

  for (const p of data.productos) {
    if (p.nombre.toLowerCase().includes(q)) {
      resultados.push({ tipo: "producto", id: p.id, titulo: p.nombre, subtitulo: "Producto", pagina: "productos" });
    }
  }
  for (const v of data.producto_variantes) {
    if (v.nombre.toLowerCase().includes(q)) {
      const base = data.productos.find((p) => p.id === v.producto_id);
      resultados.push({ tipo: "producto", id: v.id, titulo: v.nombre, subtitulo: `Variante de ${base?.nombre ?? "(producto eliminado)"}`, pagina: "productos" });
    }
  }

  for (const p of data.proveedores) {
    if (p.nombre.toLowerCase().includes(q)) {
      resultados.push({ tipo: "proveedor", id: p.id, titulo: p.nombre, subtitulo: "Proveedor", pagina: "operaciones" });
    }
  }

  for (const ped of data.pedidos) {
    if (ped.id.toLowerCase().includes(q)) {
      const cliente = data.clientes.find((c) => c.id === ped.cliente_id);
      resultados.push({ tipo: "pedido", id: ped.id, titulo: `Pedido ${ped.id}`, subtitulo: `${cliente?.nombre ?? "(cliente eliminado)"} · ${ped.fecha}`, pagina: "ventas" });
    }
  }

  return resultados.slice(0, limite);
}
