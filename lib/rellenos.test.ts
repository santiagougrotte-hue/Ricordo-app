import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2, type Pedido, type PedidoItem } from "./types-v2";
import { consumoInsumosProduccion, kgRellenoDisponible, kgRellenoParaCajas, kgRellenoParaCajasGusto, llevaRelleno, resumenRellenos } from "./rellenos";
import { resumenImportApp, HEADERS_IMPORT_APP } from "./resumen-sheets";

function fixture() {
  const data = emptyDataV2();
  data.insumos = [
    { id: "PREMEZCLA", nombre: "Premezcla", tipo: "ingrediente", unidad: "kg", precio_actual: 5000, controla_stock: true, stock_minimo: 2, activo: true },
    { id: "OSOBUCO", nombre: "Osobuco", tipo: "ingrediente", unidad: "kg", precio_actual: 9500, controla_stock: false, activo: true },
    { id: "BOLSA", nombre: "Bolsa al vacío", tipo: "packaging", unidad: "unidad", precio_actual: 500, controla_stock: true, activo: true },
  ];
  data.productos = [
    { id: "OSO", nombre: "Medialuna de osobuco", linea: "Pasta", activo: true },
    { id: "LAS", nombre: "Lasaña", linea: "Lasaña", activo: true },
  ];
  data.producto_variantes = [
    { id: "OSO-12", producto_id: "OSO", nombre: "Osobuco 12", canal: "Minorista", unidades_por_paquete: 12, precio_venta: 14000, activo: true },
    { id: "OSO-8", producto_id: "OSO", nombre: "Osobuco 8", canal: "Mayorista", unidades_por_paquete: 8, precio_venta: 9000, activo: true },
    { id: "LAS-1", producto_id: "LAS", nombre: "Lasaña", canal: "Minorista", unidades_por_paquete: 1, precio_venta: 18000, activo: true },
  ];
  data.recetas = [{ id: "REC-OSO", producto_id: "OSO", nombre: "Receta", activa: true, minutos_por_unidad: 2.5 }];
  data.receta_items = [
    { id: "R1", receta_id: "REC-OSO", insumo_id: "PREMEZCLA", etapa: "masa", cantidad: 0.01 },
    { id: "R2", receta_id: "REC-OSO", insumo_id: "OSOBUCO", etapa: "relleno", cantidad: 0.007 },
  ];
  data.ajustes_receta_variante = [
    { id: "A1", variante_id: "OSO-12", insumo_id: "BOLSA", operacion: "sumar", cantidad: 1, etapa: "packaging" },
    { id: "A2", variante_id: "OSO-8", insumo_id: "BOLSA", operacion: "sumar", cantidad: 1, etapa: "packaging" },
  ];
  data.configuracion.costo_mano_obra_hora = 6000;
  return data;
}

function pedido(estado: Pedido["estado"] = "Confirmado"): { p: Pedido; items: PedidoItem[] } {
  return {
    p: { id: "PED-1", fecha: "2026-10-20", cliente_id: "C1", estado, canal: "Minorista", descuento: 0, costo_envio: 1000, km_envio: 20, peaje_envio: 500, total: 29000 },
    items: [{ id: "I1", pedido_id: "PED-1", producto_variante_id: "OSO-12", nombre_historico: "Osobuco 12", cantidad: 2, precio_unitario: 14000, descuento: 0, subtotal: 28000 }],
  };
}

test("kgRellenoParaCajas: 13 g por unidad, solo línea Pasta", () => {
  const data = fixture();
  assert.equal(kgRellenoParaCajas(data, data.producto_variantes[0], 10), 1.56);
  assert.equal(kgRellenoParaCajas(data, data.producto_variantes[1], 10), 1.04);
  assert.equal(kgRellenoParaCajas(data, data.producto_variantes[2], 10), 0);
  data.configuracion.gramos_relleno_por_unidad = 15;
  assert.equal(kgRellenoParaCajas(data, data.producto_variantes[0], 1), 0.18);
});

test("resumenRellenos: kilos cargados menos kilos usados al armar, en cajas de 12", () => {
  const data = fixture();
  data.rellenos_cocidos = [
    { id: "T1", fecha: "2026-10-01", producto_id: "OSO", kg: 3 },
    { id: "T2", fecha: "2026-10-15", producto_id: "OSO", kg: 1 },
  ];
  data.produccion = [{ id: "P1", producto_variante_id: "OSO-12", cantidad: 10, fecha: "2026-10-16", kg_relleno: 1.56 }];
  const [r] = resumenRellenos(data);
  assert.equal(r.kg_cargados, 4);
  assert.equal(r.kg_usados, 1.56);
  assert.equal(r.kg_disponibles, 2.44);
  assert.equal(r.produccion_disponible, 15); // 2.44 / 0.156 = 15.6
  assert.equal(r.unidad_produccion, "cajas de 12");
  assert.equal(r.ultima_tanda, "2026-10-15");
  assert.equal(kgRellenoDisponible(data, "OSO"), 2.44);
});

test("resumenRellenos: documento viejo sin rellenos_cocidos no rompe", () => {
  const data = fixture();
  delete data.rellenos_cocidos;
  assert.deepEqual(resumenRellenos(data), []);
});

