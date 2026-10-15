import test from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "./types-v2";
import type { RicordoDataV2 } from "./types-v2";
import {
  resumenProductosSheets,
  resumenGastosSheets,
  resumenRecetasRellenoSheets,
  resumenRecetasArmadoSheets,
  resumenRepartoSheets,
  resumenPreciosFormatosSheets,
  resumenStockInsumosSheets,
  resumenFlujoCajaSemanalSheets,
  avisosRecetaNoExportada,
  formatearNumero,
  celdaTexto,
  decimalesPorColumna,
} from "./resumen-sheets";

function fixture(): RicordoDataV2 {
  const data = emptyDataV2();
  data.categorias = [
    { id: "CAT-FIJO", nombre: "Costo Fijo — Servicios", ambito: "financiero", activo: true },
    { id: "CAT-REPARTO", nombre: "Costo Indirecto — Reparto", ambito: "financiero", activo: true },
    { id: "CAT-VIAJES", nombre: "Costo Indirecto — Viajes de compra", ambito: "financiero", activo: true },
  ];
  data.insumos = [{ id: "ING-01", nombre: "Harina", unidad: "kg", tipo: "ingrediente", precio_actual: 1000, activo: true, controla_stock: false }];
  data.productos = [
    { id: "PROD-01", nombre: "Calabaza", activo: true, linea: "Pasta" },
    { id: "PROD-14", nombre: "Salsa", activo: true, linea: "Salsa" },
    { id: "PROD-99", nombre: "Inactivo", activo: false, linea: "Pasta" },
  ];
  data.producto_variantes = [
    { id: "VAR-MIN12", producto_id: "PROD-01", canal: "Minorista", activo: true, nombre: "Calabaza minorista 12u", precio_venta: 10000, unidades_por_paquete: 12 },
    { id: "VAR-MAY12", producto_id: "PROD-01", canal: "Mayorista", activo: true, nombre: "Calabaza mayorista 12u", precio_venta: 9000, unidades_por_paquete: 12 },
    { id: "PROD-14", producto_id: "PROD-14", canal: "Minorista", activo: true, nombre: "Salsa", precio_venta: 4500, unidades_por_paquete: 1 },
  ];
  data.recetas = [{ id: "REC-01", producto_id: "PROD-01", nombre: "Receta Calabaza", activa: true }];
  data.receta_items = [
    { id: "RECI-01", receta_id: "REC-01", insumo_id: "ING-01", etapa: "masa", cantidad: 0.01 },
    { id: "RECI-02", receta_id: "REC-01", insumo_id: "ING-01", etapa: "relleno", cantidad: 0.005 },
  ];
  data.clientes = [{ id: "CLI-01", nombre: "Cliente Test" } as RicordoDataV2["clientes"][number]];
  data.pedidos = [
    {
      id: "PED-01",
      fecha: "2026-09-10",
      cliente_id: "CLI-01",
      estado: "Entregado",
      canal: "Minorista",
      descuento: 500,
      zona: "Zona 1 - Cercana",
      costo_envio: 2000,
      costo_real_envio: 3000,
      km_envio: 10,
      total: 10000,
    },
    {
      id: "PED-02",
      fecha: "2026-09-15",
      cliente_id: "CLI-01",
      estado: "Confirmado",
      canal: "Mayorista",
      descuento: 0,
      costo_envio: 0,
      total: 9000,
    },
    {
      id: "PED-03",
      fecha: "2026-09-20",
      cliente_id: "CLI-01",
      estado: "Cancelado",
      canal: "Minorista",
      descuento: 0,
      costo_envio: 0,
      total: 99999,
    },
  ];
  data.pedido_items = [
    { id: "PI-01", pedido_id: "PED-01", producto_variante_id: "VAR-MIN12", nombre_historico: "Calabaza minorista 12u", cantidad: 1, precio_unitario: 10000, descuento: 500, subtotal: 9500 },
    { id: "PI-02", pedido_id: "PED-02", producto_variante_id: "VAR-MAY12", nombre_historico: "Calabaza mayorista 12u", cantidad: 1, precio_unitario: 9000, descuento: 0, subtotal: 9000 },
    { id: "PI-03", pedido_id: "PED-03", producto_variante_id: "VAR-MIN12", nombre_historico: "Calabaza minorista 12u", cantidad: 1, precio_unitario: 10000, descuento: 0, subtotal: 10000 },
  ];
  data.produccion = [{ id: "PR-01", producto_variante_id: "VAR-MIN12", cantidad: 2, fecha: "2026-09-05" }];
  data.compras = [{ id: "C-01", fecha: "2026-09-12", proveedor_id: "PROV-01", estado_pago: "pagado", total: 5000 }];
  data.movimientos_financieros = [
    { id: "MOVF-01", fecha: "2026-09-01", tipo: "egreso", categoria_id: "CAT-FIJO", concepto: "Alquiler", monto: 34000, estado: "confirmado" },
    { id: "MOVF-02", fecha: "2026-09-10", tipo: "egreso", categoria_id: "CAT-REPARTO", concepto: "Diferencia envío PED-01", monto: 1000, estado: "confirmado", origen_tipo: "diferencia_envio", origen_id: "PED-01" },
    { id: "MOVF-03", fecha: "2026-09-14", tipo: "egreso", categoria_id: "CAT-VIAJES", concepto: "Viaje de compra", monto: 7000, estado: "confirmado" },
  ];
  return data;
}

