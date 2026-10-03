import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import { costoVariante } from "./calc-v2";
import {
  aGramos,
  deGramos,
  calcularStockReservado,
  calcularStockDisponible,
  necesidadPreparacion,
  necesidadCajas,
  costoConsumoInsumos,
  stockRestanteLote,
  lotesConStockOrdenados,
  costoPromedioPorKgPreparacion,
  construirReservasInsumos,
  construirReservaRelleno,
  liberarReservasDeOrigen,
  confirmarProduccionPreparacion,
  confirmarElaboracionCajas,
  reservasDeOrigen,
} from "./produccion-v2";

test("aGramos/deGramos: solo convierte g/kg, nunca otra unidad (litro, unidad) sin equivalencia cargada", () => {
  assert.equal(aGramos(2, "kg"), 2000);
  assert.equal(aGramos(500, "g"), 500);
  assert.equal(aGramos(3, "litro"), null);
  assert.equal(aGramos(1, "unidad"), null);
  assert.equal(deGramos(2500, "kg"), 2.5);
  assert.equal(deGramos(2500, "g"), 2500);
});

function fixtureRelleno(): RicordoDataV2 {
  const data = emptyDataV2();
  data.insumos = [
    { id: "INS-CALABAZA", nombre: "Calabaza", tipo: "ingrediente", unidad: "kg", precio_actual: 1000, controla_stock: true, activo: true },
    { id: "INS-QUESO", nombre: "Queso", tipo: "ingrediente", unidad: "kg", precio_actual: 4000, controla_stock: true, activo: true },
  ];
  data.preparaciones = [{ id: "PREP-CALABAZA", nombre: "Relleno de calabaza", unidad: "g", controla_stock: true, activo: true }];
  // Receta de referencia: con 2kg de calabaza + 0.5kg de queso se obtienen 2000g de relleno.
  data.preparacion_recetas = [{ id: "PR-1", preparacion_id: "PREP-CALABAZA", rendimiento_referencia: 2000 }];
  data.preparacion_receta_items = [
    { id: "PRI-1", preparacion_id: "PREP-CALABAZA", insumo_id: "INS-CALABAZA", cantidad: 2 },
    { id: "PRI-2", preparacion_id: "PREP-CALABAZA", insumo_id: "INS-QUESO", cantidad: 0.5 },
  ];
  // Stock físico cargado vía compra.
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-CALABAZA", cantidad: 10 },
    { id: "M2", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-QUESO", cantidad: 3 },
  ];
  return data;
}

test("necesidadPreparacion: escala la receta de referencia proporcionalmente y calcula disponible/faltante", () => {
  const data = fixtureRelleno();
  // Objetivo: 3000g (1.5x la referencia de 2000g) -> 3kg calabaza, 0.75kg queso.
  const necesidad = necesidadPreparacion(data, "PREP-CALABAZA", 3000)!;
  assert.equal(necesidad.factor_escala, 1.5);
  const calabaza = necesidad.insumos.find((i) => i.insumo_id === "INS-CALABAZA")!;
  assert.equal(calabaza.cantidad_necesaria, 3);
  assert.equal(calabaza.disponible, 10);
  assert.equal(calabaza.faltante, 0);
  const queso = necesidad.insumos.find((i) => i.insumo_id === "INS-QUESO")!;
  assert.equal(queso.cantidad_necesaria, 0.75);
  assert.equal(queso.disponible, 3);
  assert.equal(queso.faltante, 0);
});

test("necesidadPreparacion: null sin receta cargada o sin rendimiento de referencia — nunca asume una receta", () => {
  const data = fixtureRelleno();
  assert.equal(necesidadPreparacion(data, "PREP-INEXISTENTE", 1000), null);
  data.preparacion_recetas[0].rendimiento_referencia = 0;
  assert.equal(necesidadPreparacion(data, "PREP-CALABAZA", 1000), null);
});

