// Resumen para Sheets — 4 tablas copiables (TSV) para pegar directo en una hoja de cálculo.
// Reutiliza calcularMargenPorItem (misma fuente que Analítica de Ventas y el EERR) en vez de
// recalcular ventas/CMV de nuevo, para no desincronizarse de esos números.

import type { RicordoDataV2, Canal } from "./types-v2";
import { calcularMargenPorItem, calcularStock, recetaEfectivaVariante, diferenciaRepartoPedido } from "./calc-v2";

function tsv(headers: string[], filas: (string | number)[][]): string {
  const linea = (celdas: (string | number)[]) => celdas.map((c) => String(c)).join("\t");
  return [linea(headers), ...filas.map(linea)].join("\n");
}

// --- 1) Productos: cajas equivalentes por canal, ingresos, costos, precios, stock, producidas ----

export interface FilaResumenProducto {
  producto_id: string;
  producto_nombre: string;
  linea: string;
  canal: Canal;
  cajas_vendidas: number;
  cajas_producidas: number;
  ingresos: number;
  costos: number;
  precio_promedio: number;
  stock_actual: number;
}

export function resumenProductosSheets(data: RicordoDataV2, desde: string, hasta: string): FilaResumenProducto[] {
  const items = calcularMargenPorItem(data, desde, hasta);
  const clave = (productoId: string, canal: Canal) => `${productoId}__${canal}`;
  const porGrupo = new Map<string, { producto_id: string; canal: Canal; cajas: number; ingresos: number; costos: number }>();
  for (const it of items) {
    const productoId = it.producto_id ?? "sin-producto";
    const k = clave(productoId, it.canal);
    const actual = porGrupo.get(k) ?? { producto_id: productoId, canal: it.canal, cajas: 0, ingresos: 0, costos: 0 };
    if (it.tipo_unidad_venta === "caja") actual.cajas += it.cantidad;
    actual.ingresos += it.ventas_netas;
    actual.costos += it.cmv;
    porGrupo.set(k, actual);
  }

  const produccionPorProductoEnPeriodo = new Map<string, number>();
  for (const p of data.produccion) {
    if (p.fecha < desde || p.fecha > hasta) continue;
    const variante = data.producto_variantes.find((v) => v.id === p.producto_variante_id);
    if (!variante) continue;
    produccionPorProductoEnPeriodo.set(variante.producto_id, (produccionPorProductoEnPeriodo.get(variante.producto_id) ?? 0) + p.cantidad);
  }

  const stockPorProducto = new Map<string, number>();
  for (const v of data.producto_variantes) {
    stockPorProducto.set(v.producto_id, (stockPorProducto.get(v.producto_id) ?? 0) + calcularStock(data, "producto_variante", v.id));
  }

  return [...porGrupo.values()]
    .map((g) => {
      const producto = data.productos.find((p) => p.id === g.producto_id);
      return {
        producto_id: g.producto_id,
        producto_nombre: producto?.nombre ?? "(producto eliminado)",
        linea: producto?.linea ?? "",
        canal: g.canal,
        cajas_vendidas: g.cajas,
        cajas_producidas: produccionPorProductoEnPeriodo.get(g.producto_id) ?? 0,
        ingresos: Math.round(g.ingresos),
        costos: Math.round(g.costos),
        precio_promedio: g.cajas > 0 ? Math.round(g.ingresos / g.cajas) : 0,
        stock_actual: stockPorProducto.get(g.producto_id) ?? 0,
      };
    })
    .sort((a, b) => b.ingresos - a.ingresos);
}

export function productosATSV(filas: FilaResumenProducto[]): string {
  return tsv(
    ["Producto", "Línea", "Canal", "Cajas vendidas", "Cajas producidas", "Ingresos", "Costos", "Precio promedio", "Stock actual"],
    filas.map((f) => [f.producto_nombre, f.linea, f.canal, f.cajas_vendidas, f.cajas_producidas, f.ingresos, f.costos, f.precio_promedio, f.stock_actual])
  );
}

// --- 2) Reparto por zona --------------------------------------------------------------------------

export interface FilaRepartoZona {
  zona: string;
  pedidos: number;
  cobrado: number;
  costo_real: number;
  diferencia: number;
}

export function resumenRepartoPorZonaSheets(data: RicordoDataV2, desde: string, hasta: string): FilaRepartoZona[] {
  const pedidos = data.pedidos.filter((p) => p.estado === "Entregado" && p.fecha >= desde && p.fecha <= hasta && p.costo_envio > 0);
  const porZona = new Map<string, FilaRepartoZona>();
  for (const p of pedidos) {
    const zona = p.zona?.trim() || "(sin zona)";
    const actual = porZona.get(zona) ?? { zona, pedidos: 0, cobrado: 0, costo_real: 0, diferencia: 0 };
    const diferencia = diferenciaRepartoPedido(p);
    actual.pedidos += 1;
    actual.cobrado += p.costo_envio;
    actual.costo_real += p.costo_envio + diferencia;
    actual.diferencia += diferencia;
    porZona.set(zona, actual);
  }
  return [...porZona.values()]
    .map((z) => ({ ...z, cobrado: Math.round(z.cobrado), costo_real: Math.round(z.costo_real), diferencia: Math.round(z.diferencia) }))
    .sort((a, b) => b.cobrado - a.cobrado);
}

export function repartoZonaATSV(filas: FilaRepartoZona[]): string {
  return tsv(
    ["Zona", "Pedidos", "Cobrado", "Costo real", "Diferencia"],
    filas.map((f) => [f.zona, f.pedidos, f.cobrado, f.costo_real, f.diferencia])
  );
}

