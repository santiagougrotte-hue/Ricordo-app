// Ciclo completo de stock: relleno cocido → producción → pedido → entrega (o cancelación). Verifica
// que cada cosa se descuente una sola vez y en el momento correcto:
// - relleno: al producir (por kilo cocido)
// - masa, armado, salsa y pote: al producir, según la receta (bolsas y film no: van por conteo)
// - producto terminado: sale del freezer al confirmar la venta, por gusto (no de nuevo al entregar)
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2, type Pedido, type PedidoItem, type RicordoDataV2 } from "./types-v2";
import { aplicarEfectosPedido } from "./pedido-efectos";
import { kgRellenoDisponible, registrarProduccion } from "./rellenos";
import { calcularStock } from "./calc-v2";
import { calcularStockDisponible } from "./produccion-v2";

function base(): RicordoDataV2 {
  const data = emptyDataV2();
  data.insumos = [
    { id: "PREMEZCLA", nombre: "Premezcla", tipo: "ingrediente", unidad: "kg", precio_actual: 5000, controla_stock: true, activo: true },
    { id: "HUEVO", nombre: "Huevos", tipo: "ingrediente", unidad: "kg", precio_actual: 2600, controla_stock: true, activo: true },
    { id: "OSOBUCO", nombre: "Osobuco", tipo: "ingrediente", unidad: "kg", precio_actual: 9500, controla_stock: false, activo: true },
    { id: "BOLSA", nombre: "Bolsa al vacío", tipo: "packaging", unidad: "unidad", precio_actual: 500, controla_stock: true, activo: true },
    { id: "FILM", nombre: "Film", tipo: "packaging", unidad: "metro", precio_actual: 250, controla_stock: true, activo: true },
  ];
  data.productos = [{ id: "OSO", nombre: "Medialuna de osobuco", linea: "Pasta", activo: true }];
  data.producto_variantes = [
    { id: "OSO-12", producto_id: "OSO", nombre: "Osobuco 12", canal: "Minorista", unidades_por_paquete: 12, precio_venta: 14000, activo: true },
    { id: "OSO-8", producto_id: "OSO", nombre: "Osobuco 8", canal: "Mayorista", unidades_por_paquete: 8, precio_venta: 9000, activo: true },
  ];
  data.recetas = [{ id: "REC", producto_id: "OSO", nombre: "Receta", activa: true }];
  data.receta_items = [
    { id: "R1", receta_id: "REC", insumo_id: "PREMEZCLA", etapa: "masa", cantidad: 0.009 },
    { id: "R2", receta_id: "REC", insumo_id: "HUEVO", etapa: "masa", cantidad: 0.0063 },
    { id: "R3", receta_id: "REC", insumo_id: "OSOBUCO", etapa: "relleno", cantidad: 0.007 },
  ];
  data.ajustes_receta_variante = ["OSO-12", "OSO-8"].flatMap((v) => [
    { id: `${v}-B`, variante_id: v, insumo_id: "BOLSA", operacion: "sumar" as const, cantidad: 1, etapa: "packaging" as const },
    { id: `${v}-F`, variante_id: v, insumo_id: "FILM", operacion: "sumar" as const, cantidad: 1, etapa: "packaging" as const },
  ]);
  // Conteo inicial de la semana
  data.inventario_movimientos = [
    { id: "C1", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "PREMEZCLA", cantidad: 5 },
    { id: "C2", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "HUEVO", cantidad: 3 },
    { id: "C3", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "BOLSA", cantidad: 50 },
    { id: "C4", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "FILM", cantidad: 40 },
  ];
  data.rellenos_cocidos = [{ id: "T1", fecha: "2026-10-19", producto_id: "OSO", kg: 3 }];
  return data;
}

const stock = (d: RicordoDataV2, id: string) => Math.round(calcularStock(d, "insumo", id) * 100000) / 100000;
const freezer = (d: RicordoDataV2) => calcularStock(d, "producto", "OSO");

function pedido(id: string, estado: Pedido["estado"], items: [string, number][]): { p: Pedido; its: PedidoItem[] } {
  return {
    p: { id, fecha: "2026-10-21", cliente_id: "C", estado, canal: "Minorista", descuento: 0, costo_envio: 0, total: 0 },
    its: items.map(([v, cant], i) => ({ id: `${id}-${i}`, pedido_id: id, producto_variante_id: v, nombre_historico: v, cantidad: cant, precio_unitario: 1, descuento: 0, subtotal: cant })),
  };
}