test("Reserva: planificar producción reserva insumos sin descontar el stock físico, y el faltante se calcula contra lo disponible (no lo físico)", () => {
  const data = fixtureRelleno();
  const necesidad = necesidadPreparacion(data, "PREP-CALABAZA", 3000)!;
  const reservas = construirReservasInsumos(necesidad.insumos, "orden_produccion", "OP-1", "2026-01-05");
  data.reservas = reservas;

  // El stock físico no cambió — sigue siendo 10kg de calabaza.
  assert.equal(
    data.inventario_movimientos.filter((m) => m.item_id === "INS-CALABAZA").reduce((a, m) => a + m.cantidad, 0),
    10
  );
  assert.equal(calcularStockReservado(data, "insumo", "INS-CALABAZA"), 3);
  assert.equal(calcularStockDisponible(data, "insumo", "INS-CALABAZA"), 7);

  // Si ahora alguien más intenta planificar otro lote con lo que "parece" disponible físicamente
  // (10kg) sin considerar la reserva, el faltante lo detecta necesidadPreparacion corriendo de nuevo.
  const necesidad2 = necesidadPreparacion(data, "PREP-CALABAZA", 8000)!; // pide 8kg de calabaza
  const calabaza2 = necesidad2.insumos.find((i) => i.insumo_id === "INS-CALABAZA")!;
  assert.equal(calabaza2.disponible, 7); // no 10 — ya hay 3kg reservados por la otra orden
  assert.equal(calabaza2.faltante, 1); // 8 necesarios - 7 disponibles
});

test("Cancelar una planificación libera la reserva (vuelve a contar como disponible), nunca la borra", () => {
  const data = fixtureRelleno();
  const necesidad = necesidadPreparacion(data, "PREP-CALABAZA", 2000)!;
  data.reservas = construirReservasInsumos(necesidad.insumos, "orden_produccion", "OP-1", "2026-01-05");
  assert.equal(calcularStockDisponible(data, "insumo", "INS-CALABAZA"), 8);

  data.reservas = liberarReservasDeOrigen(data, "orden_produccion", "OP-1");
  assert.equal(reservasDeOrigen(data, "orden_produccion", "OP-1").length, 0); // ya no cuenta como activa
  assert.equal(data.reservas.length, 2); // pero el registro sigue existiendo (auditable)
  assert.equal(data.reservas[0].estado, "liberada");
  assert.equal(calcularStockDisponible(data, "insumo", "INS-CALABAZA"), 10); // vuelve a estar disponible
});

