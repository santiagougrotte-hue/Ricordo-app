// Ciclo completo de stock: relleno cocido → armado → pedido → entrega (o cancelación). Verifica
// que cada cosa se descuente una sola vez y en el momento correcto:
// - relleno: al armar (por kilo cocido)
// - masa, packaging y armado: al armar, con la receta de la presentación de referencia (no al
//   cargar la venta, no de nuevo al entregar) — ver `consumoInsumosProduccion` en lib/rellenos.ts
// - producto terminado: sale del freezer al cargar la venta, por gusto (no al entregar)
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2, type Pedido, type PedidoItem, type RicordoDataV2 } from "./types-v2";
import { aplicarEfectosPedido } from "./pedido-efectos";
import { kgRellenoDisponible, quitarProduccion, registrarProduccion } from "./rellenos";
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

test("ciclo completo: armar descuenta relleno, masa, packaging y armado; vender y entregar solo mueven el freezer", () => {
  let d = base();

  // 1) Armar 10 cajas de 12: suma 120 unidades al freezer, usa 1,56 kg de relleno y descuenta la
  // masa/packaging de la presentación de referencia (OSO-12) × 10.
  d = registrarProduccion(d, { id: "P1", movId: "M-P1", producto_id: "OSO", cajas: 10, fecha: "2026-10-20" });
  assert.equal(freezer(d), 120);
  assert.equal(kgRellenoDisponible(d, "OSO"), 1.44);
  assert.equal(stock(d, "PREMEZCLA"), 3.92); // 5 − 0,009 × 12 u/caja × 10 cajas
  assert.equal(stock(d, "HUEVO"), 2.244); // 3 − 0,0063 × 12 × 10
  assert.equal(stock(d, "BOLSA"), 40); // 50 − 1 bolsa/caja × 10
  assert.equal(stock(d, "FILM"), 30);

  // 2) Cargar pedido confirmado: 2 cajas de 12 + 1 caja de 8 (mayorista) — ya está armado y
  // empaquetado, así que vender NO vuelve a tocar masa ni packaging, solo el freezer.
  const { p, its } = pedido("PED-1", "Confirmado", [["OSO-12", 2], ["OSO-8", 1]]);
  d = guardar(d, p, its);
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(stock(d, "HUEVO"), 2.244);
  assert.equal(stock(d, "BOLSA"), 40);
  assert.equal(stock(d, "FILM"), 30);
  assert.equal(freezer(d), 88); // sale del freezer al cargar la venta: 24 + 8 unidades del mismo gusto
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 88); // sin reservas aparte
  assert.equal(kgRellenoDisponible(d, "OSO"), 1.44); // vender no toca el relleno

  // 3) Pasar a "En producción": nada cambia
  d = guardar(d, { ...p, estado: "Produccion" }, its);
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 88);

  // 4) Entregar: no vuelve a descontar nada
  d = guardar(d, { ...p, estado: "Entregado" }, its);
  assert.equal(freezer(d), 88);
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 88);
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(stock(d, "BOLSA"), 40);
  assert.equal(d.reservas.filter((r) => r.origen_id === "PED-1" && r.estado === "activa").length, 0);

  // 5) Volver a guardar el pedido entregado (editar una nota): no duplica nada
  d = guardar(d, { ...p, estado: "Entregado", notas: "ok" }, its);
  assert.equal(freezer(d), 88);
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(d.inventario_movimientos.filter((m) => m.origen_id === "PED-1" && m.item_tipo === "producto").length, 1); // un solo movimiento por gusto
});

test("editar las cantidades de un pedido confirmado solo ajusta el freezer; cancelarlo lo devuelve. Masa y packaging no se tocan (ya se armaron)", () => {
  let d = base();
  d = registrarProduccion(d, { id: "P1", movId: "M-P1", producto_id: "OSO", cajas: 10, fecha: "2026-10-20" });
  const { p, its } = pedido("PED-2", "Confirmado", [["OSO-12", 3]]);
  d = guardar(d, p, its);
  assert.equal(stock(d, "BOLSA"), 40);
  assert.equal(freezer(d), 84);

  const menos = [{ ...its[0], cantidad: 1 }];
  d = guardar(d, p, menos);
  assert.equal(stock(d, "BOLSA"), 40); // editar la venta no mueve insumos
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(freezer(d), 108);

  d = guardar(d, { ...p, estado: "Cancelado" }, menos);
  assert.equal(stock(d, "BOLSA"), 40); // cancelar la venta tampoco: los insumos ya se gastaron al armar
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), 120);
  assert.equal(freezer(d), 120);
});

