// Planificación de compras — lo que antes vivía en las planillas PLAN_MASA_SEMANAL,
// PROYECCION_MENSUAL y PLAN_RELLENOS_MENSUAL, calculado con los datos de la app:
//   · Semanal: cajas a armar (venta promedio de las últimas 4 semanas, o lo que cargues) → insumos
//     de masa, armado y packaging con stock controlado → qué comprar el jueves.
//   · Mensual: proyección por gusto (promedio ponderado 3/2/1 de los últimos 3 meses + ajuste) −
//     freezer → cajas a producir → insumos del mes, relleno a cocinar e ingredientes de relleno.
//   · ¿Alcanza la plata?: compras del mes contra el fondo de reposición.
// Todo se expresa en "cajas de referencia" (`unidadesPorCajaStock`: 12 para pasta, 1 para lasaña,
// salsa y el resto), igual que el freezer.

import type { RicordoDataV2, PlanCompras } from "./types-v2";
import { calcularMargenPorItem, calcularStock, mesAnterior, primerDiaMes, ultimoDiaMes, sumarDias } from "./calc-v2";
import { consumoInsumosProduccion, gramosRellenoPorUnidad, kgRellenoDisponible, unidadesPorCajaStock, usaRellenoCocido } from "./rellenos";
import { calcularFondoReposicion } from "./fondo-reposicion";
import { configNegocio } from "./negocio";

export const claveMes = (mes: number, anio: number) => `${anio}-${String(mes).padStart(2, "0")}`;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Ventas por gusto en cajas de referencia entre dos fechas (presentación × unidades / formato). */
export function ventasPorGustoRef(data: RicordoDataV2, desde: string, hasta: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of calcularMargenPorItem(data, desde, hasta)) {
    if (!i.producto_id || !i.variante_id) continue;
    const v = data.producto_variantes.find((x) => x.id === i.variante_id);
    const unidades = i.cantidad * (v?.unidades_por_paquete ?? 1);
    out.set(i.producto_id, (out.get(i.producto_id) ?? 0) + unidades / unidadesPorCajaStock(data, i.producto_id));
  }
  return out;
}

const productosPlanificables = (data: RicordoDataV2) =>
  data.productos.filter((p) => p.activo && data.producto_variantes.some((v) => v.producto_id === p.id && v.activo));

export interface FilaInsumoPlan {
  insumo_id: string;
  nombre: string;
  unidad: string;
  necesario: number;
  /** null cuando el insumo no lleva stock en la app (ingredientes de relleno). */
  stock: number | null;
  stock_minimo: number | null;
  /** Lo que se cargó a mano como "ya tengo" (solo relleno). */
  en_casa?: number;
  comprar: number;
  precio: number;
  costo: number;
  estado: "no alcanza" | "justo" | "ok";
  usado_en: string[];
}

function filaInsumo(
  data: RicordoDataV2,
  insumoId: string,
  necesario: number,
  usadoEn: string[],
  opciones: { conStock: boolean; enCasa?: number }
): FilaInsumoPlan {
  const insumo = data.insumos.find((i) => i.id === insumoId);
  const stock = opciones.conStock ? Math.max(0, calcularStock(data, "insumo", insumoId)) : null;
  const minimo = insumo?.stock_minimo ?? null;
  const disponible = stock ?? opciones.enCasa ?? 0;
  const comprar = Math.max(0, necesario + (opciones.conStock ? minimo ?? 0 : 0) - disponible);
  const precio = insumo?.precio_actual ?? 0;
  const queda = disponible - necesario;
  return {
    insumo_id: insumoId,
    nombre: (insumo?.nombre ?? insumoId).trim(),
    unidad: (insumo?.unidad ?? "").trim(),
    necesario,
    stock,
    stock_minimo: minimo,
    en_casa: opciones.enCasa,
    comprar,
    precio,
    costo: Math.round(comprar * precio),
    estado: queda < 0 ? "no alcanza" : comprar > 0 || queda < necesario * 0.25 ? "justo" : "ok",
    usado_en: usadoEn,
  };
}

function ordenarFilas(filas: FilaInsumoPlan[]): FilaInsumoPlan[] {
  const orden = { "no alcanza": 0, justo: 1, ok: 2 };
  return filas.sort((a, b) => orden[a.estado] - orden[b.estado] || b.costo - a.costo || a.nombre.localeCompare(b.nombre));
}

