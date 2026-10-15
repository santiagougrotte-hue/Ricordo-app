import { test } from "node:test";
import assert from "node:assert/strict";
import { mesAnteriorAHoy } from "./ResumenSheets";

test("mesAnteriorAHoy: el selector del bloque mensual arranca en el mes anterior, con el caso especial de enero → diciembre del año pasado", () => {
  assert.equal(mesAnteriorAHoy(new Date(2026, 9, 15)), "2026-09"); // octubre -> setiembre
  assert.equal(mesAnteriorAHoy(new Date(2026, 0, 5)), "2025-12"); // enero -> diciembre del año anterior
  assert.equal(mesAnteriorAHoy(new Date(2026, 11, 31)), "2026-11"); // diciembre -> noviembre
});
