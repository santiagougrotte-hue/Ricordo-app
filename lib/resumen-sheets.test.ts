import test from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import {
  resumenProductosSheets,
  resumenGastosSheets,
  resumenRecetasRellenoSheets,
  resumenRepartoSheets,
  resumenPreciosFormatosSheets,
  resumenStockInsumosSheets,
  formatearNumero,
  celdaTexto,
  decimalesPorColumna,
} from "./resumen-sheets";

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

test("resumenRecetasRellenoSheets: solo ítems de etapa relleno de productos activos, con el stock actual del insumo", () => {
  const data = fixture();
  data.inventario_movimientos = [{ id: "MOV-1", fecha: "2026-09-01", tipo: "compra", item_tipo: "insumo", item_id: "ING-01", cantidad: 7 }];
  const filas = resumenRecetasRellenoSheets(data);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].producto_id, "PROD-01");
  assert.equal(filas[0].cantidad_por_unidad, 0.005);
  assert.equal(filas[0].stock_actual, 7);
});

test("formatearNumero/celdaTexto: separador coma por defecto, 5 decimales en RECETAS_RELLENO sin perder cantidades chicas", () => {
  // Antes el redondeo genérico a 2 decimales hacía que 0,005 (bug real: una cantidad_por_unidad
  // de relleno) diera 0 — acá nunca se pierde, y el separador coma evita que Sheets (configuración
  // regional Argentina) pegue "0.03" como texto o lea "8.11" como fecha.
  assert.equal(formatearNumero(0.005, 5, "coma"), "0,005");
  assert.equal(formatearNumero(0.0006, 5, "coma"), "0,0006");
  assert.equal(formatearNumero(8.11, 2, "coma"), "8,11");
  assert.equal(formatearNumero(0.83, 2, "coma"), "0,83");
  assert.equal(formatearNumero(8.11, 2, "punto"), "8.11"); // con "punto" elegido, se mantiene el punto
  assert.equal(formatearNumero(5000, 2, "coma"), "5000"); // entero: sin parte decimal, sin separador
  assert.equal(celdaTexto("texto", 5, "coma"), "texto"); // una celda no-numérica pasa intacta

  const data = fixture();
  const filas = resumenRecetasRellenoSheets(data);
  const decimales = decimalesPorColumna(8, { 4: 5, 7: 3 }); // HEADERS_RECETAS: índice 4 = cantidad_por_unidad, 7 = stock_actual
  const fila = filas[0];
  assert.equal(celdaTexto(fila.cantidad_por_unidad, decimales[4], "coma"), "0,005");
});