/** Insumos de masa, armado y packaging (con stock controlado) para producir `cajasPorGusto`. */
function insumosMasaPackaging(data: RicordoDataV2, cajasPorGusto: Map<string, number>): FilaInsumoPlan[] {
  const necesidad = new Map<string, { cantidad: number; usado: Set<string> }>();
  for (const [productoId, cajas] of cajasPorGusto) {
    const nombre = data.productos.find((p) => p.id === productoId)?.nombre.trim() ?? productoId;
    for (const c of consumoInsumosProduccion(data, productoId, cajas)) {
      const n = necesidad.get(c.insumo_id) ?? { cantidad: 0, usado: new Set<string>() };
      n.cantidad += c.cantidad;
      n.usado.add(nombre);
      necesidad.set(c.insumo_id, n);
    }
  }
  return ordenarFilas(
    [...necesidad.entries()]
      .filter(([, n]) => n.cantidad > 0)
      .map(([id, n]) => filaInsumo(data, id, n.cantidad, [...n.usado], { conStock: true }))
  );
}

// --- Semanal -------------------------------------------------------------------------------------

export interface FilaCajasSemana {
  producto_id: string;
  nombre: string;
  /** Cajas de referencia por semana, promedio de las últimas 4 semanas. */
  promedio_semanal: number;
  sugerido: number;
  manual: number | null;
  a_armar: number;
  /** "cajas" o "unidades" según el formato del gusto. */
  unidad: string;
}

export interface PlanSemanal {
  jueves: string;
  cajas: FilaCajasSemana[];
  total_cajas: number;
  insumos: FilaInsumoPlan[];
  costo_total: number;
  disponible_fondo: number;
}

export function planSemanal(data: RicordoDataV2, jueves: string): PlanSemanal {
  const plan: PlanCompras = data.configuracion.plan_compras ?? {};
  const ventas = ventasPorGustoRef(data, sumarDias(jueves, -28), sumarDias(jueves, -1));
  const cajas: FilaCajasSemana[] = productosPlanificables(data).map((p) => {
    const promedio_semanal = (ventas.get(p.id) ?? 0) / 4;
    const sugerido = Math.max(0, Math.ceil(promedio_semanal - 1e-9));
    const manual = plan.cajas_semana?.[`${jueves}:${p.id}`] ?? null;
    return {
      producto_id: p.id,
      nombre: p.nombre.trim(),
      promedio_semanal,
      sugerido,
      manual,
      a_armar: manual ?? sugerido,
      unidad: unidadesPorCajaStock(data, p.id) > 1 ? "cajas" : "unidades",
    };
  });
  // Orden fijo por lo que se vende (no por lo cargado a mano), para que las filas no salten al escribir.
  cajas.sort((a, b) => b.promedio_semanal - a.promedio_semanal || a.nombre.localeCompare(b.nombre));
  const insumos = insumosMasaPackaging(data, new Map(cajas.filter((c) => c.a_armar > 0).map((c) => [c.producto_id, c.a_armar])));
  return {
    jueves,
    cajas,
    total_cajas: cajas.reduce((acc, c) => acc + c.a_armar, 0),
    insumos,
    costo_total: insumos.reduce((acc, f) => acc + f.costo, 0),
    disponible_fondo: calcularFondoReposicion(data).disponible_total,
  };
}

// --- Mensual -------------------------------------------------------------------------------------

export interface FilaProyeccion {
  producto_id: string;
  nombre: string;
  unidad: string;
  /** Vendido en los 3 meses anteriores (del más viejo al más nuevo); null si ese mes no cuenta. */
  vendidos: (number | null)[];
  promedio_ponderado: number;
  ajuste_pct: number;
  sugerida: number;
  manual: number | null;
  a_usar: number;
  /** Cajas en el freezer al empezar el mes (o hoy, si el mes todavía no empezó). */
  freezer: number;
  a_producir: number;
  /** Cajas ya producidas en el mes (Operaciones → Producción). */
  producido: number;
  usa_relleno: boolean;
  /** Kilos de relleno cocido que lleva la producción del mes, los que ya hay y los que faltan. */
  kg_relleno_necesario: number;
  kg_relleno_disponible: number;
  kg_relleno_a_cocinar: number;
  /** Cajas de referencia que cubre el relleno a cocinar (para la lista de ingredientes). */
  cajas_relleno_a_cocinar: number;
}

