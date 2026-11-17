// Tablero de decisiones de Inicio — capa de cálculo pura sobre funciones que ya existen
// (calcularEerr, calcularMargenPorItem, calcularAlertasStock, calcularFondoReposicion). Responde
// las preguntas que antes se contestaban en las planillas de Sheets:
//   1. ¿Cómo voy este mes? → punto de equilibrio, ritmo de venta acumulado y cuánto falta.
//   2. ¿Qué compro el jueves? → insumos de masa y packaging (control semanal) con cobertura en días.
//   3. ¿Qué producto conviene empujar? → margen de contribución por gusto.
// Nunca inventa un número: si falta un dato (sin ventas para estimar margen, sin consumo para
// estimar cobertura) devuelve null y la pantalla lo dice.

import type { RicordoDataV2 } from "./types-v2";
import {
  calcularEerr,
  calcularMargenPorItem,
  costoVariante,
  costosFijosTotales,
  recetaEfectivaVariante,
  mesAnterior,
  primerDiaMes,
  ultimoDiaMes,
  sumarDias,
} from "./calc-v2";
import { calcularAlertasStock, type AlertaStockInsumo } from "./ia-stock";
import { claseInsumoImport } from "./resumen-sheets";

// --- 1. Punto de equilibrio del mes -------------------------------------------------------------

