import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "./types";
import type { RicordoData } from "./types";
import { emptyDataV2 } from "./types-v2";
import { migrarAV2 } from "./migration/v2";
import {
  costoVariante,
  costoManoDeObraVariante,
  costoPedidoItem,
  manoDeObraPedidoItem,
  calcularStock,
  saldoCaja,
  diferenciaRepartoPedido,
  cmvPeriodo,
  ventasNetas,
  costosFijosTotales,
  totalCostosIndirectosPorTipo,
  valorStockInsumos,
  calcularEerr,
  cobrosPeriodo,
  itemsSinCostoDeterminado,
  calcularComprasCmvInventario,
  calcularMargenPorItem,
  calcularFlujoCaja,
  detectarCanalInconsistente,
  totalCobradoPedido,
  estadoCobroPedido,
  variantesSinFactorReceta,
  estadoCuentaPorCobrar,
  totalPagadoCompra,
  estadoPagoCompraCalculado,
  estadoCuentaPorPagar,
  calcularCuentasPorCobrar,
  calcularCuentasPorPagar,
  calcularDineroLibre,
  calcularBalanceGeneral,
  recetaEfectivaVariante,
  costoUnidadProductoBase,
  idsExcluidosPorRevision,
  calcularEerrEstructurado,
} from "./calc-v2";

function fixture(): RicordoData {
  const data = emptyData();
  data.clientes = [{ id: "CLI-1", nombre: "Juan", canal: "Minorista" }];
  data.proveedores = [{ id: "PROV-1", nombre: "Verdulería" }];
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 500, precio_vigente: null, seguimiento_stock: true }];
  data.packaging = [{ id: "PKG-1", nombre: "Bolsa", unidad: "unidad", precio_ref: 50, precio_vigente: null }];
  data.productos = [
    {
      id: "PROD-BASE",
      id_base: "PROD-BASE",
      nombre: "Calabaza",
      precio_venta: 0,
      activo: true,
      receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-1", cantidad: 0.1 }],
    },
    { id: "PROD-MAYO", id_base: "PROD-BASE", nombre: "Calabaza mayorista", precio_venta: 4000, activo: true, canal: "Mayorista", unidades_por_paquete: 12 },
  ];
  data.recetas = [{ id: "RL-1", id_producto: "PROD-MAYO", tipo: "Packaging", concepto: "PKG-1", cantidad: 1 }];
  data.pedidos = [
    {
      id_pedido: "PED-1",
      id_detalle: "PED-1-A",
      id_cliente: "CLI-1",
      id_producto: "PROD-MAYO",
      nombre_producto: "Calabaza mayorista",
      cantidad: 2,
      precio_unitario: 4000,
      precio_total: 8000,
      descuento_monto: 0,
      precio_neto: 8000,
      fecha: "2026-08-01",
      estado: "Entregado",
      canal: "Mayorista",
      metodo_pago: "Transferencia",
      km_envio: 0,
      costo_envio: 0,
    },
  ];
  data.compras = [
    {
      id: "COM-1",
      fecha: "2026-08-01",
      id_proveedor: "PROV-1",
      total: 1000,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 2, precio_unitario: 500 }],
      lineasPkg: [],
    },
  ];
  data.conteos_ingredientes = [{ id: "CTI-1", id_ingrediente: "ING-1", cantidad: 10, fecha: "2026-07-15" }];
  data.caja_movimientos = [{ id: "CAJ-1", fecha: "2026-08-01", tipo: "ingreso", concepto: "Cobro", monto: 8000, metodo: "Efectivo" }];
  data.costos_fijos = [{ id: "CF-1", descripcion: "Alquiler", monto: 100000, categoria: "General", activo: true }];
  data.costos_indirectos = [{ id: "CI-1", descripcion: "Luz agosto", monto: 5000, mes: 8, anio: 2026, categoria: "Servicios", tipo_costo: "Fijo" }];
  return data;
}

test("costoVariante: hereda la receta del producto base escalada por unidades_por_paquete + su propio packaging", () => {
  const { documento } = migrarAV2(fixture());
  // 12 unidades × 0,1 kg de harina × $500/kg = $600 (masa) + 1 bolsa × $50 (packaging propio) = $650
  const costo = costoVariante(documento.data, "PROD-MAYO");
  assert.equal(costo, 650);
});

test("calcularStock: un conteo resetea el saldo, no se acumula con lo anterior a él", () => {
  const data = fixture();
  const { documento } = migrarAV2(data);
  // conteo del 15/07 = 10; compra del 01/08 = +2 => stock = 12 (no 0+2+10)
  const stock = calcularStock(documento.data, "insumo", "ING-1", "2026-08-31");
  assert.equal(stock, 12);
});

test("valorStockInsumos: solo suma insumos con controla_stock activo, al precio actual", () => {
  const { documento } = migrarAV2(fixture());
  // stock de ING-1 = 12 (ver test anterior) × $500 = $6000; PKG-1 no controla stock, no suma.
  assert.equal(valorStockInsumos(documento.data), 6000);
});

test("saldoCaja: saldo inicial + ingresos - egresos de movimientos_financieros", () => {
  const { documento } = migrarAV2(fixture());
  assert.equal(saldoCaja(documento.data), 8000);
});

test("diferenciaRepartoPedido: positiva si el costo real supera lo cobrado, nunca inventa el costo real si falta", () => {
  assert.equal(diferenciaRepartoPedido({ costo_envio: 1000, costo_real_envio: 1500 }), 500);
  assert.equal(diferenciaRepartoPedido({ costo_envio: 1000, costo_real_envio: 700 }), -300);
  assert.equal(diferenciaRepartoPedido({ costo_envio: 1000, costo_real_envio: undefined }), 0);
});

test("cmvPeriodo + ventasNetas: contribución marginal da positiva con datos sanos", () => {
  const { documento } = migrarAV2(fixture());
  const pedidosAgosto = documento.data.pedidos.filter((p) => p.fecha.startsWith("2026-08"));
  const ventas = ventasNetas(pedidosAgosto);
  const cmv = cmvPeriodo(documento.data, pedidosAgosto);
  assert.equal(ventas, 8000);
  // 2 paquetes vendidos × $650 costo unitario = 1300
  assert.equal(cmv, 1300);
  assert.ok(ventas - cmv > 0);
});

test("costosFijosTotales: el costo fijo recurrente aplica a cualquier mes, el indirecto solo al suyo", () => {
  const { documento } = migrarAV2(fixture());
  const cfAgosto = costosFijosTotales(documento.data, 8, 2026);
  const cfEnero = costosFijosTotales(documento.data, 1, 2026);
  // Agosto: 100000 (fijo recurrente) + 5000 (indirecto de agosto) = 105000
  assert.equal(cfAgosto, 105000);
  // Enero: solo el fijo recurrente, el indirecto es específico de agosto
  assert.equal(cfEnero, 100000);
  assert.equal(totalCostosIndirectosPorTipo(documento.data, 1, 2026, "Fijo"), 0);
});

