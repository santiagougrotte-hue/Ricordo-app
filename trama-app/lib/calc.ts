import type {
  AppData,
  Cliente,
  Config,
  Movimiento,
  Persona,
  Presupuesto,
  TipoMovimiento,
} from "./types";
import { TIPOS_MOVIMIENTO } from "./types";

// ---------- Formato ----------

export function fMoney(n: number, moneda: "ARS" | "USD" = "ARS"): string {
  return (n || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 0,
  });
}

export function fARS(n: number): string {
  return fMoney(n, "ARS");
}

export function fNum(n: number, decimals = 0): string {
  return (n || 0).toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fPct(n: number, decimals = 0): string {
  return `${(n || 0).toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

// ---------- Fechas / períodos ----------

function ym(fecha: string): { anio: number; mes: number } {
  const [anio, mes] = fecha.split("-").map(Number);
  return { anio, mes };
}

export function inPeriod(fecha: string, mes: number, anio: number): boolean {
  const d = ym(fecha);
  return d.mes === mes && d.anio === anio;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function mesAnterior(mes: number, anio: number): { mes: number; anio: number } {
  return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}

// ---------- Moneda / conversión ----------

export function montoEnARS(monto: number, moneda: "ARS" | "USD", tipoCambio: number): number {
  return moneda === "USD" ? monto * (tipoCambio || 1) : monto;
}

export function movimientoEnARS(m: Movimiento): number {
  return montoEnARS(m.monto, m.moneda, m.tipoCambio);
}

const TIPO_INFO: Record<TipoMovimiento, { ingreso: boolean }> = Object.fromEntries(
  TIPOS_MOVIMIENTO.map((t) => [t.value, { ingreso: t.ingreso }])
) as Record<TipoMovimiento, { ingreso: boolean }>;

export function esIngreso(tipo: TipoMovimiento): boolean {
  return TIPO_INFO[tipo]?.ingreso ?? false;
}

const TIPOS_SUELDO: TipoMovimiento[] = ["pago_sueldo", "pago_freelance"];

// ---------- Pricing de presupuestos ----------

/** Precio necesario para que `margenPct` quede como porcentaje del precio final,
 * después de descontar impuestos y comisiones (también % del precio final). */
export function precioParaMargen(
  costo: number,
  margenPct: number,
  impuestosPct: number,
  comisionesPct: number
): number {
  const deducciones = (margenPct + impuestosPct + comisionesPct) / 100;
  if (deducciones >= 0.98) return costo * 5; // guard: evita dividir por ~0 o negativo
  return costo / (1 - deducciones);
}

export interface PresupuestoTotales {
  costoItems: number;
  costoAdicionales: number;
  baseCostos: number;
  fondoImprevistosMonto: number;
  costoInterno: number;
  precioMinimo: number;
  precioSugerido: number;
  precioPremium: number;
  precioFinal: number;
  impuestosMonto: number;
  comisionesMonto: number;
  gananciaTrama: number;
  margenReal: number;
  subtotalCliente: number;
}

export function calcularPresupuesto(p: Presupuesto): PresupuestoTotales {
  const costoItems = p.items.reduce((acc, it) => acc + it.costoUnitario * it.cantidad, 0);
  const subtotalCliente = p.items.reduce((acc, it) => acc + it.precioUnitario * it.cantidad, 0);
  const costoAdicionales = p.costosAdicionales.reduce((acc, c) => acc + c.monto, 0);
  const baseCostos = costoItems + costoAdicionales;
  const fondoImprevistosMonto = baseCostos * (p.fondoImprevistosPct / 100);
  const costoInterno = baseCostos + fondoImprevistosMonto;

  const precioMinimo = precioParaMargen(costoInterno, p.margenMinimoPct, p.impuestosPct, p.comisionesPct);
  const precioSugerido = precioParaMargen(costoInterno, p.margenSugeridoPct, p.impuestosPct, p.comisionesPct);
  const precioPremium = precioParaMargen(costoInterno, p.margenPremiumPct, p.impuestosPct, p.comisionesPct);

  const precioFinal =
    p.precioElegido === "minimo"
      ? precioMinimo
      : p.precioElegido === "premium"
      ? precioPremium
      : p.precioElegido === "manual"
      ? p.precioManual
      : precioSugerido;

  const impuestosMonto = precioFinal * (p.impuestosPct / 100);
  const comisionesMonto = precioFinal * (p.comisionesPct / 100);
  const gananciaTrama = precioFinal - costoInterno - impuestosMonto - comisionesMonto;
  const margenReal = precioFinal > 0 ? (gananciaTrama / precioFinal) * 100 : 0;

  return {
    costoItems,
    costoAdicionales,
    baseCostos,
    fondoImprevistosMonto,
    costoInterno,
    precioMinimo,
    precioSugerido,
    precioPremium,
    precioFinal,
    impuestosMonto,
    comisionesMonto,
    gananciaTrama,
    margenReal,
    subtotalCliente,
  };
}

/** Porcentaje que representa `monto` dentro de un total (0 si el total es 0). */
export function pctDe(monto: number, total: number): number {
  return total > 0 ? (monto / total) * 100 : 0;
}

/** Suma de las participaciones (%) de los servicios de un presupuesto. */
export function sumaParticipacion(p: Presupuesto): number {
  return p.items.reduce((acc, it) => acc + (it.participacionPct || 0), 0);
}

export interface DistribucionResumen {
  totalDistribuido: number;
  totalPresupuesto: number;
  diferencia: number; // positivo = queda dinero sin asignar, negativo = excede
  excede: boolean;
  incompleto: boolean;
}

export function montoDistribucion(item: { tipo: "fijo" | "porcentaje"; valor: number }, precioFinal: number): number {
  return item.tipo === "fijo" ? item.valor : precioFinal * (item.valor / 100);
}

export function resumenDistribucion(p: Presupuesto, precioFinal: number): DistribucionResumen {
  const totalDistribuido = p.distribucion.reduce((acc, d) => acc + montoDistribucion(d, precioFinal), 0);
  const diferencia = precioFinal - totalDistribuido;
  return {
    totalDistribuido,
    totalPresupuesto: precioFinal,
    diferencia,
    excede: diferencia < -0.5,
    incompleto: diferencia > 0.5,
  };
}

export function siguienteNumeroPresupuesto(data: AppData): number {
  return data.presupuestos.reduce((max, p) => Math.max(max, p.numero), 0) + 1;
}

// ---------- Finanzas mensuales ----------

export function movimientosDelMes(data: AppData, mes: number, anio: number): Movimiento[] {
  return data.movimientos.filter((m) => inPeriod(m.fecha, mes, anio));
}

export function facturacionMes(data: AppData, mes: number, anio: number): number {
  return movimientosDelMes(data, mes, anio)
    .filter((m) => esIngreso(m.tipo))
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export function cobradoMes(data: AppData, mes: number, anio: number): number {
  return movimientosDelMes(data, mes, anio)
    .filter((m) => esIngreso(m.tipo) && m.estado === "cobrado")
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export function pendienteCobroMes(data: AppData, mes: number, anio: number): number {
  return movimientosDelMes(data, mes, anio)
    .filter((m) => esIngreso(m.tipo) && m.estado !== "cobrado")
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export function gastosMes(data: AppData, mes: number, anio: number): number {
  return movimientosDelMes(data, mes, anio)
    .filter((m) => !esIngreso(m.tipo) && !TIPOS_SUELDO.includes(m.tipo))
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export function sueldosMes(data: AppData, mes: number, anio: number): number {
  return movimientosDelMes(data, mes, anio)
    .filter((m) => TIPOS_SUELDO.includes(m.tipo))
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export function sueldoDirectoraMes(data: AppData, mes: number, anio: number): number {
  const directoraIds = new Set(data.equipo.filter((p) => p.esDirectora).map((p) => p.id));
  return movimientosDelMes(data, mes, anio)
    .filter((m) => m.tipo === "pago_sueldo" && m.personaId && directoraIds.has(m.personaId))
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export interface ResumenMes {
  facturacion: number;
  cobrado: number;
  pendienteCobro: number;
  gastos: number;
  sueldos: number;
  sueldoDirectora: number;
  gananciaBruta: number;
  gananciaNeta: number;
  margenGanancia: number;
  reinversionDisponible: number;
}

export function resumenMes(data: AppData, mes: number, anio: number): ResumenMes {
  const facturacion = facturacionMes(data, mes, anio);
  const cobrado = cobradoMes(data, mes, anio);
  const pendienteCobro = pendienteCobroMes(data, mes, anio);
  const gastos = gastosMes(data, mes, anio);
  const sueldos = sueldosMes(data, mes, anio);
  const sueldoDirectora = sueldoDirectoraMes(data, mes, anio);
  const gananciaBruta = cobrado - gastos;
  const gananciaNeta = gananciaBruta - sueldos;
  const margenGanancia = cobrado > 0 ? (gananciaNeta / cobrado) * 100 : 0;
  const reinversionDisponible = gananciaNeta > 0 ? gananciaNeta * (data.config.porcentajeReinversion / 100) : 0;
  return {
    facturacion,
    cobrado,
    pendienteCobro,
    gastos,
    sueldos,
    sueldoDirectora,
    gananciaBruta,
    gananciaNeta,
    margenGanancia,
    reinversionDisponible,
  };
}

export function gastosPorCategoria(data: AppData, mes: number, anio: number): { categoria: string; monto: number }[] {
  const map = new Map<string, number>();
  for (const m of movimientosDelMes(data, mes, anio)) {
    if (esIngreso(m.tipo)) continue;
    const key = m.categoria || "Sin categoría";
    map.set(key, (map.get(key) ?? 0) + movimientoEnARS(m));
  }
  return Array.from(map.entries())
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);
}

export function evolucionFacturacion(data: AppData, meses = 6): { label: string; mes: number; anio: number; facturacion: number; gastos: number; gananciaNeta: number }[] {
  const now = new Date();
  const out: { label: string; mes: number; anio: number; facturacion: number; gastos: number; gananciaNeta: number }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = d.getMonth() + 1;
    const anio = d.getFullYear();
    const r = resumenMes(data, mes, anio);
    out.push({
      label: d.toLocaleDateString("es-AR", { month: "short" }),
      mes,
      anio,
      facturacion: r.facturacion,
      gastos: r.gastos,
      gananciaNeta: r.gananciaNeta,
    });
  }
  return out;
}

// ---------- Rentabilidad por cliente ----------

export interface RentabilidadCliente {
  cliente: Cliente;
  ingresos: number;
  gastos: number;
  ganancia: number;
  margen: number;
}

export function movimientosCliente(data: AppData, clienteId: string, mes?: number, anio?: number): Movimiento[] {
  return data.movimientos.filter(
    (m) => m.clienteId === clienteId && (mes == null || anio == null || inPeriod(m.fecha, mes, anio))
  );
}

export function rentabilidadCliente(data: AppData, cliente: Cliente, mes?: number, anio?: number): RentabilidadCliente {
  const movs = movimientosCliente(data, cliente.id, mes, anio);
  const ingresos = movs.filter((m) => esIngreso(m.tipo)).reduce((acc, m) => acc + movimientoEnARS(m), 0);
  const gastos = movs.filter((m) => !esIngreso(m.tipo)).reduce((acc, m) => acc + movimientoEnARS(m), 0);
  const ganancia = ingresos - gastos;
  const margen = ingresos > 0 ? (ganancia / ingresos) * 100 : 0;
  return { cliente, ingresos, gastos, ganancia, margen };
}

export function rentabilidadPorCliente(data: AppData, mes?: number, anio?: number): RentabilidadCliente[] {
  return data.clientes
    .map((c) => rentabilidadCliente(data, c, mes, anio))
    .filter((r) => r.ingresos > 0 || r.gastos > 0)
    .sort((a, b) => b.ganancia - a.ganancia);
}

// ---------- Equipo: pagos ----------

export function pagosPendientesPersona(data: AppData, personaId: string): number {
  return data.movimientos
    .filter((m) => m.personaId === personaId && TIPOS_SUELDO.includes(m.tipo) && m.estado === "pendiente")
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

export function pagosRealizadosPersona(data: AppData, personaId: string, mes?: number, anio?: number): number {
  return data.movimientos
    .filter(
      (m) =>
        m.personaId === personaId &&
        TIPOS_SUELDO.includes(m.tipo) &&
        m.estado === "pagado" &&
        (mes == null || anio == null || inPeriod(m.fecha, mes, anio))
    )
    .reduce((acc, m) => acc + movimientoEnARS(m), 0);
}

/** Estimación de cuánto debería cobrar una persona este mes según su tipo de
 * contratación y los clientes que tiene asignados (además de cualquier pago
 * ya cargado manualmente en Finanzas). */
export function estimacionCobroPersona(data: AppData, persona: Persona): number {
  if (persona.tipoContratacion === "mensual") return persona.sueldoFijo;
  if (persona.tipoContratacion === "cliente") {
    return persona.clientesAsignados.length * persona.valorPieza;
  }
  return 0;
}

// ---------- Punto de equilibrio ----------

export interface PuntoEquilibrio {
  costosFijosMensuales: number;
  facturacionNecesariaCubrirCostos: number;
  facturacionParaGanancia: (objetivo: number) => number;
}

export function calcularPuntoEquilibrio(data: AppData, meses = 3): PuntoEquilibrio {
  const now = new Date();
  let totalGastos = 0;
  let totalSueldos = 0;
  for (let i = 0; i < meses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    totalGastos += gastosMes(data, d.getMonth() + 1, d.getFullYear());
    totalSueldos += sueldosMes(data, d.getMonth() + 1, d.getFullYear());
  }
  const sueldosFijosEquipo = data.equipo
    .filter((p) => p.activa && p.tipoContratacion === "mensual")
    .reduce((acc, p) => acc + p.sueldoFijo, 0);
  const costosFijosMensuales = totalGastos / meses + Math.max(totalSueldos / meses, sueldosFijosEquipo);
  return {
    costosFijosMensuales,
    facturacionNecesariaCubrirCostos: costosFijosMensuales,
    facturacionParaGanancia: (objetivo: number) => costosFijosMensuales + objetivo,
  };
}

// ---------- Alertas ----------

export interface Alerta {
  id: string;
  kind: "warning" | "danger" | "info";
  texto: string;
}

export function calcularAlertas(data: AppData, config: Config): Alerta[] {
  const alertas: Alerta[] = [];
  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  for (const p of data.presupuestos) {
    if (p.estado === "aprobado" || p.estado === "borrador") {
      const t = calcularPresupuesto(p);
      if (t.margenReal < config.margenGananciaMinimo) {
        alertas.push({
          id: `margen-${p.id}`,
          kind: "danger",
          texto: `Presupuesto #${p.numero} (${p.nombreCliente}) tiene un margen de ${fPct(t.margenReal, 0)}, por debajo del mínimo (${fPct(config.margenGananciaMinimo, 0)}).`,
        });
      }
    }
  }

  for (const m of data.movimientos) {
    if (m.estado === "pendiente") {
      const f = new Date(`${m.fecha}T00:00:00`);
      if (f < now) {
        alertas.push({
          id: `vencido-${m.id}`,
          kind: "warning",
          texto: `${esIngreso(m.tipo) ? "Cobro" : "Pago"} pendiente vencido: "${m.descripcion}" (${fARS(movimientoEnARS(m))}).`,
        });
      }
    }
  }

  for (const r of rentabilidadPorCliente(data, mes, anio)) {
    if (r.ganancia < 0) {
      alertas.push({
        id: `no-rentable-${r.cliente.id}`,
        kind: "danger",
        texto: `${r.cliente.marca} no es rentable este mes (${fARS(r.ganancia)}).`,
      });
    }
  }

  const resumen = resumenMes(data, mes, anio);
  if (resumen.sueldos + resumen.gastos > resumen.cobrado && resumen.cobrado > 0) {
    alertas.push({
      id: "gastos-superan-ingresos",
      kind: "danger",
      texto: "Los sueldos y gastos fijos superan lo cobrado este mes.",
    });
  }

  return alertas;
}