export interface EquilibrioMes {
  /** Costos fijos del mes (recurrentes + indirectos fijos del mes), igual que el EERR. */
  costos_fijos: number;
  /** Margen de contribución % (ventas − CMV − mano de obra − costos variables) de los meses de
   * referencia; null si no hubo ventas para calcularlo. */
  margen_contribucion_pct: number | null;
  /** De qué meses salió el margen (texto corto para mostrar, ej. "ago–oct"). */
  meses_referencia: string[];
  punto_equilibrio: number | null;
  vendido: number;
  /** 0–100+ (puede pasar 100 si ya se superó). null si no hay punto de equilibrio. */
  pct_alcanzado: number | null;
  falta: number | null;
  dias_del_mes: number;
  /** Días que quedan del mes contando hoy; 0 si el mes ya terminó, todos si todavía no empezó. */
  dias_restantes: number;
  venta_necesaria_por_semana: number | null;
  precio_promedio_caja: number | null;
  cajas_por_semana_necesarias: number | null;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function margenDeContribucion(data: RicordoDataV2, desde: string, hasta: string): { ventas: number; mc: number } {
  const e = calcularEerr(data, desde, hasta);
  const mc = e.ventas_netas - e.cmv.total - e.mano_de_obra_directa.total - e.costos_indirectos_variables.total;
  return { ventas: e.ventas_netas, mc };
}

/** El margen se toma de los 3 meses anteriores (más estable que un mes a medio vender); si no hubo
 * ventas en esos meses, del mes en curso. */
export function calcularEquilibrioMes(data: RicordoDataV2, mes: number, anio: number, hoy: string): EquilibrioMes {
  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const dias_del_mes = Number(hasta.slice(8, 10));

  let ventasRef = 0;
  let mcRef = 0;
  const meses_referencia: string[] = [];
  let m = { mes, anio };
  for (let i = 0; i < 3; i++) {
    m = mesAnterior(m.mes, m.anio);
    const r = margenDeContribucion(data, primerDiaMes(m.mes, m.anio), ultimoDiaMes(m.mes, m.anio));
    if (r.ventas > 0) {
      ventasRef += r.ventas;
      mcRef += r.mc;
      meses_referencia.unshift(MESES_CORTOS[m.mes - 1]);
    }
  }
  if (ventasRef === 0) {
    const r = margenDeContribucion(data, desde, hasta);
    ventasRef = r.ventas;
    mcRef = r.mc;
    if (r.ventas > 0) meses_referencia.push(MESES_CORTOS[mes - 1]);
  }
  const margen_contribucion_pct = ventasRef > 0 ? (mcRef / ventasRef) * 100 : null;

  const costos_fijos = costosFijosTotales(data, mes, anio);
  const punto_equilibrio =
    margen_contribucion_pct != null && margen_contribucion_pct > 0 ? Math.round(costos_fijos / (margen_contribucion_pct / 100)) : null;

  const items = calcularMargenPorItem(data, desde, hasta);
  const vendido = Math.round(items.reduce((acc, i) => acc + i.ventas_netas, 0));
  // Mismo criterio que Analítica de Ventas (esCaja): cuentan cajas y unidades sueltas, no salsa/potes.
  const itemsCaja = items.filter((i) => i.tipo_unidad_venta === "caja" || i.tipo_unidad_venta === "unidad");
  const cajas = itemsCaja.reduce((acc, i) => acc + i.cantidad, 0);
  const precio_promedio_caja = cajas > 0 ? Math.round(itemsCaja.reduce((acc, i) => acc + i.ventas_netas, 0) / cajas) : null;

  let dias_restantes: number;
  if (hoy > hasta) dias_restantes = 0;
  else if (hoy < desde) dias_restantes = dias_del_mes;
  else dias_restantes = dias_del_mes - Number(hoy.slice(8, 10)) + 1;

  const pct_alcanzado = punto_equilibrio ? (vendido / punto_equilibrio) * 100 : null;
  const falta = punto_equilibrio != null ? Math.max(0, punto_equilibrio - vendido) : null;
  const semanasRestantes = dias_restantes / 7;
  const venta_necesaria_por_semana =
    falta != null && semanasRestantes > 0 ? Math.round(falta / Math.max(1, semanasRestantes)) : falta === 0 ? 0 : null;
  const cajas_por_semana_necesarias =
    venta_necesaria_por_semana != null && precio_promedio_caja ? Math.ceil(venta_necesaria_por_semana / precio_promedio_caja) : null;

  return {
    costos_fijos,
    margen_contribucion_pct,
    meses_referencia,
    punto_equilibrio,
    vendido,
    pct_alcanzado,
    falta,
    dias_del_mes,
    dias_restantes,
    venta_necesaria_por_semana,
    precio_promedio_caja,
    cajas_por_semana_necesarias,
  };
}

export interface PuntoRitmo {
  dia: number;
  /** Venta acumulada hasta ese día; null en días futuros (la línea se corta en hoy). */
  vendido: number | null;
  /** Meta acumulada lineal hasta el punto de equilibrio. */
  meta: number | null;
}

/** Serie diaria para el gráfico "¿Cómo voy?": venta acumulada vs. una meta lineal al equilibrio. */
export function ritmoDelMes(data: RicordoDataV2, mes: number, anio: number, hoy: string, puntoEquilibrio: number | null): PuntoRitmo[] {
  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const dias = Number(hasta.slice(8, 10));
  const porDia = new Array<number>(dias + 1).fill(0);
  for (const i of calcularMargenPorItem(data, desde, hasta)) {
    porDia[Number(i.fecha.slice(8, 10))] += i.ventas_netas;
  }
  const ultimoDiaConDato = hoy > hasta ? dias : hoy < desde ? 0 : Number(hoy.slice(8, 10));
  const puntos: PuntoRitmo[] = [];
  let acumulado = 0;
  for (let d = 1; d <= dias; d++) {
    acumulado += porDia[d];
    puntos.push({
      dia: d,
      vendido: d <= ultimoDiaConDato ? Math.round(acumulado) : null,
      meta: puntoEquilibrio != null ? Math.round((puntoEquilibrio * d) / dias) : null,
    });
  }
  return puntos;
}

// --- 2. Compra del jueves (masa y packaging) -----------------------------------------------------

export interface FilaCompraSemanal extends AlertaStockInsumo {
  clase: "masa" | "packaging";
  /** Costo estimado de la cantidad sugerida, al precio actual del insumo. */
  costo_sugerido: number;
}

export interface CompraSemanal {
  filas: FilaCompraSemanal[];
  costo_total_sugerido: number;
}

/** Insumos de control semanal (masa y packaging con stock controlado), ordenados por urgencia —
 * misma sugerencia que la IA de stock (pedidos pendientes + mínimo o 7 días de colchón). */
export function calcularCompraSemanal(data: RicordoDataV2, hoy: string): CompraSemanal {
  const filas: FilaCompraSemanal[] = [];
  for (const a of calcularAlertasStock(data, hoy)) {
    const clase = claseInsumoImport(data, a.insumo_id);
    if (clase !== "masa" && clase !== "packaging") continue;
    const precio = data.insumos.find((i) => i.id === a.insumo_id)?.precio_actual ?? 0;
    filas.push({ ...a, clase, costo_sugerido: Math.round(a.cantidad_sugerida_compra * precio) });
  }
  return { filas, costo_total_sugerido: filas.reduce((acc, f) => acc + f.costo_sugerido, 0) };
}

/** Próximo jueves (o hoy si es jueves), para el título de la sección. */
export function proximoJueves(hoy: string): string {
  const dia = new Date(`${hoy}T12:00:00`).getDay(); // 0 domingo … 4 jueves
  return sumarDias(hoy, (4 - dia + 7) % 7);
}

// --- 3. Qué producto empujar ---------------------------------------------------------------------

export interface RankingProducto {
  producto_id: string;
  nombre: string;
  ventas: number;
  margen_contribucion: number;
  margen_pct: number | null;
  cantidad: number;
}

/** Margen de contribución por gusto en el período, de mayor a menor plata aportada. */
export function rankingProductos(data: RicordoDataV2, desde: string, hasta: string): RankingProducto[] {
  const porProducto = new Map<string, RankingProducto>();
  for (const i of calcularMargenPorItem(data, desde, hasta)) {
    const id = i.producto_id ?? `sin-catalogo:${i.producto_nombre.trim().toLowerCase()}`;
    const fila = porProducto.get(id) ?? {
      producto_id: id,
      nombre: i.producto_nombre.trim(),
      ventas: 0,
      margen_contribucion: 0,
      margen_pct: null,
      cantidad: 0,
    };
    fila.ventas += i.ventas_netas;
    fila.margen_contribucion += i.margen_contribucion;
    fila.cantidad += i.cantidad;
    porProducto.set(id, fila);
  }
  return [...porProducto.values()]
    .map((f) => ({
      ...f,
      ventas: Math.round(f.ventas),
      margen_contribucion: Math.round(f.margen_contribucion),
      margen_pct: f.ventas > 0 ? (f.margen_contribucion / f.ventas) * 100 : null,
    }))
    .sort((a, b) => b.margen_contribucion - a.margen_contribucion);
}

// --- 4. Simulador "¿y si…?" ----------------------------------------------------------------------
// Recalcula costos con la receta actual (costoVariante, que ya incluye mano de obra) cambiando el
// precio de venta de presentaciones y/o el precio de insumos. Nunca modifica los datos: trabaja
// sobre una copia. El impacto mensual usa lo vendido de cada presentación en los últimos 90 días.

export interface CambiosSimulacion {
  /** varianteId → nuevo precio de venta */
  precios?: Record<string, number>;
  /** insumoId → nuevo precio por unidad del insumo */
  insumos?: Record<string, number>;
}

export interface FilaSimulacion {
  variante_id: string;
  nombre: string;
  canal: string;
  precio_actual: number;
  precio_nuevo: number;
  costo_actual: number;
  costo_nuevo: number;
  margen_actual: number;
  margen_nuevo: number;
  margen_pct_actual: number | null;
  margen_pct_nuevo: number | null;
  /** Presentaciones vendidas por mes (promedio de los últimos 90 días). */
  vendidas_por_mes: number;
  impacto_mensual: number;
}

export interface ResultadoSimulacion {
  filas: FilaSimulacion[];
  impacto_mensual_total: number;
  punto_equilibrio_actual: number | null;
  punto_equilibrio_nuevo: number | null;
}

function aplicarCambios(data: RicordoDataV2, cambios: CambiosSimulacion): RicordoDataV2 {
  const insumos = cambios.insumos ?? {};
  const precios = cambios.precios ?? {};
  return {
    ...data,
    insumos: data.insumos.map((i) => (insumos[i.id] != null ? { ...i, precio_actual: insumos[i.id] } : i)),
    producto_variantes: data.producto_variantes.map((v) => (precios[v.id] != null ? { ...v, precio_venta: precios[v.id] } : v)),
  };
}

export function vendidasPorMes(data: RicordoDataV2, hoy: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of calcularMargenPorItem(data, sumarDias(hoy, -90), hoy)) {
    if (!i.variante_id) continue;
    out.set(i.variante_id, (out.get(i.variante_id) ?? 0) + i.cantidad / 3);
  }
  return out;
}