test("calcularEerr: ventas/CMV/costos fijos coinciden con los mismos datos que usan las funciones ya probadas", () => {
  const { documento } = migrarAV2(fixture());
  const eerr = calcularEerr(documento.data, "2026-08-01", "2026-08-31");
  // Ventas netas = 8000 (mismo total que ventasNetas del pedido Entregado, sin descuentos/envío cargados en el fixture).
  assert.equal(eerr.ventas_netas, 8000);
  assert.equal(eerr.descuentos.total, 0);
  assert.equal(eerr.envios_cobrados.total, 0);
  // CMV = 1300 (2 unidades × $650, igual que el test de cmvPeriodo).
  assert.equal(eerr.cmv.total, 1300);
  assert.equal(eerr.resultado_bruto, 6700);
  assert.ok(eerr.margen_bruto_pct !== null && Math.abs(eerr.margen_bruto_pct - 83.75) < 0.01);
  // El costo indirecto del fixture es "Fijo", no "Variable" — no debe sumar acá.
  assert.equal(eerr.costos_indirectos_variables.total, 0);
  assert.equal(eerr.gastos_operativos.total, 0);
  // Costo fijo recurrente ($100000) aplica una vez por el único mes del rango (agosto).
  assert.equal(eerr.costos_fijos.total, 100000);
  assert.equal(eerr.resultado_operativo, 6700 - 100000);
  // Otros ingresos/gastos e impuestos: sin fuente de datos todavía, siempre en cero.
  assert.equal(eerr.otros_ingresos_gastos.total, 0);
  assert.equal(eerr.impuestos.total, 0);
  assert.equal(eerr.resultado_neto, eerr.resultado_operativo);
  // El detalle de CMV es trazable hasta el pedido_item que lo originó.
  assert.equal(eerr.cmv.registros.length, 1);
  assert.ok(eerr.cmv.registros[0].concepto.includes("Calabaza mayorista"));
});

test("calcularEerr: filtra por canal y no confunde meses sin ventas con NaN", () => {
  const { documento } = migrarAV2(fixture());
  // El único pedido del fixture es Mayorista — filtrando por Minorista no debe quedar nada.
  const eerrMinorista = calcularEerr(documento.data, "2026-08-01", "2026-08-31", "Minorista");
  assert.equal(eerrMinorista.ventas_netas, 0);
  assert.equal(eerrMinorista.margen_bruto_pct, null);
  assert.equal(eerrMinorista.margen_neto_pct, null);
  // Costos fijos/costos indirectos no dependen de pedidos, así que el filtro de canal no los afecta.
  assert.equal(eerrMinorista.costos_fijos.total, 100000);

  const eerrMayorista = calcularEerr(documento.data, "2026-08-01", "2026-08-31", "Mayorista");
  assert.equal(eerrMayorista.ventas_netas, 8000);
});

test("calcularEerr: un mes sin ningún dato da todo en cero, sin dividir por cero", () => {
  const { documento } = migrarAV2(fixture());
  const eerr = calcularEerr(documento.data, "2020-01-01", "2020-01-31");
  assert.equal(eerr.ventas_netas, 0);
  assert.equal(eerr.resultado_bruto, 0);
  assert.equal(eerr.margen_bruto_pct, null);
  // El costo fijo recurrente sigue aplicando (no depende de fecha), el resto queda en cero.
  assert.equal(eerr.costos_fijos.total, 100000);
  assert.equal(eerr.resultado_operativo, -100000);
  assert.equal(eerr.margen_neto_pct, null);
});

test("calcularComprasCmvInventario: compras/CMV/inventario no se confunden, y la conciliación cierra en el fixture", () => {
  const { documento } = migrarAV2(fixture());
  const r = calcularComprasCmvInventario(documento.data, "2026-08-01", "2026-08-31");
  // Compras (COM-1: 2kg × $500) nunca se toman como CMV — son conceptos distintos.
  assert.equal(r.compras.total, 1000);
  assert.equal(r.cmv.total, 1300); // mismo valor que ya prueba calcularEerr/cmvPeriodo
  assert.notEqual(r.compras.total, r.cmv.total);
  assert.equal(r.consumo.total, 0); // el fixture no tiene producción, no hay movimientos de consumo
  assert.equal(r.produccion.total, 0);
  // Inventario de insumos: 10 (conteo de julio) × $500 antes del período, +2 (compra) después.
  assert.equal(r.inventario_insumos_inicial, 5000);
  assert.equal(r.inventario_insumos_final, 6000);
  assert.equal(r.variacion_inventario_insumos, 1000);
  assert.equal(r.ajustes_conteo.total, 0); // el único conteo del fixture es de julio, fuera del rango
  assert.equal(r.mermas.total, 0);
  // Se vendieron 2 unidades sin haber producción registrada: el stock de productos queda en -2
  // (estimado a costo de receta vigente, $650) — por eso también dispara la alerta de stock negativo.
  assert.equal(r.inventario_productos_final, -1300);
  // La conciliación del CMV (inicial + producción − final de productos) debe coincidir con el CMV real.
  assert.equal(r.cmv_conciliado_estimado, r.cmv.total);
  // La conciliación de insumos también cierra en cero en este fixture (no hay diferencia sin explicar).
  assert.equal(r.diferencia_no_explicada, 0);
  assert.ok(r.alertas.some((a) => a.mensaje.includes("Stock negativo") && a.mensaje.includes("Calabaza mayorista")));
  assert.ok(r.alertas.some((a) => a.mensaje.includes("último conteo")));
});

test("calcularComprasCmvInventario: mermas y ajustes de conteo se valorizan al precio del insumo", () => {
  const data = emptyDataV2();
  data.insumos = [{ id: "INS-1", nombre: "Harina", tipo: "ingrediente", unidad: "kg", precio_actual: 100, controla_stock: true, activo: true }];
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-1", cantidad: 50 },
    { id: "M2", fecha: "2026-01-10", tipo: "merma", item_tipo: "insumo", item_id: "INS-1", cantidad: -5 },
    // Calculado antes de este conteo: 50 − 5 = 45; se contaron 40 → diferencia de −5.
    { id: "M3", fecha: "2026-01-20", tipo: "conteo", item_tipo: "insumo", item_id: "INS-1", cantidad: 40 },
  ];
  const r = calcularComprasCmvInventario(data, "2026-01-01", "2026-01-31");
  assert.equal(r.mermas.total, 500);
  assert.equal(r.ajustes_conteo.total, -500);
  assert.equal(r.inventario_insumos_inicial, 0);
  assert.equal(r.inventario_insumos_final, 4000);
  assert.equal(r.dias_desde_ultimo_conteo, 11);
});

