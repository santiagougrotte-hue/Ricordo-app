import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import { calcularConsumoDiarioPromedio, necesidadPorPedidosPendientes, calcularAlertasStock } from "./ia-stock";

function fixture() {
  const data = emptyDataV2();
  data.insumos = [
    { id: "INS-HARINA", nombre: "Harina de arroz", tipo: "ingrediente", unidad: "kg", precio_actual: 1000, controla_stock: true, stock_minimo: 5, activo: true },
    { id: "INS-MOZZA", nombre: "Mozzarella", tipo: "ingrediente", unidad: "kg", precio_actual: 4000, controla_stock: true, stock_minimo: 2, activo: true },
    { id: "INS-SIN-USO", nombre: "Sin movimientos", tipo: "ingrediente", unidad: "kg", precio_actual: 100, controla_stock: true, stock_minimo: 1, activo: true },
  ];
  data.productos = [{ id: "PROD-A", nombre: "Sabor A", activo: true }];
  data.recetas = [{ id: "REC-A", producto_id: "PROD-A", nombre: "Receta base", activa: true }];
  data.receta_items = [{ id: "RI-1", receta_id: "REC-A", insumo_id: "INS-MOZZA", etapa: "relleno", cantidad: 1 }];
  data.producto_variantes = [{ id: "VAR-A", producto_id: "PROD-A", nombre: "Caja", unidades_por_paquete: 1, precio_venta: 1000, activo: true }];
  return data;
}

test("calcularConsumoDiarioPromedio: promedia solo salidas reales (consumo/venta/merma) dentro de la ventana", () => {
  const data = fixture();
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-08-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-HARINA", cantidad: 100 },
    { id: "M2", fecha: "2026-08-10", tipo: "consumo", item_tipo: "insumo", item_id: "INS-HARINA", cantidad: -10 },
    { id: "M3", fecha: "2026-08-20", tipo: "venta", item_tipo: "insumo", item_id: "INS-HARINA", cantidad: -5 },
    { id: "M4", fecha: "2026-07-01", tipo: "consumo", item_tipo: "insumo", item_id: "INS-HARINA", cantidad: -100 }, // fuera de ventana
  ];
  // Ventana de 30 días terminando el 30/08: solo M2 (10) + M3 (5) = 15 -> 15/30 = 0.5/día
  const consumo = calcularConsumoDiarioPromedio(data, "INS-HARINA", "2026-08-30", 30);
  assert.equal(consumo, 0.5);
});

test("necesidadPorPedidosPendientes: suma insumos de pedidos Confirmado/Produccion, ignora Entregado/Cancelado", () => {
  const data = fixture();
  data.pedidos = [
    { id: "PED-1", fecha: "2026-08-01", cliente_id: "C1", estado: "Confirmado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 1000 },
    { id: "PED-2", fecha: "2026-08-02", cliente_id: "C1", estado: "Entregado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 1000 },
  ];
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "VAR-A", nombre_historico: "Caja", cantidad: 3, precio_unitario: 1000, descuento: 0, subtotal: 3000 },
    { id: "I2", pedido_id: "PED-2", producto_variante_id: "VAR-A", nombre_historico: "Caja", cantidad: 100, precio_unitario: 1000, descuento: 0, subtotal: 100000 },
  ];
  const necesidad = necesidadPorPedidosPendientes(data);
  // Solo PED-1 cuenta: 3 cajas × 1 kg de mozzarella por caja = 3kg.
  assert.equal(necesidad.get("INS-MOZZA"), 3);
});

test("calcularAlertasStock: severidad crítica cuando falta stock para pedidos pendientes, prioriza sobre días de cobertura", () => {
  const data = fixture();
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-08-01", tipo: "compra", item_tipo: "insumo", item_id: "INS-MOZZA", cantidad: 2 },
  ];
  data.pedidos = [
    { id: "PED-1", fecha: "2026-08-01", cliente_id: "C1", estado: "Confirmado", canal: "Minorista", descuento: 0, costo_envio: 0, total: 1000 },
  ];
  data.pedido_items = [
    { id: "I1", pedido_id: "PED-1", producto_variante_id: "VAR-A", nombre_historico: "Caja", cantidad: 5, precio_unitario: 1000, descuento: 0, subtotal: 5000 },
  ];
  const alertas = calcularAlertasStock(data, "2026-08-31");
  const mozza = alertas.find((a) => a.insumo_id === "INS-MOZZA")!;
  assert.equal(mozza.stock_actual, 2);
  assert.equal(mozza.necesidad_pedidos_pendientes, 5);
  assert.equal(mozza.faltante_para_pedidos_pendientes, 3);
  assert.equal(mozza.severidad, "critica");
  // La fila crítica queda primera en el orden.
  assert.equal(alertas[0].insumo_id, "INS-MOZZA");
});

test("calcularAlertasStock: sin consumo registrado, dias_cobertura es null y el mensaje lo aclara en vez de inventar un número", () => {
  const data = fixture();
  const alertas = calcularAlertasStock(data, "2026-08-31");
  const sinUso = alertas.find((a) => a.insumo_id === "INS-SIN-USO")!;
  assert.equal(sinUso.dias_cobertura, null);
  assert.match(sinUso.mensaje, /no se puede estimar cobertura/);
});
