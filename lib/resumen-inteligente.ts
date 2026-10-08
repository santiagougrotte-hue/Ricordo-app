// "Resumen inteligente" (Inicio → Sección 14 del pedido de evolución): conclusiones en texto
// grounded 100% en números ya calculados por otras capas (Analítica de Ventas, EERR, historial de
// precios) — nunca inventa un dato ni llama a un modelo de lenguaje. Cada conclusión trae su
// `datos` con los números exactos usados, para el link "¿Por qué?" de la UI.

import type { RicordoDataV2 } from "./types-v2";
import { cmvPeriodo, primerDiaMes, ultimoDiaMes, mesAnterior } from "./calc-v2";
import { pctCambio, calcularMetricasVentas, calcularVentasPorCanal, calcularVentasPorGusto } from "./analitica-ventas";

export type CategoriaConclusion = "positivo" | "negativo" | "neutral";

export interface Conclusion {
  id: string;
  texto: string;
  categoria: CategoriaConclusion;
  datos: Record<string, string | number | null>;
}

function fPct(n: number): string {
  const signo = n > 0 ? "+" : "";
  return `${signo}${n.toFixed(1)}%`;
}

/** Sección 14, ejemplo 1: facturación y cajas no siempre se mueven juntas — si una cambió fuerte y
 * la otra se mantuvo, el ticket promedio es lo que realmente se movió. Solo se emite si hay un
 * período anterior comparable (pctCambio no devuelve null). */
function conclusionFacturacionVsCajas(actual: ReturnType<typeof calcularMetricasVentas>, anterior: ReturnType<typeof calcularMetricasVentas>): Conclusion | null {
  const deltaFact = pctCambio(actual.ventas_totales, anterior.ventas_totales);
  const deltaCajas = pctCambio(actual.cajas_vendidas, anterior.cajas_vendidas);
  if (deltaFact === null || deltaCajas === null) return null;
  if (Math.abs(deltaFact) < 5 || Math.abs(deltaCajas) >= 5) return null;

  const direccion = deltaFact > 0 ? "aumentó" : "bajó";
  return {
    id: "facturacion-vs-cajas",
    categoria: deltaFact > 0 ? "positivo" : "negativo",
    texto: `Este mes la facturación ${direccion} (${fPct(deltaFact)}), pero la cantidad de cajas vendidas se mantuvo estable (${fPct(deltaCajas)}) — el cambio vino del ticket promedio, no del volumen.`,
    datos: {
      facturacion_actual: actual.ventas_totales,
      facturacion_anterior: anterior.ventas_totales,
      cajas_actual: actual.cajas_vendidas,
      cajas_anterior: anterior.cajas_vendidas,
      ticket_promedio_actual: actual.ticket_promedio,
      ticket_promedio_anterior: anterior.ticket_promedio,
    },
  };
}

/** Sección 14, ejemplo 2: de qué canal vino la mayor parte del movimiento de facturación (en
 * pesos, no en %, para no exagerar el aporte de un canal chico con un % grande sobre poca base).
 * Requiere que el mes anterior haya tenido facturación real en algún canal — si no, no hay una
 * base contra la cual medir "de dónde vino el crecimiento" (mismo criterio que "Sin base
 * comparable" del resto de la app). */
function conclusionCanalQueMasAporto(porCanalActual: ReturnType<typeof calcularVentasPorCanal>, porCanalAnterior: ReturnType<typeof calcularVentasPorCanal>): Conclusion | null {
  const totalAnterior = porCanalAnterior.reduce((acc, c) => acc + c.ventas_totales, 0);
  if (totalAnterior <= 0) return null;

  const deltas = porCanalActual.map((c) => {
    const ant = porCanalAnterior.find((a) => a.canal === c.canal);
    return { canal: c.canal, delta: c.ventas_totales - (ant?.ventas_totales ?? 0) };
  });
  const deltaTotal = deltas.reduce((acc, d) => acc + d.delta, 0);
  if (Math.abs(deltaTotal) < 1) return null;

  const mayor = deltas.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
  // Si el canal con mayor movimiento no explica al menos la mitad del cambio total, no hay un
  // "responsable" claro — no forzamos la conclusión.
  if (Math.abs(mayor.delta) < Math.abs(deltaTotal) * 0.5) return null;

  const direccion = deltaTotal > 0 ? "crecimiento" : "caída";
  return {
    id: "canal-que-mas-aporto",
    categoria: deltaTotal > 0 ? "positivo" : "negativo",
    texto: `La mayor parte del ${direccion} de facturación vino del canal ${mayor.canal} (${mayor.delta >= 0 ? "+" : ""}$${Math.round(mayor.delta).toLocaleString("es-AR")} de un total de $${Math.round(deltaTotal).toLocaleString("es-AR")}).`,
    datos: Object.fromEntries(deltas.map((d) => [`delta_${d.canal.toLowerCase()}`, Math.round(d.delta)])),
  };
}

/** Sección 14, ejemplo 3: el gusto dominante del mes, si realmente domina (umbral 20% de las
 * cajas) — evita mencionar un gusto irrelevante solo porque quedó primero en un mes con pocas ventas. */
function conclusionGustoDominante(porGusto: ReturnType<typeof calcularVentasPorGusto>): Conclusion | null {
  const top = porGusto[0];
  if (!top || top.pct_cajas === null || top.pct_cajas < 20) return null;
  return {
    id: "gusto-dominante",
    categoria: "neutral",
    texto: `${top.producto_nombre} representa el ${top.pct_cajas.toFixed(1)}% de las cajas vendidas este mes (${top.cajas} cajas).`,
    datos: { producto: top.producto_nombre, cajas: top.cajas, pct_cajas: top.pct_cajas, facturacion: top.facturacion },
  };
}