function guardar(d: RicordoDataV2, p: Pedido, its: PedidoItem[]): RicordoDataV2 {
  const sinPrevio = { ...d, pedidos: [...d.pedidos.filter((x) => x.id !== p.id), p], pedido_items: [...d.pedido_items.filter((i) => i.pedido_id !== p.id), ...its] };
  return aplicarEfectosPedido(sinPrevio, p, its);
}

test("ciclo completo: producir descuenta relleno y masa (no bolsas); vender solo saca del freezer, una sola vez", () => {
  let d = base();

  // 1) Producir 10 cajas de 12: suma 120 unidades al freezer, usa 1,56 kg de relleno y la masa de 120 u.
  d = registrarProduccion(d, { id: "P1", movId: "M-P1", producto_id: "OSO", cajas: 10, fecha: "2026-10-20" });
  assert.equal(freezer(d), 120);
  assert.equal(kgRellenoDisponible(d, "OSO"), 1.44);
  assert.equal(stock(d, "PREMEZCLA"), 3.92); // 5 − 0,009 × 120
  assert.equal(stock(d, "HUEVO"), 2.244); // 3 − 0,0063 × 120
  assert.equal(stock(d, "BOLSA"), 50); // bolsas y film: conteo manual
  assert.equal(stock(d, "FILM"), 40);

  // 2) Pedido confirmado: 2 cajas de 12 + 1 caja de 8 (mayorista) → solo sale del freezer
  const { p, its } = pedido("PED-1", "Confirmado", [["OSO-12", 2], ["OSO-8", 1]]);
  d = guardar(d, p, its);
  assert.equal(freezer(d), 88); // 24 + 8 unidades del mismo gusto
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 88); // sin reservas aparte
  assert.equal(stock(d, "PREMEZCLA"), 3.92); // vender no toca la masa
  assert.equal(stock(d, "BOLSA"), 50);
  assert.equal(kgRellenoDisponible(d, "OSO"), 1.44); // ni el relleno

  // 3) Pasar a "En producción": nada cambia
  d = guardar(d, { ...p, estado: "Produccion" }, its);
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 88);

  // 4) Entregar: no vuelve a descontar nada
  d = guardar(d, { ...p, estado: "Entregado" }, its);
  assert.equal(freezer(d), 88);
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(d.reservas.filter((r) => r.origen_id === "PED-1" && r.estado === "activa").length, 0);

  // 5) Volver a guardar el pedido entregado (editar una nota): no duplica nada
  d = guardar(d, { ...p, estado: "Entregado", notas: "ok" }, its);
  assert.equal(freezer(d), 88);
  assert.equal(d.inventario_movimientos.filter((m) => m.origen_id === "PED-1" && m.item_tipo === "producto").length, 1); // un solo movimiento por gusto
  assert.equal(d.inventario_movimientos.filter((m) => m.origen_id === "PED-1" && m.item_tipo === "insumo").length, 0);
});

test("editar las cantidades de un pedido confirmado recalcula el freezer; cancelarlo lo devuelve", () => {
  let d = base();
  d = registrarProduccion(d, { id: "P1", movId: "M-P1", producto_id: "OSO", cajas: 10, fecha: "2026-10-20" });
  const { p, its } = pedido("PED-2", "Confirmado", [["OSO-12", 3]]);
  d = guardar(d, p, its);
  assert.equal(freezer(d), 84);

  const menos = [{ ...its[0], cantidad: 1 }];
  d = guardar(d, p, menos);
  assert.equal(freezer(d), 108);

  d = guardar(d, { ...p, estado: "Cancelado" }, menos);
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 120);
  assert.equal(freezer(d), 120);
  assert.equal(stock(d, "PREMEZCLA"), 3.92); // la masa ya se usó al producir: cancelar no la devuelve
});

test("un pedido viejo sin descuentos cargados los recibe al volver a guardarse, y cierra su reserva vieja", () => {
  let d = base();
  const { p, its } = pedido("PED-VIEJO", "Confirmado", [["OSO-12", 1]]);
  // Simula un pedido guardado antes del cambio: está en el documento pero sin efectos aplicados.
  d = {
    ...d,
    pedidos: [p],
    pedido_items: its,
    reservas: [{ id: "RSV-VIEJA", item_tipo: "producto", item_id: "OSO", cantidad: 12, origen_tipo: "pedido", origen_id: "PED-VIEJO", estado: "activa", fecha: "2026-10-10" }],
  };
  d = guardar(d, { ...p, estado: "Entregado" }, its);
  assert.equal(freezer(d), -12); // sin producción registrada el freezer queda negativo: hay que contar
  assert.equal(d.reservas[0].estado, "consumida");
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), -12); // no descuenta dos veces
});

