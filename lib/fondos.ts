// Fondos de reinversión y de seguridad + préstamos internos — lo que antes se llevaba en las
// pestañas SALDOS y FONDOS de la planilla de Finanzas.
//
// Cómo funciona:
//   · Saldo de un fondo = saldo inicial + aportes − usos − préstamos sin devolver.
//   · Cada mes cerrado sugiere lo que hay que separar: las amortizaciones van a reinversión, y si
//     el negocio ganó plata (resultado neto del EERR) se reparte con los % configurados. Si perdió,
//     sugiere cubrir la pérdida con el fondo de seguridad. Nada se registra solo: se confirma.
//   · Un préstamo sale del fondo hasta que se marca devuelto.
// Estos fondos son una forma de repartir la plata de la caja; no cambian el saldo de caja.

import type { RicordoDataV2, ConfigFondos, FondoId, MovimientoFondo } from "./types-v2";
import { mesAnterior, ultimoDiaMes } from "./calc-v2";
import { amortizacionesMensuales, configNegocio, costosFijosMensuales, deudaConSanti, maquinariaComprada, resultadoMes } from "./negocio";

export const NOMBRE_FONDO: Record<FondoId, string> = {
  reinversion: "Reinversión de maquinaria",
  seguridad: "Margen de seguridad",
};

/** Valores de arranque tomados de la planilla de Finanzas de Santi (pestañas SALDOS, FONDOS y
 * PARAMETROS, al 05/11/2026). Se pueden cambiar desde Finanzas → Fondos. */
export const FONDOS_POR_DEFECTO: ConfigFondos = {
  pct_reinversion: 60,
  pct_seguridad: 40,
  amortizacion_mensual: 40000,
  meses_meta_seguridad: 3,
  meta_reinversion: 4500000,
  fecha_inicio: "2026-11-01",
  saldo_inicial_reinversion: 190181,
  saldo_inicial_seguridad: 38898,
  movimientos: [
    { id: "FON-LEG-1", fecha: "2026-11-05", fondo: "reinversion", tipo: "prestamo", monto: 40000, concepto: "Compras de noviembre" },
    { id: "FON-LEG-2", fecha: "2026-11-05", fondo: "reinversion", tipo: "prestamo", monto: 83000, concepto: "Bolsas al vacío" },
  ],
};

export function configFondos(data: RicordoDataV2): ConfigFondos {
  return { ...FONDOS_POR_DEFECTO, ...(data.configuracion.fondos ?? {}) };
}

export interface EstadoFondo {
  fondo: FondoId;
  saldo: number;
  aportes: number;
  usos: number;
  prestado_sin_devolver: number;
  /** Lo que va a tener cuando se devuelvan los préstamos. */
  saldo_con_devoluciones: number;
  meta: number;
  pct_meta: number;
}

export interface EstadoFondos {
  reinversion: EstadoFondo;
  seguridad: EstadoFondo;
  /** Meses de costos fijos que cubre el fondo de seguridad. */
  meses_cubiertos: number | null;
  prestamos_pendientes: MovimientoFondo[];
  total_prestado: number;
  /** Gastos que pagaste de tu bolsillo y todavía no te devolviste. */
  te_debe: number;
}

export function estadoFondos(data: RicordoDataV2, mes: number, anio: number): EstadoFondos {
  const cfg = configFondos(data);
  void mes;
  void anio;
  // Meta de seguridad = meses × (costos fijos + sueldo objetivo), como en la planilla.
  const costoMensual = costosFijosMensuales(data, "casa") + configNegocio(data).sueldo_objetivo;
  const calc = (fondo: FondoId): EstadoFondo => {
    const movs = cfg.movimientos.filter((m) => m.fondo === fondo);
    const aportes = movs.filter((m) => m.tipo === "aporte").reduce((a, m) => a + m.monto, 0);
    // Las máquinas anotadas en Gastos (categoría Maquinaria y equipos) salen de reinversión.
    const usos = movs.filter((m) => m.tipo === "uso").reduce((a, m) => a + m.monto, 0) + (fondo === "reinversion" ? maquinariaComprada(data) : 0);
    const prestado = movs.filter((m) => m.tipo === "prestamo" && !m.devuelto_el).reduce((a, m) => a + m.monto, 0);
    const inicial = fondo === "reinversion" ? cfg.saldo_inicial_reinversion : cfg.saldo_inicial_seguridad;
    const saldo_con_devoluciones = inicial + aportes - usos;
    const meta = fondo === "reinversion" ? cfg.meta_reinversion : costoMensual * cfg.meses_meta_seguridad;
    const saldo = saldo_con_devoluciones - prestado;
    return {
      fondo,
      saldo,
      aportes,
      usos,
      prestado_sin_devolver: prestado,
      saldo_con_devoluciones,
      meta,
      pct_meta: meta > 0 ? (saldo / meta) * 100 : 0,
    };
  };
  const reinversion = calc("reinversion");
  const seguridad = calc("seguridad");
  const prestamos_pendientes = cfg.movimientos.filter((m) => m.tipo === "prestamo" && !m.devuelto_el).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    reinversion,
    seguridad,
    meses_cubiertos: costoMensual > 0 ? seguridad.saldo / costoMensual : null,
    prestamos_pendientes,
    total_prestado: prestamos_pendientes.reduce((a, m) => a + m.monto, 0),
    te_debe: deudaConSanti(data).total,
  };
}

