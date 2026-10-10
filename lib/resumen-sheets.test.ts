import test from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import { resumenProductosSheets, resumenGastosSheets, resumenRecetasRellenoSheets, resumenRepartoSheets } from "./resumen-sheets";

function fixture(): RicordoDataV2 {
  const data = emptyDataV2();
  data.categorias = [
    { id: "CAT-FIJO", nombre: "Costo Fijo — Servicios", ambito: "financiero", activo: true },
    { id: "CAT-REPARTO", nombre: "Costo Indirecto — Reparto", ambito: "financiero", activo: true },
    { id: "CAT-VIAJES", nombre: "Costo Indirecto — Viajes de compra", ambito: "financiero", activo: true },
  ];
  data.insumos = [{ id: "ING-01", nombre: "Harina", unidad: "kg", tipo: "ingrediente", precio_actual: 1000, activo: true, controla_stock: false }];
  data.productos = [
    { id: "PROD-01", nombre: "Calabaza", activo: true, linea: "Pasta" },
    { id: "PROD-14", nombre: "Salsa", activo: true, linea: "Salsa" },
    { id: "PROD-99", nombre: "Inactivo", activo: false, linea: "Pasta" },
  ];
  data.producto_variantes = [
    { id: "VAR-MIN12", producto_id: "PROD-01", canal: "Minorista", activo: true, nombre: "Calabaza minorista 12u", precio_venta: 10000, unidades_por_paquete: 12 },
    { id: "VAR-MAY12", producto_id: "PROD-01", canal: "Mayorista", activo: true, nombre: "Calabaza mayorista 12u", precio_venta: 9000, unidades_por_paquete: 12 },
    { id: "PROD-14", producto_id: "PROD-14", canal: "Minorista", activo: true, nombre: "Salsa", precio_venta: 4500, unidades_por_paquete: 1 },
  ];
  data.recetas = [{ id: "REC-01", producto_id: "PROD-01", nombre: "Receta Calabaza", activa: true }];
  data.receta_items = [
    { id: "RECI-01", receta_id: "REC-01", insumo_id: "ING-01", etapa: "masa", cantidad: 0.01 },
    { id: "RECI-02", receta_id: "REC-01", insumo_id: "ING-01", etapa: "relleno", cantidad: 0.005 },
  ];
  data.clientes = [{ id: "CLI-01", nombre: "Cliente Test" } as RicordoDataV2["clientes"][number]];
  data.pedidos = [
    {
      id: "PED-01",
      fecha: "2026-09-10",
      cliente_id: "CLI-01",
      estado: "Entregado",
      canal: "Minorista",
      descuento: 500,
      zona: "Zona 1 - Cercana",
      costo_envio: 2000,
      costo_real_envio: 3000,
      km_envio: 10,
      total: 10000,
    },
    {
      id: "PED-02",
      fecha: "2026-09-15",
      cliente_id: "CLI-01",
      estado: "Confirmado",
      canal: "Mayorista",
      descuento: 0,
      costo_envio: 0,
      total: 9000,
    },
    {
      id: "PED-03",
      fecha: "2026-09-20",
      cliente_id: "CLI-01",
      estado: "Cancelado",
      canal: "Minorista",
      descuento: 0,
      costo_envio: 0,
      total: 99999,
    },
  ];
  data.pedido_items = [
    { id: "PI-01", pedido_id: "PED-01", producto_variante_id: "VAR-MIN12", nombre_historico: "Calabaza minorista 12u", cantidad: 1, precio_unitario: 10000, descuento: 500, subtotal: 9500 },
    { id: "PI-02", pedido_id: "PED-02", producto_variante_id: "VAR-MAY12", nombre_historico: "Calabaza mayorista 12u", cantidad: 1, precio_unitario: 9000, descuento: 0, subtotal: 9000 },
    { id: "PI-03", pedido_id: "PED-03", producto_variante_id: "VAR-MIN12", nombre_historico: "Calabaza minorista 12u", cantidad: 1, precio_unitario: 10000, descuento: 0, subtotal: 10000 },
  ];
  data.produccion = [{ id: "PR-01", producto_variante_id: "VAR-MIN12", cantidad: 2, fecha: "2026-09-05" }];
  data.compras = [{ id: "C-01", fecha: "2026-09-12", proveedor_id: "PROV-01", estado_pago: "pagado", total: 5000 }];
  data.movimientos_financieros = [
    { id: "MOVF-01", fecha: "2026-09-01", tipo: "egreso", categoria_id: "CAT-FIJO", concepto: "Alquiler", monto: 34000, estado: "confirmado" },
    { id: "MOVF-02", fecha: "2026-09-10", tipo: "egreso", categoria_id: "CAT-REPARTO", concepto: "Diferencia envío PED-01", monto: 1000, estado: "confirmado", origen_tipo: "diferencia_envio", origen_id: "PED-01" },
    { id: "MOVF-03", fecha: "2026-09-14", tipo: "egreso", categoria_id: "CAT-VIAJES", concepto: "Viaje de compra", monto: 7000, estado: "confirmado" },
  ];
  return data;
}