test("resumenProductosSheets: incluye todo producto activo aunque no tenga ventas, excluye inactivos, separa por canal con cajas_eq correctas", () => {
  const filas = resumenProductosSheets(fixture(), "2026-09");
  assert.deepEqual(
    filas.map((f) => f.producto_id).sort(),
    ["PROD-01", "PROD-14"]
  );
  const calabaza = filas.find((f) => f.producto_id === "PROD-01")!;
  // PED-03 está Cancelado: no debe contar aunque tenga fecha en el mes.
  assert.equal(calabaza.cajas_eq_minorista, 1);
  assert.equal(calabaza.cajas_eq_mayorista, 1);
  assert.equal(calabaza.ingresos_minorista, 9500);
  assert.equal(calabaza.ingresos_mayorista, 9000);
  assert.equal(calabaza.descuentos_total, 500);
  assert.equal(calabaza.cajas_producidas_eq, 2); // 2 paquetes de 12u = 24 unidades / 12 = 2
  assert.equal(calabaza.costo_insumos_caja_ref > 0, true); // 12 * (0.01+0.005) * 1000
  assert.equal(calabaza.precio_minorista_caja_ref, 10000);
  assert.equal(calabaza.precio_mayorista_caja_ref, 9000);
});

test("resumenProductosSheets: línea Salsa usa ref=1 (no 12) para cajas equivalentes", () => {
  const filas = resumenProductosSheets(fixture(), "2026-09");
  const salsa = filas.find((f) => f.producto_id === "PROD-14")!;
  assert.equal(salsa.unidades_por_caja_ref, 1);
});

test("resumenProductosSheets: un sorrentino de línea Pasta sigue exportando unidades_por_caja_ref = 12, igual que antes", () => {
  const filas = resumenProductosSheets(fixture(), "2026-09");
  const calabaza = filas.find((f) => f.producto_id === "PROD-01")!; // línea Pasta en el fixture
  assert.equal(calabaza.unidades_por_caja_ref, 12);
});

test("resumenProductosSheets: una Lasaña con variante minorista de 1 unidad a $18.000 exporta unidades_por_caja_ref=1, el precio y el costo de la receta (no 0)", () => {
  const data = fixture();
  data.productos.push({ id: "PROD-LAS", nombre: "Lasaña de ragú", activo: true, linea: "Lasaña" });
  data.producto_variantes.push({
    id: "VAR-LAS-MIN",
    producto_id: "PROD-LAS",
    canal: "Minorista",
    activo: true,
    nombre: "Lasaña de ragú",
    precio_venta: 18000,
    unidades_por_paquete: 1,
  });
  data.recetas.push({ id: "REC-LAS", producto_id: "PROD-LAS", nombre: "Receta Lasaña", activa: true });
  data.receta_items.push({ id: "RL-COSTO", receta_id: "REC-LAS", insumo_id: "ING-01", etapa: "masa", cantidad: 2 }); // 2kg harina * $1000 = $2000
  const filas = resumenProductosSheets(data, "2026-09");
  const lasagna = filas.find((f) => f.producto_id === "PROD-LAS")!;
  assert.equal(lasagna.unidades_por_caja_ref, 1);
  assert.equal(lasagna.precio_minorista_caja_ref, 18000);
  assert.equal(lasagna.costo_insumos_caja_ref, 2000);
  assert.ok(lasagna.costo_total_caja_ref > 0);
});

