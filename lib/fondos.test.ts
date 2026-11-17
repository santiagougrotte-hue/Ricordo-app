import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { estadoFondos, sugerenciasPendientes, conMovimientosFondo, conPrestamoDevuelto, conAjustesFondos } from "./fondos";

const base = () =>
  conAjustesFondos(
    { ...emptyDataV2(), configuracion: { ...emptyDataV2().configuracion, fondos: { movimientos: [] } as never } },
    { saldo_inicial_reinversion: 100000, saldo_inicial_seguridad: 50000, fecha_inicio: "2026-10-01", amortizacion_mensual: 40000 }
  );

test("estadoFondos: un préstamo baja el saldo hasta que se devuelve", () => {
  let d = conMovimientosFondo(base(), [{ id: "P1", fecha: "2026-11-05", fondo: "reinversion", tipo: "prestamo", monto: 30000, concepto: "Compras" }]);
  let e = estadoFondos(d, 11, 2026);
  assert.equal(e.reinversion.saldo, 70000);
  assert.equal(e.reinversion.saldo_con_devoluciones, 100000);
  assert.equal(e.total_prestado, 30000);
  d = conPrestamoDevuelto(d, "P1", "2026-11-30");
  e = estadoFondos(d, 11, 2026);
  assert.equal(e.reinversion.saldo, 100000);
  assert.equal(e.total_prestado, 0);
});

test("estadoFondos: aportes suman y usos restan", () => {
  const d = conMovimientosFondo(base(), [
    { id: "A1", fecha: "2026-10-31", fondo: "seguridad", tipo: "aporte", monto: 20000, concepto: "Ganancia" },
    { id: "U1", fecha: "2026-11-02", fondo: "seguridad", tipo: "uso", monto: 5000, concepto: "Pérdida" },
  ]);
  assert.equal(estadoFondos(d, 11, 2026).seguridad.saldo, 65000);
});

test("sugerenciasPendientes: un mes por cerrar desde la fecha de inicio, y no repite uno ya registrado", () => {
  const d = base();
  const s = sugerenciasPendientes(d, "2026-11-17");
  assert.deepEqual(s.map((x) => x.mes_origen), ["2026-10"]);
  // Sin ventas: se separan las amortizaciones y la pérdida (costos fijos + sueldo objetivo) se cubre con seguridad.
  assert.deepEqual(s[0].movimientos[0].fondo, "reinversion");
  assert.equal(s[0].movimientos[0].monto, 40000);
  assert.ok(s[0].perdida > 0);
  assert.deepEqual(s[0].movimientos.at(-1)?.tipo, "uso");
  const registrado = conMovimientosFondo(d, s[0].movimientos.map((m, i) => ({ ...m, id: `M${i}` })));
  assert.deepEqual(sugerenciasPendientes(registrado, "2026-11-17"), []);
});
