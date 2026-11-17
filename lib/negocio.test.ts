import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { costosFijosMensuales, amortizacionesMensuales, resultadoMes, estadoCostosFijosMes, conNegocio, deudaConSanti, calcularEscenario } from "./negocio";

test("costos fijos de la planilla: casa $86.900, local $948.000, amortizaciones $40.000", () => {
  const d = emptyDataV2();
  assert.equal(costosFijosMensuales(d, "casa"), 86900);
  assert.equal(costosFijosMensuales(d, "local"), 948000);
  assert.equal(amortizacionesMensuales(d), 40000);
});

test("resultadoMes: sin ventas, el resultado es − (costos fijos + gastos + sueldo objetivo)", () => {
  const r = resultadoMes(emptyDataV2(), 10, 2026);
  assert.equal(r.costos_fijos, 86900);
  assert.equal(r.gastos, 83263); // los dos gastos de octubre de la planilla
  assert.equal(r.resultado_neto, -(86900 + 83263 + 300000));
});

test("estadoCostosFijosMes: lo tildado como pagado se descuenta de lo que falta", () => {
  let d = emptyDataV2();
  assert.equal(estadoCostosFijosMes(d, 11, 2026).falta, 46900);
  d = conNegocio(d, (n) => ({ ...n, pagos_costos_fijos: { "2026-11:CFI-01": "2026-11-05" } }));
  assert.equal(estadoCostosFijosMes(d, 11, 2026).falta, 29900);
});

test("deudaConSanti: suma lo pagado de tu bolsillo sin reintegrar", () => {
  const d = conNegocio(emptyDataV2(), (n) => ({
    ...n,
    gastos: [
      { id: "G1", fecha: "2026-11-01", concepto: "Nafta", categoria: "Nafta y envíos", monto: 5000, con: "bolsillo" },
      { id: "G2", fecha: "2026-11-02", concepto: "Film", categoria: "Otros", monto: 2000, con: "bolsillo", reintegrado_el: "2026-11-10" },
    ],
  }));
  assert.equal(deudaConSanti(d).total, 5000);
});

test("calcularEscenario: equilibrio en cajas y meses para recuperar la inversión", () => {
  const e = calcularEscenario(emptyDataV2(), 10319, 61.2, 86);
  assert.equal(e.fijos_casa, 386900);
  assert.equal(e.equilibrio_casa, 62);
  assert.equal(e.inversion_total, 4500000);
  assert.ok(e.meses_recupero != null && e.meses_recupero > 8 && e.meses_recupero < 10);
});
