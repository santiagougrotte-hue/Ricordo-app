import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { buscarGlobal } from "./busqueda-global";

function fixture() {
  const data = emptyDataV2();
  data.clientes = [
    { id: "C1", nombre: "Root Bar", canal: "Mayorista" },
    { id: "C2", nombre: "Mariana Osterc", canal: "Minorista" },
  ];
  data.insumos = [
    { id: "INS-1", nombre: "Mozzarella", tipo: "ingrediente", unidad: "kg", precio_actual: 4000, controla_stock: true, activo: true },
    { id: "INS-2", nombre: "Harina de arroz", tipo: "ingrediente", unidad: "kg", precio_actual: 1000, controla_stock: true, activo: true },
  ];
  data.productos = [{ id: "P1", nombre: "Ravioles de calabaza", activo: true }];
  data.producto_variantes = [{ id: "V1", producto_id: "P1", nombre: "Calabaza mayorista", precio_venta: 3000, activo: true }];
  data.proveedores = [{ id: "PRV1", nombre: "Distribuidora Mozzarella SA" }];
  data.pedidos = [{ id: "PED-100", fecha: "2026-01-10", cliente_id: "C1", estado: "Entregado", canal: "Mayorista", descuento: 0, costo_envio: 0, total: 5000 }];
  return data;
}

test("buscarGlobal: menos de 2 caracteres no devuelve nada, para no listar medio catálogo por error", () => {
  const data = fixture();
  assert.deepEqual(buscarGlobal(data, ""), []);
  assert.deepEqual(buscarGlobal(data, "a"), []);
});

test("buscarGlobal: 'mozzarella' encuentra el insumo Y el proveedor cuyo nombre lo contiene, case-insensitive", () => {
  const data = fixture();
  const resultados = buscarGlobal(data, "MOZZA");
  const tipos = resultados.map((r) => r.tipo).sort();
  assert.deepEqual(tipos, ["insumo", "proveedor"]);
});

test("buscarGlobal: 'root' encuentra el cliente y sus pedidos asociados", () => {
  const data = fixture();
  const resultados = buscarGlobal(data, "root");
  assert.equal(resultados.some((r) => r.tipo === "cliente" && r.id === "C1"), true);
});

test("buscarGlobal: busca también dentro de variantes de producto, mostrando el producto base como referencia", () => {
  const data = fixture();
  const resultados = buscarGlobal(data, "calabaza");
  const variante = resultados.find((r) => r.id === "V1");
  assert.ok(variante);
  assert.match(variante!.subtitulo, /Ravioles de calabaza/);
});

test("buscarGlobal: nunca inventa un resultado — una búsqueda sin coincidencias reales da un array vacío", () => {
  const data = fixture();
  assert.deepEqual(buscarGlobal(data, "xyz-inexistente"), []);
});