test("stock de terminados por gusto: distintas presentaciones y canales del mismo sabor salen del mismo stock", () => {
  let d = base();
  d.productos.push({ id: "CAL", nombre: "Ravioles de calabaza", linea: "Pasta", activo: true });
  d.producto_variantes.push({ id: "CAL-10", producto_id: "CAL", nombre: "Calabaza 10", canal: "Mayorista", unidades_por_paquete: 10, precio_venta: 8500, activo: true });
  d = registrarProduccion(d, { id: "P1", movId: "M1", producto_id: "OSO", cajas: 5, fecha: "2026-10-20" }); // 5 cajas de 12 = 60 u de osobuco
  d = registrarProduccion(d, { id: "P2", movId: "M2", producto_id: "CAL", cajas: 3, fecha: "2026-10-20" }); // 3 cajas de 12 = 36 u de calabaza
  const { p, its } = pedido("PED-3", "Confirmado", [["OSO-12", 1], ["OSO-8", 2], ["CAL-10", 1]]);
  d = guardar(d, p, its);
  assert.equal(freezer(d), 60 - 12 - 16); // osobuco: 12 de la caja minorista + 16 de dos cajas de 8
  assert.equal(calcularStock(d, "producto", "CAL"), 26); // calabaza: 36 − 10 (vendida en caja de 10)
});

test("el descuento se ata a la confirmación: un estado fuera de Confirmado/En producción/Entregado no descuenta", () => {
  let d = base();
  d = registrarProduccion(d, { id: "P1", movId: "M1", producto_id: "OSO", cajas: 2, fecha: "2026-10-20" });
  const { p, its } = pedido("PED-4", "Confirmado", [["OSO-12", 1]]);
  // Un estado no confirmado (p. ej. un futuro "Borrador") no toca el stock.
  d = guardar(d, { ...p, estado: "Borrador" as unknown as Pedido["estado"] }, its);
  assert.equal(freezer(d), 24);
  // Al confirmarlo, sale del freezer.
  d = guardar(d, p, its);
  assert.equal(freezer(d), 12);
});

test("producción por gusto: la pasta entra en cajas de 12; un gusto que se vende por unidad (lasaña) entra por unidad", async () => {
  const { unidadesPorCajaStock } = await import("./rellenos");
  let d = base();
  d.productos.push({ id: "LAS", nombre: "Lasaña", linea: "Pasta", activo: true }); // línea mal cargada como Pasta
  d.producto_variantes.push({ id: "LAS-1", producto_id: "LAS", nombre: "Lasaña", canal: "Minorista", unidades_por_paquete: 1, precio_venta: 18000, activo: true });
  assert.equal(unidadesPorCajaStock(d, "OSO"), 12);
  assert.equal(unidadesPorCajaStock(d, "LAS"), 1);
  d = registrarProduccion(d, { id: "P1", movId: "M1", producto_id: "LAS", cajas: 6, fecha: "2026-10-20" });
  assert.equal(calcularStock(d, "producto", "LAS"), 6);
  assert.equal(d.produccion[0].kg_relleno, undefined); // la lasaña no usa los 13 g por unidad
});

