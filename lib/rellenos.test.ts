import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2, type Pedido, type PedidoItem } from "./types-v2";
import {
  conConsumoInsumosVenta,
  consumoInsumosProduccion,
  kgRellenoDisponible,
  kgRellenoParaCajas,
  ORIGEN_CONSUMO_VENTA,
  ORIGEN_CONSUMO_PRODUCCION,
  resumenRellenos,
  produccionPendientePorSabor,
  insumosRellenoControlados,
  movimientosInsumosProduccion,
  movimientosTandaRelleno,
  gramosRellenoPorUnidad,
  kgRellenoParaCajasGusto,
  quitarProduccion,
  registrarProduccion,
  usaRellenoCocido,
  unidadesPorCajaStock,
} from "./rellenos";
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

test("gramosRellenoPorUnidad/kgRellenoParaCajasGusto: un gusto con su propio gramaje pisa el general, el resto sigue con el general", () => {
  const data = fixture();
  data.productos.find((p) => p.id === "OSO")!.gramos_relleno_por_unidad = 11; // este gusto usa menos
  assert.equal(gramosRellenoPorUnidad(data, "OSO"), 11);
  assert.equal(gramosRellenoPorUnidad(data, "LAS"), 13); // Lasaña sigue con el general (default)
  assert.equal(gramosRellenoPorUnidad(data), 13); // sin producto, el general
  // 10 cajas de 12 = 120 unidades × 11 g = 1,32 kg (antes, con 13 g, daba 1,56 kg)
  assert.equal(kgRellenoParaCajasGusto(data, "OSO", 10), 1.32);
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
  assert.equal(r.unidades_ref_disponibles, 15); // 2.44 / 0.156 = 15.6
  assert.equal(r.unidades_por_ref, 12);
  assert.equal(r.ultima_tanda, "2026-10-15");
  assert.equal(kgRellenoDisponible(data, "OSO"), 2.44);
});

test("resumenRellenos: documento viejo sin rellenos_cocidos no rompe", () => {
  const data = fixture();
  delete data.rellenos_cocidos;
  assert.deepEqual(resumenRellenos(data), []);
});

test("consumoInsumosProduccion: descuenta masa y packaging controlados de la presentación de referencia, nunca el relleno", () => {
  const data = fixture();
  const consumo = consumoInsumosProduccion(data, "OSO", 10);
  const porInsumo = Object.fromEntries(consumo.map((c) => [c.insumo_id, c.cantidad]));
  assert.equal(porInsumo.PREMEZCLA, 1.2); // 0,01 kg × 12 u/caja (receta) × 10 cajas
  assert.equal(porInsumo.BOLSA, 10); // 1 bolsa por caja, de la variante de referencia (OSO-12, Minorista)
  assert.equal(porInsumo.OSOBUCO, undefined); // etapa relleno: nunca se descuenta acá
});

test("consumoInsumosProduccion: sin unidades_por_paquete en la variante de referencia, la masa no se descuenta (nunca se inventa un factor) pero el packaging sigue andando", () => {
  const data = fixture();
  // Gusto nuevo con una sola presentación, sin "unidades_por_paquete" cargado — el mismo vacío de
  // datos que deja la masa en $0 en Productos → Variantes ("Falta — receta en $0").
  data.productos.push({ id: "SINUP", nombre: "Sorrentino sin paquete", linea: "Pasta", activo: true });
  data.producto_variantes.push({ id: "SINUP-1", producto_id: "SINUP", nombre: "Sorrentino sin paquete", canal: "Minorista", precio_venta: 14000, activo: true });
  data.recetas.push({ id: "REC-SINUP", producto_id: "SINUP", nombre: "Receta", activa: true });
  data.receta_items.push(
    { id: "RS1", receta_id: "REC-SINUP", insumo_id: "PREMEZCLA", etapa: "masa", cantidad: 0.01 },
    { id: "RS2", receta_id: "REC-SINUP", insumo_id: "BOLSA", etapa: "packaging", cantidad: 1 }
  );
  const consumo = consumoInsumosProduccion(data, "SINUP", 10);
  const porInsumo = Object.fromEntries(consumo.map((c) => [c.insumo_id, c.cantidad]));
  assert.equal(porInsumo.PREMEZCLA, undefined); // masa escalada × 0: se omite, no se inventa un valor
  assert.equal(porInsumo.BOLSA, 10); // packaging no escala por unidades_por_paquete: no se ve afectado
});

