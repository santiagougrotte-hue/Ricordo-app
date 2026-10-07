import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import type { TransferenciaFondo } from "./types";
import { saldoCaja, calcularFondosReinversion, calcularDineroLibre, prestamosInternos, transferenciasRecientes } from "./calc-v2";

const HOY = "2026-10-07";

function fixture(): RicordoDataV2 {
  return emptyDataV2();
}

function agregarTransferencia(data: RicordoDataV2, t: TransferenciaFondo) {
  data.configuracion.caja_inteligente.transferencias_fondos = [
    ...(data.configuracion.caja_inteligente.transferencias_fondos ?? []),
    t,
  ];
}

test("un préstamo de seguridad a operativa baja seguridad, sube el dinero libre y no toca saldoCaja", () => {
  const data = fixture();

  const seguridadAntes = calcularFondosReinversion(data).seguridad.disponible;
  const libreAntes = calcularDineroLibre(data, HOY).dinero_libre;
  const cajaAntes = saldoCaja(data);

  agregarTransferencia(data, {
    id: "TRF-1",
    fecha: HOY,
    origen: "seguridad",
    destino: "operativa",
    monto: 30000,
    motivo: "Cubrir hosting",
    tipo: "prestamo",
    devolver_en: "2026-11",
  });

  const seguridadDespues = calcularFondosReinversion(data).seguridad.disponible;
  const libreDespues = calcularDineroLibre(data, HOY).dinero_libre;
  const cajaDespues = saldoCaja(data);

  assert.equal(seguridadAntes - seguridadDespues, 30000);
  assert.equal(libreDespues - libreAntes, 30000);
  assert.equal(cajaDespues, cajaAntes);
});

test("estados de préstamo: Parcial, Devuelto y Vencido", () => {
  const data = fixture();

  // A: devolución parcial, todavía no vence -> Parcial
  agregarTransferencia(data, {
    id: "PRES-A",
    fecha: "2026-09-01",
    origen: "seguridad",
    destino: "operativa",
    monto: 10000,
    motivo: "Préstamo A",
    tipo: "prestamo",
    devolver_en: "2026-11",
  });
  agregarTransferencia(data, {
    id: "DEV-A1",
    fecha: "2026-09-15",
    origen: "operativa",
    destino: "seguridad",
    monto: 4000,
    motivo: "Devolución parcial de A",
    tipo: "movimiento",
    devolucion_de: "PRES-A",
  });

  // B: devolución total -> Devuelto
  agregarTransferencia(data, {
    id: "PRES-B",
    fecha: "2026-08-01",
    origen: "reinversion",
    destino: "operativa",
    monto: 5000,
    motivo: "Préstamo B",
    tipo: "prestamo",
    devolver_en: "2026-08",
  });
  agregarTransferencia(data, {
    id: "DEV-B1",
    fecha: "2026-08-20",
    origen: "operativa",
    destino: "reinversion",
    monto: 5000,
    motivo: "Devolución total de B",
    tipo: "movimiento",
    devolucion_de: "PRES-B",
  });

  // C: nadie devolvió nada y devolver_en ya pasó -> Vencido
  agregarTransferencia(data, {
    id: "PRES-C",
    fecha: "2026-07-01",
    origen: "reposicion",
    destino: "operativa",
    monto: 8000,
    motivo: "Préstamo C",
    tipo: "prestamo",
    devolver_en: "2026-09",
  });

  const prestamos = prestamosInternos(data, HOY);
  const porId = new Map(prestamos.map((p) => [p.id, p]));

  assert.equal(porId.get("PRES-A")?.estado, "Parcial");
  assert.equal(porId.get("PRES-A")?.falta, 6000);

  assert.equal(porId.get("PRES-B")?.estado, "Devuelto");
  assert.equal(porId.get("PRES-B")?.falta, 0);

  assert.equal(porId.get("PRES-C")?.estado, "Vencido");
  assert.equal(porId.get("PRES-C")?.falta, 8000);
});

test("transferenciasRecientes muestra un préstamo viejo sin devolver y deja de mostrarlo una vez devuelto", () => {
  const data = fixture();

  // Préstamo de hace más de 15 días, sin devolver todavía.
  agregarTransferencia(data, {
    id: "PRES-VIEJO",
    fecha: "2026-01-10",
    origen: "seguridad",
    destino: "operativa",
    monto: 15000,
    motivo: "Préstamo viejo",
    tipo: "prestamo",
    devolver_en: "2026-02",
  });

  const antes = transferenciasRecientes(data, HOY, 15);
  assert.ok(antes.some((t) => t.id === "PRES-VIEJO"));

  // Se devuelve por completo, también hace rato (fuera de la ventana de 15 días).
  agregarTransferencia(data, {
    id: "DEV-VIEJO",
    fecha: "2026-01-20",
    origen: "operativa",
    destino: "seguridad",
    monto: 15000,
    motivo: "Devolución del préstamo viejo",
    tipo: "movimiento",
    devolucion_de: "PRES-VIEJO",
  });

  const despues = transferenciasRecientes(data, HOY, 15);
  assert.ok(!despues.some((t) => t.id === "PRES-VIEJO" || t.id === "DEV-VIEJO"));
});
