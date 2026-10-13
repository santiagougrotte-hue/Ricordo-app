// "Exportar a Sheets" (Fase 4) — 4 tablas copiables (TSV) con columnas y orden EXACTOS, pensadas
// para pegarse directo en la Google Sheet de planificación/análisis (que ahora vive fuera de la
// app). Los nombres de columna son el contrato con esa Sheet — no renombrar sin avisar.

import type { RicordoDataV2 } from "./types-v2";
import { recetaEfectivaVariante, costoVariante, costoManoDeObraVariante, calcularStock } from "./calc-v2";

function redondear(n: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(n * factor) / factor;
}

function tsv(headers: string[], filas: (string | number)[][]): string {
  const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  const celda = (c: string | number) => (typeof c === "number" ? num(c) : c);
  const linea = (celdas: (string | number)[]) => celdas.map(celda).join("\t");
  return [linea(headers), ...filas.map(linea)].join("\n");
}

// --- Separador decimal / formato de celdas ("Exportar a Sheets", componente ResumenSheets.tsx) ---
// Google Sheets en configuración regional Argentina espera coma como separador decimal — con
// punto, "0.03" se pega como texto y "8.11" se interpreta como fecha. Cada tabla define cuántos
// decimales usa por columna (2 por default, con overrides puntuales — ej. 5 para
// cantidad_por_unidad, 3 para stock_actual) para no perder cantidades chicas en el redondeo.
export type SeparadorDecimal = "coma" | "punto";

/** Redondea a `decimales`, saca ceros finales innecesarios (0,500 → 0,5) y usa el separador
 * elegido — nunca re-redondea a una precisión menor que la que ya trae el dato. */
export function formatearNumero(valor: number, decimales: number, separador: SeparadorDecimal): string {
  const factor = 10 ** decimales;
  const redondeado = Math.round(valor * factor) / factor;
  let texto = redondeado.toFixed(decimales);
  if (texto.includes(".")) texto = texto.replace(/0+$/, "").replace(/\.$/, "");
  if (texto === "-0") texto = "0";
  return separador === "coma" ? texto.replace(".", ",") : texto;
}

export function celdaTexto(c: string | number, decimales: number, separador: SeparadorDecimal): string {
  if (typeof c !== "number") return c;
  return formatearNumero(c, decimales, separador);
}

/** Decimales por columna para una tabla — 2 por default, con los overrides puntuales que pida
 * cada una (ej. {4: 5, 7: 3} en RECETAS_RELLENO). */
export function decimalesPorColumna(totalColumnas: number, overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: totalColumnas }, (_, i) => overrides[i] ?? 2);
}

/** `mes` en formato AAAA-MM → {mesCol: "AAAA-MM-01", desde, hasta} del mes calendario completo. */
function rangoMes(mes: string): { mesCol: string; desde: string; hasta: string } {
  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(anio, m, 0).getDate();
  return { mesCol: `${mes}-01`, desde: `${mes}-01`, hasta: `${mes}-${String(ultimoDia).padStart(2, "0")}` };
}

/** Cuántas unidades sueltas representa "una caja" de referencia para cada línea de catálogo —
 * usado para mostrar el stock compartido por producto (ver TipoItemStock) en términos legibles de
 * "cajas", ya que se guarda siempre en unidades sueltas. Exportada para reusar el mismo criterio
 * en Inventario → Productos terminados. */
export function refUnidades(linea: string | undefined): number {
  return linea === "Salsa" ? 1 : 12;
}

// --- 1) RESUMEN_PRODUCTOS -------------------------------------------------------------------------

export interface FilaResumenProducto {
  mes: string;
  producto_id: string;
  producto: string;
  linea: string;
  unidades_por_caja_ref: number;
  cajas_eq_minorista: number;
  cajas_eq_mayorista: number;
  cajas_eq_total: number;
  ingresos_minorista: number;
  ingresos_mayorista: number;
  descuentos_total: number;
  costo_insumos_caja_ref: number;
  costo_mo_caja_ref: number;
  costo_total_caja_ref: number;
  precio_minorista_caja_ref: number;
  precio_mayorista_caja_ref: number;
  stock_terminado_cajas_eq: number;
  cajas_producidas_eq: number;
}