test("resumenProductosSheets: sin variante exacta de ref, usa la primera variante activa del canal y no exporta 0 en silencio", () => {
  const data = fixture();
  // Línea Pasta (ref=12) pero la única variante activa Mayorista es de 6 unidades: no hay
  // ninguna de 12u, así que cae al fallback en vez de dejar el precio/costo mayorista en 0.
  data.producto_variantes.push({
    id: "VAR-SIXPACK",
    producto_id: "PROD-01",
    canal: "Mayorista",
    activo: true,
    nombre: "Calabaza mayorista 6u",
    precio_venta: 4500,
    unidades_por_paquete: 6,
  });
  const varianteMay12 = data.producto_variantes.find((v) => v.id === "VAR-MAY12")!;
  varianteMay12.activo = false; // ya no hay ninguna Mayorista de 12u activa
  const filas = resumenProductosSheets(data, "2026-09");
  const calabaza = filas.find((f) => f.producto_id === "PROD-01")!;
  assert.equal(calabaza.precio_mayorista_caja_ref, 4500); // de la variante de 6u, no 0
});

test("resumenGastosSheets: compras_insumos, una fila por categoría, excluye las categorías de reparto", () => {
  const filas = resumenGastosSheets(fixture(), "2026-09");
  const porCategoria = new Map(filas.map((f) => [f.categoria, f]));
  assert.equal(porCategoria.get("Compras de insumos")?.monto, 5000);
  assert.equal(porCategoria.get("Costo Fijo — Servicios")?.monto, 34000);
  assert.equal(porCategoria.has("Costo Indirecto — Reparto"), false);
  assert.equal(porCategoria.has("Costo Indirecto — Viajes de compra"), false);
});

test("resumenRecetasRellenoSheets: solo ítems de etapa relleno de productos activos, con el stock actual del insumo", () => {
  const data = fixture();
  data.inventario_movimientos = [{ id: "MOV-1", fecha: "2026-09-01", tipo: "compra", item_tipo: "insumo", item_id: "ING-01", cantidad: 7 }];
  const filas = resumenRecetasRellenoSheets(data);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].producto_id, "PROD-01");
  assert.equal(filas[0].cantidad_por_unidad, 0.005);
  assert.equal(filas[0].stock_actual, 7);
});

test("formatearNumero/celdaTexto: separador coma por defecto, 5 decimales en RECETAS_RELLENO sin perder cantidades chicas", () => {
  // Antes el redondeo genérico a 2 decimales hacía que 0,005 (bug real: una cantidad_por_unidad
  // de relleno) diera 0 — acá nunca se pierde, y el separador coma evita que Sheets (configuración
  // regional Argentina) pegue "0.03" como texto o lea "8.11" como fecha.
  assert.equal(formatearNumero(0.005, 5, "coma"), "0,005");
  assert.equal(formatearNumero(0.0006, 5, "coma"), "0,0006");
  assert.equal(formatearNumero(8.11, 2, "coma"), "8,11");
  assert.equal(formatearNumero(0.83, 2, "coma"), "0,83");
  assert.equal(formatearNumero(8.11, 2, "punto"), "8.11"); // con "punto" elegido, se mantiene el punto
  assert.equal(formatearNumero(5000, 2, "coma"), "5000"); // entero: sin parte decimal, sin separador
  assert.equal(celdaTexto("texto", 5, "coma"), "texto"); // una celda no-numérica pasa intacta

  const data = fixture();
  const filas = resumenRecetasRellenoSheets(data);
  const decimales = decimalesPorColumna(8, { 4: 5, 7: 3 }); // HEADERS_RECETAS: índice 4 = cantidad_por_unidad, 7 = stock_actual
  const fila = filas[0];
  assert.equal(celdaTexto(fila.cantidad_por_unidad, decimales[4], "coma"), "0,005");
});

