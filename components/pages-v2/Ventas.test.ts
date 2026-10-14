import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "@/lib/types-v2";
import { crearPedidoDesdeWeb } from "./Ventas";
import type { PedidoWeb } from "./Ventas";

function pedidoWebBase(overrides: Partial<PedidoWeb> = {}): PedidoWeb {
  return {
    id: "WEB-1",
    fecha_creacion: "2026-03-10",
    cliente: { nombre: "Lucía", telefono: "1122334455" },
    direccion: { calle: "Calle Falsa", numero: "123", localidad: "Berazategui" },
    zona: "Zona 3 - CABA",
    items: [],
    envio_cobrado: 0,
    envio_costo_real: 0,
    metodo_pago: "Transferencia",
    estado_pago: "pagado",
    total: 10000,
    ...overrides,
  };
}

test("crearPedidoDesdeWeb: un pedido con cupón se guarda con su código y su tipo de descuento", () => {
  const data = emptyDataV2();
  const out = crearPedidoDesdeWeb(
    data,
    pedidoWebBase({ cupon_codigo: "BIENVENIDA10", tipo_descuento: "cupon", descuento_monto: 1000 }),
  );
  assert.equal(out.pedidos.length, 1);
  const pedido = out.pedidos[0];
  assert.equal(pedido.cupon_codigo, "BIENVENIDA10");
  assert.equal(pedido.tipo_descuento, "cupon");
  assert.equal(pedido.descuento, 1000);
});

test("crearPedidoDesdeWeb: un pedido sin cupón no guarda cupon_codigo ni tipo_descuento", () => {
  const data = emptyDataV2();
  const out = crearPedidoDesdeWeb(data, pedidoWebBase());
  const pedido = out.pedidos[0];
  assert.equal(pedido.cupon_codigo, undefined);
  assert.equal(pedido.tipo_descuento, undefined);
});
