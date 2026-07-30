import { test } from "node:test";
import assert from "node:assert/strict";
import { proponerClasificacionRecetas } from "./planificacion";
import { emptyData } from "./types";
import type { Ingrediente, RecetaLinea } from "./types";

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