// --- 3) Gastos del mes por categoría, más envíos ---------------------------------------------------
// Las categorías "Costo Indirecto — Reparto…" (diferencia de envío al entregar, viaje de compra a
// Berazategui) se dejan afuera del desglose por categoría: ya están representadas en la fila de
// envíos (reparto) de abajo — contarlas también acá las duplicaría.

const PREFIJO_CATEGORIA_REPARTO = "Costo Indirecto — Reparto";
const PREFIJOS_GASTO_RESUMEN = ["Costo Fijo — ", "Costo Indirecto — ", "Gasto Operativo — ", "Gastos Financieros — "];

export interface FilaGastoCategoria {
  categoria: string;
  monto: number;
}

export interface ResumenGastos {
  categorias: FilaGastoCategoria[];
  envios: { cobrado: number; costo_real: number; diferencia: number };
}

export function resumenGastosSheets(data: RicordoDataV2, desde: string, hasta: string): ResumenGastos {
  const nombreCategoria = (id: string | undefined) => data.categorias.find((c) => c.id === id)?.nombre ?? "(sin categoría)";
  const gastos = data.movimientos_financieros.filter((m) => {
    if (m.fecha < desde || m.fecha > hasta) return false;
    const nombre = nombreCategoria(m.categoria_id);
    return PREFIJOS_GASTO_RESUMEN.some((p) => nombre.startsWith(p)) && !nombre.startsWith(PREFIJO_CATEGORIA_REPARTO);
  });
  const porCategoria = new Map<string, number>();
  for (const g of gastos) {
    const nombre = nombreCategoria(g.categoria_id);
    porCategoria.set(nombre, (porCategoria.get(nombre) ?? 0) + g.monto);
  }
  const categorias = [...porCategoria.entries()]
    .map(([categoria, monto]) => ({ categoria, monto: Math.round(monto) }))
    .sort((a, b) => b.monto - a.monto);

  const pedidos = data.pedidos.filter((p) => p.estado === "Entregado" && p.fecha >= desde && p.fecha <= hasta && p.costo_envio > 0);
  const cobrado = Math.round(pedidos.reduce((acc, p) => acc + p.costo_envio, 0));
  const costo_real = Math.round(pedidos.reduce((acc, p) => acc + (p.costo_real_envio ?? p.costo_envio), 0));

  return { categorias, envios: { cobrado, costo_real, diferencia: costo_real - cobrado } };
}

export function gastosATSV(r: ResumenGastos): string {
  const filas = r.categorias.map((f) => [f.categoria, f.monto]);
  filas.push(["Envíos — cobrado", r.envios.cobrado]);
  filas.push(["Envíos — costo real", r.envios.costo_real]);
  filas.push(["Envíos — diferencia", r.envios.diferencia]);
  return tsv(["Categoría", "Monto"], filas);
}

// --- 4) Recetas (insumos de relleno) para el batch de compras ---------------------------------------
// Cuánto insumo de la etapa "relleno" hace falta según lo realmente vendido (Entregado) en el
// período — nunca una proyección inventada, es consumo real ya ocurrido más stock actual, para
// decidir cuánto comprar.

export interface FilaRecetaRelleno {
  insumo_id: string;
  insumo_nombre: string;
  unidad: string;
  cantidad_necesaria: number;
  stock_actual: number;
  faltante: number;
}

export function resumenRecetasRellenoSheets(data: RicordoDataV2, desde: string, hasta: string): FilaRecetaRelleno[] {
  const pedidosPeriodo = new Set(data.pedidos.filter((p) => p.estado === "Entregado" && p.fecha >= desde && p.fecha <= hasta).map((p) => p.id));
  const itemsPeriodo = data.pedido_items.filter((i) => pedidosPeriodo.has(i.pedido_id));

  const necesarioPorInsumo = new Map<string, number>();
  for (const item of itemsPeriodo) {
    if (!item.producto_variante_id) continue;
    const variante = data.producto_variantes.find((v) => v.id === item.producto_variante_id);
    if (!variante) continue;
    const relleno = recetaEfectivaVariante(data, variante).filter((r) => r.etapa === "relleno");
    for (const r of relleno) {
      necesarioPorInsumo.set(r.insumo_id, (necesarioPorInsumo.get(r.insumo_id) ?? 0) + r.cantidad * item.cantidad);
    }
  }

  return [...necesarioPorInsumo.entries()]
    .map(([insumo_id, cantidad_necesaria]) => {
      const insumo = data.insumos.find((i) => i.id === insumo_id);
      const stock_actual = calcularStock(data, "insumo", insumo_id);
      return {
        insumo_id,
        insumo_nombre: insumo?.nombre ?? "(insumo eliminado)",
        unidad: insumo?.unidad ?? "",
        cantidad_necesaria: Math.round(cantidad_necesaria * 100) / 100,
        stock_actual: Math.round(stock_actual * 100) / 100,
        faltante: Math.max(0, Math.round((cantidad_necesaria - stock_actual) * 100) / 100),
      };
    })
    .sort((a, b) => b.faltante - a.faltante);
}

export function recetasRellenoATSV(filas: FilaRecetaRelleno[]): string {
  return tsv(
    ["Insumo", "Unidad", "Necesario (vendido en el período)", "Stock actual", "Faltante"],
    filas.map((f) => [f.insumo_nombre, f.unidad, f.cantidad_necesaria, f.stock_actual, f.faltante])
  );
}
