import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import {
  resumenProductosSheets,
  resumenRepartoPorZonaSheets,
  resumenGastosSheets,
  resumenRecetasRellenoSheets,
} from "./resumen-sheets";

function fixture(): RicordoDataV2 {
  const data = emptyDataV2();
  data.insumos = [
    { id: "INS-MASA", nombre: "Harina", tipo: "ingrediente", unidad: "kg", precio_actual: 500, controla_stock: true, activo: true },
    { id: "INS-RELLENO", nombre: "Calabaza", tipo: "ingrediente", unidad: "kg", precio_actual: 1000, controla_stock: true, activo: true },
  ];
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-RELLENO", cantidad: 3 },
  ];
  data.productos = [{ id: "P1", nombre: "Calabaza", linea: "Pasta", activo: true }];
  data.recetas = [{ id: "REC-1", producto_id: "P1", nombre: "Receta base", activa: true }];
  data.receta_items = [
    { id: "RI-1", receta_id: "REC-1", insumo_id: "INS-MASA", etapa: "masa", cantidad: 0.1 },
    { id: "RI-2", receta_id: "REC-1", insumo_id: "INS-RELLENO", etapa: "relleno", cantidad: 0.2 },
  ];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "Caja x10", unidades_por_paquete: 10, precio_venta: 5000, activo: true }];
  data.clientes = [{ id: "C1", nombre: "Cliente 1", canal: "Minorista" }];
  data.produccion = [{ id: "PR1", producto_variante_id: "V1", cantidad: 4, fecha: "2026-01-10" }];
  return data;
}

test("resumenProductosSheets: agrupa por producto y canal, suma cajas producidas y stock", () => {
  const data = fixture();
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-15", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 5000 }];
  data.pedido_items = [{ id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "Caja x10", cantidad: 1, precio_unitario: 5000, descuento: 0, subtotal: 5000 }];

  const filas = resumenProductosSheets(data, "2026-01-01", "2026-01-31");
  assert.equal(filas.length, 1);
  assert.equal(filas[0].producto_nombre, "Calabaza");
  assert.equal(filas[0].linea, "Pasta");
  assert.equal(filas[0].canal, "Minorista");
  assert.equal(filas[0].cajas_vendidas, 1);
  assert.equal(filas[0].cajas_producidas, 4);
  assert.equal(filas[0].ingresos, 5000);
});

test("resumenRepartoPorZonaSheets: agrupa pedidos entregados por zona, con lo cobrado/costo real/diferencia", () => {
  const data = fixture();
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-05", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, zona: "Centro", costo_envio: 2000, costo_real_envio: 2500, total: 7000 },
    { id: "PED-2", fecha: "2026-01-06", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, zona: "Centro", costo_envio: 1000, costo_real_envio: 800, total: 6000 },
    { id: "PED-3", fecha: "2026-01-07", cliente_id: "C1", estado: "Confirmado", canal: "Minorista", descuento: 0, zona: "Sur", costo_envio: 3000, total: 8000 },
  ];
  const filas = resumenRepartoPorZonaSheets(data, "2026-01-01", "2026-01-31");
  assert.equal(filas.length, 1); // PED-3 no está Entregado, no entra
  assert.equal(filas[0].zona, "Centro");
  assert.equal(filas[0].pedidos, 2);
  assert.equal(filas[0].cobrado, 3000);
  assert.equal(filas[0].costo_real, 3300);
  assert.equal(filas[0].diferencia, 300);
});

test("resumenGastosSheets: deja afuera las categorías de reparto del desglose, pero las muestra en envíos", () => {
  const data = fixture();
  data.categorias = [
    { id: "CAT-OP", nombre: "Gasto Operativo — Sueldos", ambito: "financiero", activo: true },
    { id: "CAT-REP", nombre: "Costo Indirecto — Reparto", ambito: "financiero", activo: true },
    { id: "CAT-BZ", nombre: "Costo Indirecto — Reparto (viaje a Berazategui)", ambito: "financiero", activo: true },
  ];
  data.movimientos_financieros = [
    { id: "M1", fecha: "2026-01-10", tipo: "egreso", categoria_id: "CAT-OP", concepto: "Sueldos", monto: 40000, estado: "confirmado" },
    { id: "M2", fecha: "2026-01-11", tipo: "egreso", categoria_id: "CAT-REP", concepto: "Diferencia de envío", monto: 500, estado: "confirmado" },
    { id: "M3", fecha: "2026-01-12", tipo: "egreso", categoria_id: "CAT-BZ", concepto: "Viaje", monto: 8000, estado: "confirmado" },
  ];
  data.pedidos = [
    { id: "PED-1", fecha: "2026-01-05", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 2000, costo_real_envio: 2500, total: 7000 },
  ];

  const r = resumenGastosSheets(data, "2026-01-01", "2026-01-31");
  assert.equal(r.categorias.length, 1);
  assert.equal(r.categorias[0].categoria, "Gasto Operativo — Sueldos");
  assert.equal(r.categorias[0].monto, 40000);
  assert.equal(r.envios.cobrado, 2000);
  assert.equal(r.envios.costo_real, 2500);
  assert.equal(r.envios.diferencia, 500);
});

test("resumenRecetasRellenoSheets: suma el insumo de relleno necesario según lo entregado, contra el stock actual", () => {
  const data = fixture();
  data.pedidos = [{ id: "PED-1", fecha: "2026-01-15", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 5000 }];
  // 2 cajas de 10 unidades c/u -> 20 unidades, 0.2 kg de relleno por unidad -> 4 kg necesarios.
  data.pedido_items = [{ id: "I1", pedido_id: "PED-1", producto_variante_id: "V1", nombre_historico: "Caja x10", cantidad: 2, precio_unitario: 5000, descuento: 0, subtotal: 10000 }];

  const filas = resumenRecetasRellenoSheets(data, "2026-01-01", "2026-01-31");
  assert.equal(filas.length, 1);
  assert.equal(filas[0].insumo_nombre, "Calabaza");
  assert.equal(filas[0].cantidad_necesaria, 4);
  assert.equal(filas[0].stock_actual, 3); // 1 sola compra de 3kg, sin consumo registrado
  assert.equal(filas[0].faltante, 1);
});