test("consumoInsumosProduccion: masa controlada por caja de 12, sin relleno ni bolsas", () => {
  const data = fixture();
  const movs = consumoInsumosProduccion(data, { produccionId: "P1", producto_id: "OSO", cajas: 2, fecha: "2026-10-20" });
  assert.deepEqual(
    movs.map((m) => [m.item_id, m.cantidad, m.origen_tipo, m.origen_id]),
    [["PREMEZCLA", -0.24, "produccion", "P1"]] // 0,01 kg × 12 u × 2 cajas; la bolsa va por conteo
  );
});

test("relleno por unidad (lasaña): solo con gramos cargados y receta con relleno", () => {
  const data = fixture();
  data.recetas.push({ id: "REC-LAS", producto_id: "LAS", nombre: "Lasaña", activa: true });
  assert.equal(llevaRelleno(data, "LAS"), false);
  data.receta_items.push({ id: "RL", receta_id: "REC-LAS", insumo_id: "OSOBUCO", etapa: "relleno", cantidad: 0.11 });
  assert.equal(llevaRelleno(data, "LAS"), true);
  assert.equal(kgRellenoParaCajasGusto(data, "LAS", 4), 0); // sin gramos cargados no se controla
  data.productos[1].gramos_relleno_por_unidad = 300;
  assert.equal(kgRellenoParaCajasGusto(data, "LAS", 4), 1.2);
  data.rellenos_cocidos = [{ id: "T", fecha: "2026-10-01", producto_id: "LAS", kg: 2 }];
  const r = resumenRellenos(data).find((x) => x.producto_id === "LAS")!;
  assert.equal(r.produccion_disponible, 6);
  assert.equal(r.unidad_produccion, "unidades");
});

test("resumenImportApp: renglones de venta, pedido, relleno, stock y receta con el formato de las planillas", () => {
  const data = fixture();
  const { p, items } = pedido();
  data.pedidos = [p];
  data.pedido_items = items;
  data.rellenos_cocidos = [{ id: "T1", fecha: "2026-10-01", producto_id: "OSO", kg: 3.12 }];
  data.configuracion.envios.consumo_100km = 10;
  data.configuracion.envios.litro_nafta = 1000;
  const filas = resumenImportApp(data, "2026-09-01", "2026-10-20");
  const col = (fila: (string | number)[], h: (typeof HEADERS_IMPORT_APP)[number]) => fila[HEADERS_IMPORT_APP.indexOf(h)];
  assert.ok(filas.every((f) => f.length === HEADERS_IMPORT_APP.length));

  const venta = filas.find((f) => f[0] === "VENTA")!;
  assert.equal(col(venta, "Importe_neto"), 28000);
  assert.equal(col(venta, "Costo_masa"), 1200); // 0,01 × 12 × 5000 × 2
  assert.equal(col(venta, "Costo_relleno"), 1596); // 0,007 × 12 × 9500 × 2
  assert.equal(col(venta, "Costo_packaging"), 1000);
  assert.equal(col(venta, "Costo_MO"), 6000); // 2,5 min × 12 u = 30 min = $3000 por caja × 2

  const ped = filas.find((f) => f[0] === "PEDIDO")!;
  assert.equal(col(ped, "Envio_cobrado"), 1000);
  assert.equal(col(ped, "Envio_costo"), 2500); // 20 km × 10 l/100 km × $1000 + $500 peaje

  const relleno = filas.find((f) => f[0] === "RELLENO")!;
  assert.equal(col(relleno, "Cajas_que_rinde"), 20);

  const stock = filas.filter((f) => f[0] === "STOCK").map((f) => col(f, "Item_ID"));
  assert.deepEqual(stock.sort(), ["BOLSA", "PREMEZCLA"]);

  const receta = filas.filter((f) => f[0] === "RECETA" && col(f, "Producto_ID") === "OSO");
  assert.equal(receta.find((f) => col(f, "Item_ID") === "OSOBUCO")?.[HEADERS_IMPORT_APP.indexOf("Clase")], "relleno");
  assert.equal(receta.find((f) => col(f, "Item_ID") === "PREMEZCLA")?.[HEADERS_IMPORT_APP.indexOf("Cantidad")], 0.12);
});

test("calcularFondoReposicion: CMV de pedidos entregados menos compras, separado masa/packaging y relleno", async () => {
  const { calcularFondoReposicion } = await import("./fondo-reposicion");
  const data = fixture();
  const { p, items } = pedido("Entregado");
  data.pedidos = [p, { ...p, id: "PED-2", estado: "Confirmado" }];
  data.pedido_items = [...items, { ...items[0], id: "I2", pedido_id: "PED-2" }];
  data.proveedores = [{ id: "PRV", nombre: "Proveedor" } as never];
  data.compras = [{ id: "C1", fecha: "2026-10-18", proveedor_id: "PRV", estado_pago: "pagado", total: 3000 }];
  data.compra_items = [
    { id: "CI1", compra_id: "C1", insumo_id: "PREMEZCLA", cantidad: 0.4, precio_unitario: 5000, subtotal: 2000 },
    { id: "CI2", compra_id: "C1", insumo_id: "OSOBUCO", cantidad: 0.1, precio_unitario: 10000, subtotal: 1000 },
  ];
  const f = calcularFondoReposicion(data);
  // Solo PED-1 (entregado): masa 1200 + packaging 1000 = 2200; relleno 1596.
  assert.equal(f.cmv_masa_packaging, 2200);
  assert.equal(f.cmv_relleno, 1596);
  assert.equal(f.compras_masa_packaging, 2000);
  assert.equal(f.compras_relleno, 1000);
  assert.equal(f.disponible_total, 796);
});