test("confirmarProduccionPreparacion: descuenta el consumo REAL de insumos, ingresa el peso REAL obtenido (puede diferir de lo planificado) y libera/consume la reserva", () => {
  const data = fixtureRelleno();
  const necesidad = necesidadPreparacion(data, "PREP-CALABAZA", 2000)!;
  data.reservas = construirReservasInsumos(necesidad.insumos, "orden_produccion", "OP-1", "2026-01-05");
  const orden = {
    id: "OP-1",
    tipo: "preparacion" as const,
    item_id: "PREP-CALABAZA",
    cantidad_planeada: 2000,
    unidad: "g",
    estado: "en_elaboracion" as const,
    fecha_prevista: "2026-01-05",
    fecha_creacion: "2026-01-04",
  };
  // Producción parcial: se consumió un poco menos de lo planificado y rindió menos por merma de cocción.
  const consumoReal = [
    { insumo_id: "INS-CALABAZA", cantidad: 1.9 },
    { insumo_id: "INS-QUESO", cantidad: 0.48 },
  ];
  const resultado = confirmarProduccionPreparacion(data, orden, consumoReal, 1800, "2026-01-06", { ubicacion: "Freezer 1", vencimiento: "2026-02-06" });

  assert.equal(resultado.movimientos_nuevos.length, 3); // 2 consumos + 1 ingreso
  const consumoCalabaza = resultado.movimientos_nuevos.find((m) => m.item_id === "INS-CALABAZA")!;
  assert.equal(consumoCalabaza.cantidad, -1.9);
  const ingreso = resultado.movimientos_nuevos.find((m) => m.item_tipo === "preparacion")!;
  assert.equal(ingreso.cantidad, 1800); // el peso REAL, no los 2000 planificados
  assert.equal(ingreso.lote_id, resultado.lote.id);

  assert.equal(resultado.lote.cantidad_obtenida, 1800);
  assert.equal(resultado.lote.costo_total, 1.9 * 1000 + 0.48 * 4000); // 1900 + 1920 = 3820
  assert.equal(resultado.lote.ubicacion, "Freezer 1");

  assert.equal(resultado.orden_actualizada.estado, "terminado");
  assert.equal(resultado.orden_actualizada.cantidad_real, 1800);
  assert.equal(resultado.orden_actualizada.lote_generado_id, resultado.lote.id);

  const reservaCalabaza = resultado.reservas_actualizadas.find((r) => r.item_id === "INS-CALABAZA")!;
  assert.equal(reservaCalabaza.estado, "consumida"); // ya no cuenta como reservada NI vuelve a estar disponible

  // Aplicando el resultado a `data` (como haría el componente): el stock de la preparación ahora
  // refleja el peso real obtenido, y lo que se reservó ya no aparece como disponible ni reservado
  // (se consumió, no se liberó).
  data.inventario_movimientos = [...data.inventario_movimientos, ...resultado.movimientos_nuevos];
  data.lotes_preparacion = [resultado.lote];
  data.reservas = resultado.reservas_actualizadas;
  assert.equal(calcularStockDisponible(data, "preparacion", "PREP-CALABAZA"), 1800);
  assert.equal(calcularStockReservado(data, "insumo", "INS-CALABAZA"), 0);
});

test("stockRestanteLote/lotesConStockOrdenados: ordena por vencimiento más próximo primero (FEFO), y descuenta consumos posteriores", () => {
  const data = fixtureRelleno();
  data.lotes_preparacion = [
    { id: "L1", preparacion_id: "PREP-CALABAZA", fecha_elaboracion: "2026-01-01", cantidad_obtenida: 1000, costo_total: 2000, vencimiento: "2026-03-01" },
    { id: "L2", preparacion_id: "PREP-CALABAZA", fecha_elaboracion: "2026-01-10", cantidad_obtenida: 1000, costo_total: 2200, vencimiento: "2026-02-01" },
  ];
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-01-01", tipo: "produccion", item_tipo: "preparacion", item_id: "PREP-CALABAZA", cantidad: 1000, lote_id: "L1" },
    { id: "M2", fecha: "2026-01-10", tipo: "produccion", item_tipo: "preparacion", item_id: "PREP-CALABAZA", cantidad: 1000, lote_id: "L2" },
    { id: "M3", fecha: "2026-01-15", tipo: "merma", item_tipo: "preparacion", item_id: "PREP-CALABAZA", cantidad: -200, lote_id: "L1" },
  ];
  assert.equal(stockRestanteLote(data, "L1"), 800);
  assert.equal(stockRestanteLote(data, "L2"), 1000);
  const ordenados = lotesConStockOrdenados(data, "PREP-CALABAZA");
  assert.equal(ordenados.length, 2);
  assert.equal(ordenados[0].lote.id, "L2"); // vence antes (01/02) -> primero, aunque se elaboró después
  assert.equal(ordenados[1].lote.id, "L1");
});

