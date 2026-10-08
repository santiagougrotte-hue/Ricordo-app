import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { generarResumenInteligente } from "./resumen-inteligente";

function fixture() {
  const data = emptyDataV2();
  data.productos = [
    { id: "PROD-A", nombre: "Sabor A", activo: true },
    { id: "PROD-B", nombre: "Sabor B", activo: true },
  ];
  data.producto_variantes = [
    { id: "VAR-A", producto_id: "PROD-A", nombre: "Caja A", canal: "Minorista", precio_venta: 1000, activo: true },
    { id: "VAR-B", producto_id: "PROD-B", nombre: "Caja B", canal: "Mayorista", precio_venta: 1000, activo: true },
  ];
  data.clientes = [{ id: "C1", nombre: "Cliente 1", canal: "Minorista" }];
  return data;
}

function pedido(id: string, fecha: string, varianteId: string, cantidad: number, precio: number, canal: "Minorista" | "Mayorista") {
  return {
    pedido: { id, fecha, cliente_id: "C1", estado: "Entregado" as const, canal, descuento: 0, costo_envio: 0, total: cantidad * precio },
    item: { id: `${id}-I1`, pedido_id: id, producto_variante_id: varianteId, nombre_historico: "x", cantidad, precio_unitario: precio, descuento: 0, subtotal: cantidad * precio },
  };
}

test("generarResumenInteligente: sin ningún mes anterior comparable, no fuerza conclusiones de crecimiento", () => {
  const data = fixture();
  const p = pedido("PED-1", "2026-08-05", "VAR-A", 5, 1000, "Minorista");
  data.pedidos = [p.pedido];
  data.pedido_items = [p.item];
  const conclusiones = generarResumenInteligente(data, 8, 2026);
  assert.equal(conclusiones.some((c) => c.id === "facturacion-vs-cajas"), false);
  assert.equal(conclusiones.some((c) => c.id === "canal-que-mas-aporto"), false);
});

test("generarResumenInteligente: gusto dominante se detecta cuando supera el 20% de las cajas", () => {
  const data = fixture();
  const pA = pedido("PED-A", "2026-08-05", "VAR-A", 8, 1000, "Minorista");
  const pB = pedido("PED-B", "2026-08-06", "VAR-B", 2, 1000, "Mayorista");
  data.pedidos = [pA.pedido, pB.pedido];
  data.pedido_items = [pA.item, pB.item];
  const conclusiones = generarResumenInteligente(data, 8, 2026);
  const gusto = conclusiones.find((c) => c.id === "gusto-dominante");
  assert.ok(gusto);
  assert.match(gusto!.texto, /Sabor A/);
  assert.equal(gusto!.datos.pct_cajas, 80);
});

test("generarResumenInteligente: un aumento de precio de insumo relevante (>=15%) se reporta como aviso independiente", () => {
  const data = fixture();
  data.insumos = [{ id: "INS-1", nombre: "Harina", tipo: "ingrediente", unidad: "kg", precio_actual: 200, controla_stock: false, activo: true }];
  data.historial_precios = [
    { id: "HP-1", insumo_id: "INS-1", fecha: "2026-07-01", precio: 100 },
    { id: "HP-2", insumo_id: "INS-1", fecha: "2026-08-05", precio: 200 },
  ];
  const p = pedido("PED-1", "2026-08-05", "VAR-A", 5, 1000, "Minorista");
  data.pedidos = [p.pedido];
  data.pedido_items = [p.item];

  const conclusiones = generarResumenInteligente(data, 8, 2026);
  const aviso = conclusiones.find((c) => c.id === "aumento-insumo");
  assert.ok(aviso);
  assert.match(aviso!.texto, /Harina/);
  assert.equal(aviso!.datos.aumento_pct, 100);
});

test("generarResumenInteligente: un aumento de precio menor al 15% no genera aviso (evita ruido)", () => {
  const data = fixture();
  data.insumos = [{ id: "INS-1", nombre: "Harina", tipo: "ingrediente", unidad: "kg", precio_actual: 105, controla_stock: false, activo: true }];
  data.historial_precios = [
    { id: "HP-1", insumo_id: "INS-1", fecha: "2026-07-01", precio: 100 },
    { id: "HP-2", insumo_id: "INS-1", fecha: "2026-08-05", precio: 105 },
  ];
  const p = pedido("PED-1", "2026-08-05", "VAR-A", 5, 1000, "Minorista");
  data.pedidos = [p.pedido];
  data.pedido_items = [p.item];

  const conclusiones = generarResumenInteligente(data, 8, 2026);
  assert.equal(conclusiones.some((c) => c.id === "aumento-insumo"), false);
});
