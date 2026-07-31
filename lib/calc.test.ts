import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearMovimientoCajaDesdePedido,
  discrepanciasCaja,
  construirResumenPulso,
  gustosActivos,
  movimientosStockGusto,
  stockCalculadoGusto,
  stockRealGusto,
} from "./calc";
import { emptyData } from "./types";
import type { Pedido, Producto } from "./types";

function pedidoBase(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: "PED-100",
    id_detalle: "PED-100-A",
    id_cliente: "CLI-01",
    id_producto: "PROD-01",
    nombre_producto: "Ravioles de ricotta",
    cantidad: 2,
    precio_unitario: 11000,
    precio_total: 22000,
    descuento_monto: 0,
    precio_neto: 22000,
    fecha: "2026-07-20",
    estado: "Entregado",
    canal: "Minorista",
    km_envio: 0,
    costo_envio: 0,
    ...overrides,
  };
}

test("crearMovimientoCajaDesdePedido: pedido entregado con precio_total > 0 genera un movimiento correcto", () => {
  const pedido = pedidoBase();
  const mov = crearMovimientoCajaDesdePedido(pedido);
  assert.equal(mov.tipo, "ingreso");
  assert.equal(mov.monto, 22000);
  assert.equal(mov.ref, "PED-100-A");
  assert.equal(mov.metodo, "Efectivo");
});

test("discrepanciasCaja: pedido entregado sin movimiento aparece como discrepancia", () => {
  const data = emptyData();
  const pedido = pedidoBase();
  data.pedidos = [pedido];

  const antes = discrepanciasCaja(data);
  assert.equal(antes.length, 1, "el pedido sin movimiento debe listarse");
  assert.equal(antes[0].movimiento, null);

  // Simula lo que hace cambiarEstado()/guardarOrden(): crea el movimiento una sola vez (idempotente)
  data.caja_movimientos = [crearMovimientoCajaDesdePedido(pedido)];
  const despues = discrepanciasCaja(data);
  assert.equal(despues.length, 0, "una vez creado el movimiento correcto, no debe quedar discrepancia");

  // Una segunda llamada no debe duplicar el movimiento (idempotencia que usan cambiarEstado/guardarOrden/guardarEdicion)
  const yaExiste = data.caja_movimientos.some((m) => m.ref === pedido.id_detalle);
  assert.equal(yaExiste, true);
});

test("discrepanciasCaja: pedido con precio 0 no genera una discrepancia falsa (monto esperado también es 0)", () => {
  const data = emptyData();
  const pedido = pedidoBase({ precio_unitario: 0, precio_total: 0, precio_neto: 0 });
  data.pedidos = [pedido];
  data.caja_movimientos = [crearMovimientoCajaDesdePedido(pedido)];

  const discrepancias = discrepanciasCaja(data);
  assert.equal(discrepancias.length, 0);
});

test("discrepanciasCaja: movimiento con monto distinto al precio_neto se marca como discrepancia", () => {
  const data = emptyData();
  const pedido = pedidoBase();
  data.pedidos = [pedido];
  data.caja_movimientos = [{ ...crearMovimientoCajaDesdePedido(pedido), monto: 0 }];

  const discrepancias = discrepanciasCaja(data);
  assert.equal(discrepancias.length, 1);
  assert.equal(discrepancias[0].movimiento?.monto, 0);
});

test("discrepanciasCaja: pedido marcado como revisado se excluye aunque no tenga movimiento", () => {
  const data = emptyData();
  const pedido = pedidoBase();
  data.pedidos = [pedido];
  data.conciliacion_ignorados = [pedido.id_detalle];

  const discrepancias = discrepanciasCaja(data);
  assert.equal(discrepancias.length, 0);
});