export function resumenProductosSheets(data: RicordoDataV2, mes: string): FilaResumenProducto[] {
  const { mesCol, desde, hasta } = rangoMes(mes);
  const pedidosDelMes = new Map(
    data.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta && p.estado !== "Cancelado").map((p) => [p.id, p.canal])
  );
  const itemsDelMes = data.pedido_items.filter((i) => pedidosDelMes.has(i.pedido_id));
  const variantePorId = new Map(data.producto_variantes.map((v) => [v.id, v]));

  return data.productos
    .filter((p) => p.activo)
    .map((producto) => {
      const ref = refUnidades(producto.linea);
      let cajas_eq_minorista = 0;
      let cajas_eq_mayorista = 0;
      let ingresos_minorista = 0;
      let ingresos_mayorista = 0;
      let descuentos_total = 0;

      for (const item of itemsDelMes) {
        if (!item.producto_variante_id) continue;
        const variante = variantePorId.get(item.producto_variante_id);
        if (!variante || variante.producto_id !== producto.id) continue;
        const canal = pedidosDelMes.get(item.pedido_id);
        const unidades = item.cantidad * (variante.unidades_por_paquete ?? 0);
        const cajasEq = unidades / ref;
        if (canal === "Minorista") {
          cajas_eq_minorista += cajasEq;
          ingresos_minorista += item.subtotal;
        } else if (canal === "Mayorista") {
          cajas_eq_mayorista += cajasEq;
          ingresos_mayorista += item.subtotal;
        }
        descuentos_total += item.descuento;
      }

      const variantesDelProducto = data.producto_variantes.filter((v) => v.producto_id === producto.id);
      const varianteMinoristaRef = variantesDelProducto.find((v) => v.activo && v.canal === "Minorista" && v.unidades_por_paquete === ref);
      const varianteMayoristaRef = variantesDelProducto.find((v) => v.activo && v.canal === "Mayorista" && v.unidades_por_paquete === ref);

      let costo_insumos_caja_ref = 0;
      if (varianteMinoristaRef) {
        costo_insumos_caja_ref = recetaEfectivaVariante(data, varianteMinoristaRef).reduce((acc, it) => {
          const insumo = data.insumos.find((i) => i.id === it.insumo_id);
          return acc + it.cantidad * (insumo?.precio_actual ?? 0);
        }, 0);
      }
      const costo_mo_caja_ref = varianteMinoristaRef ? costoManoDeObraVariante(data, varianteMinoristaRef.id) : 0;

      const stockUnidades = calcularStock(data, "producto", producto.id);

      const produccionDelMes = data.produccion.filter((pr) => pr.fecha >= desde && pr.fecha <= hasta);
      const unidadesProducidas = produccionDelMes.reduce((acc, pr) => {
        const variante = variantePorId.get(pr.producto_variante_id);
        if (!variante || variante.producto_id !== producto.id) return acc;
        return acc + pr.cantidad * (variante.unidades_por_paquete ?? 0);
      }, 0);

      return {
        mes: mesCol,
        producto_id: producto.id,
        producto: producto.nombre,
        linea: producto.linea ?? "",
        unidades_por_caja_ref: ref,
        cajas_eq_minorista: Math.round(cajas_eq_minorista * 100) / 100,
        cajas_eq_mayorista: Math.round(cajas_eq_mayorista * 100) / 100,
        cajas_eq_total: Math.round((cajas_eq_minorista + cajas_eq_mayorista) * 100) / 100,
        ingresos_minorista: Math.round(ingresos_minorista),
        ingresos_mayorista: Math.round(ingresos_mayorista),
        descuentos_total: Math.round(descuentos_total),
        costo_insumos_caja_ref: Math.round(costo_insumos_caja_ref),
        costo_mo_caja_ref: Math.round(costo_mo_caja_ref),
        costo_total_caja_ref: Math.round(costo_insumos_caja_ref + costo_mo_caja_ref),
        precio_minorista_caja_ref: varianteMinoristaRef?.precio_venta ?? 0,
        precio_mayorista_caja_ref: varianteMayoristaRef?.precio_venta ?? 0,
        stock_terminado_cajas_eq: Math.round((stockUnidades / ref) * 100) / 100,
        cajas_producidas_eq: Math.round((unidadesProducidas / ref) * 100) / 100,
      };
    });
}

