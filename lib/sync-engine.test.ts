import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { backoffDelayMs, diferenciasPorSeccion, hayDiferenciasReales } from "./sync-engine";

test("backoffDelayMs: crece exponencialmente y nunca supera el techo", () => {
  assert.equal(backoffDelayMs(0), 2000);
  assert.equal(backoffDelayMs(1), 2000);
  assert.equal(backoffDelayMs(2), 4000);
  assert.equal(backoffDelayMs(3), 8000);
  assert.equal(backoffDelayMs(4), 16000);
  assert.equal(backoffDelayMs(5), 30000); // techo
  assert.equal(backoffDelayMs(20), 30000); // nunca crece sin límite
});

test("diferenciasPorSeccion: detecta qué secciones cambiaron entre dos documentos, con conteo de registros", () => {
  const base = emptyDataV2();
  const local = { ...base, pedidos: [{ id: "PED-1", fecha: "2026-01-01", cliente_id: "C1", estado: "Entregado" as const, canal: "Minorista" as const, descuento: 0, costo_envio: 0, total: 1000 }] };
  const remoto = { ...base, insumos: [{ id: "INS-1", nombre: "Harina", tipo: "ingrediente" as const, unidad: "kg", precio_actual: 500, controla_stock: true, activo: true }] };

  const diffs = diferenciasPorSeccion(local, remoto);
  const pedidosDiff = diffs.find((d) => d.clave === "pedidos")!;
  const insumosDiff = diffs.find((d) => d.clave === "insumos")!;
  const clientesDiff = diffs.find((d) => d.clave === "clientes")!;

  assert.equal(pedidosDiff.distinto, true);
  assert.equal(pedidosDiff.cantidad_local, 1);
  assert.equal(pedidosDiff.cantidad_remoto, 0);
  assert.equal(insumosDiff.distinto, true);
  assert.equal(insumosDiff.cantidad_local, 0);
  assert.equal(insumosDiff.cantidad_remoto, 1);
  assert.equal(clientesDiff.distinto, false); // ninguno tocó clientes
  assert.equal(pedidosDiff.nombre, "Pedidos");
});

test("diferenciasPorSeccion: dos documentos idénticos no muestran ninguna sección distinta", () => {
  const data = emptyDataV2();
  const diffs = diferenciasPorSeccion(data, { ...data });
  assert.equal(hayDiferenciasReales(diffs), false);
  assert.ok(diffs.every((d) => !d.distinto));
});

test("hayDiferenciasReales: true apenas una sola sección difiere", () => {
  const base = emptyDataV2();
  const otro = { ...base, activos: [{ id: "A1", nombre: "Sobadora", fecha_compra: "2026-01-01", costo: 1000, vida_util_meses: 12, amortizacion_mensual: 83, activo: true }] };
  assert.equal(hayDiferenciasReales(diferenciasPorSeccion(base, otro)), true);
});