export function simularCambios(data: RicordoDataV2, cambios: CambiosSimulacion, mes: number, anio: number, hoy: string): ResultadoSimulacion {
  const simulado = aplicarCambios(data, cambios);
  const vendidas = vendidasPorMes(data, hoy);
  const precios = cambios.precios ?? {};
  const insumosCambiados = new Set(Object.keys(cambios.insumos ?? {}));

  const filas: FilaSimulacion[] = [];
  for (const v of data.producto_variantes) {
    if (!v.activo) continue;
    const tocaPrecio = precios[v.id] != null;
    const tocaInsumo =
      insumosCambiados.size > 0 && recetaEfectivaVariante(data, v).some((it) => insumosCambiados.has(it.insumo_id));
    if (!tocaPrecio && !tocaInsumo) continue;
    const costo_actual = costoVariante(data, v.id);
    const costo_nuevo = costoVariante(simulado, v.id);
    const precio_actual = v.precio_venta;
    const precio_nuevo = precios[v.id] ?? v.precio_venta;
    const margen_actual = precio_actual - costo_actual;
    const margen_nuevo = precio_nuevo - costo_nuevo;
    const vendidas_por_mes = vendidas.get(v.id) ?? 0;
    filas.push({
      variante_id: v.id,
      nombre: v.nombre.trim(),
      canal: v.canal ?? "",
      precio_actual,
      precio_nuevo,
      costo_actual,
      costo_nuevo,
      margen_actual,
      margen_nuevo,
      margen_pct_actual: precio_actual > 0 ? (margen_actual / precio_actual) * 100 : null,
      margen_pct_nuevo: precio_nuevo > 0 ? (margen_nuevo / precio_nuevo) * 100 : null,
      vendidas_por_mes,
      impacto_mensual: Math.round((margen_nuevo - margen_actual) * vendidas_por_mes),
    });
  }
  filas.sort((a, b) => b.vendidas_por_mes - a.vendidas_por_mes);
  const impacto_mensual_total = filas.reduce((acc, f) => acc + f.impacto_mensual, 0);

  // Punto de equilibrio nuevo: mismo margen de contribución promedio de los meses de referencia,
  // corrido por el impacto (más/menos margen) y la venta extra (si cambia el precio).
  const eq = calcularEquilibrioMes(data, mes, anio, hoy);
  let punto_equilibrio_nuevo: number | null = null;
  if (eq.margen_contribucion_pct != null) {
    const ventasMes = eq.punto_equilibrio != null && eq.margen_contribucion_pct > 0 ? referenciaVentasMensual(data, mes, anio) : 0;
    const deltaVentas = filas.reduce((acc, f) => acc + (f.precio_nuevo - f.precio_actual) * f.vendidas_por_mes, 0);
    if (ventasMes > 0) {
      const mcMes = (ventasMes * eq.margen_contribucion_pct) / 100;
      const pctNuevo = (mcMes + impacto_mensual_total) / (ventasMes + deltaVentas);
      punto_equilibrio_nuevo = pctNuevo > 0 ? Math.round(eq.costos_fijos / pctNuevo) : null;
    }
  }
  return { filas, impacto_mensual_total, punto_equilibrio_actual: eq.punto_equilibrio, punto_equilibrio_nuevo };
}

