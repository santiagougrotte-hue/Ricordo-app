// "Exportar a Sheets" (Fase 4) — 4 tablas copiables (TSV) con columnas y orden EXACTOS, pensadas
// para pegarse directo en la Google Sheet de planificación/análisis (que ahora vive fuera de la
// app). Los nombres de columna son el contrato con esa Sheet — no renombrar sin avisar.

import type { RicordoDataV2, EtapaReceta } from "./types-v2";
import {
  recetaEfectivaVariante,
  costoVariante,
  costoManoDeObraVariante,
  calcularStock,
  calcularCuentasPorCobrar,
  calcularCuentasPorPagar,
  totalCobradoPedido,
  saldoCaja,
  sumarDias,
  costoRealEnvioCalculado,
} from "./calc-v2";
import { calcularCuponesMes } from "./analitica-ventas";

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
 * en Inventario → Productos terminados. Solo la línea Pasta se vende de a 12 (sorrentinos,
 * ravioles); el resto (Salsa, Lasaña, Pizza o sin línea) se vende de a 1. */
export function refUnidades(linea: string | undefined): number {
  return linea === "Pasta" ? 12 : 1;
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
      const varianteRefDeCanal = (canal: "Minorista" | "Mayorista") => {
        const activasDelCanal = variantesDelProducto.filter((v) => v.activo && v.canal === canal);
        const exacta = activasDelCanal.find((v) => v.unidades_por_paquete === ref);
        if (exacta) return exacta;
        if (activasDelCanal.length === 0) return undefined;
        console.warn(
          `resumenProductosSheets: "${producto.nombre}" (línea ${producto.linea ?? "sin línea"}) no tiene variante ${canal} activa de ${ref}u — uso "${activasDelCanal[0].nombre}" como referencia.`
        );
        return activasDelCanal[0];
      };
      const varianteMinoristaRef = varianteRefDeCanal("Minorista");
      const varianteMayoristaRef = varianteRefDeCanal("Mayorista");

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

// --- 3) RECETAS_RELLENO / RECETAS_ARMADO (receta vigente, no depende del mes) ----------------------
// El relleno (ej. el ragú de la lasaña, el relleno de calabaza de los sorrentinos) se prepara en
// una tanda grande mensual y se congela — por eso esos insumos quedan afuera de la alerta
// automática de stock (`insumosSoloRelleno`/`calcularAlertasStock` en lib/calc-v2.ts e ia-stock.ts)
// y se planifican acá a mano: `stock_actual` da el punto de partida para calcular cuánto falta
// comprar/preparar según la próxima tanda planeada (cantidad_por_unidad × unidades a producir −
// stock_actual). La masa y el armado de la lasaña (salsa, sardo, mozzarella, láminas) en cambio se
// compran y usan cada semana, el día que se arma — van en una tabla aparte (RECETAS_ARMADO) para
// que la planilla los planifique por separado y no mezcle ambos ritmos.
//
// `destinoItemReceta` es la única fuente de verdad de a qué tabla va cada ítem de receta (o a
// ninguna) — la usan `resumenRecetasRellenoSheets`, `resumenRecetasArmadoSheets` y
// `avisosRecetaNoExportada` por igual, para que las tres nunca puedan quedar desincronizadas:
//   - packaging: nunca se exporta (se planifica por caja/presentación, no acá).
//   - armado: siempre a RECETAS_ARMADO.
//   - masa: en línea Pasta se planea aparte (nunca entra a ningún lado, no es un error); en
//     cualquier otra línea (Lasaña, Pizza, etc.) entra a RECETAS_ARMADO junto con el armado, porque
//     ahí es cuando se arma/compra.
//   - relleno: siempre a RECETAS_RELLENO.
//   - cualquier otra etapa (salsa, terminación, …): si el producto tiene algún ítem en etapa
//     relleno, se asume que la receta ya distingue relleno/armado/otras etapas a propósito, y esto
//     queda sin exportar (probable aviso); si el producto NO tiene ningún ítem en etapa relleno
//     (ej. una salsa de tomate, con una sola etapa), se exporta igual en RECETAS_RELLENO —
//     comportamiento histórico preservado para recetas que nunca separaron relleno de lo demás.
type DestinoItemReceta = "relleno" | "armado" | "sin_exportar" | "excluida";

function destinoItemReceta(linea: string | undefined, etapa: EtapaReceta, tieneRelleno: boolean): DestinoItemReceta {
  if (etapa === "packaging") return "excluida";
  if (etapa === "armado") return "armado";
  if (etapa === "masa") return linea === "Pasta" ? "excluida" : "armado";
  if (etapa === "relleno") return "relleno";
  return tieneRelleno ? "sin_exportar" : "relleno";
}

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

function filaInsumo(data: RicordoDataV2, producto: { id: string; nombre: string }, insumoId: string, cantidad: number): FilaRecetaRelleno {
  const insumo = data.insumos.find((i) => i.id === insumoId);
  return {
    producto_id: producto.id,
    producto: producto.nombre,
    insumo_id: insumoId,
    insumo: insumo?.nombre ?? "(insumo eliminado)",
    cantidad_por_unidad: redondear(cantidad, 5),
    unidad: insumo?.unidad ?? "",
    precio_actual: insumo?.precio_actual ?? 0,
    stock_actual: insumo ? redondear(calcularStock(data, "insumo", insumo.id), 3) : 0,
  };
}

function filasPorDestino(data: RicordoDataV2, destinoBuscado: "relleno" | "armado"): FilaRecetaRelleno[] {
  const filas: FilaRecetaRelleno[] = [];
  for (const producto of data.productos.filter((p) => p.activo)) {
    const receta = data.recetas.find((r) => r.producto_id === producto.id && r.activa);
    if (!receta) continue;
    const itemsDeReceta = data.receta_items.filter((ri) => ri.receta_id === receta.id);
    const tieneRelleno = itemsDeReceta.some((ri) => ri.etapa === "relleno");
    const itemsRelevantes = itemsDeReceta.filter((ri) => destinoItemReceta(producto.linea, ri.etapa, tieneRelleno) === destinoBuscado);
    const cantidadPorInsumo = new Map<string, number>();
    for (const item of itemsRelevantes) {
      cantidadPorInsumo.set(item.insumo_id, (cantidadPorInsumo.get(item.insumo_id) ?? 0) + item.cantidad);
    }
    for (const [insumoId, cantidad] of cantidadPorInsumo) {
      filas.push(filaInsumo(data, producto, insumoId, cantidad));
    }
  }
  return filas;
}

export function resumenRecetasRellenoSheets(data: RicordoDataV2): FilaRecetaRelleno[] {
  return filasPorDestino(data, "relleno");
}

const HEADERS_RECETAS = ["producto_id", "producto", "insumo_id", "insumo", "cantidad_por_unidad", "unidad", "precio_actual", "stock_actual"];

function recetasFilaATSV(f: FilaRecetaRelleno): (string | number)[] {
  return [f.producto_id, f.producto, f.insumo_id, f.insumo, f.cantidad_por_unidad, f.unidad, f.precio_actual, f.stock_actual];
}

export function recetasRellenoATSV(filas: FilaRecetaRelleno[]): string {
  return tsv(HEADERS_RECETAS, filas.map(recetasFilaATSV));
}

/** RECETAS_ARMADO: masa (en líneas que no son Pasta) + armado de cada producto activo — el trabajo
 * semanal de armado/compra, separado del relleno mensual (RECETAS_RELLENO). Mismas 8 columnas y
 * mismo orden que RECETAS_RELLENO. */
export function resumenRecetasArmadoSheets(data: RicordoDataV2): FilaRecetaRelleno[] {
  return filasPorDestino(data, "armado");
}

export function recetasArmadoATSV(filas: FilaRecetaRelleno[]): string {
  return tsv(HEADERS_RECETAS, filas.map(recetasFilaATSV));
}

/** Detecta productos activos con ítems de receta que no salen en NINGUNA de las dos tablas de
 * arriba y que no son packaging ni masa de línea Pasta (esos dos nunca entran a propósito, no son
 * un error) — típicamente, un producto con ingredientes de salsa/terminación cargados que, al
 * tener también un ítem de relleno, quedan afuera en silencio. Casi siempre significa que esos
 * ingredientes tienen que pasar a relleno o a armado, o que la etapa está mal elegida — se muestra
 * como aviso, nunca se corrige sola. */
export interface AvisoRecetaNoExportada {
  producto_id: string;
  producto: string;
  linea: string;
  etapa: EtapaReceta;
  cantidad: number;
}

export function avisosRecetaNoExportada(data: RicordoDataV2): AvisoRecetaNoExportada[] {
  const avisos: AvisoRecetaNoExportada[] = [];
  for (const producto of data.productos.filter((p) => p.activo)) {
    const receta = data.recetas.find((r) => r.producto_id === producto.id && r.activa);
    if (!receta) continue;
    const itemsDeReceta = data.receta_items.filter((ri) => ri.receta_id === receta.id);
    const tieneRelleno = itemsDeReceta.some((ri) => ri.etapa === "relleno");
    const porEtapa = new Map<EtapaReceta, number>();
    for (const item of itemsDeReceta) {
      if (destinoItemReceta(producto.linea, item.etapa, tieneRelleno) !== "sin_exportar") continue;
      porEtapa.set(item.etapa, (porEtapa.get(item.etapa) ?? 0) + 1);
    }
    for (const [etapa, cantidad] of porEtapa) {
      avisos.push({ producto_id: producto.id, producto: producto.nombre, linea: producto.linea ?? "", etapa, cantidad });
    }
  }
  return avisos;
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

// --- 7) CUPONES_MES ---------------------------------------------------------------------------
// Una fila por cada código de cupón / tipo de descuento usado en el mes (lo que manda la web de
// pedidos) — reusa `calcularCuponesMes` (lib/analitica-ventas.ts), la misma cuenta que ya muestra
// Ventas → Analítica, para que nunca se desincronicen.

export interface FilaCuponMes {
  mes: string;
  cupon_codigo: string;
  tipo_descuento: string;
  pedidos: number;
  total_descuento: number;
  total_vendido: number;
}

export function resumenCuponesMesSheets(data: RicordoDataV2, mes: string): FilaCuponMes[] {
  const { mesCol, desde, hasta } = rangoMes(mes);
  return calcularCuponesMes(data, desde, hasta).map((c) => ({ mes: mesCol, ...c }));
}

// --- 8) FLUJO_CAJA_SEMANAL -------------------------------------------------------------------------
// Se exporta cada viernes, para planificar la semana — a diferencia de las tablas de arriba (mes
// cerrado, una vez por mes) esto es una foto de HOY de la caja y lo que falta cobrar/pagar,
// repartido en 8 semanas desde el lunes de la semana actual. Nunca se suma dos veces por pegarse
// de nuevo: siempre reemplaza (se pega ENCIMA) la foto anterior.

function lunesDeSemana(fechaIso: string): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  const dow = d.getDay(); // 0 = domingo … 6 = sábado
  const offsetHastaLunes = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offsetHastaLunes);
  return d.toISOString().slice(0, 10);
}

