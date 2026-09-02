import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import {
  pctCambio,
  calcularMetricasVentas,
  calcularVentasPorCanal,
  calcularVentasPorGusto,
  calcularDetalleGusto,
  calcularEvolucionMensual,
  calcularEvolucionGustoMensual,
  calcularEvolucionCanalMensual,
  calcularClientesPeriodo,
  calcularDescuentosPeriodo,
  calcularVentasPendientes,
} from "./analitica-ventas";

/** Fixture compartido: dos gustos (Jamón y queso, Calabaza), cada uno con variante minorista y
 * mayorista; Calabaza además tiene una salsa vendida como línea aparte (tipo_unidad_venta "otro",
 * nunca debe contar como caja). Dos clientes (uno minorista recurrente, uno mayorista nuevo). */
function fixture(): RicordoDataV2 {
  const data = emptyDataV2();
  data.clientes = [
    { id: "CLI-MIN", nombre: "Juan", canal: "Minorista" },
    { id: "CLI-MAY", nombre: "Almacén Sur", canal: "Mayorista" },
  ];
  data.productos = [
    { id: "PROD-JYQ", nombre: "Jamón y queso", activo: true },
    { id: "PROD-CAL", nombre: "Calabaza", activo: true },
    { id: "PROD-SALSA", nombre: "Salsa filetto", activo: true },
  ];
  data.producto_variantes = [
    { id: "V-JYQ-MIN", producto_id: "PROD-JYQ", nombre: "Jamón y queso minorista", canal: "Minorista", presentacion: "Minorista 10u", unidades_por_paquete: 10, precio_venta: 8000, activo: true, tipo_unidad_venta: "caja" },
    { id: "V-JYQ-MAY", producto_id: "PROD-JYQ", nombre: "Jamón y queso mayorista", canal: "Mayorista", presentacion: "Mayorista 12u", unidades_por_paquete: 12, precio_venta: 9000, activo: true, tipo_unidad_venta: "caja" },
    { id: "V-CAL-MIN", producto_id: "PROD-CAL", nombre: "Calabaza minorista", canal: "Minorista", presentacion: "Minorista 10u", unidades_por_paquete: 10, precio_venta: 7500, activo: true, tipo_unidad_venta: "caja" },
    { id: "V-SALSA", producto_id: "PROD-SALSA", nombre: "Salsa filetto", canal: "Minorista", precio_venta: 2000, activo: true, tipo_unidad_venta: "otro" },
  ];
  // Enero 2026: cliente minorista (recurrente, ya compró antes) compra 2 cajas de jamón + 1 salsa.
  data.pedidos = [
    { id: "PED-0", fecha: "2025-12-01", cliente_id: "CLI-MIN", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 8000 },
    { id: "PED-1", fecha: "2026-01-10", cliente_id: "CLI-MIN", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 16000 + 2000 },
    // Cliente mayorista (nuevo este período) compra 5 cajas de jamón mayorista.
    { id: "PED-2", fecha: "2026-01-15", cliente_id: "CLI-MAY", estado: "Entregado", canal: "Mayorista", descuento: 0, costo_envio: 0, total: 45000 },
    // Pedido de calabaza en febrero.
    { id: "PED-3", fecha: "2026-02-05", cliente_id: "CLI-MIN", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 7500 },
    // Pedido confirmado (no entregado) — no debe contar como venta realizada.
    { id: "PED-4", fecha: "2026-01-20", cliente_id: "CLI-MIN", estado: "Confirmado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 8000 },
  ];
  data.pedido_items = [
    { id: "I-0", pedido_id: "PED-0", producto_variante_id: "V-JYQ-MIN", nombre_historico: "Jamón y queso minorista", cantidad: 1, precio_unitario: 8000, descuento: 0, subtotal: 8000 },
    { id: "I-1", pedido_id: "PED-1", producto_variante_id: "V-JYQ-MIN", nombre_historico: "Jamón y queso minorista", cantidad: 2, precio_unitario: 8000, descuento: 0, subtotal: 16000 },
    { id: "I-1b", pedido_id: "PED-1", producto_variante_id: "V-SALSA", nombre_historico: "Salsa filetto", cantidad: 1, precio_unitario: 2000, descuento: 0, subtotal: 2000 },
    { id: "I-2", pedido_id: "PED-2", producto_variante_id: "V-JYQ-MAY", nombre_historico: "Jamón y queso mayorista", cantidad: 5, precio_unitario: 9000, descuento: 0, subtotal: 45000 },
    { id: "I-3", pedido_id: "PED-3", producto_variante_id: "V-CAL-MIN", nombre_historico: "Calabaza minorista", cantidad: 1, precio_unitario: 7500, descuento: 0, subtotal: 7500 },
    { id: "I-4", pedido_id: "PED-4", producto_variante_id: "V-JYQ-MIN", nombre_historico: "Jamón y queso minorista", cantidad: 1, precio_unitario: 8000, descuento: 0, subtotal: 8000 },
  ];
  return data;
}

test("pctCambio: null cuando el anterior es 0 y no hubo cambio real, nunca Infinity", () => {
  assert.equal(pctCambio(100, 0), null);
  assert.equal(pctCambio(0, 0), 0);
  assert.equal(pctCambio(150, 100), 50);
  assert.equal(pctCambio(50, 100), -50);
});

test("calcularMetricasVentas: solo cuenta pedidos Entregados, cajas excluye la salsa (tipo_unidad_venta != caja)", () => {
  const data = fixture();
  const m = calcularMetricasVentas(data, "2026-01-01", "2026-01-31");
  // PED-1 (2 cajas jamón + 1 salsa) + PED-2 (5 cajas jamón mayorista) = 2 pedidos, 7 cajas.
  // PED-4 (Confirmado) no cuenta.
  assert.equal(m.cantidad_pedidos, 2);
  assert.equal(m.cajas_vendidas, 7);
  assert.equal(m.ventas_totales, 16000 + 2000 + 45000);
  assert.equal(m.ticket_promedio, Math.round((16000 + 2000 + 45000) / 2));
  assert.equal(m.cajas_promedio_por_pedido, 7 / 2);
  // precio_promedio_caja usa solo la facturación de líneas "caja" (excluye la salsa).
  assert.equal(m.precio_promedio_caja, Math.round((16000 + 45000) / 7));
});

test("calcularVentasPorCanal: separa Minorista/Mayorista con participación sobre el total", () => {
  const data = fixture();
  const canales = calcularVentasPorCanal(data, "2026-01-01", "2026-01-31");
  const minorista = canales.find((c) => c.canal === "Minorista")!;
  const mayorista = canales.find((c) => c.canal === "Mayorista")!;
  assert.equal(minorista.ventas_totales, 16000 + 2000);
  assert.equal(minorista.cantidad_pedidos, 1);
  assert.equal(mayorista.ventas_totales, 45000);
  assert.equal(mayorista.cantidad_pedidos, 1);
  const totalVentas = minorista.ventas_totales + mayorista.ventas_totales;
  assert.equal(minorista.participacion_pct, (minorista.ventas_totales / totalVentas) * 100);
  assert.equal(mayorista.participacion_pct, (mayorista.ventas_totales / totalVentas) * 100);
});

test("calcularVentasPorGusto: agrupa por producto_id (nunca por variante), ordenado de mayor a menor cajas", () => {
  const data = fixture();
  // Rango que cubre enero y febrero para ver los dos gustos.
  const gustos = calcularVentasPorGusto(data, "2026-01-01", "2026-02-28");
  assert.equal(gustos.length, 3); // Jamón y queso, Calabaza, Salsa (como producto propio, 0 cajas)
  assert.equal(gustos[0].producto_nombre, "Jamón y queso");
  assert.equal(gustos[0].cajas, 7); // 2 minorista + 5 mayorista, la variante mayorista no es una fila aparte
  const salsa = gustos.find((g) => g.producto_nombre === "Salsa filetto")!;
  assert.equal(salsa.cajas, 0); // nunca cuenta como caja
  assert.ok(salsa.facturacion > 0); // pero sigue apareciendo en facturación
});

test("calcularDetalleGusto: desglose por canal y por presentación de un solo gusto", () => {
  const data = fixture();
  const detalle = calcularDetalleGusto(data, "2026-01-01", "2026-02-28", "PROD-JYQ")!;
  assert.equal(detalle.total_cajas, 7);
  assert.equal(detalle.cajas_minorista, 2);
  assert.equal(detalle.cajas_mayorista, 5);
  assert.equal(detalle.por_presentacion.length, 2);
  const minorista = detalle.por_presentacion.find((p) => p.nombre === "Minorista 10u")!;
  assert.equal(minorista.cajas, 2);
  assert.equal(calcularDetalleGusto(data, "2026-01-01", "2026-01-31", "PROD-INEXISTENTE"), null);
});

test("calcularEvolucionMensual: siempre devuelve los 12 meses del año, con 0 donde no hay ventas", () => {
  const data = fixture();
  const evolucion = calcularEvolucionMensual(data, 2026);
  assert.equal(evolucion.length, 12);
  assert.equal(evolucion[0].label, "Enero");
  assert.equal(evolucion[0].cajas, 7);
  assert.equal(evolucion[1].label, "Febrero");
  assert.equal(evolucion[1].cajas, 1);
  assert.equal(evolucion[2].cajas, 0); // marzo sin datos, nunca se saltea
});

test("calcularEvolucionGustoMensual: evolución de UN gusto puntual mes a mes", () => {
  const data = fixture();
  const evolucion = calcularEvolucionGustoMensual(data, 2026, "PROD-CAL");
  assert.equal(evolucion[0].cajas, 0); // enero sin calabaza
  assert.equal(evolucion[1].cajas, 1); // febrero
});

test("calcularEvolucionCanalMensual: minorista y mayorista mes a mes, en el mismo array", () => {
  const data = fixture();
  const evolucion = calcularEvolucionCanalMensual(data, 2026);
  assert.equal(evolucion[0].minorista.cajas, 2);
  assert.equal(evolucion[0].mayorista.cajas, 5);
  assert.equal(evolucion[1].minorista.cajas, 1);
  assert.equal(evolucion[1].mayorista.cajas, 0);
});

test("calcularClientesPeriodo: distingue nuevos (primer pedido en el período) de recurrentes (ya compraba antes)", () => {
  const data = fixture();
  const clientes = calcularClientesPeriodo(data, "2026-01-01", "2026-01-31");
  assert.equal(clientes.total, 2);
  assert.equal(clientes.minoristas, 1);
  assert.equal(clientes.mayoristas, 1);
  // CLI-MIN ya tenía un pedido entregado en diciembre -> recurrente. CLI-MAY compra por primera vez en enero -> nuevo.
  assert.equal(clientes.recurrentes, 1);
  assert.equal(clientes.nuevos, 1);
  assert.equal(clientes.principales[0].cliente_id, "CLI-MAY"); // mayor total comprado primero
});

test("calcularDescuentosPeriodo: reutiliza el EERR, nunca recalcula el reparto de descuentos de nuevo", () => {
  const data = fixture();
  const desc = calcularDescuentosPeriodo(data, "2026-01-01", "2026-01-31");
  assert.equal(desc.descuentos, 0);
  assert.equal(desc.ventas_brutas, 16000 + 2000 + 45000);
  assert.equal(desc.ventas_netas, 16000 + 2000 + 45000);
  assert.equal(desc.pct_sobre_bruta, 0);
});

test("calcularVentasPendientes: solo Confirmado/Produccion, nunca mezclado con Entregado ni Cancelado", () => {
  const data = fixture();
  assert.equal(calcularVentasPendientes(data, "2026-01-01", "2026-01-31"), 8000); // PED-4
});