/** Venta mensual promedio de los meses de referencia del equilibrio (los 3 anteriores con ventas). */
function referenciaVentasMensual(data: RicordoDataV2, mes: number, anio: number): number {
  let total = 0;
  let meses = 0;
  let m = { mes, anio };
  for (let i = 0; i < 3; i++) {
    m = mesAnterior(m.mes, m.anio);
    const v = calcularEerr(data, primerDiaMes(m.mes, m.anio), ultimoDiaMes(m.mes, m.anio)).ventas_netas;
    if (v > 0) {
      total += v;
      meses++;
    }
  }
  return meses > 0 ? total / meses : 0;
}

// --- 5. Semana a semana (igual que SEGUIMIENTO_SEMANAL de la planilla) ----------------------------

export interface SemanaSeguimiento {
  semana: number;
  desde: string;
  hasta: string;
  meta: number | null;
  vendido: number;
  diferencia: number | null;
  meta_acumulada: number | null;
  vendido_acumulado: number;
  cajas: number;
  pedidos: number;
  ticket_promedio: number | null;
  /** "pasada" | "en curso" | "futura" respecto de hoy. */
  estado: "pasada" | "en curso" | "futura";
}

/** Semanas fijas del mes: 1–7, 8–14, 15–21, 22–28 y 29–fin (la 5ª junta los últimos días), con la
 * meta = punto de equilibrio repartido por días — mismo criterio que la planilla. */