test("RECETAS_RELLENO / RECETAS_ARMADO: una Lasaña con ítems en relleno, masa, armado y packaging separa relleno de masa+armado, y el packaging no sale en ninguna", () => {
  const data = fixture();
  data.productos.push({ id: "PROD-LAS", nombre: "Lasaña", activo: true, linea: "Lasaña" });
  data.recetas.push({ id: "REC-LAS", producto_id: "PROD-LAS", nombre: "Receta Lasaña", activa: true });
  data.insumos.push(
    { id: "ING-RAGU", nombre: "Ragú", unidad: "kg", tipo: "ingrediente", precio_actual: 2000, activo: true, controla_stock: false },
    { id: "ING-LAMINAS", nombre: "Láminas de masa", unidad: "kg", tipo: "ingrediente", precio_actual: 1500, activo: true, controla_stock: false },
    { id: "ING-MOZZA", nombre: "Mozzarella", unidad: "kg", tipo: "ingrediente", precio_actual: 3000, activo: true, controla_stock: false },
    { id: "ING-BOLSA", nombre: "Bolsa lasaña", unidad: "unidad", tipo: "packaging", precio_actual: 50, activo: true, controla_stock: false }
  );
  data.receta_items.push(
    { id: "RL-1", receta_id: "REC-LAS", insumo_id: "ING-RAGU", etapa: "relleno", cantidad: 0.3 },
    { id: "RL-2", receta_id: "REC-LAS", insumo_id: "ING-LAMINAS", etapa: "masa", cantidad: 0.2 },
    { id: "RL-3", receta_id: "REC-LAS", insumo_id: "ING-MOZZA", etapa: "armado", cantidad: 0.1 },
    { id: "RL-4", receta_id: "REC-LAS", insumo_id: "ING-BOLSA", etapa: "packaging", cantidad: 1 }
  );
  const relleno = resumenRecetasRellenoSheets(data).filter((f) => f.producto_id === "PROD-LAS");
  const armado = resumenRecetasArmadoSheets(data).filter((f) => f.producto_id === "PROD-LAS");

  assert.equal(relleno.length, 1);
  assert.equal(relleno[0].insumo_id, "ING-RAGU");

  assert.equal(armado.length, 2); // láminas (masa, no-Pasta) + mozzarella (armado)
  assert.ok(armado.some((f) => f.insumo_id === "ING-LAMINAS"));
  assert.ok(armado.some((f) => f.insumo_id === "ING-MOZZA"));

  assert.equal(relleno.some((f) => f.insumo_id === "ING-BOLSA"), false);
  assert.equal(armado.some((f) => f.insumo_id === "ING-BOLSA"), false);
});

test("RECETAS_RELLENO / RECETAS_ARMADO: un sorrentino de línea Pasta con ítems en masa y relleno exporta solo el relleno en RECETAS_RELLENO y no aparece en RECETAS_ARMADO", () => {
  const data = fixture();
  // PROD-01 (Calabaza, línea Pasta) ya tiene masa (RECI-01) y relleno (RECI-02) en el fixture base.
  const relleno = resumenRecetasRellenoSheets(data).filter((f) => f.producto_id === "PROD-01");
  const armado = resumenRecetasArmadoSheets(data).filter((f) => f.producto_id === "PROD-01");
  assert.equal(relleno.length, 1);
  assert.equal(relleno[0].insumo_id, "ING-01");
  assert.equal(relleno[0].cantidad_por_unidad, 0.005); // solo la cantidad de relleno, no la de masa
  assert.equal(armado.length, 0); // la masa de Pasta se planea aparte, nunca entra a RECETAS_ARMADO
});