export interface PlanMensual {
  colchon_pct: number;
  mes: number;
  anio: number;
  meses_ref: string[];
  productos: FilaProyeccion[];
  insumos_masa: FilaInsumoPlan[];
  insumos_relleno: FilaInsumoPlan[];
  costo_masa: number;
  costo_relleno: number;
  costo_total: number;
  disponible_fondo: number;
  /** Planificado (a producir) contra lo producido en el mes, en cajas. */
  total_planificado: number;
  total_producido: number;
  /** Lo que todavía falta producir del plan (lo producido de más en un gusto no cubre a otro). */
  falta_producir: number;
  /** Avance del plan en %, con cada gusto tope en lo planificado; null si no hay nada planificado. */
  avance_pct: number | null;
  /** Positivo: sobra; negativo: falta esa plata para las compras del mes. */
  diferencia: number;
}

/** Cajas producidas por gusto entre dos fechas. Las producciones nuevas ya se cargan en cajas por
 * gusto; las viejas (por presentación) se pasan a cajas con las unidades del paquete. */
export function producidoPorGusto(data: RicordoDataV2, desde: string, hasta: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of data.produccion) {
    if (p.fecha < desde || p.fecha > hasta) continue;
    let productoId = p.producto_id;
    let cajas = p.cantidad;
    if (!productoId) {
      const v = data.producto_variantes.find((x) => x.id === p.producto_variante_id);
      if (!v) continue;
      productoId = v.producto_id;
      cajas = (p.cantidad * (v.unidades_por_paquete ?? 1)) / unidadesPorCajaStock(data, productoId);
    }
    out.set(productoId, (out.get(productoId) ?? 0) + cajas);
  }
  return out;
}