test("calcularMargenPorItem: coincide con el CMV/ventas ya probados", () => {
  const { documento } = migrarAV2(fixture());
  const items = calcularMargenPorItem(documento.data, "2026-08-01", "2026-08-31");
  assert.equal(items.length, 1);
  assert.equal(items[0].ventas_brutas, 8000);
  assert.equal(items[0].cmv, 1300);
  assert.equal(items[0].margen_contribucion, 6700);
  assert.ok(items[0].margen_pct !== null && Math.abs(items[0].margen_pct - 83.75) < 0.01);
});

test("calcularMargenPorItem: reparte el descuento del pedido proporcional a ventas, no lo duplica en cada línea", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Sabor A", activo: true }];
  data.producto_variantes = [
    { id: "V1", producto_id: "P1", nombre: "A chica", precio_venta: 100, activo: true },
    { id: "V2", producto_id: "P1", nombre: "A grande", precio_venta: 300, activo: true },
  ];
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 40, costo_envio: 0, total: 360 }];
  // Línea 1: $100 (25% del bruto de $400) → le toca 25% del descuento de $40 = $10.
  // Línea 2: $300 (75% del bruto) → le toca 75% del descuento = $30. $10 + $30 = $40, no $40 + $40.
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "A chica", cantidad: 1, precio_unitario: 100, descuento: 0, subtotal: 100 },
    { id: "I2", pedido_id: "PED-1", producto_variante_id: "V2", nombre_historico: "A grande", cantidad: 1, precio_unitario: 300, descuento: 0, subtotal: 300 },
  ];
  const items = calcularMargenPorItem(data, "2026-01-01", "2026-01-31");
  const i1 = items.find((i) => i.item_id === "I1")!;
  const i2 = items.find((i) => i.item_id === "I2")!;
  assert.equal(i1.descuento, 10);
  assert.equal(i2.descuento, 30);
  assert.equal(i1.descuento + i2.descuento, 40); // nunca $40 + $40
});

test("calcularFlujoCaja: el caja_movimiento_legacy del fixture entra como caja real, agrupado por método de pago", () => {
  const { documento } = migrarAV2(fixture());
  const flujo = calcularFlujoCaja(documento.data, "2026-08-01", "2026-08-31");
  assert.equal(flujo.saldo_inicial, 0);
  assert.equal(flujo.saldo_final, 8000);
  // El movimiento migrado no tiene origen_tipo "venta_pedido" (la entrega ya no genera caja sola) —
  // cae en "otros ingresos", no en "cobros de clientes".
  assert.equal(flujo.cobros_clientes.total, 0);
  assert.equal(flujo.otros_ingresos.total, 8000);
  assert.equal(flujo.pagos_compras.total, 0);
  assert.equal(flujo.flujo_operativo, 8000);
  assert.equal(flujo.flujo_inversion, 0);
  assert.equal(flujo.por_cuenta.length, 1);
  assert.equal(flujo.por_cuenta[0].cuenta, "Efectivo");
  assert.equal(flujo.por_cuenta[0].saldo_final, 8000);
  assert.equal(flujo.evolucion_diaria.length, 1);
  assert.equal(flujo.evolucion_mensual.length, 1);
  assert.equal(flujo.variacion_caja, 8000);
});

test("calcularFlujoCaja: entregar un pedido no genera caja; el cobro y el pago de compra se clasifican en su propio balde; las transferencias no afectan el saldo total", () => {
  const data = emptyDataV2();
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-02-01", tipo: "ingreso", concepto: "Cobro pedido PED-1", monto: 1000, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" },
    { id: "M2", fecha: "2026-02-02", tipo: "egreso", concepto: "Compra COM-1", monto: 300, origen_tipo: "compra_pago", origen_id: "COM-1", estado: "confirmado" },
    { id: "M3", fecha: "2026-02-03", tipo: "egreso", concepto: "Compra de activo — Amasadora", monto: 500, origen_tipo: "compra_activo", origen_id: "ACT-1", estado: "confirmado" },
    { id: "M4", fecha: "2026-02-04", tipo: "transferencia", concepto: "Banco a Efectivo", monto: 200, estado: "confirmado" },
    // Un costo fijo NO es caja real (no tiene origen_tipo de ORIGENES_CAJA_REAL) — no debe entrar acá.
    { id: "M5", fecha: "2026-02-05", tipo: "egreso", concepto: "Alquiler", monto: 9999, categoria_id: "CAT-CF", estado: "confirmado" },
  ];
  data.categorias = [{ id: "CAT-CF", nombre: "Costo Fijo — Alquiler", ambito: "financiero", activo: true }];
  const flujo = calcularFlujoCaja(data, "2026-02-01", "2026-02-28");
  assert.equal(flujo.cobros_clientes.total, 1000);
  assert.equal(flujo.pagos_compras.total, 300);
  assert.equal(flujo.inversiones.total, 500);
  assert.equal(flujo.transferencias.total, 200);
  assert.equal(flujo.saldo_final, 1000 - 300 - 500); // la transferencia es neutra para el total agregado
  assert.equal(flujo.flujo_inversion, -500);
  assert.equal(flujo.flujo_operativo, 1000 - 300);
  assert.equal(flujo.flujo_financiacion, 0);
  // Variación de caja == saldo_final - saldo_inicial, y nunca incluye la transferencia.
  assert.equal(flujo.variacion_caja, flujo.saldo_final - flujo.saldo_inicial);
});