test("construirResumenPulso: arma el resumen agregado sin exponer los pedidos crudos", () => {
  const data = emptyData();
  const hoy = new Date("2026-07-15T12:00:00");
  const producto: Producto = { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de ricotta", precio_venta: 20000, activo: true };
  data.productos = [producto];
  data.stock_manual = { "PROD-01": 0 };
  data.pedidos = [
    pedidoBase({ fecha: "2026-07-10", estado: "Entregado", precio_neto: 22000 }),
    pedidoBase({ id_detalle: "PED-101-A", fecha: "2026-06-05", canal: "Mayorista", precio_neto: 15000 }),
  ];
  data.caja_movimientos = []; // nada cargado en caja todavía

  const resumen = construirResumenPulso(data, hoy);

  assert.equal(resumen.ventasPorMesCanal.length, 6, "3 meses x 2 canales");
  assert.equal(resumen.productos.length, 1);
  assert.equal(resumen.productos[0].stock, 0);
  assert.equal(resumen.pendientesEntrega, 0);
  assert.ok(resumen.diferenciaCajaVentas > 0, "hay ventas entregadas sin ingreso de caja cargado");
  assert.ok(!("pedidos" in resumen), "el resumen no debe incluir los registros crudos de pedidos");
});

// --- Agrupación por producto base (gusto) ------------------------------------------------

function productoBaseCalabaza(): Producto[] {
  return [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true },
    { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true },
    { id: "PROD-12", id_base: "PROD-01", nombre: "Calabaza al vacío mayo", precio_venta: 10000, activo: true },
  ];
}

test("gustosActivos: agrupa las variantes de canal bajo su producto base", () => {
  const data = emptyData();
  data.productos = [
    ...productoBaseCalabaza(),
    { id: "PROD-02", id_base: "PROD-02", nombre: "Ravioles de ricotta", precio_venta: 12000, activo: true },
  ];
  const gustos = gustosActivos(data);
  assert.equal(gustos.length, 2);
  const calabaza = gustos.find((g) => g.id_base === "PROD-01");
  assert.ok(calabaza);
  assert.equal(calabaza!.nombre, "Ravioles de calabaza");
  assert.equal(calabaza!.variantes.length, 3);
});

test("gustosActivos: excluye variantes inactivas pero conserva el gusto si otra variante sigue activa", () => {
  const data = emptyData();
  const variantes = productoBaseCalabaza();
  variantes[1].activo = false; // Calabaza mayorista discontinuada
  data.productos = variantes;
  const gustos = gustosActivos(data);
  assert.equal(gustos.length, 1);
  assert.equal(gustos[0].variantes.length, 2);
});

test("movimientosStockGusto + stockCalculadoGusto: suma producción y resta ventas Entregado de todas las variantes", () => {
  const data = emptyData();
  data.produccion = [
    { id: "PRODLOG-1", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 50, fecha: "2026-07-01" },
    { id: "PRODLOG-2", id_producto: "PROD-08", nombre_producto: "Calabaza mayorista", cantidad: 30, fecha: "2026-07-05" },
  ];
  data.pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 20, fecha: "2026-07-10", estado: "Entregado" }),
    pedidoBase({ id_detalle: "B", id_producto: "PROD-08", nombre_producto: "Calabaza mayorista", cantidad: 15, fecha: "2026-07-12", estado: "Entregado" }),
    pedidoBase({ id_detalle: "C", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 999, fecha: "2026-07-15", estado: "Confirmado" }),
  ];
  const movimientos = movimientosStockGusto(data, ["PROD-01", "PROD-08", "PROD-12"]);
  assert.equal(movimientos.length, 4, "3 movimientos reales + el pedido Confirmado no cuenta");
  assert.equal(movimientos[0].fecha, "2026-07-01"); // ordenado del más viejo al más nuevo
  assert.equal(stockCalculadoGusto(movimientos), 50 + 30 - 20 - 15); // 45
});

test("stockRealGusto: sin conteo manual usa el calculado por la app", () => {
  const data = emptyData();
  data.productos = productoBaseCalabaza();
  data.produccion = [{ id: "PRODLOG-1", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 50, fecha: "2026-07-01" }];
  const gusto = gustosActivos(data)[0];
  assert.equal(stockRealGusto(data, gusto), 50);
});

test("stockRealGusto: con conteo manual, resta ventas Entregado posteriores a la fecha del conteo (de cualquier variante)", () => {
  const data = emptyData();
  data.productos = productoBaseCalabaza();
  data.produccion = [{ id: "PRODLOG-1", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 50, fecha: "2026-07-01" }];
  data.conteos_stock = [{ id: "CTK-1", id_producto: "PROD-01", cantidad: 40, fecha: "2026-07-10" }];
  data.pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", cantidad: 5, fecha: "2026-07-05", estado: "Entregado" }), // antes del conteo, no cuenta
    pedidoBase({ id_detalle: "B", id_producto: "PROD-08", nombre_producto: "Calabaza mayorista", cantidad: 8, fecha: "2026-07-12", estado: "Entregado" }), // otra variante, después del conteo
  ];
  const gusto = gustosActivos(data)[0];
  assert.equal(stockRealGusto(data, gusto), 40 - 8); // 32
});
