import { test } from "node:test";
import assert from "node:assert/strict";
import { toCSV } from "./csv";

interface Fila {
  id: string;
  nombre: string;
  monto: number;
}

test("toCSV: arma encabezado y filas separados por coma y CRLF", () => {
  const filas: Fila[] = [
    { id: "1", nombre: "Ana", monto: 1000 },
    { id: "2", nombre: "Beto", monto: 2000 },
  ];
  const csv = toCSV(filas, [
    { header: "ID", value: (r) => r.id },
    { header: "Nombre", value: (r) => r.nombre },
    { header: "Monto", value: (r) => r.monto },
  ]);
  assert.equal(csv, "ID,Nombre,Monto\r\n1,Ana,1000\r\n2,Beto,2000");
});

test("toCSV: sin filas devuelve solo el encabezado", () => {
  const csv = toCSV<Fila>([], [{ header: "ID", value: (r) => r.id }]);
  assert.equal(csv, "ID");
});

test("toCSV: escapa campos con comas envolviéndolos en comillas", () => {
  const filas = [{ id: "1", nombre: "Ricordo, Pastas", monto: 100 }];
  const csv = toCSV(filas, [
    { header: "ID", value: (r) => r.id },
    { header: "Nombre", value: (r) => r.nombre },
  ]);
  assert.equal(csv, 'ID,Nombre\r\n1,"Ricordo, Pastas"');
});

test("toCSV: escapa comillas dobles duplicándolas", () => {
  const filas = [{ id: "1", nombre: 'Ravioles "especiales"', monto: 100 }];
  const csv = toCSV(filas, [{ header: "Nombre", value: (r) => r.nombre }]);
  assert.equal(csv, 'Nombre\r\n"Ravioles ""especiales"""');
});

test("toCSV: escapa saltos de línea envolviendo el campo", () => {
  const filas = [{ id: "1", nombre: "Línea1\nLínea2", monto: 100 }];
  const csv = toCSV(filas, [{ header: "Nombre", value: (r) => r.nombre }]);
  assert.equal(csv, 'Nombre\r\n"Línea1\nLínea2"');
});

test("toCSV: valores null/undefined se exportan como campo vacío", () => {
  const filas = [{ id: "1", nombre: undefined as unknown as string, monto: 100 }];
  const csv = toCSV(filas, [
    { header: "ID", value: (r) => r.id },
    { header: "Nombre", value: (r) => r.nombre },
  ]);
  assert.equal(csv, "ID,Nombre\r\n1,");
});