export function semanasDelMes(data: RicordoDataV2, mes: number, anio: number, hoy: string, puntoEquilibrio: number | null): SemanaSeguimiento[] {
  const desdeMes = primerDiaMes(mes, anio);
  const hastaMes = ultimoDiaMes(mes, anio);
  const dias = Number(hastaMes.slice(8, 10));
  const items = calcularMargenPorItem(data, desdeMes, hastaMes);
  const semanas: SemanaSeguimiento[] = [];
  let metaAcum = 0;
  let vendAcum = 0;
  for (let s = 0; s < 5; s++) {
    const d0 = s * 7 + 1;
    const d1 = s === 4 ? dias : Math.min(dias, d0 + 6);
    if (d0 > dias) break;
    const desde = `${desdeMes.slice(0, 8)}${String(d0).padStart(2, "0")}`;
    const hasta = `${desdeMes.slice(0, 8)}${String(d1).padStart(2, "0")}`;
    const deSemana = items.filter((i) => i.fecha >= desde && i.fecha <= hasta);
    const vendido = Math.round(deSemana.reduce((acc, i) => acc + i.ventas_netas, 0));
    const pedidos = new Set(deSemana.map((i) => i.pedido_id)).size;
    const cajas = deSemana
      .filter((i) => i.tipo_unidad_venta === "caja" || i.tipo_unidad_venta === "unidad")
      .reduce((acc, i) => acc + i.cantidad, 0);
    const meta = puntoEquilibrio != null ? Math.round((puntoEquilibrio * (d1 - d0 + 1)) / dias) : null;
    metaAcum += meta ?? 0;
    vendAcum += vendido;
    const estado = hoy > hasta ? "pasada" : hoy < desde ? "futura" : "en curso";
    semanas.push({
      semana: s + 1,
      desde,
      hasta,
      meta,
      vendido,
      diferencia: meta != null && estado !== "futura" ? vendido - meta : null,
      meta_acumulada: meta != null ? metaAcum : null,
      vendido_acumulado: vendAcum,
      cajas,
      pedidos,
      ticket_promedio: pedidos > 0 ? Math.round(vendido / pedidos) : null,
      estado,
    });
  }
  return semanas;
}