export function productosATSV(filas: FilaResumenProducto[]): string {
  return tsv(
    [
      "mes",
      "producto_id",
      "producto",
      "linea",
      "unidades_por_caja_ref",
      "cajas_eq_minorista",
      "cajas_eq_mayorista",
      "cajas_eq_total",
      "ingresos_minorista",
      "ingresos_mayorista",
      "descuentos_total",
      "costo_insumos_caja_ref",
      "costo_mo_caja_ref",
      "costo_total_caja_ref",
      "precio_minorista_caja_ref",
      "precio_mayorista_caja_ref",
      "stock_terminado_cajas_eq",
      "cajas_producidas_eq",
    ],
    filas.map((f) => [
      f.mes,
      f.producto_id,
      f.producto,
      f.linea,
      f.unidades_por_caja_ref,
      f.cajas_eq_minorista,
      f.cajas_eq_mayorista,
      f.cajas_eq_total,
      f.ingresos_minorista,
      f.ingresos_mayorista,
      f.descuentos_total,
      f.costo_insumos_caja_ref,
      f.costo_mo_caja_ref,
      f.costo_total_caja_ref,
      f.precio_minorista_caja_ref,
      f.precio_mayorista_caja_ref,
      f.stock_terminado_cajas_eq,
      f.cajas_producidas_eq,
    ])
  );
}

// --- 2) RESUMEN_GASTOS -----------------------------------------------------------------------------
// Los egresos de las categorías de reparto ("Costo Indirecto — Reparto", "Costo Indirecto — Viajes
// de compra") quedan afuera: van en la Tabla 4 (RESUMEN_REPARTO), contarlos acá también los
// duplicaría.

const CATEGORIAS_REPARTO = new Set(["Costo Indirecto — Reparto", "Costo Indirecto — Viajes de compra"]);

export interface FilaResumenGasto {
  mes: string;
  tipo: "compras_insumos" | "gasto_categoria";
  categoria: string;
  monto: number;
}

export function resumenGastosSheets(data: RicordoDataV2, mes: string): FilaResumenGasto[] {
  const { mesCol, desde, hasta } = rangoMes(mes);
  const nombreCategoria = (id: string | undefined) => data.categorias.find((c) => c.id === id)?.nombre ?? "Sin categoría";

  const comprasDelMes = data.compras.filter((c) => c.fecha >= desde && c.fecha <= hasta);
  const totalCompras = Math.round(comprasDelMes.reduce((acc, c) => acc + c.total, 0));

  const gastos = data.movimientos_financieros.filter((m) => {
    if (m.tipo !== "egreso" || m.estado !== "confirmado" || m.monto <= 0) return false;
    if (m.fecha < desde || m.fecha > hasta) return false;
    if (m.origen_tipo === "compra_pago") return false;
    const nombre = nombreCategoria(m.categoria_id);
    return !CATEGORIAS_REPARTO.has(nombre);
  });
  const porCategoria = new Map<string, number>();
  for (const g of gastos) {
    const nombre = nombreCategoria(g.categoria_id);
    porCategoria.set(nombre, (porCategoria.get(nombre) ?? 0) + g.monto);
  }

  const filas: FilaResumenGasto[] = [{ mes: mesCol, tipo: "compras_insumos", categoria: "Compras de insumos", monto: totalCompras }];
  for (const [categoria, monto] of [...porCategoria.entries()].sort((a, b) => b[1] - a[1])) {
    filas.push({ mes: mesCol, tipo: "gasto_categoria", categoria, monto: Math.round(monto) });
  }
  return filas;
}

export function gastosATSV(filas: FilaResumenGasto[]): string {
  return tsv(
    ["mes", "tipo", "categoria", "monto"],
    filas.map((f) => [f.mes, f.tipo, f.categoria, f.monto])
  );
}

