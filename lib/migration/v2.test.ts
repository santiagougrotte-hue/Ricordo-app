import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData } from "../types";
import type { RicordoData } from "../types";
import { calcStockIngrediente } from "../calc";
import { migrarAV2 } from "./v2";

function fixture(): RicordoData {
  const data = emptyData();
  data.clientes = [{ id: "CLI-1", nombre: "Juan", canal: "Minorista" }];
  data.proveedores = [{ id: "PROV-1", nombre: "Verdulería" }];
  data.ingredientes = [
    { id: "ING-1", nombre: "Harina", unidad: "kg", categoria: "Secos", precio_ref: 500, precio_vigente: null, seguimiento_stock: true, stock_minimo: 5 },
    { id: "ING-2", nombre: "Bolsa mal clasificada", unidad: "unidad", categoria: "Packaging", precio_ref: 10, precio_vigente: null, seguimiento_stock: false },
  ];
  data.packaging = [{ id: "PKG-1", nombre: "Bolsa", unidad: "unidad", precio_ref: 50, precio_vigente: null }];
  data.productos = [
    {
      id: "PROD-BASE",
      id_base: "PROD-BASE",
      nombre: "Calabaza",
      precio_venta: 5000,
      activo: true,
      receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-1", cantidad: 0.1 }],
    },
    { id: "PROD-MAYO", id_base: "PROD-BASE", nombre: "Calabaza mayorista", precio_venta: 4000, activo: true, canal: "Mayorista", unidades_por_paquete: 12 },
    { id: "PROD-SINSALSA", id_base: "PROD-BASE", nombre: "Calabaza minorista sin salsa", precio_venta: 4500, activo: true, canal: "Minorista", unidades_por_paquete: 6 },
  ];
  // Línea de receta vieja (modelo legacy) sobre una variante ya migrada al modelo base/venta —
  // a propósito contradice la receta derivada, para probar que el migrador la marca en vez de
  // elegir una sola fuente.
  data.recetas = [{ id: "RL-1", id_producto: "PROD-MAYO", tipo: "Ingrediente", concepto: "ING-1", cantidad: 99 }];
  data.pedidos = [
    {
      id_pedido: "PED-1",
      id_detalle: "PED-1-A",
      id_cliente: "CLI-1",
      id_producto: "PROD-MAYO",
      nombre_producto: "Calabaza mayorista",
      cantidad: 2,
      precio_unitario: 4000,
      precio_total: 8000,
      descuento_monto: 0,
      precio_neto: 8000,
      fecha: "2026-08-01",
      estado: "Entregado",
      canal: "Mayorista",
      km_envio: 0,
      costo_envio: 0,
    },
    {
      id_pedido: "PED-1",
      id_detalle: "PED-1-B",
      id_cliente: "CLI-1",
      id_producto: "PROD-SINSALSA",
      nombre_producto: "Calabaza minorista sin salsa",
      cantidad: 1,
      precio_unitario: 4500,
      precio_total: 4500,
      descuento_monto: 500,
      precio_neto: 4000,
      fecha: "2026-08-01",
      estado: "Entregado",
      canal: "Minorista",
      km_envio: 0,
      costo_envio: 0,
    },
  ];
  data.compras = [
    {
      id: "COM-1",
      fecha: "2026-08-01",
      id_proveedor: "PROV-1",
      total: 600,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 2, precio_unitario: 250 }],
      lineasPkg: [{ id_packaging: "PKG-1", cantidad: 2, precio_unitario: 50 }],
    },
  ];
  data.produccion = [{ id: "PRODLOG-1", id_producto: "PROD-MAYO", nombre_producto: "Calabaza mayorista", cantidad: 3, fecha: "2026-08-01" }];
  data.caja_movimientos = [{ id: "CAJ-1", fecha: "2026-08-01", tipo: "ingreso", concepto: "Cobro pedido", monto: 8000, metodo: "Efectivo" }];
  data.costos_fijos = [{ id: "CF-1", descripcion: "Alquiler", monto: 100000, categoria: "General", activo: true }];
  data.costos_indirectos = [{ id: "CI-1", descripcion: "Luz", monto: 5000, mes: 8, anio: 2026, categoria: "Servicios", tipo_costo: "Fijo" }];
  data.amortizaciones = [{ id: "AM-1", nombre: "Heladera", precio_total: 120000, fecha_inicio: "2026-01-01", meses_totales: 12 }];
  return data;
}

test("migrarAV2: no se pierden pedidos ni líneas", () => {
  const { documento } = migrarAV2(fixture());
  assert.equal(documento.data.pedidos.length, 1, "1 pedido (agrupado por id_pedido)");
  assert.equal(documento.data.pedido_items.length, 2, "las 2 líneas originales siguen todas presentes");
});

