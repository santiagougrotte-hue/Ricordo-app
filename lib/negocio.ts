// Parámetros y números del negocio que antes vivían en la planilla de Finanzas (PARAMETROS,
// COSTOS_FIJOS, GASTOS, EERR_MENSUAL, ESCENARIO_LOCAL) y en COSTEO_NUEVOS. El resultado del mes
// se calcula igual que en la planilla:
//   margen antes de tu sueldo = ventas netas − CMV − costos variables (nafta, peajes)
//   lo que quedó para tu sueldo = margen antes de tu sueldo − costos fijos − gastos anotados
//   resultado neto = lo que quedó para tu sueldo − sueldo objetivo
// (equivale a: margen después de la mano de obra − fijos − la parte fija del sueldo).

import type { RicordoDataV2, ConfigNegocio, GastoAnotado } from "./types-v2";
import { calcularEerr, primerDiaMes, ultimoDiaMes } from "./calc-v2";

export const CATEGORIAS_GASTO = [
  "Servicios",
  "Mantenimiento y reparaciones",
  "Maquinaria y equipos",
  "Nafta y envíos",
  "Marketing y redes",
  "Limpieza",
  "Impuestos y trámites",
  "Utensilios e insumos menores",
  "Otros",
];
/** Gastos que no son del mes: se compran con el fondo de reinversión. */
export const CATEGORIA_MAQUINARIA = "Maquinaria y equipos";

/** Valores de la planilla de Finanzas de Santi (PARAMETROS, COSTOS_FIJOS, GASTOS y
 * ESCENARIO_LOCAL al 17/11/2026). Se editan desde la app. */
export const NEGOCIO_POR_DEFECTO: ConfigNegocio = {
  sueldo_objetivo: 300000,
  margen_objetivo_minorista: 45,
  margen_objetivo_mayorista: 30,
  colchon_pct: 15,
  saldo_cuenta_costos_fijos: 60000,
  costos_fijos: [
    { id: "CFI-01", nombre: "Linktree", categoria: "Suscripciones", monto_casa: 17000, monto_local: 17000, se_paga_desde: "costos_fijos" },
    { id: "CFI-02", nombre: "Claude", categoria: "Suscripciones", monto_casa: 15000, monto_local: 15000, se_paga_desde: "costos_fijos" },
    { id: "CFI-03", nombre: "Otras suscripciones", categoria: "Suscripciones", monto_casa: 14000, monto_local: 0, se_paga_desde: "costos_fijos", nota: "Completá cuáles son" },
    { id: "CFI-04", nombre: "Amortización sobadora", categoria: "Amortización de equipos", monto_casa: 20000, monto_local: 20000, se_paga_desde: "reinversion" },
    { id: "CFI-05", nombre: "Amortización freezer", categoria: "Amortización de equipos", monto_casa: 11667, monto_local: 11667, se_paga_desde: "reinversion" },
    { id: "CFI-06", nombre: "Amortización utensilios", categoria: "Amortización de equipos", monto_casa: 8333, monto_local: 8333, se_paga_desde: "reinversion" },
    { id: "CFI-07", nombre: "Esponja", categoria: "Limpieza", monto_casa: 900, monto_local: 0, se_paga_desde: "costos_fijos" },
    { id: "CFI-08", nombre: "Servicios del local", categoria: "Servicios", monto_casa: 0, monto_local: 90000, se_paga_desde: "costos_fijos" },
    { id: "CFI-09", nombre: "Alquiler del local", categoria: "Alquiler", monto_casa: 0, monto_local: 350000, se_paga_desde: "costos_fijos" },
    { id: "CFI-10", nombre: "Expensas y TGI", categoria: "Expensas y TGI", monto_casa: 0, monto_local: 45000, se_paga_desde: "costos_fijos" },
    { id: "CFI-11", nombre: "Monotributo e impuestos", categoria: "Impuestos", monto_casa: 0, monto_local: 28000, se_paga_desde: "costos_fijos" },
    { id: "CFI-12", nombre: "Limpieza", categoria: "Limpieza", monto_casa: 0, monto_local: 8000, se_paga_desde: "costos_fijos" },
    { id: "CFI-13", nombre: "Amortización equipamiento nuevo", categoria: "Amortización de equipos", monto_casa: 0, monto_local: 35000, se_paga_desde: "reinversion" },
    { id: "CFI-14", nombre: "Ayudante de cocina", categoria: "Personal", monto_casa: 0, monto_local: 280000, se_paga_desde: "costos_fijos" },
    { id: "CFI-15", nombre: "Seguro y bromatología", categoria: "Seguros", monto_casa: 0, monto_local: 25000, se_paga_desde: "costos_fijos" },
    { id: "CFI-16", nombre: "Otros fijos", categoria: "Otros", monto_casa: 0, monto_local: 15000, se_paga_desde: "costos_fijos" },
  ],
  pagos_costos_fijos: {},
  gastos: [
    { id: "GAS-01", fecha: "2026-10-07", concepto: "Sueldo Sofi", categoria: "Otros", monto: 60000, con: "caja" },
    { id: "GAS-02", fecha: "2026-10-08", concepto: "Nafta", categoria: "Nafta y envíos", monto: 23263, con: "caja" },
  ],
  escenario: {
    capacidad_casa: 156,
    capacidad_local: 400,
    cajas_esperadas_local: 300,
    inversion: [
      { id: "INV-1", concepto: "Depósito en garantía (2 meses)", monto: 700000 },
      { id: "INV-2", concepto: "Comisión inmobiliaria y sellados", monto: 350000 },
      { id: "INV-3", concepto: "Obra civil y adecuación sin TACC", monto: 1200000 },
      { id: "INV-4", concepto: "Habilitación municipal", monto: 250000 },
      { id: "INV-5", concepto: "Maquinaria extra", monto: 1500000 },
      { id: "INV-6", concepto: "Fondo de maniobra", monto: 500000 },
    ],
  },
  costeos: [],
};