// --- 3) RECETAS_RELLENO (receta vigente, no depende del mes) ---------------------------------------
// El relleno se arma en una tanda grande una vez por mes (a diferencia de masa/packaging, de ritmo
// diario/semanal) — por eso esos insumos quedan afuera de la alerta automática de stock
// (`insumosSoloRelleno`/`calcularAlertasStock` en lib/calc-v2.ts e ia-stock.ts) y se planifican acá
// a mano: `stock_actual` da el punto de partida para calcular cuánto falta comprar/preparar según
// la próxima tanda planeada (cantidad_por_unidad × unidades a producir − stock_actual).
//
// Qué etapas entran depende de la línea del producto: en Pasta, la masa se planifica aparte y el
// packaging no va acá — solo importa el relleno (tanda mensual). En cualquier otra línea (Lasaña,
// Pizza, Salsa, etc.) no hay ese reparto masa/relleno por separado, así que entra la receta
// completa salvo el packaging (que sigue sin planificarse acá, es por caja/presentación). Si el
// mismo insumo aparece en más de una etapa del mismo producto, se suma en una sola fila.

export interface FilaRecetaRelleno {
  producto_id: string;
  producto: string;
  insumo_id: string;
  insumo: string;
  cantidad_por_unidad: number;
  unidad: string;
  precio_actual: number;
  stock_actual: number;
}

export function resumenRecetasRellenoSheets(data: RicordoDataV2): FilaRecetaRelleno[] {
  const filas: FilaRecetaRelleno[] = [];
  for (const producto of data.productos.filter((p) => p.activo)) {
    const receta = data.recetas.find((r) => r.producto_id === producto.id && r.activa);
    if (!receta) continue;
    const esPasta = producto.linea === "Pasta";
    const itemsRelevantes = data.receta_items.filter(
      (ri) => ri.receta_id === receta.id && (esPasta ? ri.etapa === "relleno" : ri.etapa !== "packaging")
    );
    const cantidadPorInsumo = new Map<string, number>();
    for (const item of itemsRelevantes) {
      cantidadPorInsumo.set(item.insumo_id, (cantidadPorInsumo.get(item.insumo_id) ?? 0) + item.cantidad);
    }
    for (const [insumoId, cantidad] of cantidadPorInsumo) {
      const insumo = data.insumos.find((i) => i.id === insumoId);
      filas.push({
        producto_id: producto.id,
        producto: producto.nombre,
        insumo_id: insumoId,
        insumo: insumo?.nombre ?? "(insumo eliminado)",
        cantidad_por_unidad: redondear(cantidad, 5),
        unidad: insumo?.unidad ?? "",
        precio_actual: insumo?.precio_actual ?? 0,
        stock_actual: insumo ? redondear(calcularStock(data, "insumo", insumo.id), 3) : 0,
      });
    }
  }
  return filas;
}

export function recetasRellenoATSV(filas: FilaRecetaRelleno[]): string {
  return tsv(
    ["producto_id", "producto", "insumo_id", "insumo", "cantidad_por_unidad", "unidad", "precio_actual", "stock_actual"],
    filas.map((f) => [f.producto_id, f.producto, f.insumo_id, f.insumo, f.cantidad_por_unidad, f.unidad, f.precio_actual, f.stock_actual])
  );
}

// --- 4) RESUMEN_REPARTO ----------------------------------------------------------------------------
// Una fila por cada zona de la lista fija (ZONAS_ENTREGA) + una fila "Compras Berazategui", aunque
// estén en 0 — para que la Sheet siempre tenga las mismas filas mes a mes.

const ZONAS_ENTREGA = [
  "Zona 1 - Cercana",
  "Zona 2 - Quilmes/Bernal/Wilde",
  "Zona 3 - CABA",
  "Zona 4 - La Plata/City Bell",
  "Viernes - Hudson/Platanos/Ranelagh",
  "Hurlingham",
  "Otro",
] as const;