test("movimientosInsumosProduccion: genera un consumo negativo por insumo, descartando cantidades en 0", () => {
  const movs = movimientosInsumosProduccion("PRD-1", "2026-10-20", [
    { insumo_id: "PREMEZCLA", cantidad: 1.2 },
    { insumo_id: "OTRO", cantidad: 0 },
  ]);
  assert.equal(movs.length, 1);
  assert.equal(movs[0].item_id, "PREMEZCLA");
  assert.equal(movs[0].cantidad, -1.2);
  assert.equal(movs[0].origen_tipo, ORIGEN_CONSUMO_PRODUCCION);
  assert.equal(movs[0].origen_id, "PRD-1");
  assert.equal(movs[0].tipo, "consumo");
});

test("registrarProduccion: descuenta insumos de masa/packaging al armar, y queda todo reversible con quitarProduccion", () => {
  const data = fixture();
  const out = registrarProduccion(data, { id: "PRD-1", movId: "MOV-1", producto_id: "OSO", cajas: 10, fecha: "2026-10-20" });
  const consumo = out.inventario_movimientos.filter((m) => m.origen_tipo === ORIGEN_CONSUMO_PRODUCCION && m.origen_id === "PRD-1");
  assert.equal(consumo.length, 2); // PREMEZCLA + BOLSA
  assert.equal(out.produccion.length, 1);

  const revertido = quitarProduccion(out, "PRD-1");
  assert.equal(revertido.produccion.length, 0);
  assert.equal(revertido.inventario_movimientos.filter((m) => m.origen_id === "PRD-1").length, 0);
});

test("conConsumoInsumosVenta: ya no genera consumo nuevo, solo limpia movimientos viejos de antes del cambio", () => {
  const data = fixture();
  const conMovimientoViejo = {
    ...data,
    inventario_movimientos: [
      ...data.inventario_movimientos,
      { id: "MOV-VIEJO", fecha: "2026-01-01", tipo: "consumo" as const, origen_tipo: ORIGEN_CONSUMO_VENTA, origen_id: "PED-1", item_tipo: "insumo" as const, item_id: "PREMEZCLA", cantidad: -1 },
    ],
  };
  const limpio = { ...conMovimientoViejo, ...conConsumoInsumosVenta(conMovimientoViejo, "PED-1") };
  assert.equal(limpio.inventario_movimientos.length, data.inventario_movimientos.length);
});

test("insumosRellenoControlados: solo lista los insumos de etapa relleno con stock controlado, escalados por kilo de relleno cocido", () => {
  const data = fixture();
  // A diferencia del Osobuco (se compra fresco para la tanda, sin stock), las Almendras se compran
  // en cantidad y sí se guardan — por eso llevan stock controlado aunque estén en la misma etapa.
  data.insumos.push({ id: "ALMENDRAS", nombre: "Almendras", tipo: "ingrediente", unidad: "kg", precio_actual: 8000, controla_stock: true, activo: true });
  data.receta_items.push({ id: "R3", receta_id: "REC-OSO", insumo_id: "ALMENDRAS", etapa: "relleno", cantidad: 0.002 });
  const insumos = insumosRellenoControlados(data, "OSO");
  assert.equal(insumos.length, 1); // OSOBUCO queda afuera: no tiene controla_stock
  const almendras = insumos.find((i) => i.insumo_id === "ALMENDRAS")!;
  assert.ok(almendras);
  assert.equal(almendras.cantidad_por_kg, 0.002 / 0.013); // 0,002 kg/unidad ÷ 13 g (0,013 kg) de relleno cocido por unidad
});

test("insumosRellenoControlados: un producto sin receta activa no rompe, da lista vacía", () => {
  const data = fixture();
  assert.deepEqual(insumosRellenoControlados(data, "LAS"), []); // Lasaña no tiene receta en el fixture
});