test("migrarAV2: los totales históricos se conservan", () => {
  const data = fixture();
  const { documento } = migrarAV2(data);
  const sumaOriginal = data.pedidos.reduce((acc, p) => acc + p.precio_neto, 0);
  const sumaNueva = documento.data.pedido_items.reduce((acc, i) => acc + i.subtotal, 0);
  assert.equal(sumaNueva, sumaOriginal);
  const pedido = documento.data.pedidos[0];
  assert.equal(pedido.total, sumaOriginal);
});

test("migrarAV2: las recetas apuntan a insumos existentes", () => {
  const { documento, reporte } = migrarAV2(fixture());
  const idsInsumos = new Set(documento.data.insumos.map((i) => i.id));
  for (const item of documento.data.receta_items) {
    assert.ok(idsInsumos.has(item.insumo_id), `receta_item ${item.id} apunta a un insumo inexistente (${item.insumo_id})`);
  }
  assert.equal(reporte.referencias_faltantes.filter((r) => r.seccion === "receta_items").length, 0);
});

test("migrarAV2: detecta una referencia a insumo inexistente en vez de perderla en silencio", () => {
  const data = fixture();
  data.productos[0].receta_masa_unidad = [{ id: "RU-X", id_ingrediente: "ING-FANTASMA", cantidad: 1 }];
  const { documento, reporte } = migrarAV2(data);
  const linea = documento.data.receta_items.find((i) => i.insumo_id === "ING-FANTASMA");
  assert.ok(linea, "la línea se migra igual, no se descarta");
  assert.ok(reporte.referencias_faltantes.some((r) => r.motivo.includes("ING-FANTASMA")));
});

test("migrarAV2: todos los pedidos apuntan a clientes existentes", () => {
  const { documento } = migrarAV2(fixture());
  const idsClientes = new Set(documento.data.clientes.map((c) => c.id));
  for (const pedido of documento.data.pedidos) {
    assert.ok(idsClientes.has(pedido.cliente_id));
  }
});

test("migrarAV2: el stock puede reconstruirse desde inventario_movimientos, mismo resultado que el cálculo viejo", () => {
  const data = fixture();
  const { documento } = migrarAV2(data);
  const movimientosIng1 = documento.data.inventario_movimientos.filter((m) => m.item_tipo === "insumo" && m.item_id === "ING-1");
  const stockReconstruido = movimientosIng1.reduce((acc, m) => acc + m.cantidad, 0);
  const stockViejo = calcStockIngrediente(data, "ING-1");
  assert.equal(stockReconstruido, stockViejo);
});

test("migrarAV2: compras y ventas quedan vinculadas a finanzas", () => {
  const data = fixture();
  const { documento } = migrarAV2(data);
  assert.ok(documento.data.compra_items.every((i) => documento.data.compras.some((c) => c.id === i.compra_id)));
  const movimientoCaja = documento.data.movimientos_financieros.find((m) => m.id === "CAJ-1");
  assert.ok(movimientoCaja);
  assert.equal(movimientoCaja?.monto, 8000);
});

test("migrarAV2: conflicto entre receta derivada y RecetaLinea vieja se registra, no se elige una sola", () => {
  const { reporte } = migrarAV2(fixture());
  assert.ok(reporte.conflictos.some((c) => c.entidad_id === "PROD-MAYO" && c.seccion === "recetas"));
});

test("migrarAV2: ingrediente con categoría Packaging se reclasifica a tipo packaging", () => {
  const { documento, reporte } = migrarAV2(fixture());
  const insumo = documento.data.insumos.find((i) => i.id === "ING-2");
  assert.equal(insumo?.tipo, "packaging");
  assert.ok(reporte.revision_manual.some((r) => r.entidad_id === "ING-2"));
});

test("migrarAV2: variantes con mismo id_base quedan agrupadas bajo un solo producto", () => {
  const { documento } = migrarAV2(fixture());
  assert.equal(documento.data.productos.length, 1);
  assert.equal(documento.data.producto_variantes.length, 3);
  assert.ok(documento.data.producto_variantes.every((v) => v.producto_id === "PROD-BASE"));
});

test("migrarAV2: exportar (JSON.stringify) e importar (JSON.parse) el documento nuevo da el mismo resultado", () => {
  const { documento } = migrarAV2(fixture());
  const idaYVuelta = JSON.parse(JSON.stringify(documento));
  assert.deepEqual(idaYVuelta, documento);
});

test("migrarAV2: es determinístico en conteos para el mismo input (dos corridas dan las mismas cantidades)", () => {
  const data = fixture();
  const { reporte: reporte1 } = migrarAV2(data);
  const { reporte: reporte2 } = migrarAV2(data);
  assert.deepEqual(reporte1.conteos, reporte2.conteos);
});
