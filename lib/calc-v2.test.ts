import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "./types";
import type { RicordoData } from "./types";
import { emptyDataV2 } from "./types-v2";
import { migrarAV2 } from "./migration/v2";
import {
  costoVariante,
  calcularStock,
  saldoCaja,
  cmvPeriodo,
  ventasNetas,
  costosFijosTotales,
  totalCostosIndirectosPorTipo,
  puntoEquilibrio,
  valorStockInsumos,
  calcularEerr,
  calcularComprasCmvInventario,
  calcularMargenPorItem,
  agruparMargen,
  compararCanalesPorSabor,
  alertasMargen,
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

test("puntoEquilibrio: da un número positivo y finito con datos sanos", () => {
  const { documento } = migrarAV2(fixture());
  const pedidosAgosto = documento.data.pedidos.filter((p) => p.fecha.startsWith("2026-08"));
  const resultado = puntoEquilibrio(documento.data, pedidosAgosto, 8, 2026);
  assert.ok(Number.isFinite(resultado.pe));
  assert.ok(resultado.pe > 0);
  assert.equal(resultado.unidadesTotales, 2);
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
  assert.equal(eerr.amortizaciones.total, 0);
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

test("calcularMargenPorItem + agruparMargen: coincide con el CMV/ventas ya probados y agrupa por sabor vía id", () => {
  const { documento } = migrarAV2(fixture());
  const items = calcularMargenPorItem(documento.data, "2026-08-01", "2026-08-31");
  assert.equal(items.length, 1);
  assert.equal(items[0].ventas_brutas, 8000);
  assert.equal(items[0].cmv, 1300);
  assert.equal(items[0].margen_contribucion, 6700);
  assert.ok(items[0].margen_pct !== null && Math.abs(items[0].margen_pct - 83.75) < 0.01);

  const porSabor = agruparMargen(items, "sabor");
  assert.equal(porSabor.length, 1);
  assert.equal(porSabor[0].etiqueta, "Calabaza");
  assert.equal(porSabor[0].unidades, 2);
  assert.equal(porSabor[0].margen_contribucion, 6700);

  const comparacion = compararCanalesPorSabor(items);
  assert.equal(comparacion.length, 1);
  assert.equal(comparacion[0].margen_mayorista, 6700);
  assert.equal(comparacion[0].margen_minorista, 0);
  assert.equal(comparacion[0].margen_pct_minorista, null); // sin ventas minoristas, no 0% engañoso
});

test("alertasMargen: dispara la alerta de margen mínimo solo cuando el umbral la supera", () => {
  const { documento } = migrarAV2(fixture());
  const items = calcularMargenPorItem(documento.data, "2026-08-01", "2026-08-31");
  const sinAlerta = alertasMargen(documento.data, items, 50); // margen real ~83.75%, no dispara
  assert.ok(!sinAlerta.some((a) => a.mensaje.includes("Calabaza") && a.mensaje.includes("margen de")));
  const conAlerta = alertasMargen(documento.data, items, 90); // 90% > 83.75%, sí dispara
  assert.ok(conAlerta.some((a) => a.mensaje.includes("Calabaza") && a.mensaje.includes("margen de")));
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

test("alertasMargen: bajo margen $0 en envío (costo real = cobrado), en cambio detecta cuando el envío pesa demasiado sobre la venta bruta", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Sabor A", activo: true }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "A", precio_venta: 100, activo: true }];
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 60, total: 160 }];
  data.pedido_items = [{ id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "A", cantidad: 1, precio_unitario: 100, descuento: 0, subtotal: 100 }];
  const items = calcularMargenPorItem(data, "2026-01-01", "2026-01-31");
  // Sin receta cargada, CMV = 0: el margen de contribución da igual a la venta bruta (100) —
  // el envío nunca lo cambia, porque entra como ingreso y sale como costo por el mismo importe.
  assert.equal(items[0].margen_contribucion, 100);
  const alertas = alertasMargen(data, items, 15);
  // $60 de envío sobre $100 de venta bruta = 60% > 30% → dispara la alerta de envío desproporcionado.
  assert.ok(alertas.some((a) => a.mensaje.includes("representa más del 30%")));
});