test("costoPromedioPorKgPreparacion: promedio ponderado por lo que queda de cada lote, convirtiendo gramos a kg explícitamente", () => {
  const data = fixtureRelleno();
  data.lotes_preparacion = [
    { id: "L1", preparacion_id: "PREP-CALABAZA", fecha_elaboracion: "2026-01-01", cantidad_obtenida: 1000, costo_total: 2000 }, // $2000/kg
    { id: "L2", preparacion_id: "PREP-CALABAZA", fecha_elaboracion: "2026-01-10", cantidad_obtenida: 1000, costo_total: 3000 }, // $3000/kg
  ];
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-01-01", tipo: "produccion", item_tipo: "preparacion", item_id: "PREP-CALABAZA", cantidad: 1000, lote_id: "L1" },
    { id: "M2", fecha: "2026-01-10", tipo: "produccion", item_tipo: "preparacion", item_id: "PREP-CALABAZA", cantidad: 1000, lote_id: "L2" },
  ];
  // 1kg a $2000/kg + 1kg a $3000/kg -> promedio $2500/kg
  assert.equal(costoPromedioPorKgPreparacion(data, "PREP-CALABAZA"), 2500);
});

test("costoPromedioPorKgPreparacion: null sin ningún lote elaborado — nunca se inventa un costo", () => {
  const data = fixtureRelleno();
  assert.equal(costoPromedioPorKgPreparacion(data, "PREP-CALABAZA"), null);
});