test("registrarProduccion es reversible: quitarProduccion devuelve el freezer, el relleno y los insumos de masa/packaging", () => {
  let d = base();
  d = registrarProduccion(d, { id: "P1", movId: "M-P1", producto_id: "OSO", cajas: 10, fecha: "2026-10-20" });
  assert.equal(freezer(d), 120);
  assert.equal(stock(d, "PREMEZCLA"), 3.92);
  assert.equal(kgRellenoDisponible(d, "OSO"), 1.44);

  d = quitarProduccion(d, "P1");
  assert.equal(freezer(d), 0);
  assert.equal(stock(d, "PREMEZCLA"), 5);
  assert.equal(stock(d, "BOLSA"), 50);
  assert.equal(kgRellenoDisponible(d, "OSO"), 3);
  assert.equal(d.produccion.length, 0);
});

test("un pedido viejo sin su efecto de freezer aplicado lo recibe al volver a guardarse, y cierra su reserva vieja — pero no toca masa/packaging (eso ya no depende del pedido)", () => {
  let d = base();
  const { p, its } = pedido("PED-VIEJO", "Confirmado", [["OSO-12", 1]]);
  // Simula un pedido guardado antes del cambio: está en el documento pero sin efectos aplicados.
  d = {
    ...d,
    pedidos: [p],
    pedido_items: its,
    reservas: [{ id: "RSV-VIEJA", item_tipo: "producto", item_id: "OSO", cantidad: 12, origen_tipo: "pedido", origen_id: "PED-VIEJO", estado: "activa", fecha: "2026-10-10" }],
  };
  assert.equal(stock(d, "BOLSA"), 50);
  d = guardar(d, { ...p, estado: "Entregado" }, its);
  assert.equal(stock(d, "BOLSA"), 50); // masa/packaging no dependen del pedido: no se tocan acá
  assert.equal(freezer(d), -12); // sin producción registrada el freezer queda negativo: hay que contar
  assert.equal(d.reservas[0].estado, "consumida");
  assert.equal(calcularStockDisponible(d, "producto", "OSO"), -12); // no descuenta dos veces
});

test("un pedido con consumo de insumos generado antes del cambio lo pierde al volver a guardarse (se limpia, no se recalcula)", () => {
  let d = base();
  const { p, its } = pedido("PED-LEGACY", "Confirmado", [["OSO-12", 1]]);
  d = {
    ...d,
    pedidos: [p],
    pedido_items: its,
    inventario_movimientos: [
      ...d.inventario_movimientos,
      { id: "MOV-LEGACY", fecha: "2026-10-20", tipo: "consumo", origen_tipo: "pedido_insumos", origen_id: p.id, item_tipo: "insumo", item_id: "PREMEZCLA", cantidad: -0.1 },
    ],
  };
  assert.equal(stock(d, "PREMEZCLA"), 4.9); // con el movimiento legacy aplicado
  d = guardar(d, p, its);
  assert.equal(stock(d, "PREMEZCLA"), 5); // se limpió el movimiento viejo, no se generó uno nuevo
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

test("el descuento del freezer se ata a la confirmación: un estado fuera de Confirmado/En producción/Entregado no descuenta", () => {
  let d = base();
  d = registrarProduccion(d, { id: "P1", movId: "M1", producto_id: "OSO", cajas: 2, fecha: "2026-10-20" });
  const { p, its } = pedido("PED-4", "Confirmado", [["OSO-12", 1]]);
  // Un estado no confirmado (p. ej. un futuro "Borrador") no toca el stock.
  d = guardar(d, { ...p, estado: "Borrador" as unknown as Pedido["estado"] }, its);
  assert.equal(freezer(d), 24);
  // Al confirmarlo, sale del freezer (masa/packaging ya se habían descontado al armar).
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