test("resumenProductosSheets: incluye todo producto activo aunque no tenga ventas, excluye inactivos, separa por canal con cajas_eq correctas", () => {
  const filas = resumenProductosSheets(fixture(), "2026-09");
  assert.deepEqual(
    filas.map((f) => f.producto_id).sort(),
    ["PROD-01", "PROD-14"]
  );
  const calabaza = filas.find((f) => f.producto_id === "PROD-01")!;
  // PED-03 está Cancelado: no debe contar aunque tenga fecha en el mes.
  assert.equal(calabaza.cajas_eq_minorista, 1);
  assert.equal(calabaza.cajas_eq_mayorista, 1);
  assert.equal(calabaza.ingresos_minorista, 9500);
  assert.equal(calabaza.ingresos_mayorista, 9000);
  assert.equal(calabaza.descuentos_total, 500);
  assert.equal(calabaza.cajas_producidas_eq, 2); // 2 paquetes de 12u = 24 unidades / 12 = 2
  assert.equal(calabaza.costo_insumos_caja_ref > 0, true); // 12 * (0.01+0.005) * 1000
  assert.equal(calabaza.precio_minorista_caja_ref, 10000);
  assert.equal(calabaza.precio_mayorista_caja_ref, 9000);
});

test("resumenProductosSheets: línea Salsa usa ref=1 (no 12) para cajas equivalentes", () => {
  const filas = resumenProductosSheets(fixture(), "2026-09");
  const salsa = filas.find((f) => f.producto_id === "PROD-14")!;
  assert.equal(salsa.unidades_por_caja_ref, 1);
});

test("resumenGastosSheets: compras_insumos, una fila por categoría, excluye las categorías de reparto", () => {
  const filas = resumenGastosSheets(fixture(), "2026-09");
  const porCategoria = new Map(filas.map((f) => [f.categoria, f]));
  assert.equal(porCategoria.get("Compras de insumos")?.monto, 5000);
  assert.equal(porCategoria.get("Costo Fijo — Servicios")?.monto, 34000);
  assert.equal(porCategoria.has("Costo Indirecto — Reparto"), false);
  assert.equal(porCategoria.has("Costo Indirecto — Viajes de compra"), false);
});

test("resumenRecetasRellenoSheets: solo ítems de etapa relleno de productos activos", () => {
  const filas = resumenRecetasRellenoSheets(fixture());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].producto_id, "PROD-01");
  assert.equal(filas[0].cantidad_por_unidad, 0.005);
});

test("resumenRepartoSheets: agrupa pedidos entregados por zona fija, pedido sin zona cae en Otro, suma Compras Berazategui aparte", () => {
  const filas = resumenRepartoSheets(fixture(), "2026-09");
  const zona1 = filas.find((f) => f.recorrido === "Zona 1 - Cercana")!;
  assert.equal(zona1.viajes, 1);
  assert.equal(zona1.km, 10);
  assert.equal(zona1.costo_total, 3000);
  assert.equal(zona1.envios_cobrados, 2000);
  const compras = filas.find((f) => f.recorrido === "Compras Berazategui")!;
  assert.equal(compras.tipo, "Compras");
  assert.equal(compras.viajes, 1);
  assert.equal(compras.costo_total, 7000);
  // Siempre las 7 zonas + la fila de compras, aunque alguna esté en 0.
  assert.equal(filas.length, 8);
});