test("resumenRecetasRellenoSheets: un producto de línea Lasaña trae todas las etapas salvo packaging, sumando el mismo insumo repetido en 2 etapas", () => {
  const data = fixture();
  data.productos.push({ id: "PROD-LAS", nombre: "Lasaña", activo: true, linea: "Lasaña" });
  data.recetas.push({ id: "REC-LAS", producto_id: "PROD-LAS", nombre: "Receta Lasaña", activa: true });
  data.insumos.push(
    { id: "ING-RAGU", nombre: "Ragú", unidad: "kg", tipo: "ingrediente", precio_actual: 2000, activo: true, controla_stock: false },
    { id: "ING-QUESO", nombre: "Queso", unidad: "kg", tipo: "ingrediente", precio_actual: 3000, activo: true, controla_stock: false },
    { id: "ING-ALUMINIO", nombre: "Bandeja de aluminio", unidad: "unidad", tipo: "ingrediente", precio_actual: 300, activo: true, controla_stock: false },
    { id: "ING-BOLSA", nombre: "Bolsa lasaña", unidad: "unidad", tipo: "packaging", precio_actual: 50, activo: true, controla_stock: false }
  );
  data.receta_items.push(
    { id: "RL-1", receta_id: "REC-LAS", insumo_id: "ING-RAGU", etapa: "salsa", cantidad: 0.1 },
    { id: "RL-2", receta_id: "REC-LAS", insumo_id: "ING-QUESO", etapa: "terminacion", cantidad: 0.05 },
    { id: "RL-3", receta_id: "REC-LAS", insumo_id: "ING-QUESO", etapa: "masa", cantidad: 0.02 }, // mismo insumo, otra etapa -> se suma
    { id: "RL-4", receta_id: "REC-LAS", insumo_id: "ING-ALUMINIO", etapa: "armado", cantidad: 1 }, // nueva etapa "armado": entra igual, no es packaging
    { id: "RL-5", receta_id: "REC-LAS", insumo_id: "ING-BOLSA", etapa: "packaging", cantidad: 1 } // packaging: excluido
  );
  const filas = resumenRecetasRellenoSheets(data).filter((f) => f.producto_id === "PROD-LAS");
  assert.equal(filas.length, 3); // Ragú + Queso (sumado) + Bandeja (armado) — Bolsa queda afuera
  assert.ok(filas.every((f) => f.cantidad_por_unidad > 0));
  const ragu = filas.find((f) => f.insumo_id === "ING-RAGU")!;
  assert.equal(ragu.cantidad_por_unidad, 0.1);
  const queso = filas.find((f) => f.insumo_id === "ING-QUESO")!;
  assert.equal(queso.cantidad_por_unidad, 0.07); // 0.05 (terminación) + 0.02 (masa)
  assert.ok(filas.some((f) => f.insumo_id === "ING-ALUMINIO"));
  assert.equal(filas.some((f) => f.insumo_id === "ING-BOLSA"), false);
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

test("resumenPreciosFormatosSheets: una fila por variante activa (con y sin ventas), costo = costoVariante/costoManoDeObraVariante, ordenado por producto/canal/unidades", () => {
  const filas = resumenPreciosFormatosSheets(fixture(), "2026-09");
  // 2 variantes activas de Calabaza + 1 de Salsa = 3 filas, aunque Salsa no tuvo ventas.
  assert.equal(filas.length, 3);

  const calabaza = filas.filter((f) => f.producto_id === "PROD-01");
  assert.equal(calabaza.length, 2);
  // Minorista antes que Mayorista, dentro del mismo producto.
  assert.equal(calabaza[0].canal, "Minorista");
  assert.equal(calabaza[1].canal, "Mayorista");

  const minorista = calabaza[0];
  assert.equal(minorista.precio_venta, 10000);
  assert.equal(minorista.costo_total_paquete, minorista.costo_insumos_paquete + minorista.costo_mo_paquete);
  // PED-01 (Entregado, Minorista, 1×VAR-MIN12, $500 de descuento) cuenta; PED-03 (Cancelado, mismo variante) no.
  assert.equal(minorista.paquetes_vendidos_mes, 1);
  assert.equal(minorista.descuentos_mes, 500);

  const mayorista = calabaza[1];
  // PED-02 (Confirmado, no Cancelado) sí cuenta para RESUMEN_PRODUCTOS/PRECIOS_FORMATOS por igual.
  assert.equal(mayorista.paquetes_vendidos_mes, 1);
  assert.equal(mayorista.descuentos_mes, 0);

  const salsa = filas.find((f) => f.producto_id === "PROD-14")!;
  assert.equal(salsa.paquetes_vendidos_mes, 0);
  assert.equal(salsa.descuentos_mes, 0);
});

test("resumenPreciosFormatosSheets: un mes sin ningún pedido igual trae todas las variantes activas, en 0", () => {
  const filas = resumenPreciosFormatosSheets(fixture(), "2020-01");
  assert.equal(filas.length, 3);
  assert.ok(filas.every((f) => f.paquetes_vendidos_mes === 0 && f.descuentos_mes === 0));
  assert.ok(filas.every((f) => f.costo_total_paquete >= 0));
});

test("resumenStockInsumosSheets: un insumo por fila aunque esté en varias etapas/recetas, nunca repetido; insumo sin stock controlado queda afuera", () => {
  const data = fixture();
  data.insumos = [
    { id: "ING-01", nombre: "Harina", unidad: "kg", tipo: "ingrediente", precio_actual: 1000, activo: true, controla_stock: true, categoria_id: "CAT-ING" },
    { id: "ING-02", nombre: "Sal", unidad: "kg", tipo: "ingrediente", precio_actual: 200, activo: true, controla_stock: true },
    { id: "ING-03", nombre: "Bolsa", unidad: "unidad", tipo: "packaging", precio_actual: 50, activo: true, controla_stock: false },
  ];
  data.categorias.push({ id: "CAT-ING", nombre: "Harinas", ambito: "insumo", activo: true });
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-09-01", tipo: "compra", item_tipo: "insumo", item_id: "ING-01", cantidad: 10 },
    { id: "M2", fecha: "2026-09-10", tipo: "conteo", item_tipo: "insumo", item_id: "ING-01", cantidad: 8 },
    { id: "M3", fecha: "2026-09-05", tipo: "consumo", item_tipo: "insumo", item_id: "ING-02", cantidad: -5 },
  ];
  const filas = resumenStockInsumosSheets(data);
  // ING-01 aparece en 2 receta_items del fixture base (masa y relleno, mismo producto) — una sola fila.
  assert.equal(filas.filter((f) => f.insumo_id === "ING-01").length, 1);
  assert.equal(filas.some((f) => f.insumo_id === "ING-03"), false);

  const harina = filas.find((f) => f.insumo_id === "ING-01")!;
  assert.equal(harina.stock_actual, 8); // el conteo del 10/9 resetea la compra anterior
  assert.equal(harina.categoria, "Harinas");
  assert.equal(harina.valor_stock, 8000);
  assert.equal(harina.fecha_ultimo_conteo, "2026-09-10");

  const sal = filas.find((f) => f.insumo_id === "ING-02")!;
  assert.equal(sal.stock_actual, -5);
  assert.equal(sal.valor_stock, 0); // stock negativo nunca valoriza negativo
  assert.equal(sal.fecha_ultimo_conteo, ""); // nunca se contó

  const totalValorStock = filas.reduce((acc, f) => acc + f.valor_stock, 0);
  assert.equal(totalValorStock, 8000);
});
