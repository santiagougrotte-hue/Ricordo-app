import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "./types";
import type { RicordoData } from "./types";
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