test("RECETAS_RELLENO: la salsa (sin ningún ítem en etapa relleno) exporta todo menos packaging, como antes", () => {
  const data = fixture();
  data.recetas.push({ id: "REC-14", producto_id: "PROD-14", nombre: "Receta Salsa", activa: true });
  data.insumos.push({ id: "ING-ENVASE", nombre: "Frasco", unidad: "unidad", tipo: "packaging", precio_actual: 200, activo: true, controla_stock: false });
  data.receta_items.push(
    { id: "RECI-14-A", receta_id: "REC-14", insumo_id: "ING-01", etapa: "salsa", cantidad: 0.02 },
    { id: "RECI-14-B", receta_id: "REC-14", insumo_id: "ING-01", etapa: "terminacion", cantidad: 0.01 },
    { id: "RECI-14-C", receta_id: "REC-14", insumo_id: "ING-ENVASE", etapa: "packaging", cantidad: 1 }
  );
  const relleno = resumenRecetasRellenoSheets(data).filter((f) => f.producto_id === "PROD-14");
  assert.equal(relleno.length, 1); // ING-01 sumado (salsa + terminación) en una fila, el frasco queda afuera
  assert.equal(relleno[0].cantidad_por_unidad, 0.03);
  assert.equal(relleno.some((f) => f.insumo_id === "ING-ENVASE"), false);
});

test("RECETAS_ARMADO: el mismo insumo repetido en armado (y en masa, para una línea no-Pasta) sale sumado en una sola fila", () => {
  const data = fixture();
  data.productos.push({ id: "PROD-PIZZA", nombre: "Pizza", activo: true, linea: "Pizza" });
  data.recetas.push({ id: "REC-PIZZA", producto_id: "PROD-PIZZA", nombre: "Receta Pizza", activa: true });
  data.receta_items.push(
    { id: "RP-1", receta_id: "REC-PIZZA", insumo_id: "ING-01", etapa: "armado", cantidad: 0.05 },
    { id: "RP-2", receta_id: "REC-PIZZA", insumo_id: "ING-01", etapa: "armado", cantidad: 0.02 },
    { id: "RP-3", receta_id: "REC-PIZZA", insumo_id: "ING-01", etapa: "masa", cantidad: 0.1 }
  );
  const armado = resumenRecetasArmadoSheets(data).filter((f) => f.producto_id === "PROD-PIZZA");
  assert.equal(armado.length, 1);
  assert.equal(armado[0].cantidad_por_unidad, 0.17); // 0.05 + 0.02 (armado) + 0.1 (masa, no-Pasta)
});

test("avisosRecetaNoExportada: un producto de línea Pasta con ítems en salsa/terminación avisa que no se exportan; uno de otra línea con los mismos ítems no avisa nunca", () => {
  const data = fixture();
  // PROD-01 (Calabaza) es línea Pasta en el fixture — le agrego 2 ítems de salsa y 1 de
  // terminación, que con la regla de Pasta (solo relleno+armado) quedan afuera del export.
  data.receta_items.push(
    { id: "RECI-SALSA-1", receta_id: "REC-01", insumo_id: "ING-01", etapa: "salsa", cantidad: 0.01 },
    { id: "RECI-SALSA-2", receta_id: "REC-01", insumo_id: "ING-01", etapa: "salsa", cantidad: 0.01 },
    { id: "RECI-TERM-1", receta_id: "REC-01", insumo_id: "ING-01", etapa: "terminacion", cantidad: 0.01 }
  );
  // PROD-14 (Salsa) con los MISMOS ítems en salsa/terminación — correctamente clasificada (no
  // Pasta), esos ítems sí se exportan, así que nunca debería generar un aviso.
  data.recetas.push({ id: "REC-14", producto_id: "PROD-14", nombre: "Receta Salsa", activa: true });
  data.receta_items.push({ id: "RECI-14-SALSA", receta_id: "REC-14", insumo_id: "ING-01", etapa: "salsa", cantidad: 0.02 });

  const avisos = avisosRecetaNoExportada(data);
  const salsa = avisos.find((a) => a.producto_id === "PROD-01" && a.etapa === "salsa")!;
  assert.ok(salsa);
  assert.equal(salsa.cantidad, 2);
  assert.equal(salsa.linea, "Pasta");
  const terminacion = avisos.find((a) => a.producto_id === "PROD-01" && a.etapa === "terminacion")!;
  assert.ok(terminacion);
  assert.equal(terminacion.cantidad, 1);
  // PROD-14, con la línea correcta, nunca avisa aunque tenga ítems en salsa.
  assert.equal(
    avisos.some((a) => a.producto_id === "PROD-14"),
    false
  );
});