function fixtureCajaConRelleno(): RicordoDataV2 {
  const data = fixtureRelleno();
  data.productos = [{ id: "PROD-SORRENTINO", nombre: "Sorrentinos", activo: true }];
  // Receta compartida del producto base: masa + bolsa (packaging) — el relleno YA NO se carga acá,
  // viene de la preparación vinculada.
  data.insumos.push(
    { id: "INS-PREMEZCLA", nombre: "Premezcla", tipo: "ingrediente", unidad: "kg", precio_actual: 1000, controla_stock: true, activo: true },
    { id: "INS-BOLSA", nombre: "Bolsa", tipo: "packaging", unidad: "unidad", precio_actual: 50, controla_stock: true, activo: true }
  );
  data.recetas = [{ id: "REC-SORRENTINO", producto_id: "PROD-SORRENTINO", nombre: "Receta sorrentino", activa: true }];
  data.receta_items = [
    { id: "RI-1", receta_id: "REC-SORRENTINO", insumo_id: "INS-PREMEZCLA", etapa: "masa", cantidad: 0.01 }, // por unidad
    { id: "RI-2", receta_id: "REC-SORRENTINO", insumo_id: "INS-BOLSA", etapa: "packaging", cantidad: 1 }, // por caja, no escala
  ];
  data.producto_variantes = [
    {
      id: "VAR-SORRENTINO-10",
      producto_id: "PROD-SORRENTINO",
      nombre: "Caja de 10",
      unidades_por_paquete: 10,
      precio_venta: 5000,
      activo: true,
      gramos_relleno_por_caja: 200, // 200g de relleno por caja, Sección 6 ejemplo ilustrativo
      preparacion_relleno_id: "PREP-CALABAZA",
    },
  ];
  // Lote de relleno ya elaborado: 3kg a $2000/kg de costo.
  data.lotes_preparacion = [{ id: "L1", preparacion_id: "PREP-CALABAZA", fecha_elaboracion: "2026-01-01", cantidad_obtenida: 3000, costo_total: 6000 }];
  data.inventario_movimientos.push(
    { id: "M3", fecha: "2026-01-01", tipo: "produccion", item_tipo: "preparacion", item_id: "PREP-CALABAZA", cantidad: 3000, lote_id: "L1" },
    // Stock de bolsas y premezcla suficiente para varias cajas.
    { id: "M4", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-BOLSA", cantidad: 100 },
    { id: "M5", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-PREMEZCLA", cantidad: 50 }
  );
  return data;
}

test("Ejemplo ilustrativo de la Sección 6: con 3kg de relleno y 200g por caja, 5 cajas elaboradas descuentan 1kg y quedan 2kg", () => {
  const data = fixtureCajaConRelleno();
  const variante = data.producto_variantes[0];
  const necesidad = necesidadCajas(data, variante, 5);
  assert.equal(necesidad.relleno!.necesario_g, 1000); // 5 × 200g = 1kg
  assert.equal(necesidad.relleno!.disponible_g, 3000);
  assert.equal(necesidad.relleno!.faltante_g, 0);

  // Confirmar la elaboración real de 5 cajas: consume 1000g del lote de relleno.
  const orden = {
    id: "OP-CAJAS-1",
    tipo: "producto_terminado" as const,
    item_id: variante.id,
    cantidad_planeada: 5,
    unidad: "caja",
    estado: "en_elaboracion" as const,
    fecha_prevista: "2026-01-10",
    fecha_creacion: "2026-01-09",
  };
  const resultado = confirmarElaboracionCajas(
    data,
    orden,
    5,
    "2026-01-10",
    [{ lote_id: "L1", cantidad: 1000 }],
    [
      { insumo_id: "INS-PREMEZCLA", cantidad: 0.01 * 10 * 5 }, // 0.5kg
      { insumo_id: "INS-BOLSA", cantidad: 5 },
    ]
  );
  data.inventario_movimientos.push(...resultado.movimientos_nuevos);

  assert.equal(stockRestanteLote(data, "L1"), 2000); // 3000 - 1000 = 2000g, como pide el ejemplo
});

test("costoVariante con relleno de preparación: NO duplica el costo de los insumos del relleno (ya consumidos al elaborar el lote)", () => {
  const data = fixtureCajaConRelleno();
  const variante = data.producto_variantes[0];
  // Costo esperado: masa (10 unidades × 0.01kg × $1000 = $100) + bolsa ($50, no escala) +
  // relleno vía preparación (200g/1000 × $2000/kg = $400) = $550. Nunca vuelve a sumar calabaza/
  // queso como si fueran insumos directos de esta variante.
  assert.equal(costoVariante(data, variante.id), 550);
});

test("costoVariante: sin preparación vinculada, el relleno se sigue costeando desde insumos directos como antes (sin regresión)", () => {
  const data = fixtureCajaConRelleno();
  data.producto_variantes[0].preparacion_relleno_id = undefined;
  data.receta_items.push({ id: "RI-3", receta_id: "REC-SORRENTINO", insumo_id: "INS-CALABAZA", etapa: "relleno", cantidad: 0.02 });
  // Masa: 10×0.01×1000=100, relleno directo: 10×0.02×1000=200, bolsa: 50 -> 350.
  assert.equal(costoVariante(data, data.producto_variantes[0].id), 350);
});

test("construirReservaRelleno/necesidadCajas: cajas_posibles respeta el mínimo entre relleno e insumos directos", () => {
  const data = fixtureCajaConRelleno();
  const variante = data.producto_variantes[0];
  // Solo 5 bolsas en stock -> limita a 5 cajas aunque el relleno alcance para 15 (3000g/200g).
  data.inventario_movimientos = data.inventario_movimientos.filter((m) => m.item_id !== "INS-BOLSA");
  data.inventario_movimientos.push({ id: "M-BOLSA-POCAS", fecha: "2026-01-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-BOLSA", cantidad: 5 });
  const necesidad = necesidadCajas(data, variante, 10);
  assert.equal(necesidad.cajas_posibles, 5);

  const reservaRelleno = construirReservaRelleno(necesidad.relleno, "orden_produccion", "OP-2", "2026-01-09")!;
  assert.equal(reservaRelleno.item_id, "PREP-CALABAZA");
  assert.equal(reservaRelleno.cantidad, 2000); // necesario (10×200=2000) <= disponible (3000) -> reserva lo necesario
});

test("costoConsumoInsumos: usa el precio ACTUAL del insumo al momento de calcularlo (se congela recién al confirmar, en el lote)", () => {
  const data = fixtureRelleno();
  const costo = costoConsumoInsumos(data, [
    { insumo_id: "INS-CALABAZA", cantidad: 2 },
    { insumo_id: "INS-QUESO", cantidad: 1 },
  ]);
  assert.equal(costo, 2 * 1000 + 1 * 4000);
});