const CATEGORIA_VIAJES_DE_COMPRA = "Costo Indirecto — Viajes de compra";

export interface FilaResumenReparto {
  mes: string;
  recorrido: string;
  tipo: "Reparto" | "Compras";
  viajes: number;
  km: number;
  litros: number;
  nafta: number;
  peajes: number;
  costo_total: number;
  envios_cobrados: number;
}

export function resumenRepartoSheets(data: RicordoDataV2, mes: string): FilaResumenReparto[] {
  const { mesCol, desde, hasta } = rangoMes(mes);
  const pedidosEntregados = data.pedidos.filter((p) => p.estado === "Entregado" && p.fecha >= desde && p.fecha <= hasta);
  const { litro_nafta, consumo_100km } = data.configuracion.envios;

  const filas: FilaResumenReparto[] = ZONAS_ENTREGA.map((zona) => {
    const pedidosZona = pedidosEntregados.filter((p) => (zona === "Otro" ? !p.zona || p.zona === "Otro" : p.zona === zona));
    const km = pedidosZona.reduce((acc, p) => acc + (p.km_envio ?? 0), 0);
    const litros = (km * consumo_100km) / 100;
    const peajes = pedidosZona.reduce((acc, p) => acc + (p.peaje_envio ?? 0), 0);
    const costo_total = pedidosZona.reduce((acc, p) => acc + (p.costo_real_envio ?? p.costo_envio), 0);
    const envios_cobrados = pedidosZona.reduce((acc, p) => acc + p.costo_envio, 0);
    return {
      mes: mesCol,
      recorrido: zona,
      tipo: "Reparto",
      viajes: pedidosZona.length,
      km: Math.round(km * 100) / 100,
      litros: Math.round(litros * 100) / 100,
      nafta: Math.round(litros * litro_nafta),
      peajes: Math.round(peajes),
      costo_total: Math.round(costo_total),
      envios_cobrados: Math.round(envios_cobrados),
    };
  });

  const nombreCategoria = (id: string | undefined) => data.categorias.find((c) => c.id === id)?.nombre;
  const viajesDeCompra = data.movimientos_financieros.filter(
    (m) => m.tipo === "egreso" && m.estado === "confirmado" && m.fecha >= desde && m.fecha <= hasta && nombreCategoria(m.categoria_id) === CATEGORIA_VIAJES_DE_COMPRA
  );
  filas.push({
    mes: mesCol,
    recorrido: "Compras Berazategui",
    tipo: "Compras",
    viajes: viajesDeCompra.length,
    km: 0,
    litros: 0,
    nafta: 0,
    peajes: 0,
    costo_total: Math.round(viajesDeCompra.reduce((acc, m) => acc + m.monto, 0)),
    envios_cobrados: 0,
  });

  return filas;
}

export function repartoATSV(filas: FilaResumenReparto[]): string {
  return tsv(
    ["mes", "recorrido", "tipo", "viajes", "km", "litros", "nafta", "peajes", "costo_total", "envios_cobrados"],
    filas.map((f) => [f.mes, f.recorrido, f.tipo, f.viajes, f.km, f.litros, f.nafta, f.peajes, f.costo_total, f.envios_cobrados])
  );
}

// --- 5) PRECIOS_FORMATOS ---------------------------------------------------------------------------
// Una fila por cada variante/presentación activa (minorista y mayorista, todos los tamaños de caja),
// aunque no haya tenido ventas en el mes — a diferencia de RESUMEN_PRODUCTOS (que agrupa por
// producto base en "cajas equivalentes"), acá cada presentación real se ve por separado con su
// propio precio y costo. `costo_insumos_paquete`/`costo_mo_paquete`/`costo_total_paquete` son
// exactamente costoVariante/costoManoDeObraVariante — la misma cuenta que ya muestra la pantalla
// Productos → Variantes como "Costo" (con y sin mano de obra), para que nunca se desincronicen.

export interface FilaPrecioFormato {
  mes: string;
  producto_id: string;
  producto: string;
  variante_id: string;
  variante: string;
  canal: string;
  unidades_por_paquete: number;
  precio_venta: number;
  costo_insumos_paquete: number;
  costo_mo_paquete: number;
  costo_total_paquete: number;
  paquetes_vendidos_mes: number;
  descuentos_mes: number;
}

