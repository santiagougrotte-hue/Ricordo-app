// Fondo de reposición: la plata de la mercadería vendida (CMV) que las ventas devolvieron para
// recomprar insumos, menos lo que ya se compró. Mismo criterio que `cmvAcumulado` /
// `comprasAcumuladas` (pedidos Entregados y compras posteriores a cada fecha de corte, más los
// saldos iniciales de Configuración). El CMV es uno solo: masa, relleno y packaging juntos.

import type { RicordoDataV2 } from "./types-v2";
import { costoPedidoItem } from "./calc-v2";
import { isAfter } from "./calc";

export interface FondoReposicion {
  /** CMV de lo entregado desde la fecha de corte (masa + relleno + packaging). */
  cmv_vendido: number;
  /** Compras de insumos desde la fecha de corte. */
  compras: number;
  saldo_inicial_cmv: number;
  saldo_inicial_compras: number;
  /** Saldo inicial CMV − saldo inicial compras + CMV vendido − compras. */
  disponible_total: number;
  cmv_total: number;
  compras_total: number;
}

export function calcularFondoReposicion(data: RicordoDataV2): FondoReposicion {
  const cfg = data.configuracion;
  const pedidosOk = new Set(data.pedidos.filter((p) => p.estado === "Entregado" && isAfter(p.fecha, cfg.fecha_corte_cmv)).map((p) => p.id));
  let cmv = 0;
  for (const item of data.pedido_items) {
    if (pedidosOk.has(item.pedido_id)) cmv += costoPedidoItem(data, item);
  }
  const compras = data.compras.filter((c) => isAfter(c.fecha, cfg.fecha_corte_compras)).reduce((acc, c) => acc + c.total, 0);
  const saldoCmv = cfg.saldo_inicial_cmv ?? 0;
  const saldoCompras = cfg.saldo_inicial_compras ?? 0;
  const r = (n: number) => Math.round(n);
  return {
    cmv_vendido: r(cmv),
    compras: r(compras),
    saldo_inicial_cmv: saldoCmv,
    saldo_inicial_compras: saldoCompras,
    disponible_total: r(saldoCmv - saldoCompras + cmv - compras),
    cmv_total: r(saldoCmv + cmv),
    compras_total: r(saldoCompras + compras),
  };
}