test("calcularFlujoCaja: aportes/retiros del dueño y préstamos van solo a financiación (nunca a operativo), y el ajuste de saldo es neto con signo", () => {
  const data = emptyDataV2();
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-03-01", tipo: "ingreso", concepto: "Aporte del dueño", monto: 500000, origen_tipo: "aporte_dueno", estado: "confirmado" },
    { id: "M2", fecha: "2026-03-02", tipo: "egreso", concepto: "Retiro del dueño", monto: 200000, origen_tipo: "retiro_dueno", estado: "confirmado" },
    { id: "M3", fecha: "2026-03-03", tipo: "ingreso", concepto: "Préstamo banco", monto: 300000, origen_tipo: "prestamo_recibido", estado: "confirmado" },
    { id: "M4", fecha: "2026-03-04", tipo: "egreso", concepto: "Cuota préstamo", monto: 50000, origen_tipo: "devolucion_prestamo", estado: "confirmado" },
    { id: "M5", fecha: "2026-03-05", tipo: "egreso", concepto: "Corrección de saldo inicial", monto: 2756572, origen_tipo: "ajuste_saldo", estado: "confirmado" },
  ];
  const flujo = calcularFlujoCaja(data, "2026-03-01", "2026-03-31");
  assert.equal(flujo.aportes_dueno.total, 500000);
  assert.equal(flujo.retiros_dueno.total, 200000);
  assert.equal(flujo.prestamos_recibidos.total, 300000);
  assert.equal(flujo.devolucion_prestamos.total, 50000);
  // Neto con signo: es un egreso, así que da negativo (a diferencia de todas las otras líneas,
  // que son siempre una magnitud sin signo).
  assert.equal(flujo.ajustes_saldo.total, -2756572);
  assert.equal(flujo.flujo_operativo, 0); // nada de esto es operativo
  assert.equal(flujo.flujo_financiacion, 300000 - 50000 + 500000 - 200000);
  assert.equal(flujo.variacion_caja, flujo.flujo_financiacion - 2756572);
  assert.equal(flujo.saldo_final, flujo.saldo_inicial + flujo.variacion_caja);
});

test("detectarCanalInconsistente: detecta variantes cuyo nombre contradice el canal cargado, sin agrupar por texto", () => {
  const data = emptyDataV2();
  data.producto_variantes = [
    { id: "V1", producto_id: "P1", nombre: "Calabaza mayorista", canal: "Minorista", precio_venta: 100, activo: true },
    { id: "V2", producto_id: "P1", nombre: "Calabaza minorista", canal: "Minorista", precio_venta: 100, activo: true },
    { id: "V3", producto_id: "P1", nombre: "Calabaza al vacío", canal: "Mayorista", precio_venta: 100, activo: true },
  ];
  const alertas = detectarCanalInconsistente(data);
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].variante_id, "V1");
  assert.equal(alertas[0].canal_actual, "Minorista");
  assert.equal(alertas[0].canal_sugerido, "Mayorista");
});

test("detectarCanalInconsistente: 'mayo' cuenta como mayorista, y la propia variante base sin sufijo sugiere Minorista", () => {
  const data = emptyDataV2();
  data.producto_variantes = [
    // La propia base (id === producto_id) sin canal cargado: convención implícita = Minorista.
    { id: "P1", producto_id: "P1", nombre: "Ravioles de calabaza", canal: undefined, precio_venta: 100, activo: true },
    // Abreviatura real vista en los datos de ejemplo.
    { id: "V2", producto_id: "P1", nombre: "Calabaza al vacio mayo", canal: undefined, precio_venta: 100, activo: true },
  ];
  const alertas = detectarCanalInconsistente(data);
  assert.equal(alertas.length, 2);
  assert.ok(alertas.some((a) => a.variante_id === "P1" && a.canal_sugerido === "Minorista"));
  assert.ok(alertas.some((a) => a.variante_id === "V2" && a.canal_sugerido === "Mayorista"));
});

test("calcularEerr/calcularMargenPorItem: costo_real_envio distinto de costo_envio no queda en $0 sin motivo", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Sabor A", activo: true }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "A", precio_venta: 100, activo: true }];
  // Se cobran $50 de envío, pero el costo real (combustible) fue $80 — antes del campo dedicado,
  // el sistema asumía que eran iguales; ahora deben poder diferir.
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 50, costo_real_envio: 80, total: 150 }];
  data.pedido_items = [{ id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "A", cantidad: 1, precio_unitario: 100, descuento: 0, subtotal: 100 }];

  const eerr = calcularEerr(data, "2026-01-01", "2026-01-31");
  assert.equal(eerr.envios_cobrados.total, 50); // ventas netas incluyen lo cobrado
  assert.equal(eerr.costos_indirectos_variables.total, 80); // pero el costo que resta es el real
  assert.equal(eerr.ventas_netas, 150);
  assert.equal(eerr.resultado_bruto, 150); // CMV=0 (sin receta)
  assert.equal(eerr.resultado_operativo, 150 - 80);

  const items = calcularMargenPorItem(data, "2026-01-01", "2026-01-31");
  assert.equal(items[0].costo_envio, 80);
  assert.equal(items[0].ventas_netas, 150);
  assert.equal(items[0].margen_contribucion, 150 - 0 - 80);

  // Esta misma variante no tiene ninguna receta cargada (fixture de arriba) — su costo ($0) no es
  // un dato real, es la ausencia de uno: debe quedar marcada como "sin costo determinado".
  const sinCosto = itemsSinCostoDeterminado(data, "2026-01-01", "2026-01-31");
  assert.equal(sinCosto.length, 1);
  assert.equal(sinCosto[0].id, "I1");
});

test("itemsSinCostoDeterminado: con receta cargada, o sin producto_variante_id vinculado", () => {
  const data = fixtureRecetaPorUnidad();
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-05", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 3000 },
  ];
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "VAR-CAJA10", nombre_historico: "Caja de 10", cantidad: 1, precio_unitario: 3000, descuento: 0, subtotal: 3000 },
    { id: "I2", pedido_id: "PED-1", producto_variante_id: null, nombre_historico: "Ítem viejo sin vincular", cantidad: 1, precio_unitario: 500, descuento: 0, subtotal: 500 },
  ];
  const sinCosto = itemsSinCostoDeterminado(data, "2026-01-01", "2026-01-31");
  // I1 tiene receta cargada (fixture) -> costo SÍ determinado, no aparece. I2 no tiene variante
  // vinculada -> costo indeterminable, sí aparece.
  assert.equal(sinCosto.length, 1);
  assert.equal(sinCosto[0].id, "I2");
});

test("cobrosPeriodo: suma solo ingresos de caja con origen venta_pedido en el rango de fechas, nunca lo facturado", () => {
  const data = emptyDataV2();
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-01-10", tipo: "ingreso", concepto: "Cobro pedido A", monto: 1000, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" },
    { id: "M2", fecha: "2026-01-20", tipo: "ingreso", concepto: "Cobro pedido B", monto: 500, origen_tipo: "venta_pedido", origen_id: "PED-2", estado: "confirmado" },
    // Fuera de rango, de otro origen, o egreso — ninguno debe sumar.
    { id: "M3", fecha: "2026-02-01", tipo: "ingreso", concepto: "Cobro fuera de mes", monto: 999, origen_tipo: "venta_pedido", origen_id: "PED-3", estado: "confirmado" },
    { id: "M4", fecha: "2026-01-15", tipo: "ingreso", concepto: "Aporte del dueño", monto: 200, origen_tipo: "aporte_dueno", estado: "confirmado" },
    { id: "M5", fecha: "2026-01-15", tipo: "egreso", concepto: "Reintegro", monto: 100, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" },
  ];
  assert.equal(cobrosPeriodo(data, "2026-01-01", "2026-01-31"), 1500);
});

