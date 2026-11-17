import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { planSemanal, planMensual, conDatoPlan, claveMes } from "./planificacion";

test("claveMes: AAAA-MM con cero adelante", () => {
  assert.equal(claveMes(3, 2026), "2026-03");
});

test("conDatoPlan: guarda y borra un dato a mano sin tocar el resto", () => {
  let d = conDatoPlan(emptyDataV2(), "ajuste_pct", "2026-11:PROD-1", 10);
  d = conDatoPlan(d, "ajuste_pct", "2026-11:PROD-2", 5);
  assert.deepEqual(d.configuracion.plan_compras?.ajuste_pct, { "2026-11:PROD-1": 10, "2026-11:PROD-2": 5 });
  d = conDatoPlan(d, "ajuste_pct", "2026-11:PROD-1", null);
  assert.deepEqual(d.configuracion.plan_compras?.ajuste_pct, { "2026-11:PROD-2": 5 });
});

test("planSemanal y planMensual: sin datos no sugieren compras", () => {
  const s = planSemanal(emptyDataV2(), "2026-11-19");
  assert.equal(s.total_cajas, 0);
  assert.deepEqual(s.insumos, []);
  const m = planMensual(emptyDataV2(), 11, 2026);
  assert.equal(m.costo_total, 0);
  assert.deepEqual(m.meses_ref, []);
});

test("planSemanal: las cajas cargadas a mano pisan la sugerencia", () => {
  const data = emptyDataV2();
  data.productos = [{ id: "P1", nombre: "Calabaza", activo: true, linea: "Pasta" }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "Caja", unidades_por_paquete: 12, precio_venta: 10000, activo: true, canal: "Minorista" }];
  const conManual = conDatoPlan(data, "cajas_semana", "2026-11-19:P1", 7);
  assert.equal(planSemanal(data, "2026-11-19").cajas[0].a_armar, 0);
  assert.equal(planSemanal(conManual, "2026-11-19").cajas[0].a_armar, 7);
});