export function configNegocio(data: RicordoDataV2): ConfigNegocio {
  const guardado = data.configuracion.negocio;
  if (!guardado) return NEGOCIO_POR_DEFECTO;
  return {
    ...NEGOCIO_POR_DEFECTO,
    ...guardado,
    escenario: { ...NEGOCIO_POR_DEFECTO.escenario, ...(guardado.escenario ?? {}) },
  };
}

export function conNegocio(data: RicordoDataV2, cambio: (n: ConfigNegocio) => ConfigNegocio): RicordoDataV2 {
  return { ...data, configuracion: { ...data.configuracion, negocio: cambio(configNegocio(data)) } };
}

export const claveMesN = (mes: number, anio: number) => `${anio}-${String(mes).padStart(2, "0")}`;

export function costosFijosMensuales(data: RicordoDataV2, estructura: "casa" | "local" = "casa"): number {
  return configNegocio(data).costos_fijos.reduce((a, c) => a + (estructura === "casa" ? c.monto_casa : c.monto_local), 0);
}

/** Amortizaciones del mes (costos fijos que se separan en el fondo de reinversión). */
export function amortizacionesMensuales(data: RicordoDataV2): number {
  return configNegocio(data)
    .costos_fijos.filter((c) => c.se_paga_desde === "reinversion")
    .reduce((a, c) => a + c.monto_casa, 0);
}

export function gastosDelMes(data: RicordoDataV2, mes: number, anio: number, incluirMaquinaria = false): GastoAnotado[] {
  const clave = claveMesN(mes, anio);
  return configNegocio(data).gastos.filter((g) => g.fecha.startsWith(clave) && (incluirMaquinaria || g.categoria !== CATEGORIA_MAQUINARIA));
}

export interface ResultadoMes {
  ventas: number;
  cmv: number;
  margen_bruto: number;
  costos_variables: number;
  mano_de_obra: number;
  margen_contribucion: number;
  margen_antes_sueldo: number;
  margen_antes_sueldo_pct: number | null;
  costos_fijos: number;
  /** Costos fijos agrupados por categoría (para mostrarlos discriminados en el EERR). */
  costos_fijos_por_categoria: { categoria: string; monto: number; items: { nombre: string; monto: number }[] }[];
  gastos: number;
  gastos_por_categoria: { categoria: string; monto: number }[];
  /** Lo que el negocio pudo pagarte de sueldo. */
  sueldo_cubierto: number;
  sueldo_objetivo: number;
  resultado_neto: number;
}

export function resultadoMes(data: RicordoDataV2, mes: number, anio: number): ResultadoMes {
  const n = configNegocio(data);
  const e = calcularEerr(data, primerDiaMes(mes, anio), ultimoDiaMes(mes, anio));
  const ventas = e.ventas_netas;
  const cmv = e.cmv.total;
  const costos_variables = e.costos_indirectos_variables.total;
  const mano_de_obra = e.mano_de_obra_directa.total;
  const margen_antes_sueldo = ventas - cmv - costos_variables;
  const costos_fijos = costosFijosMensuales(data, "casa");
  const delMes = gastosDelMes(data, mes, anio);
  const gastos = delMes.reduce((a, g) => a + g.monto, 0);
  const porCat = new Map<string, { categoria: string; monto: number; items: { nombre: string; monto: number }[] }>();
  for (const c of n.costos_fijos) {
    if (c.monto_casa <= 0) continue;
    const g = porCat.get(c.categoria) ?? { categoria: c.categoria, monto: 0, items: [] };
    g.monto += c.monto_casa;
    g.items.push({ nombre: c.nombre, monto: c.monto_casa });
    porCat.set(c.categoria, g);
  }
  const gastosCat = new Map<string, number>();
  for (const g of delMes) gastosCat.set(g.categoria, (gastosCat.get(g.categoria) ?? 0) + g.monto);
  const sueldo_cubierto = margen_antes_sueldo - costos_fijos - gastos;
  return {
    ventas,
    cmv,
    margen_bruto: ventas - cmv,
    costos_variables,
    mano_de_obra,
    margen_contribucion: margen_antes_sueldo - mano_de_obra,
    margen_antes_sueldo,
    margen_antes_sueldo_pct: ventas > 0 ? (margen_antes_sueldo / ventas) * 100 : null,
    costos_fijos,
    costos_fijos_por_categoria: [...porCat.values()].sort((a, b) => b.monto - a.monto),
    gastos,
    gastos_por_categoria: [...gastosCat.entries()].map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto),
    sueldo_cubierto,
    sueldo_objetivo: n.sueldo_objetivo,
    resultado_neto: sueldo_cubierto - n.sueldo_objetivo,
  };
}