test("estadoCobroPedido: Pendiente/Parcial/Cobrado se calculan desde los movimientos ya registrados, nunca desde 'Entregado'", () => {
  const data = emptyDataV2();
  const pedido = { id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Entregado" as const, canal: "Minorista" as const, descuento: 0, costo_envio: 0, total: 1000 };
  data.pedidos = [pedido];
  assert.equal(estadoCobroPedido(data, pedido), "Pendiente"); // entregado, pero sin ningún cobro registrado
  assert.equal(totalCobradoPedido(data, pedido.id), 0);

  data.movimientos_financieros = [{ id: "M1", fecha: "2026-01-05", tipo: "ingreso", concepto: "Seña", monto: 400, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" }];
  assert.equal(estadoCobroPedido(data, pedido), "Parcial");
  assert.equal(totalCobradoPedido(data, pedido.id), 400);

  data.movimientos_financieros.push({ id: "M2", fecha: "2026-01-10", tipo: "ingreso", concepto: "Saldo", monto: 600, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" });
  assert.equal(estadoCobroPedido(data, pedido), "Cobrado");
  assert.equal(totalCobradoPedido(data, pedido.id), 1000);
});

test("variantesSinFactorReceta: detecta la variante que hereda la receta compartida pero no tiene unidades_por_paquete", () => {
  const { documento } = migrarAV2(fixture());
  // El fixture ya tiene PROD-MAYO con unidades_por_paquete: 12 — no debería salir en la lista
  // (a diferencia de la propia base, PROD-BASE, que nunca tuvo ese dato en el esquema viejo y por
  // eso ya sale sola en esta lista — mismo caso real que se ve en los datos de ejemplo).
  const sinFactor = variantesSinFactorReceta(documento.data);
  assert.ok(sinFactor.some((s) => s.variante_id === "PROD-BASE"));
  assert.ok(!sinFactor.some((s) => s.variante_id === "PROD-MAYO"));

  // Le sacamos el dato a PROD-MAYO también para simular el caso completo visto en los datos reales.
  const dataSinFactor = { ...documento.data, producto_variantes: documento.data.producto_variantes.map((v) => (v.id === "PROD-MAYO" ? { ...v, unidades_por_paquete: undefined } : v)) };
  const alertas = variantesSinFactorReceta(dataSinFactor);
  assert.equal(alertas.length, 2);
  assert.ok(alertas.some((a) => a.variante_id === "PROD-MAYO"));
});

test("estadoCuentaPorCobrar/estadoCuentaPorPagar: Pendiente/Parcial/Cobrado(Pagado)/Vencido, VENTA≠COBRO y COMPRA≠PAGO", () => {
  const data = emptyDataV2();
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 100000 },
    { id: "PED-2", fecha: "2026-01-02", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 50000, fecha_vencimiento: "2026-01-10" },
  ];
  data.compras = [
    { id: "COM-1", fecha: "2026-01-01", proveedor_id: "P1", estado_pago: "pendiente", total: 80000 },
    { id: "COM-2", fecha: "2026-01-02", proveedor_id: "P1", estado_pago: "pendiente", total: 40000, fecha_vencimiento: "2026-01-10" },
  ];
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-01-05", tipo: "ingreso", concepto: "Cobro parcial PED-1", monto: 30000, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" },
    { id: "M2", fecha: "2026-01-05", tipo: "egreso", concepto: "Pago parcial COM-1", monto: 20000, origen_tipo: "compra_pago", origen_id: "COM-1", estado: "confirmado" },
  ];
  const hoy = "2026-01-20"; // ya pasó la fecha_vencimiento de PED-2/COM-2 (10 de enero)

  assert.equal(estadoCuentaPorCobrar(data, data.pedidos[0], hoy), "Parcial");
  // Sin cobrar nada y ya vencido -> Vencido (no Pendiente a secas).
  assert.equal(estadoCuentaPorCobrar(data, data.pedidos[1], hoy), "Vencido");

  assert.equal(totalPagadoCompra(data, "COM-1"), 20000);
  assert.equal(estadoPagoCompraCalculado(data, data.compras[0]), "Parcial");
  assert.equal(estadoCuentaPorPagar(data, data.compras[1], hoy), "Vencido");

  // Cobrar/pagar el saldo completo cierra la cuenta.
  data.movimientos_financieros.push(
    { id: "M3", fecha: "2026-01-06", tipo: "ingreso", concepto: "Resto PED-1", monto: 70000, origen_tipo: "venta_pedido", origen_id: "PED-1", estado: "confirmado" },
    { id: "M4", fecha: "2026-01-06", tipo: "egreso", concepto: "Resto COM-1", monto: 60000, origen_tipo: "compra_pago", origen_id: "COM-1", estado: "confirmado" }
  );
  assert.equal(estadoCuentaPorCobrar(data, data.pedidos[0], hoy), "Cobrado");
  assert.equal(estadoCuentaPorPagar(data, data.compras[0], hoy), "Pagado");
});

test("calcularCuentasPorCobrar/calcularCuentasPorPagar: solo pedidos Entregados con saldo abierto, ordenadas por vencimiento", () => {
  const data = emptyDataV2();
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Confirmado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 999999 }, // no entregado: no genera cuenta
    { id: "PED-2", fecha: "2026-01-02", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 50000, fecha_vencimiento: "2026-01-20" },
    { id: "PED-3", fecha: "2026-01-03", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 30000 },
  ];
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-01-04", tipo: "ingreso", concepto: "Cobro total PED-3", monto: 30000, origen_tipo: "venta_pedido", origen_id: "PED-3", estado: "confirmado" },
  ];
  const cuentas = calcularCuentasPorCobrar(data, "2026-01-15");
  assert.equal(cuentas.length, 1); // PED-1 no entregado, PED-3 ya cobrado del todo
  assert.equal(cuentas[0].pedido_id, "PED-2");
  assert.equal(cuentas[0].saldo, 50000);

  data.compras = [
    { id: "COM-1", fecha: "2026-01-01", proveedor_id: "P1", estado_pago: "pendiente", total: 10000, fecha_vencimiento: "2026-02-01" },
    { id: "COM-2", fecha: "2026-01-01", proveedor_id: "P1", estado_pago: "pendiente", total: 5000, fecha_vencimiento: "2026-01-05" },
  ];
  const porPagar = calcularCuentasPorPagar(data, "2026-01-15");
  assert.equal(porPagar.length, 2);
  assert.equal(porPagar[0].compra_id, "COM-2"); // vence antes -> primero
});

