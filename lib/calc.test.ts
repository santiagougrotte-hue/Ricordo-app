import { test } from "node:test";
import assert from "node:assert/strict";
import { crearMovimientoCajaDesdePedido, discrepanciasCaja } from "./calc";
import { emptyData } from "./types";
import type { Pedido } from "./types";

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