export function planMensual(data: RicordoDataV2, mes: number, anio: number, hoy = new Date().toLocaleDateString("sv-SE")): PlanMensual {
  const plan: PlanCompras = data.configuracion.plan_compras ?? {};
  const clave = claveMes(mes, anio);
  const colchon = configNegocio(data).colchon_pct;

  // Los 3 meses anteriores, del más viejo al más nuevo; solo cuentan los que tuvieron ventas.
  const meses: { mes: number; anio: number }[] = [];
  let m = { mes, anio };
  for (let i = 0; i < 3; i++) {
    m = mesAnterior(m.mes, m.anio);
    meses.unshift(m);
  }
  const ventasMes = meses.map((x) => ventasPorGustoRef(data, primerDiaMes(x.mes, x.anio), ultimoDiaMes(x.mes, x.anio)));
  const cuenta = ventasMes.map((v) => [...v.values()].some((n) => n > 0));
  const pesos = [1, 2, 3];
  const inicioMes = primerDiaMes(mes, anio);
  // El freezer se toma al empezar el mes, así lo planificado no cambia a medida que se produce.
  const corteFreezer = inicioMes <= hoy ? sumarDias(inicioMes, -1) : undefined;
  const producidoMes = producidoPorGusto(data, inicioMes, ultimoDiaMes(mes, anio));

  const productos: FilaProyeccion[] = productosPlanificables(data).map((p) => {
    const vendidos = ventasMes.map((v, idx) => (cuenta[idx] ? v.get(p.id) ?? 0 : null));
    const pesoTotal = pesos.reduce((acc, w, idx) => acc + (cuenta[idx] ? w : 0), 0);
    const promedio_ponderado = pesoTotal > 0 ? vendidos.reduce<number>((acc, v, idx) => acc + (v ?? 0) * pesos[idx], 0) / pesoTotal : 0;
    const ajuste_pct = plan.ajuste_pct?.[`${clave}:${p.id}`] ?? 0;
    const sugerida = Math.max(0, Math.ceil(promedio_ponderado * (1 + ajuste_pct / 100) - 1e-9));
    const manual = plan.proyeccion_manual?.[`${clave}:${p.id}`] ?? null;
    const a_usar = manual ?? sugerida;
    const formato = unidadesPorCajaStock(data, p.id);
    const freezer = Math.max(0, Math.round((calcularStock(data, "producto", p.id, corteFreezer) / formato) * 10) / 10);
    // A producir = proyección + colchón (PARAMETROS de la planilla, 15% por defecto) − freezer.
    const a_producir = Math.max(0, Math.ceil(a_usar * (1 + colchon / 100) - freezer - 1e-9));
    const usa_relleno = usaRellenoCocido(data, p.id);
    const kgPorCaja = usa_relleno ? (gramosRellenoPorUnidad(data, p.id) * formato) / 1000 : 0;
    const kg_relleno_necesario = Math.round(a_producir * kgPorCaja * 1000) / 1000;
    const kg_relleno_disponible = usa_relleno ? Math.max(0, kgRellenoDisponible(data, p.id)) : 0;
    const kg_relleno_a_cocinar = Math.max(0, Math.round((kg_relleno_necesario - kg_relleno_disponible) * 1000) / 1000);
    return {
      producto_id: p.id,
      nombre: p.nombre.trim(),
      unidad: formato > 1 ? "cajas" : "unidades",
      vendidos,
      promedio_ponderado,
      ajuste_pct,
      sugerida,
      manual,
      a_usar,
      freezer,
      a_producir,
      producido: Math.round((producidoMes.get(p.id) ?? 0) * 10) / 10,
      usa_relleno,
      kg_relleno_necesario,
      kg_relleno_disponible,
      kg_relleno_a_cocinar,
      cajas_relleno_a_cocinar: kgPorCaja > 0 ? kg_relleno_a_cocinar / kgPorCaja : 0,
    };
  });
  productos.sort((a, b) => b.promedio_ponderado - a.promedio_ponderado || a.nombre.localeCompare(b.nombre));

  const insumos_masa = insumosMasaPackaging(data, new Map(productos.filter((p) => p.a_producir > 0).map((p) => [p.producto_id, p.a_producir])));

  // Ingredientes de relleno: receta (etapa relleno, por unidad) × unidades que cubre el relleno a cocinar.
  const necesidadRelleno = new Map<string, { cantidad: number; usado: Set<string> }>();
  for (const p of productos) {
    if (p.cajas_relleno_a_cocinar <= 0) continue;
    const receta = data.recetas.find((r) => r.producto_id === p.producto_id && r.activa);
    if (!receta) continue;
    const unidades = p.cajas_relleno_a_cocinar * unidadesPorCajaStock(data, p.producto_id);
    for (const it of data.receta_items) {
      if (it.receta_id !== receta.id || it.etapa !== "relleno" || it.cantidad <= 0) continue;
      const n = necesidadRelleno.get(it.insumo_id) ?? { cantidad: 0, usado: new Set<string>() };
      n.cantidad += it.cantidad * unidades;
      n.usado.add(p.nombre);
      necesidadRelleno.set(it.insumo_id, n);
    }
  }
  const insumos_relleno = ordenarFilas(
    [...necesidadRelleno.entries()].map(([id, n]) =>
      filaInsumo(data, id, n.cantidad, [...n.usado], { conStock: false, enCasa: plan.relleno_en_casa?.[`${clave}:${id}`] })
    )
  );

  const fondo = calcularFondoReposicion(data);
  const costo_masa = insumos_masa.reduce((acc, f) => acc + f.costo, 0);
  const costo_relleno = insumos_relleno.reduce((acc, f) => acc + f.costo, 0);
  const costo_total = costo_masa + costo_relleno;
  const total_planificado = productos.reduce((acc, p) => acc + p.a_producir, 0);
  const total_producido = Math.round(productos.reduce((acc, p) => acc + p.producido, 0) * 10) / 10;
  const cubierto = productos.reduce((acc, p) => acc + Math.min(p.producido, p.a_producir), 0);
  const falta_producir = Math.round((total_planificado - cubierto) * 10) / 10;
  return {
    colchon_pct: colchon,
    mes,
    anio,
    meses_ref: meses.filter((_, idx) => cuenta[idx]).map((x) => MESES_CORTOS[x.mes - 1]),
    productos,
    insumos_masa,
    insumos_relleno,
    costo_masa,
    costo_relleno,
    costo_total,
    disponible_fondo: fondo.disponible_total,
    total_planificado,
    total_producido,
    falta_producir,
    avance_pct: total_planificado > 0 ? (cubierto / total_planificado) * 100 : null,
    diferencia: fondo.disponible_total - costo_total,
  };
}

/** Escribe (o borra, con `null`) un dato a mano del plan, sin tocar el resto del documento. */
export function conDatoPlan(data: RicordoDataV2, campo: keyof PlanCompras, clave: string, valor: number | null): RicordoDataV2 {
  const plan = { ...(data.configuracion.plan_compras ?? {}) };
  const mapa = { ...(plan[campo] ?? {}) };
  if (valor == null || Number.isNaN(valor)) delete mapa[clave];
  else mapa[clave] = valor;
  plan[campo] = mapa;
  return { ...data, configuracion: { ...data.configuracion, plan_compras: plan } };
}