test("calcularDineroLibre: descuenta cuentas por pagar del saldo de caja", () => {
  const data = emptyDataV2();
  data.configuracion.saldo_inicial_caja = 1000000;
  data.compras = [{ id: "COM-1", fecha: "2026-01-01", proveedor_id: "P1", estado_pago: "pendiente", total: 200000 }];
  const libre = calcularDineroLibre(data, "2026-01-15");
  assert.equal(libre.dinero_en_cuentas, 1000000);
  assert.equal(libre.cuentas_por_pagar, 200000);
  assert.equal(libre.dinero_libre, 1000000 - 200000);
});

test("calcularBalanceGeneral: ACTIVO = PASIVO + PATRIMONIO NETO con aportes/retiros/préstamos/resultado", () => {
  const data = emptyDataV2();
  data.configuracion.saldo_inicial_caja = 0;
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-01-01", tipo: "ingreso", concepto: "Aporte inicial del dueño", monto: 1000000, origen_tipo: "aporte_dueno", estado: "confirmado" },
    { id: "M2", fecha: "2026-01-02", tipo: "ingreso", concepto: "Préstamo banco", monto: 200000, origen_tipo: "prestamo_recibido", estado: "confirmado" },
    { id: "M3", fecha: "2026-01-03", tipo: "egreso", concepto: "Retiro del dueño", monto: 50000, origen_tipo: "retiro_dueno", estado: "confirmado" },
  ];
  const balance = calcularBalanceGeneral(data, "2026-01-31", "2026-01-01");
  assert.equal(balance.activo_corriente.caja_bancos, 1000000 + 200000 - 50000);
  assert.equal(balance.pasivo_no_corriente.prestamos, 200000);
  assert.equal(balance.patrimonio_neto.aportes_dueno, 1000000);
  assert.equal(balance.patrimonio_neto.retiros_dueno, 50000);
  assert.equal(balance.total_activo, balance.total_pasivo_mas_patrimonio);
  assert.ok(balance.cuadra);
  assert.equal(balance.diferencia, 0);
});

test("calcularBalanceGeneral: separa resultado del período de los resultados acumulados de períodos anteriores", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Sabor A", activo: true }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "A", precio_venta: 1000, activo: true }];
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-15", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 1000 },
    { id: "PED-2", fecha: "2026-02-15", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 2000 },
  ];
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "A", cantidad: 1, precio_unitario: 1000, descuento: 0, subtotal: 1000 },
    { id: "I2", pedido_id: "PED-2", producto_variante_id: "V1", nombre_historico: "A", cantidad: 2, precio_unitario: 1000, descuento: 0, subtotal: 2000 },
  ];
  // Sin CMV cargado (sin receta): resultado neto de cada venta == su venta neta.
  const balance = calcularBalanceGeneral(data, "2026-02-28", "2026-02-01");
  assert.equal(balance.patrimonio_neto.resultado_periodo, 2000); // solo febrero
  assert.equal(balance.patrimonio_neto.resultados_acumulados, 1000); // enero, período anterior
});

function fixtureRecetaPorUnidad() {
  const data = emptyDataV2();
  data.insumos = [
    { id: "INS-PREMEZCLA", nombre: "Premezcla", tipo: "ingrediente", unidad: "kg", precio_actual: 1000, controla_stock: true, activo: true },
    { id: "INS-MOZZA", nombre: "Mozzarella", tipo: "ingrediente", unidad: "kg", precio_actual: 4000, controla_stock: true, activo: true },
    { id: "INS-BOLSA", nombre: "Bolsa al vacío", tipo: "packaging", unidad: "unidad", precio_actual: 50, controla_stock: true, activo: true },
  ];
  data.productos = [{ id: "PROD-RAVIOL", nombre: "Raviol de jamón y queso", activo: true }];
  data.recetas = [{ id: "REC-RAVIOL", producto_id: "PROD-RAVIOL", nombre: "Receta base", activa: true }];
  // Receta "por unidad": 0,018 kg de premezcla y 0,025 kg de mozzarella por CADA raviol individual.
  data.receta_items = [
    { id: "RI-1", receta_id: "REC-RAVIOL", insumo_id: "INS-PREMEZCLA", etapa: "masa", cantidad: 0.018 },
    { id: "RI-2", receta_id: "REC-RAVIOL", insumo_id: "INS-MOZZA", etapa: "relleno", cantidad: 0.025 },
    // Packaging cargado (por error, o a propósito) en la receta compartida — no debe escalar.
    { id: "RI-3", receta_id: "REC-RAVIOL", insumo_id: "INS-BOLSA", etapa: "packaging", cantidad: 1 },
  ];
  data.producto_variantes = [
    { id: "VAR-CAJA10", producto_id: "PROD-RAVIOL", nombre: "Caja de 10", unidades_por_paquete: 10, precio_venta: 3000, activo: true },
    { id: "VAR-CAJA12", producto_id: "PROD-RAVIOL", nombre: "Caja de 12", unidades_por_paquete: 12, precio_venta: 3500, activo: true },
  ];
  return data;
}

test("recetaEfectivaVariante: masa y relleno escalan × unidades_por_paquete, packaging de la receta compartida NO", () => {
  const data = fixtureRecetaPorUnidad();
  const v10 = data.producto_variantes.find((v) => v.id === "VAR-CAJA10")!;
  const items = recetaEfectivaVariante(data, v10);

  const premezcla = items.find((i) => i.insumo_id === "INS-PREMEZCLA")!;
  const mozza = items.find((i) => i.insumo_id === "INS-MOZZA")!;
  const bolsa = items.find((i) => i.insumo_id === "INS-BOLSA")!;

  assert.equal(premezcla.cantidad, 0.018 * 10);
  assert.equal(mozza.cantidad, 0.025 * 10);
  // La bolsa nunca se multiplica por unidades_por_paquete, aunque esté en la receta compartida.
  assert.equal(bolsa.cantidad, 1);
});

test("costoVariante: dos presentaciones del mismo producto base dan costos de masa/relleno distintos, packaging igual", () => {
  const data = fixtureRecetaPorUnidad();
  // Costo de 1 raviol: 0,018×$1000 + 0,025×$4000 = $18 + $100 = $118 -> caja de 10 = $1180 + $50 bolsa = $1230
  assert.equal(costoVariante(data, "VAR-CAJA10"), 1230);
  // Caja de 12: $118×12 = $1416 + $50 bolsa = $1466 — la bolsa no cambia entre presentaciones.
  assert.equal(costoVariante(data, "VAR-CAJA12"), 1466);
});