export interface SugerenciaMes {
  mes_origen: string;
  etiqueta: string;
  resultado_neto: number;
  amortizacion: number;
  a_reinversion: number;
  a_seguridad: number;
  /** Pérdida del mes a cubrir con el fondo de seguridad (0 si ganó). */
  perdida: number;
  movimientos: Omit<MovimientoFondo, "id">[];
}

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Meses cerrados desde `fecha_inicio` cuyo reparto todavía no se registró. */
export function sugerenciasPendientes(data: RicordoDataV2, hoy: string): SugerenciaMes[] {
  const cfg = configFondos(data);
  const registrados = new Set(cfg.movimientos.map((m) => m.mes_origen).filter(Boolean));
  const out: SugerenciaMes[] = [];
  const inicio = cfg.fecha_inicio.slice(0, 7);
  let m = mesAnterior(Number(hoy.slice(5, 7)), Number(hoy.slice(0, 4)));
  for (let i = 0; i < 24; i++) {
    const clave = `${m.anio}-${String(m.mes).padStart(2, "0")}`;
    if (clave < inicio) break;
    if (!registrados.has(clave)) {
      const resultado_neto = resultadoMes(data, m.mes, m.anio).resultado_neto;
      const ganancia = Math.max(0, resultado_neto);
      const a_reinversion = Math.round((ganancia * cfg.pct_reinversion) / 100);
      const a_seguridad = Math.round((ganancia * cfg.pct_seguridad) / 100);
      const perdida = Math.max(0, -resultado_neto);
      const etiqueta = `${MESES_LARGOS[m.mes - 1]} ${m.anio}`;
      const fecha = ultimoDiaMes(m.mes, m.anio);
      const movimientos: Omit<MovimientoFondo, "id">[] = [];
      const amortizacion = amortizacionesMensuales(data) || cfg.amortizacion_mensual;
      if (amortizacion > 0)
        movimientos.push({ fecha, fondo: "reinversion", tipo: "aporte", monto: amortizacion, concepto: `Amortizaciones de ${etiqueta}`, mes_origen: clave });
      if (a_reinversion > 0)
        movimientos.push({ fecha, fondo: "reinversion", tipo: "aporte", monto: a_reinversion, concepto: `Ganancia de ${etiqueta} (${cfg.pct_reinversion}%)`, mes_origen: clave });
      if (a_seguridad > 0)
        movimientos.push({ fecha, fondo: "seguridad", tipo: "aporte", monto: a_seguridad, concepto: `Ganancia de ${etiqueta} (${cfg.pct_seguridad}%)`, mes_origen: clave });
      if (perdida > 0)
        movimientos.push({ fecha, fondo: "seguridad", tipo: "uso", monto: perdida, concepto: `Cubrir la pérdida de ${etiqueta}`, mes_origen: clave });
      out.push({ mes_origen: clave, etiqueta, resultado_neto, amortizacion, a_reinversion, a_seguridad, perdida, movimientos });
    }
    m = mesAnterior(m.mes, m.anio);
  }
  return out.reverse();
}

function conConfig(data: RicordoDataV2, cambio: (c: ConfigFondos) => ConfigFondos): RicordoDataV2 {
  return { ...data, configuracion: { ...data.configuracion, fondos: cambio(configFondos(data)) } };
}

export function conMovimientosFondo(data: RicordoDataV2, nuevos: MovimientoFondo[]): RicordoDataV2 {
  return conConfig(data, (c) => ({ ...c, movimientos: [...c.movimientos, ...nuevos] }));
}

export function conPrestamoDevuelto(data: RicordoDataV2, id: string, fecha: string | undefined): RicordoDataV2 {
  return conConfig(data, (c) => ({ ...c, movimientos: c.movimientos.map((m) => (m.id === id ? { ...m, devuelto_el: fecha } : m)) }));
}

export function sinMovimientoFondo(data: RicordoDataV2, id: string): RicordoDataV2 {
  return conConfig(data, (c) => ({ ...c, movimientos: c.movimientos.filter((m) => m.id !== id) }));
}

export function conAjustesFondos(data: RicordoDataV2, cambios: Partial<Omit<ConfigFondos, "movimientos">>): RicordoDataV2 {
  return conConfig(data, (c) => ({ ...c, ...cambios }));
}