interface AumentoPrecio {
  insumo_id: string;
  insumo_nombre: string;
  pct: number;
  fecha: string;
  precio_anterior: number;
  precio_nuevo: number;
}

function mayoresAumentosPrecio(data: RicordoDataV2, desde: string, hasta: string): AumentoPrecio[] {
  const resultado: AumentoPrecio[] = [];
  for (const insumo of data.insumos) {
    const historial = data.historial_precios.filter((h) => h.insumo_id === insumo.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (let i = 0; i < historial.length; i++) {
      const entrada = historial[i];
      if (entrada.fecha < desde || entrada.fecha > hasta) continue;
      const anterior = historial[i - 1];
      if (!anterior || anterior.precio <= 0) continue;
      const pct = ((entrada.precio - anterior.precio) / anterior.precio) * 100;
      if (pct > 0) resultado.push({ insumo_id: insumo.id, insumo_nombre: insumo.nombre, pct, fecha: entrada.fecha, precio_anterior: anterior.precio, precio_nuevo: entrada.precio });
    }
  }
  return resultado.sort((a, b) => b.pct - a.pct);
}

/** Sección 14, ejemplo 4 (parte A): el margen bruto cayó respecto del mes anterior — se informa
 * como un hecho aislado, sin atribuirle una causa puntual: el costeo actual usa el precio VIGENTE
 * de cada insumo (no el histórico al momento de cada venta), así que no se puede afirmar con
 * certeza que un aumento de precio puntual sea la causa de la caída de un mes anterior. */
function conclusionMargenCayo(margenActual: number, margenAnterior: number | null): Conclusion | null {
  if (margenAnterior === null) return null;
  const caidaPuntos = margenAnterior - margenActual;
  if (caidaPuntos < 2) return null;
  return {
    id: "margen-cayo",
    categoria: "negativo",
    texto: `El margen bruto de este mes es ${margenActual.toFixed(1)}%, ${caidaPuntos.toFixed(1)} puntos menos que el mes anterior (${margenAnterior.toFixed(1)}%).`,
    datos: { margen_actual_pct: margenActual, margen_anterior_pct: margenAnterior },
  };
}

/** Sección 14, ejemplo 4 (parte B) / Sección 21: aviso independiente de un aumento de precio de
 * insumo relevante en el período — no afirma un vínculo causal con el margen (ver arriba), solo
 * señala el hecho real (historial_precios) para que la persona lo evalúe en Productos → Costos. */
function conclusionAumentoInsumo(data: RicordoDataV2, desde: string, hasta: string): Conclusion | null {
  const aumentos = mayoresAumentosPrecio(data, desde, hasta);
  const mayor = aumentos[0];
  if (!mayor || mayor.pct < 15) return null;
  return {
    id: "aumento-insumo",
    categoria: "negativo",
    texto: `El costo de ${mayor.insumo_nombre} aumentó ${fPct(mayor.pct)} el ${mayor.fecha} (de ${mayor.precio_anterior.toLocaleString("es-AR")} a ${mayor.precio_nuevo.toLocaleString("es-AR")}) — ya se refleja en el costo de los productos que lo usan.`,
    datos: {
      insumo: mayor.insumo_nombre,
      aumento_pct: mayor.pct,
      precio_anterior: mayor.precio_anterior,
      precio_nuevo: mayor.precio_nuevo,
      fecha_aumento: mayor.fecha,
    },
  };
}

/** Genera todas las conclusiones que tengan sustento en los datos del mes — nunca rellena con una
 * genérica si la condición no se cumple. Puede devolver un array vacío. */
export function generarResumenInteligente(data: RicordoDataV2, mes: number, anio: number): Conclusion[] {
  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const ant = mesAnterior(mes, anio);
  const desdeAnt = primerDiaMes(ant.mes, ant.anio);
  const hastaAnt = ultimoDiaMes(ant.mes, ant.anio);

  const metricas = calcularMetricasVentas(data, desde, hasta);
  const metricasAnt = calcularMetricasVentas(data, desdeAnt, hastaAnt);
  const porCanal = calcularVentasPorCanal(data, desde, hasta);
  const porCanalAnt = calcularVentasPorCanal(data, desdeAnt, hastaAnt);
  const porGusto = calcularVentasPorGusto(data, desde, hasta);

  const pedidosDelMes = data.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const pedidosMesAnt = data.pedidos.filter((p) => p.fecha >= desdeAnt && p.fecha <= hastaAnt);
  const cmvActual = cmvPeriodo(data, pedidosDelMes);
  const cmvAnt = cmvPeriodo(data, pedidosMesAnt);
  const margenActual = metricas.ventas_totales > 0 ? ((metricas.ventas_totales - cmvActual) / metricas.ventas_totales) * 100 : 0;
  const margenAnterior = metricasAnt.ventas_totales > 0 ? ((metricasAnt.ventas_totales - cmvAnt) / metricasAnt.ventas_totales) * 100 : null;

  const conclusiones = [
    conclusionFacturacionVsCajas(metricas, metricasAnt),
    conclusionCanalQueMasAporto(porCanal, porCanalAnt),
    conclusionGustoDominante(porGusto),
    conclusionMargenCayo(margenActual, margenAnterior),
    conclusionAumentoInsumo(data, desde, hasta),
  ];

  return conclusiones.filter((c): c is Conclusion => c !== null);
}