test("costoUnidadProductoBase: costo de exactamente 1 unidad — solo masa+relleno, nunca packaging, no depende de ninguna variante", () => {
  const data = fixtureRecetaPorUnidad();
  // $18 + $100 = $118 — nunca incluye la bolsa, y da lo mismo sin importar qué variante exista.
  assert.equal(costoUnidadProductoBase(data, "PROD-RAVIOL"), 118);
  data.producto_variantes = [];
  assert.equal(costoUnidadProductoBase(data, "PROD-RAVIOL"), 118);
});

test("costoManoDeObraVariante: sin minutos cargados o sin costo por hora configurado, da 0 — nunca inventa un tiempo", () => {
  const data = fixtureRecetaPorUnidad();
  assert.equal(costoManoDeObraVariante(data, "VAR-CAJA10"), 0);
  data.configuracion.costo_mano_obra_hora = 6000;
  // Sigue en 0: no hay minutos_por_unidad cargado en la receta.
  assert.equal(costoManoDeObraVariante(data, "VAR-CAJA10"), 0);
});

test("costoManoDeObraVariante: receta compartida — los minutos escalan × unidades_por_paquete, igual que masa/relleno", () => {
  const data = fixtureRecetaPorUnidad();
  data.recetas[0].minutos_por_unidad = 2; // 2 minutos por raviol individual
  data.configuracion.costo_mano_obra_hora = 6000; // $6000/hora = $100/minuto
  // Caja de 10: 2 min × 10 = 20 min = 1/3 hora × $6000 = $2000
  assert.equal(costoManoDeObraVariante(data, "VAR-CAJA10"), 2000);
  // Caja de 12: 2 min × 12 = 24 min = 0.4 hora × $6000 = $2400
  assert.equal(costoManoDeObraVariante(data, "VAR-CAJA12"), 2400);
});

test("costoVariante: incluye el costo de mano de obra sumado al de insumos/packaging", () => {
  const data = fixtureRecetaPorUnidad();
  data.recetas[0].minutos_por_unidad = 2;
  data.configuracion.costo_mano_obra_hora = 6000;
  // 1230 (insumos+packaging, ver test de arriba) + 2000 (mano de obra) = 3230
  assert.equal(costoVariante(data, "VAR-CAJA10"), 3230);
});

test("costoPedidoItem/manoDeObraPedidoItem: el CMV de una línea vendida excluye la mano de obra, aunque costoVariante la incluya", () => {
  const data = fixtureRecetaPorUnidad();
  data.recetas[0].minutos_por_unidad = 2;
  data.configuracion.costo_mano_obra_hora = 6000;
  const item = { id: "I1", pedido_id: "PED-1", producto_variante_id: "VAR-CAJA10", nombre_historico: "Caja de 10", cantidad: 3, precio_unitario: 3000, descuento: 0, subtotal: 9000 };
  // costoVariante(VAR-CAJA10) = 3230 (1230 insumos+packaging + 2000 mano de obra, ver test de arriba).
  // costoPedidoItem resta la mano de obra: (3230 - 2000) × 3 = 3690.
  assert.equal(costoPedidoItem(data, item), 3690);
  // manoDeObraPedidoItem toma exactamente lo que costoPedidoItem excluyó: 2000 × 3 = 6000.
  assert.equal(manoDeObraPedidoItem(data, item), 6000);
});

test("costoPedidoItem/manoDeObraPedidoItem: con costo_unitario_historico/mano_obra_unitaria_historica cargados, usan esos valores congelados en vez de recalcular en vivo", () => {
  const data = fixtureRecetaPorUnidad();
  // Precio de insumos sube después de la venta — el ítem ya vendido no debe verse afectado.
  data.insumos.find((i) => i.id === "INS-PREMEZCLA")!.precio_actual = 999999;
  data.configuracion.costo_mano_obra_hora = 6000;
  const item = {
    id: "I1",
    pedido_id: "PED-1",
    producto_variante_id: "VAR-CAJA10",
    nombre_historico: "Caja de 10",
    cantidad: 3,
    precio_unitario: 3000,
    descuento: 0,
    subtotal: 9000,
    costo_unitario_historico: 1230,
    mano_obra_unitaria_historica: 2000,
  };
  assert.equal(costoPedidoItem(data, item), 1230 * 3);
  assert.equal(manoDeObraPedidoItem(data, item), 2000 * 3);
});

test("calcularEerr: la mano de obra sale del CMV y pasa a su propia línea — resultado operativo/neto no cambian de valor", () => {
  const data = fixtureRecetaPorUnidad();
  data.recetas[0].minutos_por_unidad = 2;
  data.configuracion.costo_mano_obra_hora = 6000;
  data.productos = [{ id: "PROD-RAVIOL", nombre: "Ravioles", activo: true }];
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-05", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 6000 }];
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "VAR-CAJA10", nombre_historico: "Caja de 10", cantidad: 2, precio_unitario: 3000, descuento: 0, subtotal: 6000 },
  ];

  const eerr = calcularEerr(data, "2026-01-01", "2026-01-31");
  // CMV = 1230 (insumos+packaging de 1 caja) × 2 = 2460 — sin mano de obra.
  assert.equal(eerr.cmv.total, 2460);
  assert.equal(eerr.resultado_bruto, 6000 - 2460);
  // Mano de obra directa = 2000 (mano de obra de 1 caja) × 2 = 4000.
  assert.equal(eerr.mano_de_obra_directa.total, 4000);
  assert.equal(eerr.resultado_despues_mano_obra, eerr.resultado_bruto - 4000);
  // Sin costos indirectos/fijos/amortizaciones cargados: resultado operativo/neto = resultado después de mano de obra
  // — el total no cambia por mover la mano de obra a su propia línea, solo dónde se ve.
  assert.equal(eerr.resultado_operativo, eerr.resultado_despues_mano_obra);
  assert.equal(eerr.resultado_neto, eerr.resultado_operativo);
  assert.equal(eerr.sueldo_periodo.pago_por_tu_trabajo, 4000);
  assert.equal(eerr.sueldo_periodo.ganancia_del_negocio, eerr.resultado_neto);
  assert.equal(eerr.sueldo_periodo.total_disponible, 4000 + eerr.resultado_neto);
});

test("costoManoDeObraVariante: receta propia/standalone (no compartida) — los minutos NO escalan, ya representan el total de la presentación", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Sabor viejo", activo: true }];
  data.producto_variantes = [{ id: "VAR-VIEJA", producto_id: "P1", nombre: "Presentación única", unidades_por_paquete: 20, precio_venta: 1000, activo: true }];
  // Receta "propia" de la variante — producto_id apunta al id de la VARIANTE, no del producto base
  // (mismo criterio que recetaEfectivaVariante para el caso standalone no migrado).
  data.recetas = [{ id: "REC-VIEJA", producto_id: "VAR-VIEJA", nombre: "Receta vieja", activa: true, minutos_por_unidad: 30 }];
  data.configuracion.costo_mano_obra_hora = 6000;
  // 30 minutos = 0.5 hora × $6000 = $3000 — nunca × 20 (unidades_por_paquete no aplica acá).
  assert.equal(costoManoDeObraVariante(data, "VAR-VIEJA"), 3000);
});

