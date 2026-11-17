import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { calcularEquilibrioMes, ritmoDelMes, proximoJueves, rankingProductos, calcularCompraSemanal } from "./tablero";

test("proximoJueves: devuelve el jueves de esa semana o el siguiente, y hoy si ya es jueves", () => {
  assert.equal(proximoJueves("2026-11-17"), "2026-11-19"); // martes
  assert.equal(proximoJueves("2026-11-19"), "2026-11-19"); // jueves
  assert.equal(proximoJueves("2026-11-20"), "2026-11-26"); // viernes
});

test("calcularEquilibrioMes: sin ventas no inventa margen ni punto de equilibrio", () => {
  const eq = calcularEquilibrioMes(emptyDataV2(), 11, 2026, "2026-11-17");
  assert.equal(eq.margen_contribucion_pct, null);
  assert.equal(eq.punto_equilibrio, null);
  assert.equal(eq.pct_alcanzado, null);
  assert.equal(eq.vendido, 0);
  assert.equal(eq.dias_del_mes, 30);
  assert.equal(eq.dias_restantes, 14); // del 17 al 30 inclusive
});

test("calcularEquilibrioMes: días restantes en un mes pasado y en uno futuro", () => {
  assert.equal(calcularEquilibrioMes(emptyDataV2(), 10, 2026, "2026-11-17").dias_restantes, 0);
  assert.equal(calcularEquilibrioMes(emptyDataV2(), 12, 2026, "2026-11-17").dias_restantes, 31);
});

test("ritmoDelMes: meta lineal hasta el equilibrio y la venta se corta en hoy", () => {
  const puntos = ritmoDelMes(emptyDataV2(), 11, 2026, "2026-11-17", 300000);
  assert.equal(puntos.length, 30);
  assert.equal(puntos[29].meta, 300000);
  assert.equal(puntos[14].meta, 150000);
  assert.equal(puntos[16].vendido, 0); // día 17 = hoy
  assert.equal(puntos[17].vendido, null); // día 18 = futuro
});

test("ritmoDelMes: sin punto de equilibrio no dibuja meta", () => {
  assert.ok(ritmoDelMes(emptyDataV2(), 11, 2026, "2026-11-17", null).every((p) => p.meta === null));
});

test("rankingProductos y calcularCompraSemanal: datos vacíos devuelven listas vacías", () => {
  assert.deepEqual(rankingProductos(emptyDataV2(), "2026-11-01", "2026-11-30"), []);
  assert.deepEqual(calcularCompraSemanal(emptyDataV2(), "2026-11-17"), { filas: [], costo_total_sugerido: 0 });
});

import { semanasDelMes, simularCambios } from "./tablero";

test("semanasDelMes: cinco semanas fijas, la 5ª junta los últimos días y la meta suma el equilibrio", () => {
  const s = semanasDelMes(emptyDataV2(), 11, 2026, "2026-11-17", 300000);
  assert.deepEqual(s.map((x) => [x.desde.slice(8), x.hasta.slice(8)]), [["01", "07"], ["08", "14"], ["15", "21"], ["22", "28"], ["29", "30"]]);
  assert.equal(s.reduce((a, x) => a + (x.meta ?? 0), 0), 300000);
  assert.deepEqual(s.map((x) => x.estado), ["pasada", "pasada", "en curso", "futura", "futura"]);
  assert.equal(s[3].diferencia, null);
});

test("simularCambios: sin cambios no devuelve filas ni impacto", () => {
  const r = simularCambios(emptyDataV2(), {}, 11, 2026, "2026-11-17");
  assert.deepEqual(r.filas, []);
  assert.equal(r.impacto_mensual_total, 0);
});