export interface EstadoCostosFijosMes {
  a_pagar: number;
  pagado: number;
  falta: number;
  a_separar_reinversion: number;
  saldo_cuenta: number;
  alcanza: boolean;
}

export function estadoCostosFijosMes(data: RicordoDataV2, mes: number, anio: number): EstadoCostosFijosMes {
  const n = configNegocio(data);
  const clave = claveMesN(mes, anio);
  const deCuenta = n.costos_fijos.filter((c) => c.se_paga_desde === "costos_fijos" && c.monto_casa > 0);
  const a_pagar = deCuenta.reduce((a, c) => a + c.monto_casa, 0);
  const pagado = deCuenta.filter((c) => n.pagos_costos_fijos[`${clave}:${c.id}`]).reduce((a, c) => a + c.monto_casa, 0);
  const falta = a_pagar - pagado;
  return {
    a_pagar,
    pagado,
    falta,
    a_separar_reinversion: amortizacionesMensuales(data),
    saldo_cuenta: n.saldo_cuenta_costos_fijos,
    alcanza: n.saldo_cuenta_costos_fijos >= falta,
  };
}

/** Lo que el negocio te debe por gastos que pagaste de tu bolsillo y todavía no te devolviste. */
export function deudaConSanti(data: RicordoDataV2): { total: number; gastos: GastoAnotado[] } {
  const gastos = configNegocio(data).gastos.filter((g) => g.con === "bolsillo" && !g.reintegrado_el);
  return { total: gastos.reduce((a, g) => a + g.monto, 0), gastos };
}

/** Compras de maquinaria anotadas como gasto: salen del fondo de reinversión. */
export function maquinariaComprada(data: RicordoDataV2): number {
  return configNegocio(data)
    .gastos.filter((g) => g.categoria === CATEGORIA_MAQUINARIA)
    .reduce((a, g) => a + g.monto, 0);
}

// --- Escenario: seguir en casa o abrir un local ---------------------------------------------------

export interface Escenario {
  precio_caja: number;
  margen_por_caja: number;
  costo_variable_caja: number;
  fijos_casa: number;
  fijos_local: number;
  equilibrio_casa: number | null;
  equilibrio_local: number | null;
  pct_capacidad_casa: number | null;
  pct_capacidad_local: number | null;
  cajas_casa: number;
  cajas_local: number;
  ganancia_casa: number;
  ganancia_local: number;
  inversion_total: number;
  meses_recupero: number | null;
}

export function calcularEscenario(
  data: RicordoDataV2,
  precioCaja: number,
  margenAntesSueldoPct: number,
  mejorMesCajas: number
): Escenario {
  const n = configNegocio(data);
  const margen_por_caja = (precioCaja * margenAntesSueldoPct) / 100;
  const fijos_casa = costosFijosMensuales(data, "casa") + n.sueldo_objetivo;
  const fijos_local = costosFijosMensuales(data, "local") + n.sueldo_objetivo;
  const eq = (f: number) => (margen_por_caja > 0 ? Math.ceil(f / margen_por_caja) : null);
  const equilibrio_casa = eq(fijos_casa);
  const equilibrio_local = eq(fijos_local);
  const cajas_casa = Math.min(mejorMesCajas, n.escenario.capacidad_casa);
  const cajas_local = Math.min(n.escenario.cajas_esperadas_local, n.escenario.capacidad_local);
  const ganancia_casa = Math.round(cajas_casa * margen_por_caja - fijos_casa);
  const ganancia_local = Math.round(cajas_local * margen_por_caja - fijos_local);
  const inversion_total = n.escenario.inversion.reduce((a, i) => a + i.monto, 0);
  const extra = ganancia_local - ganancia_casa;
  return {
    precio_caja: precioCaja,
    margen_por_caja: Math.round(margen_por_caja),
    costo_variable_caja: Math.round(precioCaja - margen_por_caja),
    fijos_casa,
    fijos_local,
    equilibrio_casa,
    equilibrio_local,
    pct_capacidad_casa: equilibrio_casa != null && n.escenario.capacidad_casa > 0 ? (equilibrio_casa / n.escenario.capacidad_casa) * 100 : null,
    pct_capacidad_local: equilibrio_local != null && n.escenario.capacidad_local > 0 ? (equilibrio_local / n.escenario.capacidad_local) * 100 : null,
    cajas_casa,
    cajas_local,
    ganancia_casa,
    ganancia_local,
    inversion_total,
    meses_recupero: extra > 0 ? inversion_total / extra : null,
  };
}