test("resumenRepartoSheets: agrupa pedidos entregados por zona fija, pedido sin zona cae en Otro, suma Compras Berazategui aparte", () => {
  const filas = resumenRepartoSheets(fixture(), "2026-09");
  const zona1 = filas.find((f) => f.recorrido === "Zona 1 - Cercana")!;
  assert.equal(zona1.viajes, 1);
  assert.equal(zona1.km, 10);
  assert.equal(zona1.costo_total, 3000);
  assert.equal(zona1.envios_cobrados, 2000);
  const compras = filas.find((f) => f.recorrido === "Compras Berazategui")!;
  assert.equal(compras.tipo, "Compras");
  assert.equal(compras.viajes, 1);
  assert.equal(compras.costo_total, 7000);
  // Siempre las 7 zonas + la fila de compras, aunque alguna esté en 0.
  assert.equal(filas.length, 8);
});

test("resumenPreciosFormatosSheets: una fila por variante activa (con y sin ventas), costo = costoVariante/costoManoDeObraVariante, ordenado por producto/canal/unidades", () => {
  const filas = resumenPreciosFormatosSheets(fixture(), "2026-09");
  // 2 variantes activas de Calabaza + 1 de Salsa = 3 filas, aunque Salsa no tuvo ventas.
  assert.equal(filas.length, 3);

  const calabaza = filas.filter((f) => f.producto_id === "PROD-01");
  assert.equal(calabaza.length, 2);
  // Minorista antes que Mayorista, dentro del mismo producto.
  assert.equal(calabaza[0].canal, "Minorista");
  assert.equal(calabaza[1].canal, "Mayorista");

  const minorista = calabaza[0];
  assert.equal(minorista.precio_venta, 10000);
  assert.equal(minorista.costo_total_paquete, minorista.costo_insumos_paquete + minorista.costo_mo_paquete);
  // PED-01 (Entregado, Minorista, 1×VAR-MIN12, $500 de descuento) cuenta; PED-03 (Cancelado, mismo variante) no.
  assert.equal(minorista.paquetes_vendidos_mes, 1);
  assert.equal(minorista.descuentos_mes, 500);

  const mayorista = calabaza[1];
  // PED-02 (Confirmado, no Cancelado) sí cuenta para RESUMEN_PRODUCTOS/PRECIOS_FORMATOS por igual.
  assert.equal(mayorista.paquetes_vendidos_mes, 1);
  assert.equal(mayorista.descuentos_mes, 0);

  const salsa = filas.find((f) => f.producto_id === "PROD-14")!;
  assert.equal(salsa.paquetes_vendidos_mes, 0);
  assert.equal(salsa.descuentos_mes, 0);
});

test("resumenPreciosFormatosSheets: un mes sin ningún pedido igual trae todas las variantes activas, en 0", () => {
  const filas = resumenPreciosFormatosSheets(fixture(), "2020-01");
  assert.equal(filas.length, 3);
  assert.ok(filas.every((f) => f.paquetes_vendidos_mes === 0 && f.descuentos_mes === 0));
  assert.ok(filas.every((f) => f.costo_total_paquete >= 0));
});