export function resumenPreciosFormatosSheets(data: RicordoDataV2, mes: string): FilaPrecioFormato[] {
  const { mesCol, desde, hasta } = rangoMes(mes);
  const pedidosDelMesIds = new Set(data.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta && p.estado !== "Cancelado").map((p) => p.id));
  const itemsDelMes = data.pedido_items.filter((i) => pedidosDelMesIds.has(i.pedido_id));
  const productoPorId = new Map(data.productos.map((p) => [p.id, p]));

  const filas: FilaPrecioFormato[] = data.producto_variantes
    .filter((v) => v.activo)
    .map((v) => {
      const producto = productoPorId.get(v.producto_id);
      const costoTotal = costoVariante(data, v.id);
      const costoMo = costoManoDeObraVariante(data, v.id);
      const itemsVariante = itemsDelMes.filter((i) => i.producto_variante_id === v.id);
      return {
        mes: mesCol,
        producto_id: v.producto_id,
        producto: producto?.nombre ?? "(producto eliminado)",
        variante_id: v.id,
        variante: v.nombre,
        canal: v.canal ?? "",
        unidades_por_paquete: v.unidades_por_paquete ?? 0,
        precio_venta: v.precio_venta,
        costo_insumos_paquete: costoTotal - costoMo,
        costo_mo_paquete: costoMo,
        costo_total_paquete: costoTotal,
        paquetes_vendidos_mes: itemsVariante.reduce((acc, i) => acc + i.cantidad, 0),
        descuentos_mes: Math.round(itemsVariante.reduce((acc, i) => acc + i.descuento, 0)),
      };
    });

  return filas.sort((a, b) => {
    if (a.producto !== b.producto) return a.producto.localeCompare(b.producto);
    if (a.canal !== b.canal) return a.canal === "Minorista" ? -1 : b.canal === "Minorista" ? 1 : a.canal.localeCompare(b.canal);
    return b.unidades_por_paquete - a.unidades_por_paquete;
  });
}

// --- 6) STOCK_INSUMOS -------------------------------------------------------------------------------
// Foto del stock de materia prima AL MOMENTO de exportar — no depende del mes elegido, igual que
// RECETAS_RELLENO. A diferencia de esa tabla (una fila por combinación producto×insumo, el mismo
// insumo se repite si entra en varias recetas), acá cada insumo con stock controlado aparece UNA
// SOLA VEZ — es el inventario físico, no una receta.

export interface FilaStockInsumo {
  insumo_id: string;
  insumo: string;
  tipo: string;
  categoria: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number | null;
  precio_actual: number;
  valor_stock: number;
  fecha_ultimo_conteo: string;
}

export function resumenStockInsumosSheets(data: RicordoDataV2): FilaStockInsumo[] {
  const filas: FilaStockInsumo[] = data.insumos
    .filter((i) => i.activo && i.controla_stock)
    .map((i) => {
      const stock_actual = redondear(calcularStock(data, "insumo", i.id), 3);
      const valor_stock = stock_actual < 0 ? 0 : Math.round(stock_actual * i.precio_actual);
      const categoria = data.categorias.find((c) => c.id === i.categoria_id)?.nombre ?? "";
      const ultimoConteo = data.inventario_movimientos
        .filter((m) => m.tipo === "conteo" && m.item_tipo === "insumo" && m.item_id === i.id)
        .reduce<string>((max, m) => (m.fecha > max ? m.fecha : max), "");
      return {
        insumo_id: i.id,
        insumo: i.nombre,
        tipo: i.tipo,
        categoria,
        unidad: i.unidad,
        stock_actual,
        stock_minimo: i.stock_minimo ?? null,
        precio_actual: i.precio_actual,
        valor_stock,
        fecha_ultimo_conteo: ultimoConteo,
      };
    });

  return filas.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "ingrediente" ? -1 : 1;
    return a.insumo.localeCompare(b.insumo);
  });
}
