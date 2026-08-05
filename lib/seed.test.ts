import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "./types";
import { mapBackupToRicordoData, repararConceptoPackagingEnRecetas } from "./seed";

test("mapBackupToRicordoData: resuelve el concepto de una línea de Packaging cuando el backup guarda el nombre en vez del id", () => {
  const backup = {
    packaging: [{ id: "PKG-001", nombre: "Bolsa zipper", unidad: "unidad", precio_ref: 120, precio_vigente: null }],
    recetas: [{ id_producto: "PROD-01", tipo: "Packaging", concepto: "Bolsa zipper", cantidad: 120 }],
  };
  const data = mapBackupToRicordoData(backup);
  assert.equal(data.recetas[0].concepto, "PKG-001");
});

test("mapBackupToRicordoData: no toca el concepto de una línea de Packaging que ya viene con id", () => {
  const backup = {
    packaging: [{ id: "PKG-001", nombre: "Bolsa zipper", unidad: "unidad", precio_ref: 120, precio_vigente: null }],
    recetas: [{ id_producto: "PROD-01", tipo: "Packaging", concepto: "PKG-001", cantidad: 120 }],
  };
  const data = mapBackupToRicordoData(backup);
  assert.equal(data.recetas[0].concepto, "PKG-001");
});

test("repararConceptoPackagingEnRecetas: corrige datos ya guardados con el concepto de Packaging como nombre", () => {
  const data = emptyData();
  data.packaging = [{ id: "PKG-001", nombre: "Bolsa zipper", unidad: "unidad", precio_ref: 120, precio_vigente: null }];
  data.recetas = [{ id: "REC-1", id_producto: "PROD-01", tipo: "Packaging", concepto: "Bolsa zipper", cantidad: 120 }];
  const reparado = repararConceptoPackagingEnRecetas(data);
  assert.equal(reparado.recetas[0].concepto, "PKG-001");
});

test("repararConceptoPackagingEnRecetas: es no-op si ya está todo con id (no crea una nueva referencia de array)", () => {
  const data = emptyData();
  data.packaging = [{ id: "PKG-001", nombre: "Bolsa zipper", unidad: "unidad", precio_ref: 120, precio_vigente: null }];
  data.recetas = [{ id: "REC-1", id_producto: "PROD-01", tipo: "Packaging", concepto: "PKG-001", cantidad: 120 }];
  const reparado = repararConceptoPackagingEnRecetas(data);
  assert.equal(reparado, data);
});

test("repararConceptoPackagingEnRecetas: no toca líneas de Ingrediente", () => {
  const data = emptyData();
  data.ingredientes = [
    { id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 100, precio_vigente: null, seguimiento_stock: false },
  ];
  data.recetas = [{ id: "REC-1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 1 }];
  const reparado = repararConceptoPackagingEnRecetas(data);
  assert.equal(reparado.recetas[0].concepto, "ING-1");
});
