import { test } from "node:test";
import assert from "node:assert/strict";
import { proponerClasificacionRecetas, referenciaVentasPorGusto, desvioPlanSemana } from "./planificacion";
import { emptyData } from "./types";
import type { Ingrediente, RecetaLinea, Pedido, Producto } from "./types";

function ingrediente(overrides: Partial<Ingrediente> = {}): Ingrediente {
  return {
    id: "ING-01",
    nombre: "Harina de arroz",
    unidad: "kg",
    precio_ref: 1000,
    precio_vigente: null,
    seguimiento_stock: false,
    ...overrides,
  };
}

function lineaReceta(overrides: Partial<RecetaLinea> = {}): RecetaLinea {
  return {
    id: "REC-01",
    id_producto: "PROD-01",
    tipo: "Ingrediente",
    concepto: "ING-01",
    cantidad: 0.063,
    ...overrides,
  };
}

test("proponerClasificacionRecetas: packaging siempre se propone como packaging", () => {
  const data = emptyData();
  data.recetas = [lineaReceta({ tipo: "Packaging", concepto: "PKG-01" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, "packaging");
});

test("proponerClasificacionRecetas: CostoFijo queda sin propuesta", () => {
  const data = emptyData();
  data.recetas = [lineaReceta({ tipo: "CostoFijo", concepto: "CF-01" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, null);
});

test("proponerClasificacionRecetas: ingrediente reconocido de masa (harina) se propone masa", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-01", nombre: "Harina de arroz" })];
  data.recetas = [lineaReceta({ concepto: "ING-01" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, "masa");
});

test("proponerClasificacionRecetas: ingrediente reconocido de relleno (espinaca) se propone relleno", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-02", nombre: "Espinaca" })];
  data.recetas = [lineaReceta({ concepto: "ING-02" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, "relleno");
});

test("proponerClasificacionRecetas: nombres con acentos matchean igual (cúrcuma, jamón)", () => {
  const data = emptyData();
  data.ingredientes = [
    ingrediente({ id: "ING-03", nombre: "Cúrcuma" }),
    ingrediente({ id: "ING-04", nombre: "Jamón cocido" }),
  ];
  data.recetas = [
    lineaReceta({ id: "REC-03", concepto: "ING-03" }),
    lineaReceta({ id: "REC-04", concepto: "ING-04" }),
  ];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas.find((p) => p.id === "REC-03")?.componente, "masa");
  assert.equal(propuestas.find((p) => p.id === "REC-04")?.componente, "relleno");
});

test("proponerClasificacionRecetas: ingrediente ambiguo (sal) queda sin propuesta en vez de adivinar", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-05", nombre: "Sal" })];
  data.recetas = [lineaReceta({ concepto: "ING-05" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, null);
});

test("proponerClasificacionRecetas: no muta data.recetas ni escribe el campo componente", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-01", nombre: "Harina de arroz" })];
  data.recetas = [lineaReceta({ concepto: "ING-01" })];
  proponerClasificacionRecetas(data);
  assert.equal(data.recetas[0].componente, undefined);
});

function producto(overrides: Partial<Producto> = {}): Producto {
  return { id: "PROD-01", id_base: "PROD-01", nombre: "Raviolón de espinaca", precio_venta: 20000, activo: true, ...overrides };
}

function pedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: "PED-01",
    id_detalle: "PED-01-A",
    id_cliente: "CLI-01",
    id_producto: "PROD-01",
    nombre_producto: "Raviolón de espinaca",
    cantidad: 1,
    precio_unitario: 20000,
    precio_total: 20000,
    descuento_monto: 0,
    precio_neto: 20000,
    fecha: "2026-07-10",
    estado: "Entregado",
    canal: "Minorista",
    km_envio: 0,
    costo_envio: 0,
    ...overrides,
  };
}

test("referenciaVentasPorGusto: replica el ejemplo real (14→12→7, promedio 11, tendencia down)", () => {
  const data = emptyData();
  data.productos = [producto()];
  data.config_planificacion.ventana_meses_referencia = 3;
  // hoy = agosto 2026 → ventana = mayo, junio, julio (los 3 meses cerrados anteriores)
  const hoy = new Date("2026-08-15T12:00:00");
  data.pedidos = [
    pedido({ id_detalle: "A", fecha: "2026-05-15", cantidad: 14 }),
    pedido({ id_detalle: "B", fecha: "2026-06-15", cantidad: 12 }),
    pedido({ id_detalle: "C", fecha: "2026-07-15", cantidad: 7 }),
  ];
  const [ref] = referenciaVentasPorGusto(data, hoy);
  assert.deepEqual(ref.historicoMeses, [14, 12, 7]);
  assert.equal(ref.promedioMes, 11);
  assert.equal(ref.ultimoMesCerrado, 7);
  assert.equal(ref.tendencia, "down");
});

test("referenciaVentasPorGusto: gusto sin ventas en la ventana aparece en cero, no se oculta", () => {
  const data = emptyData();
  data.productos = [producto({ id: "PROD-02", nombre: "Sin ventas" })];
  const [ref] = referenciaVentasPorGusto(data, new Date("2026-08-15T12:00:00"));
  assert.equal(ref.promedioMes, 0);
  assert.equal(ref.ultimoMesCerrado, 0);
  assert.equal(ref.tendencia, "flat");
});

test("referenciaVentasPorGusto: excluye productos inactivos", () => {
  const data = emptyData();
  data.productos = [producto({ activo: false })];
  const referencia = referenciaVentasPorGusto(data);
  assert.equal(referencia.length, 0);
});

test("desvioPlanSemana: sin desvío cuando semana×4,33 coincide con el mes", () => {
  const r = desvioPlanSemana(43.3, 10, 15);
  assert.equal(r.excedeUmbral, false);
});

test("desvioPlanSemana: marca el aviso cuando el desvío supera el umbral, sin bloquear", () => {
  // 10 cajas/semana × 4,33 = 43,3 vs 30 cargadas en el mes → +44% de desvío
  const r = desvioPlanSemana(30, 10, 15);
  assert.ok(r.desviacionPct !== null && r.desviacionPct > 15);
  assert.equal(r.excedeUmbral, true);
});