test("resumenStockInsumosSheets: un insumo por fila aunque esté en varias etapas/recetas, nunca repetido; insumo sin stock controlado queda afuera", () => {
  const data = fixture();
  data.insumos = [
    { id: "ING-01", nombre: "Harina", unidad: "kg", tipo: "ingrediente", precio_actual: 1000, activo: true, controla_stock: true, categoria_id: "CAT-ING" },
    { id: "ING-02", nombre: "Sal", unidad: "kg", tipo: "ingrediente", precio_actual: 200, activo: true, controla_stock: true },
    { id: "ING-03", nombre: "Bolsa", unidad: "unidad", tipo: "packaging", precio_actual: 50, activo: true, controla_stock: false },
  ];
  data.categorias.push({ id: "CAT-ING", nombre: "Harinas", ambito: "insumo", activo: true });
  data.inventario_movimientos = [
    { id: "M1", fecha: "2026-09-01", tipo: "compra", item_tipo: "insumo", item_id: "ING-01", cantidad: 10 },
    { id: "M2", fecha: "2026-09-10", tipo: "conteo", item_tipo: "insumo", item_id: "ING-01", cantidad: 8 },
    { id: "M3", fecha: "2026-09-05", tipo: "consumo", item_tipo: "insumo", item_id: "ING-02", cantidad: -5 },
  ];
  const filas = resumenStockInsumosSheets(data);
  // ING-01 aparece en 2 receta_items del fixture base (masa y relleno, mismo producto) — una sola fila.
  assert.equal(filas.filter((f) => f.insumo_id === "ING-01").length, 1);
  assert.equal(filas.some((f) => f.insumo_id === "ING-03"), false);

  const harina = filas.find((f) => f.insumo_id === "ING-01")!;
  assert.equal(harina.stock_actual, 8); // el conteo del 10/9 resetea la compra anterior
  assert.equal(harina.categoria, "Harinas");
  assert.equal(harina.valor_stock, 8000);
  assert.equal(harina.fecha_ultimo_conteo, "2026-09-10");

  const sal = filas.find((f) => f.insumo_id === "ING-02")!;
  assert.equal(sal.stock_actual, -5);
  assert.equal(sal.valor_stock, 0); // stock negativo nunca valoriza negativo
  assert.equal(sal.fecha_ultimo_conteo, ""); // nunca se contó

  const totalValorStock = filas.reduce((acc, f) => acc + f.valor_stock, 0);
  assert.equal(totalValorStock, 8000);
});

test("resumenFlujoCajaSemanalSheets: da 8 filas, la primera empieza el lunes de la semana actual y solo ella lleva el saldo de caja", () => {
  const data = emptyDataV2();
  data.configuracion.saldo_inicial_caja = 50000;
  // 2026-09-10 es jueves → el lunes de esa semana es 2026-09-07.
  const filas = resumenFlujoCajaSemanalSheets(data, "2026-09-10");
  assert.equal(filas.length, 8);
  assert.equal(filas[0].semana_desde, "07/09/2026");
  assert.equal(filas[0].saldo_caja_hoy, 50000);
  assert.ok(filas.slice(1).every((f) => f.saldo_caja_hoy === ""));
  // cada semana siguiente empieza 7 días después de la anterior.
  assert.equal(filas[1].semana_desde, "14/09/2026");
  assert.equal(filas[7].semana_desde, "26/10/2026");
});

test("resumenFlujoCajaSemanalSheets: una cuenta por cobrar vencida (fecha_vencimiento muy anterior a hoy) aparece en la primera semana", () => {
  const data = emptyDataV2();
  data.clientes = [{ id: "CLI-1", nombre: "Cliente" } as RicordoDataV2["clientes"][number]];
  data.pedidos = [
    {
      id: "PED-1",
      fecha: "2026-08-01",
      cliente_id: "CLI-1",
      estado: "Entregado",
      canal: "Minorista",
      descuento: 0,
      costo_envio: 0,
      total: 5000,
      fecha_vencimiento: "2026-08-15", // vencido, muy antes del lunes de la semana actual (07/09)
    },
  ];
  const filas = resumenFlujoCajaSemanalSheets(data, "2026-09-10");
  assert.equal(filas[0].por_cobrar, 5000);
  assert.ok(filas.slice(1).every((f) => f.por_cobrar === 0));
});

test("resumenFlujoCajaSemanalSheets: una compra que vence dentro de 10 días aparece en la semana que corresponde", () => {
  const data = emptyDataV2();
  data.compras = [
    { id: "C-1", fecha: "2026-09-05", proveedor_id: "PROV-1", estado_pago: "pendiente", total: 8000, fecha_vencimiento: "2026-09-20" }, // hoy (09-10) + 10 días
  ];
  const filas = resumenFlujoCajaSemanalSheets(data, "2026-09-10");
  // Semana 1 (14/09–20/09) es la que incluye el 20/09.
  assert.equal(filas[1].semana_desde, "14/09/2026");
  assert.equal(filas[1].por_pagar, 8000);
  assert.ok(filas.filter((_, i) => i !== 1).every((f) => f.por_pagar === 0));
});