test("movimientosTandaRelleno: genera un consumo por insumo, descartando cantidades en 0", () => {
  const movs = movimientosTandaRelleno("REL-1", "2026-10-22", [
    { insumo_id: "ALMENDRAS", cantidad: 0.4 },
    { insumo_id: "OTRO", cantidad: 0 },
  ]);
  assert.equal(movs.length, 1);
  assert.equal(movs[0].item_id, "ALMENDRAS");
  assert.equal(movs[0].cantidad, -0.4);
  assert.equal(movs[0].origen_tipo, "relleno_tanda");
  assert.equal(movs[0].origen_id, "REL-1");
  assert.equal(movs[0].tipo, "consumo");
});

test("produccionPendientePorSabor: agrupa por sabor (producto), no por presentación/canal, y expresa el total en cajas de 12 para pasta", () => {
  const data = fixture();
  data.clientes = [{ id: "C1", nombre: "Cliente" } as never];
  data.pedidos = [
    { id: "PED-A", fecha: "2026-10-20", cliente_id: "C1", estado: "Produccion", canal: "Minorista", descuento: 0, costo_envio: 0, total: 14000 },
    { id: "PED-B", fecha: "2026-10-21", cliente_id: "C1", estado: "Produccion", canal: "Mayorista", descuento: 0, costo_envio: 0, total: 9000 },
  ];
  data.pedido_items = [
    { id: "I-A", pedido_id: "PED-A", producto_variante_id: "OSO-12", nombre_historico: "Osobuco 12", cantidad: 1, precio_unitario: 14000, descuento: 0, subtotal: 14000 }, // 12u
    { id: "I-B", pedido_id: "PED-B", producto_variante_id: "OSO-8", nombre_historico: "Osobuco 8", cantidad: 1, precio_unitario: 9000, descuento: 0, subtotal: 9000 }, // 8u
  ];
  const items = produccionPendientePorSabor(data, data.pedidos);
  assert.equal(items.length, 1); // un solo sabor, no "Osobuco 12" + "Osobuco 8" por separado
  assert.equal(items[0].nombre, "Medialuna de osobuco");
  assert.equal(items[0].cantidad, Math.round(((12 + 8) / 12) * 100) / 100); // 20 unidades / 12 por caja
  assert.equal(items[0].pedidos, 2);
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

test("usaRellenoCocido: depende de si la receta activa tiene una etapa relleno, no de la línea — el ragú de la lasaña cuenta igual que el relleno de un sorrentino", () => {
  const data = fixture();
  assert.equal(usaRellenoCocido(data, "OSO"), true);
  assert.equal(usaRellenoCocido(data, "LAS"), false); // LAS no tiene receta en el fixture base
  data.recetas.push({ id: "REC-LAS", producto_id: "LAS", nombre: "Receta lasaña", activa: true });
  data.receta_items.push({ id: "R3", receta_id: "REC-LAS", insumo_id: "OSOBUCO", etapa: "relleno", cantidad: 0.05 });
  assert.equal(usaRellenoCocido(data, "LAS"), true);
});

test("kgRellenoParaCajasGusto/resumenRellenos: un gusto que se vende por unidad (lasaña) usa unidades, no cajas de 12", () => {
  const data = fixture();
  data.recetas.push({ id: "REC-LAS", producto_id: "LAS", nombre: "Receta lasaña", activa: true });
  data.receta_items.push({ id: "R3", receta_id: "REC-LAS", insumo_id: "OSOBUCO", etapa: "relleno", cantidad: 0.05 });
  data.productos.find((p) => p.id === "LAS")!.gramos_relleno_por_unidad = 300;

  assert.equal(unidadesPorCajaStock(data, "LAS"), 1);
  // 10 "cajas" de referencia = 10 unidades (no 10×12) × 300 g = 3 kg
  assert.equal(kgRellenoParaCajasGusto(data, "LAS", 10), 3);

  data.rellenos_cocidos = [{ id: "T1", fecha: "2026-10-01", producto_id: "LAS", kg: 6 }];
  data.produccion = [{ id: "P1", producto_variante_id: "LAS-1", producto_id: "LAS", cantidad: 10, fecha: "2026-10-16", kg_relleno: 3 }];
  const r = resumenRellenos(data).find((x) => x.producto_id === "LAS")!;
  assert.equal(r.kg_disponibles, 3);
  assert.equal(r.unidades_por_ref, 1);
  assert.equal(r.unidades_ref_disponibles, 10); // 3 kg disponibles / 0.3 kg por unidad
});
