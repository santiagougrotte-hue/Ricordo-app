// IA de stock (Sección 20 del pedido de evolución) — capa de cálculo pura: días de cobertura,
// necesidad de insumos por pedidos ya confirmados/en producción, variación de consumo y una
// sugerencia de compra. Todo derivado de datos ya cargados (inventario_movimientos, pedidos,
// recetas) — nunca inventa un número ni modifica stock por sí sola, solo calcula y alerta.

import type { RicordoDataV2 } from "./types-v2";
import { calcularStock, recetaEfectivaVariante, sumarDias } from "./calc-v2";

/** Consumo diario promedio de un insumo en la ventana [hasta - diasLookback, hasta] — solo cuenta
 * salidas reales de stock (consumo de producción, venta directa, merma), nunca compras ni
 * conteos/ajustes (que no reflejan ritmo de uso). */
export function calcularConsumoDiarioPromedio(data: RicordoDataV2, insumoId: string, hasta: string, diasLookback = 30): number {
  const desde = sumarDias(hasta, -diasLookback);
  const salidas = data.inventario_movimientos.filter(
    (m) =>
      m.item_tipo === "insumo" &&
      m.item_id === insumoId &&
      (m.tipo === "consumo" || m.tipo === "venta" || m.tipo === "merma") &&
      m.fecha > desde &&
      m.fecha <= hasta
  );
  const total = salidas.reduce((acc, m) => acc + Math.abs(m.cantidad), 0);
  return total / diasLookback;
}

/** Cuánto de cada insumo hace falta para producir todo lo que ya está Confirmado o en Producción
 * (pedidos que todavía no se entregaron, así que ese consumo todavía no pasó por el libro de
 * movimientos) — para no descubrir el faltante recién al querer producir. */
export function necesidadPorPedidosPendientes(data: RicordoDataV2): Map<string, number> {
  const necesidad = new Map<string, number>();
  const pedidosPendientes = new Set(
    data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").map((p) => p.id)
  );
  for (const item of data.pedido_items) {
    if (!pedidosPendientes.has(item.pedido_id) || !item.producto_variante_id) continue;
    const variante = data.producto_variantes.find((v) => v.id === item.producto_variante_id);
    if (!variante) continue;
    for (const linea of recetaEfectivaVariante(data, variante)) {
      necesidad.set(linea.insumo_id, (necesidad.get(linea.insumo_id) ?? 0) + linea.cantidad * item.cantidad);
    }
  }
  return necesidad;
}

export type SeveridadAlerta = "critica" | "importante" | "informativa";

export interface AlertaStockInsumo {
  insumo_id: string;
  insumo_nombre: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number | null;
  consumo_diario_promedio: number;
  /** null cuando no hay consumo registrado en la ventana — no se puede estimar una cobertura. */
  dias_cobertura: number | null;
  necesidad_pedidos_pendientes: number;
  faltante_para_pedidos_pendientes: number;
  /** % de cambio del consumo diario de los últimos 30 días contra los 30 anteriores — null si no
   * había consumo en el período anterior para comparar. */
  variacion_consumo_pct: number | null;
  cantidad_sugerida_compra: number;
  severidad: SeveridadAlerta;
  mensaje: string;
}

/** Sección 20: una fila por insumo con stock controlado — la severidad prioriza primero el
 * faltante ya comprometido por pedidos pendientes (es plata ya vendida que no se puede cumplir),
 * después los días de cobertura contra el consumo real. Nunca compra ni ajusta stock: solo
 * calcula y sugiere una cantidad, la decisión de comprar queda del lado humano. */
export function calcularAlertasStock(data: RicordoDataV2, hoy: string, diasLookback = 30): AlertaStockInsumo[] {
  const necesidadPendientes = necesidadPorPedidosPendientes(data);

  const filas: AlertaStockInsumo[] = data.insumos
    .filter((i) => i.controla_stock && i.activo)
    .map((insumo) => {
      const stock_actual = calcularStock(data, "insumo", insumo.id, hoy);
      const consumo_diario_promedio = calcularConsumoDiarioPromedio(data, insumo.id, hoy, diasLookback);
      const consumoAnterior = calcularConsumoDiarioPromedio(data, insumo.id, sumarDias(hoy, -diasLookback), diasLookback);
      const dias_cobertura = consumo_diario_promedio > 0 ? stock_actual / consumo_diario_promedio : null;
      const necesidad_pedidos_pendientes = necesidadPendientes.get(insumo.id) ?? 0;
      const faltante_para_pedidos_pendientes = Math.max(0, necesidad_pedidos_pendientes - stock_actual);
      const variacion_consumo_pct =
        consumoAnterior > 0 ? ((consumo_diario_promedio - consumoAnterior) / consumoAnterior) * 100 : null;

      // Sugerencia: cubrir lo que falta para los pedidos ya comprometidos + volver a tener el
      // stock mínimo cargado (si hay) + un colchón de 7 días de consumo promedio.
      const colchonSeguridad = consumo_diario_promedio * 7;
      const objetivoStock = Math.max(insumo.stock_minimo ?? 0, colchonSeguridad) + necesidad_pedidos_pendientes;
      const cantidad_sugerida_compra = Math.max(0, Math.round(objetivoStock - stock_actual));

      let severidad: SeveridadAlerta = "informativa";
      if (faltante_para_pedidos_pendientes > 0) severidad = "critica";
      else if (insumo.stock_minimo != null && stock_actual < insumo.stock_minimo) severidad = "importante";
      else if (dias_cobertura != null && dias_cobertura < 7) severidad = "importante";

      let mensaje: string;
      if (faltante_para_pedidos_pendientes > 0) {
        mensaje = `Los pedidos confirmados o en producción necesitan ${fNumIa(necesidad_pedidos_pendientes)} ${insumo.unidad} de ${insumo.nombre}, pero solo hay ${fNumIa(stock_actual)} — faltan ${fNumIa(faltante_para_pedidos_pendientes)} ${insumo.unidad}.`;
      } else if (dias_cobertura != null) {
        mensaje = `Quedan ~${Math.floor(dias_cobertura)} día(s) de ${insumo.nombre} al ritmo de consumo actual.`;
      } else {
        mensaje = `Sin consumo registrado de ${insumo.nombre} en los últimos ${diasLookback} días — no se puede estimar cobertura.`;
      }

      return {
        insumo_id: insumo.id,
        insumo_nombre: insumo.nombre,
        unidad: insumo.unidad,
        stock_actual,
        stock_minimo: insumo.stock_minimo ?? null,
        consumo_diario_promedio,
        dias_cobertura,
        necesidad_pedidos_pendientes,
        faltante_para_pedidos_pendientes,
        variacion_consumo_pct,
        cantidad_sugerida_compra,
        severidad,
        mensaje,
      };
    });

  const ordenSeveridad: Record<SeveridadAlerta, number> = { critica: 0, importante: 1, informativa: 2 };
  return filas.sort((a, b) => {
    const bySeveridad = ordenSeveridad[a.severidad] - ordenSeveridad[b.severidad];
    if (bySeveridad !== 0) return bySeveridad;
    if (a.dias_cobertura === null) return 1;
    if (b.dias_cobertura === null) return -1;
    return a.dias_cobertura - b.dias_cobertura;
  });
}

function fNumIa(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}