function fechaDDMMAAAA(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

export interface FilaFlujoCajaSemanal {
  semana_desde: string;
  saldo_caja_hoy: number | "";
  por_cobrar: number;
  pedidos_a_cobrar: number;
  por_pagar: number;
}

/** 8 filas, una por semana, empezando el lunes de la semana de `hoy`. Lo vencido (o sin fecha
 * propia a futuro) siempre cae en la primera fila — nunca se pierde un faltante real por quedar
 * fuera de las 8 semanas que se muestran; si una fecha cae más allá de la octava semana, se agrupa
 * en la última en vez de abrir una fila 9 (la Sheet solo tiene 8 filas de destino). */
export function resumenFlujoCajaSemanalSheets(data: RicordoDataV2, hoy: string): FilaFlujoCajaSemanal[] {
  const lunes0 = lunesDeSemana(hoy);
  const semanas = Array.from({ length: 8 }, (_, i) => sumarDias(lunes0, i * 7));

  function indiceSemana(fecha: string): number {
    if (fecha < semanas[0]) return 0;
    let idx = 0;
    for (let i = 0; i < semanas.length; i++) {
      if (fecha >= semanas[i]) idx = i;
    }
    return idx;
  }

  const porCobrar = new Array(8).fill(0);
  for (const c of calcularCuentasPorCobrar(data, hoy)) {
    const fechaEfectiva = c.fecha_vencimiento ?? sumarDias(c.fecha, 7);
    porCobrar[indiceSemana(fechaEfectiva)] += c.saldo;
  }

  const porPagar = new Array(8).fill(0);
  for (const c of calcularCuentasPorPagar(data, hoy)) {
    const fechaEfectiva = c.fecha_vencimiento ?? sumarDias(c.fecha, 7);
    porPagar[indiceSemana(fechaEfectiva)] += c.saldo;
  }

  const pedidosACobrar = new Array(8).fill(0);
  for (const p of data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion")) {
    const saldo = Math.round(p.total - totalCobradoPedido(data, p.id));
    if (saldo <= 0) continue;
    const idx = p.fecha < hoy ? 0 : indiceSemana(p.fecha);
    pedidosACobrar[idx] += saldo;
  }

  const saldo = saldoCaja(data);
  return semanas.map((semanaDesde, i) => ({
    semana_desde: fechaDDMMAAAA(semanaDesde),
    saldo_caja_hoy: i === 0 ? Math.round(saldo) : "",
    por_cobrar: Math.round(porCobrar[i]),
    pedidos_a_cobrar: Math.round(pedidosACobrar[i]),
    por_pagar: Math.round(porPagar[i]),
  }));
}

export function flujoCajaSemanalATSV(filas: FilaFlujoCajaSemanal[]): string {
  return tsv(
    ["semana_desde", "saldo_caja_hoy", "por_cobrar", "pedidos_a_cobrar", "por_pagar"],
    filas.map((f) => [f.semana_desde, f.saldo_caja_hoy, f.por_cobrar, f.pedidos_a_cobrar, f.por_pagar])
  );
}

// --- IMPORT_APP: export único para las planillas "Ricordo · Finanzas" y "Ricordo · Productos y
// compras" ------------------------------------------------------------------------------------------
// Una sola tabla, un renglón por evento, desde la fecha de inicio del análisis. Se copia entera cada
// semana y se pega en Finanzas → IMPORT_APP, celda A1, reemplazando lo anterior (no se acumula: cada
// export ya trae todo el historial desde la fecha de inicio). Los nombres y el orden de las columnas
// son el contrato con esas dos planillas — no cambiarlos sin cambiar las planillas.

export const HEADERS_IMPORT_APP = [
  "Tipo", "Fecha", "Referencia", "Contraparte", "Canal", "Producto_ID", "Producto", "Variante", "Formato_u",
  "Item_ID", "Item", "Clase", "Cantidad", "Unidad", "Precio_unit", "Importe_bruto", "Descuento", "Importe_neto",
  "Costo_masa", "Costo_relleno", "Costo_packaging", "Costo_MO", "Envio_cobrado", "Envio_costo", "Km", "Medio_pago",
  "Stock_minimo", "Cajas_que_rinde",
] as const;

/** Decimales por columna: cantidades de receta y stock necesitan más precisión que los montos. */
export const DECIMALES_IMPORT_APP = decimalesPorColumna(HEADERS_IMPORT_APP.length, { 12: 5, 14: 2, 26: 3, 27: 1 });

type FilaImport = Partial<Record<(typeof HEADERS_IMPORT_APP)[number], string | number>>;

/** Fecha desde la que arranca el export: la del saldo inicial de caja o la de corte del CMV. */
export function fechaInicioImportApp(data: RicordoDataV2): string {
  return data.configuracion.fecha_saldo_inicial_caja ?? data.configuracion.fecha_corte_cmv ?? "";
}

/** Clase de un insumo para las planillas: packaging, masa (todo lo de stock controlado que no es
 * packaging = control semanal), relleno (se usa en recetas pero no lleva stock) u otro. */
export function claseInsumoImport(data: RicordoDataV2, insumoId: string): "masa" | "relleno" | "packaging" | "otro" {
  const insumo = data.insumos.find((i) => i.id === insumoId);
  if (!insumo) return "otro";
  if (insumo.tipo === "packaging") return "packaging";
  if (insumo.controla_stock) return "masa";
  return data.receta_items.some((r) => r.insumo_id === insumoId) ? "relleno" : "otro";
}

function etapaImport(etapa: EtapaReceta): "masa" | "relleno" | "packaging" {
  if (etapa === "relleno") return "relleno";
  if (etapa === "packaging") return "packaging";
  return "masa";
}

function costoPorEtapaVariante(data: RicordoDataV2, varianteId: string): Record<"masa" | "relleno" | "packaging", number> {
  const out = { masa: 0, relleno: 0, packaging: 0 };
  const variante = data.producto_variantes.find((v) => v.id === varianteId);
  if (!variante) return out;
  for (const item of recetaEfectivaVariante(data, variante)) {
    const insumo = data.insumos.find((i) => i.id === item.insumo_id);
    out[etapaImport(item.etapa)] += item.cantidad * (insumo?.precio_actual ?? 0);
  }
  return out;
}

export function resumenImportApp(data: RicordoDataV2, desde: string = fechaInicioImportApp(data), hoy: string = new Date().toISOString().slice(0, 10)): (string | number)[][] {
  const filas: FilaImport[] = [];
  const enRango = (fecha: string) => !desde || fecha >= desde;
  const nombreCliente = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "";
  const producto = (id: string) => data.productos.find((p) => p.id === id);

  // VENTA (un renglón por ítem) + PEDIDO (uno por pedido)
  for (const p of [...data.pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!enRango(p.fecha) || p.estado === "Cancelado") continue;
    const items = data.pedido_items.filter((i) => i.pedido_id === p.id);
    const brutoPedido = items.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
    const descuentoPedido = p.descuento ?? 0;
    for (const i of items) {
      const bruto = i.precio_unitario * i.cantidad;
      const descuento = (i.descuento ?? 0) + (brutoPedido > 0 ? (descuentoPedido * bruto) / brutoPedido : 0);
      const variante = i.producto_variante_id ? data.producto_variantes.find((v) => v.id === i.producto_variante_id) : undefined;
      const base: FilaImport = {
        Tipo: "VENTA", Fecha: p.fecha, Referencia: p.id, Contraparte: nombreCliente(p.cliente_id), Canal: p.canal,
        Clase: p.estado, Cantidad: i.cantidad, Precio_unit: i.precio_unitario, Importe_bruto: Math.round(bruto),
        Descuento: Math.round(descuento), Importe_neto: Math.round(bruto - descuento), Medio_pago: p.metodo_pago ?? "",
        Item: i.nombre_historico,
      };
      if (variante) {
        const etapas = costoPorEtapaVariante(data, variante.id);
        const totalReceta = etapas.masa + etapas.relleno + etapas.packaging;
        // Respeta el costo congelado al vender; la receta actual solo reparte ese costo por etapa.
        const k = i.costo_unitario_historico != null && totalReceta > 0 ? i.costo_unitario_historico / totalReceta : 1;
        const mo = i.mano_obra_unitaria_historica ?? costoManoDeObraVariante(data, variante.id);
        filas.push({
          ...base, Producto_ID: variante.producto_id, Producto: producto(variante.producto_id)?.nombre ?? "",
          Variante: variante.nombre.trim(), Formato_u: variante.unidades_por_paquete ?? 1, Item_ID: variante.id,
          Unidad: (variante.unidades_por_paquete ?? 1) > 1 ? "caja" : "unidad",
          Costo_masa: Math.round(etapas.masa * k * i.cantidad), Costo_relleno: Math.round(etapas.relleno * k * i.cantidad),
          Costo_packaging: Math.round(etapas.packaging * k * i.cantidad), Costo_MO: Math.round(mo * i.cantidad),
        });
      } else {
        filas.push({
          ...base, Producto_ID: "SIN-CATALOGO", Producto: i.nombre_historico, Variante: i.nombre_historico, Formato_u: 12,
          Item_ID: i.producto_variante_id ?? "", Unidad: "caja", Costo_relleno: Math.round((i.costo_unitario_historico ?? 0) * i.cantidad),
        });
      }
    }
    const km = p.km_envio ?? 0;
    const costoEnvio = p.costo_real_envio ?? (km > 0 ? costoRealEnvioCalculado(data, km, p.peaje_envio ?? 0) : 0);
    filas.push({
      Tipo: "PEDIDO", Fecha: p.fecha, Referencia: p.id, Contraparte: nombreCliente(p.cliente_id), Canal: p.canal, Clase: p.estado,
      Item: p.zona ?? "", Cantidad: items.length, Importe_bruto: Math.round(brutoPedido),
      Descuento: Math.round(descuentoPedido + items.reduce((acc, i) => acc + (i.descuento ?? 0), 0)), Importe_neto: Math.round(p.total),
      Envio_cobrado: Math.round(p.costo_envio ?? 0), Envio_costo: Math.round(costoEnvio), Km: km, Medio_pago: p.metodo_pago ?? "",
    });
  }

  // COMPRA (un renglón por ítem)
  for (const c of [...data.compras].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!enRango(c.fecha)) continue;
    const proveedor = data.proveedores.find((p) => p.id === c.proveedor_id)?.nombre ?? "";
    for (const it of data.compra_items.filter((x) => x.compra_id === c.id)) {
      const insumo = data.insumos.find((i) => i.id === it.insumo_id);
      filas.push({
        Tipo: "COMPRA", Fecha: c.fecha, Referencia: c.id, Contraparte: proveedor, Item_ID: it.insumo_id, Item: insumo?.nombre.trim() ?? "",
        Clase: claseInsumoImport(data, it.insumo_id), Cantidad: it.cantidad, Unidad: (it.unidad ?? insumo?.unidad ?? "").trim(),
        Precio_unit: it.precio_unitario, Importe_bruto: Math.round(it.subtotal), Importe_neto: Math.round(it.subtotal), Medio_pago: c.metodo_pago ?? "",
      });
    }
  }

  // CAJA (todos los movimientos de dinero confirmados)
  for (const m of [...data.movimientos_financieros].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!enRango(m.fecha) || m.estado !== "confirmado" || m.tipo === "transferencia") continue;
    const categoria = data.categorias.find((c) => c.id === m.categoria_id)?.nombre ?? "";
    let item: string;
    if (m.tipo === "ingreso") item = m.origen_tipo === "venta_pedido" ? "Cobro de venta" : "Otro ingreso";
    else if (m.origen_tipo === "compra_pago") item = "Pago de compra";
    else if (m.origen_tipo === "ajuste_saldo") item = "Ajuste de saldo";
    else if (categoria.includes("Sueldo")) item = "Retiro de sueldo";
    else if (/Fijo|Alquiler|Amortiz/.test(categoria)) item = "Costo fijo";
    else item = "Otro egreso";
    filas.push({
      Tipo: "CAJA", Fecha: m.fecha, Referencia: m.origen_id ?? m.id, Contraparte: m.concepto, Item: item,
      Clase: m.tipo === "ingreso" ? "Ingreso" : "Egreso", Importe_bruto: Math.round(m.monto), Importe_neto: Math.round(m.monto), Medio_pago: m.metodo_pago ?? "",
    });
  }

  // PRODUCCION (cajas armadas)
  for (const pr of [...data.produccion].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!enRango(pr.fecha)) continue;
    const v = data.producto_variantes.find((x) => x.id === pr.producto_variante_id);
    filas.push({
      Tipo: "PRODUCCION", Fecha: pr.fecha, Referencia: pr.id, Producto_ID: v?.producto_id ?? pr.producto_variante_id,
      Producto: v ? producto(v.producto_id)?.nombre ?? "" : "", Variante: v?.nombre.trim() ?? "", Formato_u: v?.unidades_por_paquete ?? 12,
      Cantidad: pr.cantidad, Unidad: "caja", Item: pr.kg_relleno ? `${pr.kg_relleno} kg de relleno` : "",
    });
  }

  // RELLENO (tandas de relleno cocido, en kilos)
  const gRelleno = data.configuracion.gramos_relleno_por_unidad && data.configuracion.gramos_relleno_por_unidad > 0 ? data.configuracion.gramos_relleno_por_unidad : 13;
  for (const r of [...(data.rellenos_cocidos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!enRango(r.fecha)) continue;
    filas.push({
      Tipo: "RELLENO", Fecha: r.fecha, Referencia: r.id, Producto_ID: r.producto_id, Producto: producto(r.producto_id)?.nombre ?? "",
      Cantidad: r.kg, Unidad: "kg", Cajas_que_rinde: Math.floor(r.kg / ((gRelleno * 12) / 1000)),
    });
  }

  // STOCK (foto de hoy de los insumos de control semanal: masa y packaging)
  for (const insumo of data.insumos) {
    if (!insumo.activo) continue;
    const clase = claseInsumoImport(data, insumo.id);
    if (clase !== "masa" && clase !== "packaging") continue;
    if (clase === "masa" && !insumo.controla_stock) continue;
    filas.push({
      Tipo: "STOCK", Fecha: hoy, Item_ID: insumo.id, Item: insumo.nombre.trim(), Clase: clase,
      Cantidad: Math.max(0, redondear(calcularStock(data, "insumo", insumo.id), 3)), Unidad: insumo.unidad.trim(),
      Precio_unit: insumo.precio_actual, Stock_minimo: insumo.stock_minimo ?? "",
    });
  }

  // RECETA (consumo por paquete de la variante minorista de cada producto activo)
  for (const p of data.productos.filter((x) => x.activo)) {
    const variantes = data.producto_variantes.filter((v) => v.producto_id === p.id && v.activo);
    const v = variantes.find((x) => x.canal === "Minorista") ?? variantes[0];
    if (!v) continue;
    const porInsumo = new Map<string, { etapa: "masa" | "relleno" | "packaging"; cantidad: number }>();
    for (const item of recetaEfectivaVariante(data, v)) {
      const etapa = etapaImport(item.etapa);
      const key = `${etapa}|${item.insumo_id}`;
      const prev = porInsumo.get(key);
      porInsumo.set(key, { etapa, cantidad: (prev?.cantidad ?? 0) + item.cantidad });
    }
    for (const [key, { etapa, cantidad }] of [...porInsumo.entries()].sort()) {
      if (cantidad <= 0) continue;
      const insumoId = key.split("|")[1];
      const insumo = data.insumos.find((i) => i.id === insumoId);
      filas.push({
        Tipo: "RECETA", Fecha: hoy, Producto_ID: p.id, Producto: p.nombre, Variante: v.nombre.trim(), Formato_u: v.unidades_por_paquete ?? 1,
        Item_ID: insumoId, Item: insumo?.nombre.trim() ?? "", Clase: etapa, Cantidad: redondear(cantidad, 5),
        Unidad: (insumo?.unidad ?? "").trim(), Precio_unit: insumo?.precio_actual ?? 0,
      });
    }
  }

  return filas.map((f) => HEADERS_IMPORT_APP.map((h) => f[h] ?? ""));
}