/** Lasaña (masa + ragú + armado + salsa + pote) y salsa de tomate (salsa + pote), como en Ricordo. */
function conLasanaYSalsa(d: RicordoDataV2): RicordoDataV2 {
  d.insumos.push(
    { id: "MOZZA", nombre: "Mozzarella", tipo: "ingrediente", unidad: "kg", precio_actual: 8000, controla_stock: true, activo: true },
    { id: "PASSATTA", nombre: "Passatta", tipo: "ingrediente", unidad: "kg", precio_actual: 3000, controla_stock: true, activo: true },
    { id: "AJO", nombre: "Ajo", tipo: "ingrediente", unidad: "kg", precio_actual: 6000, controla_stock: false, activo: true },
    { id: "ROAST", nombre: "Roastbeef", tipo: "ingrediente", unidad: "kg", precio_actual: 12000, controla_stock: false, activo: true },
    { id: "POTE", nombre: "Pote 500 cc", tipo: "packaging", unidad: "unidad", precio_actual: 300, controla_stock: true, activo: true }
  );
  d.productos.push(
    { id: "LAS", nombre: "Lasaña", linea: "Pasta", activo: true, gramos_relleno_por_unidad: 250 },
    { id: "SAL", nombre: "Salsa de tomate", linea: "Salsa", activo: true }
  );
  d.producto_variantes.push(
    { id: "LAS-1", producto_id: "LAS", nombre: "Lasaña", canal: "Minorista", unidades_por_paquete: 1, precio_venta: 18000, activo: true },
    { id: "SAL-1", producto_id: "SAL", nombre: "Salsa", canal: "Minorista", unidades_por_paquete: 1, precio_venta: 5000, activo: true }
  );
  d.recetas.push({ id: "REC-LAS", producto_id: "LAS", nombre: "Lasaña", activa: true }, { id: "REC-SAL", producto_id: "SAL", nombre: "Salsa", activa: true });
  d.receta_items.push(
    { id: "L1", receta_id: "REC-LAS", insumo_id: "PREMEZCLA", etapa: "masa", cantidad: 0.097 },
    { id: "L2", receta_id: "REC-LAS", insumo_id: "ROAST", etapa: "relleno", cantidad: 0.11 },
    { id: "L3", receta_id: "REC-LAS", insumo_id: "MOZZA", etapa: "armado", cantidad: 0.18 },
    { id: "L4", receta_id: "REC-LAS", insumo_id: "PASSATTA", etapa: "salsa", cantidad: 0.15 },
    { id: "L5", receta_id: "REC-LAS", insumo_id: "POTE", etapa: "packaging", cantidad: 1 },
    { id: "L6", receta_id: "REC-LAS", insumo_id: "FILM", etapa: "packaging", cantidad: 1 },
    { id: "S1", receta_id: "REC-SAL", insumo_id: "PASSATTA", etapa: "salsa", cantidad: 0.188 },
    { id: "S2", receta_id: "REC-SAL", insumo_id: "AJO", etapa: "salsa", cantidad: 0.002 },
    { id: "S3", receta_id: "REC-SAL", insumo_id: "POTE", etapa: "packaging", cantidad: 1 }
  );
  d.inventario_movimientos.push(
    { id: "C5", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "MOZZA", cantidad: 2 },
    { id: "C6", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "PASSATTA", cantidad: 5 },
    { id: "C7", fecha: "2026-10-19", tipo: "conteo", item_tipo: "insumo", item_id: "POTE", cantidad: 30 }
  );
  d.rellenos_cocidos!.push({ id: "T2", fecha: "2026-10-19", producto_id: "LAS", kg: 2 });
  return d;
}

test("lasaña: producir descuenta masa, armado, salsa, pote y ragú por kilo; no el film ni los ingredientes del ragú", () => {
  let d = conLasanaYSalsa(base());
  d = registrarProduccion(d, { id: "P1", movId: "M1", producto_id: "LAS", cajas: 4, fecha: "2026-10-20" });
  assert.equal(calcularStock(d, "producto", "LAS"), 4);
  assert.equal(stock(d, "PREMEZCLA"), 4.612); // 5 − 0,097 × 4
  assert.equal(stock(d, "MOZZA"), 1.28); // 2 − 0,18 × 4
  assert.equal(stock(d, "PASSATTA"), 4.4); // 5 − 0,15 × 4
  assert.equal(stock(d, "POTE"), 26);
  assert.equal(stock(d, "FILM"), 40);
  assert.equal(d.produccion[0].kg_relleno, 1); // 250 g × 4
  assert.equal(kgRellenoDisponible(d, "LAS"), 1);
  assert.ok(!d.inventario_movimientos.some((m) => m.item_id === "ROAST"));
  // Vender la lasaña solo la saca del freezer.
  const { p, its } = pedido("PED-L", "Confirmado", [["LAS-1", 2]]);
  d = guardar(d, p, its);
  assert.equal(calcularStock(d, "producto", "LAS"), 2);
  assert.equal(stock(d, "POTE"), 26);
});

test("salsa de tomate: producir descuenta la salsa controlada y un pote por unidad", () => {
  let d = conLasanaYSalsa(base());
  d = registrarProduccion(d, { id: "P1", movId: "M1", producto_id: "SAL", cajas: 10, fecha: "2026-10-20" });
  assert.equal(calcularStock(d, "producto", "SAL"), 10);
  assert.equal(stock(d, "PASSATTA"), 3.12); // 5 − 0,188 × 10
  assert.equal(stock(d, "POTE"), 20);
  assert.ok(!d.inventario_movimientos.some((m) => m.item_id === "AJO")); // sin «Controla stock»
  assert.equal(d.produccion[0].kg_relleno, undefined);
});