test("idsExcluidosPorRevision: solo junta los casos 'pendiente' de pedidos/pedido_items — resuelto/ignorado ya no cuentan", () => {
  const data = emptyDataV2();
  data.datos_pendientes_revision = [
    { id: "R1", seccion: "pedidos", entidad_id: "PED-1", motivo: "Sin método de pago" }, // sin estado -> pendiente
    { id: "R2", seccion: "pedido_items", entidad_id: "ITEM-1", motivo: "Importe $0", estado: "pendiente" },
    { id: "R3", seccion: "pedido_items", entidad_id: "ITEM-2", motivo: "Neto negativo", estado: "resuelto", resuelto_por: "a@a.com", resuelto_en: "2026-01-01" },
    { id: "R4", seccion: "pedidos", entidad_id: "PED-2", motivo: "Otro caso", estado: "ignorado", nota_resolucion: "Es una venta de prueba, no afecta nada real" },
    { id: "R5", seccion: "insumos", entidad_id: "INS-1", motivo: "No es un pedido, no debería aparecer acá" },
  ];
  const excluidos = idsExcluidosPorRevision(data);
  assert.equal(excluidos.pedidos.has("PED-1"), true);
  assert.equal(excluidos.pedidos.has("PED-2"), false); // ya ignorado, no se excluye más
  assert.equal(excluidos.pedido_items.has("ITEM-1"), true);
  assert.equal(excluidos.pedido_items.has("ITEM-2"), false); // ya resuelto
  assert.equal(excluidos.pedidos.size, 1);
  assert.equal(excluidos.pedido_items.size, 1);
});

test("calcularEerr/calcularMargenPorItem: un pedido pendiente de revisión no entra en ventas hasta resolverse", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Sabor A", activo: true }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "A", precio_venta: 1000, activo: true }];
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-10", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 1000 },
    { id: "PED-2", fecha: "2026-01-15", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 500 },
  ];
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "A", cantidad: 1, precio_unitario: 1000, descuento: 0, subtotal: 1000 },
    { id: "I2", pedido_id: "PED-2", producto_variante_id: "V1", nombre_historico: "A", cantidad: 1, precio_unitario: 500, descuento: 0, subtotal: 500 },
  ];
  data.datos_pendientes_revision = [{ id: "R1", seccion: "pedidos", entidad_id: "PED-2", motivo: "Pedido sin método de pago", estado: "pendiente" }];

  const eerr = calcularEerr(data, "2026-01-01", "2026-01-31");
  assert.equal(eerr.ventas_netas, 1000); // PED-2 excluido mientras esté pendiente

  const items = calcularMargenPorItem(data, "2026-01-01", "2026-01-31");
  assert.equal(items.length, 1);
  assert.equal(items[0].pedido_id, "PED-1");

  // Al marcarlo resuelto, vuelve a contar sin tocar nada más del pedido.
  data.datos_pendientes_revision[0].estado = "resuelto";
  assert.equal(calcularEerr(data, "2026-01-01", "2026-01-31").ventas_netas, 1500);
});

test("calcularEerrEstructurado: reproduce exactamente la estructura pedida (VENTAS/CMV/R.bruto/Gastos adm,comerc./Intereses/IIGG/Resultado neto)", () => {
  const data = emptyDataV2();
  data.clientes = [{ id: "C1", nombre: "Cliente 1", canal: "Minorista" }];
  data.insumos = [{ id: "INS-1", nombre: "Insumo caro", tipo: "ingrediente", unidad: "kg", precio_actual: 140000, controla_stock: false, activo: true }];
  data.productos = [{ id: "P1", nombre: "Producto A", activo: true }];
  data.recetas = [{ id: "REC-1", producto_id: "P1", nombre: "Receta A", activa: true }];
  data.receta_items = [{ id: "RI-1", receta_id: "REC-1", insumo_id: "INS-1", etapa: "masa", cantidad: 1 }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "A", unidades_por_paquete: 1, precio_venta: 300000, activo: true }];
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-10", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 300000 }];
  data.pedido_items = [{ id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "A", cantidad: 1, precio_unitario: 300000, descuento: 0, subtotal: 300000 }];

  data.categorias = [
    { id: "CAT-GO", nombre: "Gasto Operativo — Sueldos", ambito: "financiero", activo: true },
    { id: "CAT-INT", nombre: "Gastos Financieros — Intereses", ambito: "financiero", activo: true },
  ];
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-01-15", tipo: "egreso", categoria_id: "CAT-GO", concepto: "Sueldos", monto: 40000, estado: "confirmado" },
    { id: "M2", fecha: "2026-01-20", tipo: "egreso", categoria_id: "CAT-INT", concepto: "Intereses préstamo", monto: 9200, estado: "confirmado" },
  ];

  const r = calcularEerrEstructurado(data, "2026-01-01", "2026-01-31");
  assert.equal(r.ventas, 300000);
  assert.equal(r.cmv.total, 140000);
  assert.equal(r.resultado_bruto, 160000);
  assert.equal(r.gastos_adm_comerc.total, 40000);
  assert.equal(r.resultado_antes_intereses_impuestos, 120000);
  assert.equal(r.intereses.total, 9200);
  assert.equal(r.resultado_antes_impuestos, 110800);
  assert.equal(r.alicuota_iigg_pct, 35);
  assert.equal(r.iigg, 38780);
  assert.equal(r.resultado_neto, 72020);
});

test("calcularEerrEstructurado: nunca calcula un IIGG negativo cuando el resultado antes de impuestos es negativo", () => {
  const data = emptyDataV2();
  data.clientes = [{ id: "C1", nombre: "Cliente 1", canal: "Minorista" }];
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-10", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 1000 }];
  data.categorias = [{ id: "CAT-INT", nombre: "Gastos Financieros — Intereses", ambito: "financiero", activo: true }];
  data.movimientos_financieros = [{ id: "M1", fecha: "2026-01-20", tipo: "egreso", categoria_id: "CAT-INT", concepto: "Intereses", monto: 5000, estado: "confirmado" }];

  const r = calcularEerrEstructurado(data, "2026-01-01", "2026-01-31");
  assert.ok(r.resultado_antes_impuestos < 0);
  assert.equal(r.iigg, 0);
  assert.equal(r.resultado_neto, r.resultado_antes_impuestos);
});
