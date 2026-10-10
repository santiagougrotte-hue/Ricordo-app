import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import { calcularStockReservado, calcularStockDisponible } from "./produccion-v2";

function fixture(): RicordoDataV2 {
  const data = emptyDataV2();
  data.producto_variantes = [
    { id: "VAR-1", producto_id: "PROD-1", nombre: "Caja x12", precio_venta: 1000, activo: true },
  ];
  data.inventario_movimientos = [
    { id: "MOV-1", fecha: "2026-01-01", tipo: "produccion", item_tipo: "producto_variante", item_id: "VAR-1", cantidad: 20 },
  ];
  return data;
}

test("calcularStockReservado/calcularStockDisponible: una reserva activa de un pedido baja el disponible sin tocar el físico", () => {
  const data = fixture();
  data.reservas = [
    { id: "RSV-1", item_tipo: "producto_variante", item_id: "VAR-1", cantidad: 5, origen_tipo: "pedido", origen_id: "PED-1", estado: "activa", fecha: "2026-01-02" },
    { id: "RSV-2", item_tipo: "producto_variante", item_id: "VAR-1", cantidad: 3, origen_tipo: "pedido", origen_id: "PED-2", estado: "liberada", fecha: "2026-01-02" },
  ];
  assert.equal(calcularStockReservado(data, "producto_variante", "VAR-1"), 5);
  assert.equal(calcularStockDisponible(data, "producto_variante", "VAR-1"), 15);
});
