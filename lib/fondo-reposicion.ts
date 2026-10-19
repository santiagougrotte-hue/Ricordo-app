// Fondo de reposición: la plata de la mercadería vendida (CMV) que las ventas devolvieron para
// recomprar insumos, menos lo que ya se compró. Mismo criterio que `cmvAcumulado` /
// `comprasAcumuladas` (pedidos Entregados y compras posteriores a cada fecha de corte, más los
// saldos iniciales de Configuración), separado en masa y packaging (control semanal) y relleno
// (compra mensual), igual que la pestaña FONDOS de la planilla Ricordo · Finanzas.

import type { RicordoDataV2 } from "./types-v2";
import { costoPedidoItem } from "./calc-v2";
import { isAfter } from "./calc";
import { claseInsumoImport, costoPorEtapaVariante } from "./resumen-sheets";

export interface FondoReposicion {
  cmv_masa_packaging: number;
  cmv_relleno: number;
  compras_masa_packaging: number;
  compras_relleno: number;
  saldo_inicial_cmv: number;
  saldo_inicial_compras: number;
  disponible_masa_packaging: number;
  disponible_relleno: number;
  /** Total = saldo inicial CMV − saldo inicial compras + los dos disponibles. */
  disponible_total: number;
  cmv_total: number;
  compras_total: number;
}

export function calcularFondoReposicion(data: RicordoDataV2): FondoReposicion {
  const cfg = data.configuracion;
  let cmvMasaPack = 0;
  let cmvRelleno = 0;
  const pedidosOk = new Set(data.pedidos.filter((p) => p.estado === "Entregado" && isAfter(p.fecha, cfg.fecha_corte_cmv)).map((p) => p.id));
  for (const item of data.pedido_items) {
    if (!pedidosOk.has(item.pedido_id)) continue;
    const costo = costoPedidoItem(data, item);
    if (costo === 0 || !item.producto_variante_id) continue;
    const etapas = costoPorEtapaVariante(data, item.producto_variante_id);
    const total = etapas.masa + etapas.relleno + etapas.packaging;
    const partRelleno = total > 0 ? etapas.relleno / total : 1;
    cmvRelleno += costo * partRelleno;
    cmvMasaPack += costo * (1 - partRelleno);
  }

  let comprasTotal = 0;
  let comprasMasaPack = 0;
  for (const compra of data.compras) {
    if (!isAfter(compra.fecha, cfg.fecha_corte_compras)) continue;
    comprasTotal += compra.total;
    for (const it of data.compra_items.filter((x) => x.compra_id === compra.id)) {
      const clase = claseInsumoImport(data, it.insumo_id);
      if (clase === "masa" || clase === "packaging") comprasMasaPack += it.subtotal;
    }
  }
  const comprasRelleno = comprasTotal - comprasMasaPack;
  const r = (n: number) => Math.round(n);
  const saldoCmv = cfg.saldo_inicial_cmv ?? 0;
  const saldoCompras = cfg.saldo_inicial_compras ?? 0;
  const dispMasa = cmvMasaPack - comprasMasaPack;
  const dispRelleno = cmvRelleno - comprasRelleno;
  return {
    cmv_masa_packaging: r(cmvMasaPack),
    cmv_relleno: r(cmvRelleno),
    compras_masa_packaging: r(comprasMasaPack),
    compras_relleno: r(comprasRelleno),
    saldo_inicial_cmv: saldoCmv,
    saldo_inicial_compras: saldoCompras,
    disponible_masa_packaging: r(dispMasa),
    disponible_relleno: r(dispRelleno),
    disponible_total: r(saldoCmv - saldoCompras + dispMasa + dispRelleno),
    cmv_total: r(saldoCmv + cmvMasaPack + cmvRelleno),
    compras_total: r(saldoCompras + comprasTotal),
  };
}
