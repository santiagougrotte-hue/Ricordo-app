import type { AppData, CategoriaEvento, Evento, GastoCuota } from "./types";

export function fARS(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export function fNum(n: number, decimals = 0): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const CATEGORIA_EVENTO_COLOR: Record<CategoriaEvento, "blue" | "purple" | "gold"> = {
  Trabajo: "blue",
  Facultad: "purple",
  Personal: "gold",
};

function ym(fecha: string): { anio: number; mes: number } {
  const [anio, mes] = fecha.split("-").map(Number);
  return { anio, mes };
}

function monthIndex(anio: number, mes: number): number {
  return anio * 12 + (mes - 1);
}

export function inPeriod(fecha: string, mes: number, anio: number): boolean {
  const d = ym(fecha);
  return d.mes === mes && d.anio === anio;
}

/** Cuánto vale cada cuota mensual de un gasto en cuotas. */
export function cuotaMensual(g: GastoCuota): number {
  if (!g.cantidadCuotas || g.cantidadCuotas <= 0) return 0;
  return g.montoTotal / g.cantidadCuotas;
}

/** Número de cuota (1-based) que corresponde a un mes/año dado, o null si ya terminó de pagarse o todavía no empezó. */
export function cuotaEnMes(g: GastoCuota, mes: number, anio: number): number | null {
  const inicio = ym(g.fechaInicio);
  const offset = monthIndex(anio, mes) - monthIndex(inicio.anio, inicio.mes);
  if (offset < 0 || offset >= g.cantidadCuotas) return null;
  return offset + 1;
}

/** Suma de todas las cuotas activas en un mes/año dado. */
export function impactoCuotasEnMes(data: AppData, mes: number, anio: number): number {
  return data.gastosCuotas.reduce(
    (acc, g) => (cuotaEnMes(g, mes, anio) !== null ? acc + cuotaMensual(g) : acc),
    0
  );
}

export function totalIngresosMes(data: AppData, mes: number, anio: number): number {
  const adicionales = data.ingresosAdicionales
    .filter((i) => inPeriod(i.fecha, mes, anio))
    .reduce((acc, i) => acc + i.monto, 0);
  return data.sueldoFijo + adicionales;
}

export function totalEgresosMes(data: AppData, mes: number, anio: number): number {
  const unicos = data.gastosUnicos
    .filter((g) => inPeriod(g.fecha, mes, anio))
    .reduce((acc, g) => acc + g.monto, 0);
  return unicos + impactoCuotasEnMes(data, mes, anio);
}

export function balanceMes(data: AppData, mes: number, anio: number): number {
  return totalIngresosMes(data, mes, anio) - totalEgresosMes(data, mes, anio);
}

/** Proyección de cuánto se va a pagar el mes que viene, sumando las cuotas activas. */
export function proyeccionCuotasMesSiguiente(data: AppData, mes: number, anio: number): number {
  const next = mes === 12 ? { mes: 1, anio: anio + 1 } : { mes: mes + 1, anio };
  return impactoCuotasEnMes(data, next.mes, next.anio);
}

export function gastosPorCategoria(
  data: AppData,
  mes: number,
  anio: number
): { categoria: string; monto: number }[] {
  const map = new Map<string, number>();
  const add = (cat: string, monto: number) => {
    const key = cat || "Sin categoría";
    map.set(key, (map.get(key) ?? 0) + monto);
  };
  for (const g of data.gastosUnicos) {
    if (inPeriod(g.fecha, mes, anio)) add(g.categoria, g.monto);
  }
  for (const g of data.gastosCuotas) {
    if (cuotaEnMes(g, mes, anio) !== null) add(g.categoria, cuotaMensual(g));
  }
  return Array.from(map.entries())
    .map(([categoria, monto]) => ({ categoria, monto }))
    .sort((a, b) => b.monto - a.monto);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export interface Movimiento {
  id: string;
  fecha: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  categoria: string;
  monto: number;
}

/** Todos los movimientos (ingresos y egresos, incluida la cuota del mes de cada gasto en cuotas activo) de un mes/año dado. */
export function movimientosDelMes(data: AppData, mes: number, anio: number): Movimiento[] {
  const rows: Movimiento[] = [];
  const primerDia = `${anio}-${pad2(mes)}-01`;

  if (data.sueldoFijo > 0) {
    rows.push({ id: "sueldo-fijo", fecha: primerDia, tipo: "ingreso", descripcion: "Sueldo fijo", categoria: "Sueldo", monto: data.sueldoFijo });
  }
  for (const i of data.ingresosAdicionales) {
    if (inPeriod(i.fecha, mes, anio)) {
      rows.push({ id: i.id, fecha: i.fecha, tipo: "ingreso", descripcion: i.descripcion, categoria: i.categoria || "Sin categoría", monto: i.monto });
    }
  }
  for (const g of data.gastosUnicos) {
    if (inPeriod(g.fecha, mes, anio)) {
      rows.push({ id: g.id, fecha: g.fecha, tipo: "egreso", descripcion: g.descripcion, categoria: g.categoria || "Sin categoría", monto: g.monto });
    }
  }
  for (const g of data.gastosCuotas) {
    const n = cuotaEnMes(g, mes, anio);
    if (n !== null) {
      rows.push({
        id: `${g.id}-cuota${n}`,
        fecha: primerDia,
        tipo: "egreso",
        descripcion: `${g.descripcion} (cuota ${n}/${g.cantidadCuotas})`,
        categoria: g.categoria || "Sin categoría",
        monto: cuotaMensual(g),
      });
    }
  }
  return rows.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function eventosDelDia(data: AppData, fechaISO: string): Evento[] {
  return data.eventos
    .filter((e) => e.fecha === fechaISO)
    .sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
}

/** Eventos entre hoy y `dias` días hacia adelante (incluye hoy), ordenados por fecha/hora. */
export function eventosProximos(data: AppData, dias = 14): Evento[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + dias);
  return data.eventos
    .filter((e) => {
      const f = new Date(`${e.fecha}T00:00:00`);
      return f >= hoy && f <= limite;
    })
    .sort((a, b) => (a.fecha + (a.hora ?? "")).localeCompare(b.fecha + (b.hora ?? "")));
}
