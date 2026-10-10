import test from "node:test";
import assert from "node:assert/strict";
import { emptyDataV2 } from "../types-v2";
import { migrarV2aV3 } from "./v3";

test("migrarV2aV3: saca las secciones huérfanas de la raíz y las preserva en legacy si tenían datos", () => {
  const base = emptyDataV2() as unknown as Record<string, unknown>;
  base.plan_produccion = { algo: 1 };
  base.ordenes_produccion = [{ id: "ORD-1" }];
  base.preparaciones = [];
  base.activos = [{ id: "ACT-1", nombre: "Tripode", costo: 75000 }];

  const resultado = migrarV2aV3(base as never) as unknown as Record<string, unknown>;

  assert.equal("plan_produccion" in resultado, false);
  assert.equal("ordenes_produccion" in resultado, false);
  assert.equal("preparaciones" in resultado, false);
  assert.equal("activos" in resultado, false);
  const legacy = resultado.legacy as Record<string, unknown>;
  assert.deepEqual(legacy.plan_produccion_v2, { algo: 1 });
  assert.deepEqual(legacy.ordenes_produccion_v2, [{ id: "ORD-1" }]);
  assert.equal("preparaciones_v2" in legacy, false); // estaba vacío, no hace falta preservarlo
  assert.deepEqual(legacy.activos_v2, [{ id: "ACT-1", nombre: "Tripode", costo: 75000 }]);
});

test("migrarV2aV3: saca caja_inteligente y fondo_reposicion de configuracion, preservando saldos reales en legacy", () => {
  const base = emptyDataV2() as unknown as Record<string, unknown>;
  const configuracion = base.configuracion as Record<string, unknown>;
  configuracion.caja_inteligente = { porcentaje_reinversion: 70, porcentaje_seguridad: 30, cargas_historicas: [{ monto: 56000 }] };
  configuracion.fondo_reposicion = { usos: [], aportes: [] };

  const resultado = migrarV2aV3(base as never) as unknown as { configuracion: Record<string, unknown>; legacy: Record<string, unknown> };

  assert.equal("caja_inteligente" in resultado.configuracion, false);
  assert.equal("fondo_reposicion" in resultado.configuracion, false);
  assert.deepEqual(resultado.legacy.caja_inteligente_v2, configuracion.caja_inteligente);
  assert.deepEqual(resultado.legacy.fondo_reposicion_v2, configuracion.fondo_reposicion);
});

test("migrarV2aV3: saca rutas_entrega/ruta_paradas, planificacion, tipo_cambio y los campos de envíos específicos de rutas", () => {
  const base = emptyDataV2() as unknown as Record<string, unknown>;
  base.rutas_entrega = [{ id: "RUTA-1", estado: "cancelada" }];
  base.ruta_paradas = [{ id: "PARADA-1", ruta_id: "RUTA-1" }];
  const configuracion = base.configuracion as Record<string, unknown>;
  configuracion.planificacion = { ventana_meses_referencia: 3, umbral_desvio_semana_pct: 15 };
  configuracion.tipo_cambio = { valor: 1200, fuente: "blue" };
  const envios = configuracion.envios as Record<string, unknown>;
  envios.direccion_base = "Sarmiento 728";
  envios.proveedor_mapa = "osrm";

  const resultado = migrarV2aV3(base as never) as unknown as { configuracion: Record<string, unknown>; legacy: Record<string, unknown> } & Record<
    string,
    unknown
  >;

  assert.equal("rutas_entrega" in resultado, false);
  assert.equal("ruta_paradas" in resultado, false);
  assert.equal("planificacion" in resultado.configuracion, false);
  assert.equal("tipo_cambio" in resultado.configuracion, false);
  assert.equal("direccion_base" in (resultado.configuracion.envios as object), false);
  assert.equal("proveedor_mapa" in (resultado.configuracion.envios as object), false);
  assert.deepEqual(resultado.legacy.rutas_entrega_v2, base.rutas_entrega);
  assert.deepEqual(resultado.legacy.ruta_paradas_v2, base.ruta_paradas);
  assert.deepEqual(resultado.legacy.planificacion_v2, configuracion.planificacion);
  assert.deepEqual(resultado.legacy.tipo_cambio_v2, configuracion.tipo_cambio);
});

test("migrarV2aV3: es idempotente (correrla dos veces da el mismo resultado)", () => {
  const base = emptyDataV2() as unknown as Record<string, unknown>;
  base.plan_produccion = { a: 1 };
  (base.configuracion as Record<string, unknown>).caja_inteligente = { porcentaje_reinversion: 70 };

  const una = migrarV2aV3(base as never);
  const dos = migrarV2aV3(una);
  assert.deepEqual(una, dos);
});

test("migrarV2aV3: un documento sin secciones huérfanas y sin productos solo recibe la fecha de corte y el saldo inicial de caja", () => {
  const base = emptyDataV2();
  const resultado = migrarV2aV3(base);
  assert.deepEqual(resultado, {
    ...base,
    configuracion: {
      ...base.configuracion,
      fecha_corte_cmv: "2026-09-01",
      fecha_corte_compras: "2026-09-01",
      saldo_inicial_caja: 286000,
      fecha_saldo_inicial_caja: "2026-09-01",
    },
  });
});

test("migrarV2aV3: elimina Caprese y las variantes 'con salsa', dejando el resto del catálogo intacto", () => {
  const base = emptyDataV2();
  base.productos = [
    { id: "PROD-01", nombre: "Ravioles de calabaza", activo: true, linea: "Pasta" },
    { id: "PROD-mrr2vmjb1", nombre: "Cappresse", activo: true, linea: "Pasta" },
  ];
  base.producto_variantes = [
    { id: "PROD-08", producto_id: "PROD-01", canal: "Mayorista", activo: true, nombre: "Calabaza mayorista 12u", precio_venta: 9000, unidades_por_paquete: 12 },
    { id: "PROD-12", producto_id: "PROD-01", canal: "Mayorista", activo: false, nombre: "Calabaza mayorista con salsa", precio_venta: 9000, unidades_por_paquete: 12 },
    { id: "PROD-mrr2vmjb1", producto_id: "PROD-mrr2vmjb1", canal: "Minorista", activo: true, nombre: "Cappresse", precio_venta: 12000, unidades_por_paquete: 12 },
    { id: "VAR-mulxognj1", producto_id: "PROD-mrr2vmjb1", canal: "Mayorista", activo: true, nombre: "Capresse mayorista", precio_venta: 9000, unidades_por_paquete: 12 },
  ];
  base.recetas = [
    { id: "REC-01", producto_id: "PROD-01", nombre: "Receta de Calabaza", activa: true },
    { id: "REC-CAPRESE", producto_id: "PROD-mrr2vmjb1", nombre: "Receta de Cappresse", activa: true },
  ];
  base.receta_items = [
    { id: "RECI-01", receta_id: "REC-01", insumo_id: "ING-01", etapa: "masa", cantidad: 1 },
    { id: "RECI-CAPRESE", receta_id: "REC-CAPRESE", insumo_id: "ING-02", etapa: "masa", cantidad: 1 },
  ];
  base.ajustes_receta_variante = [
    { id: "AJR-01", variante_id: "PROD-08", insumo_id: "PKG-01", operacion: "sumar", cantidad: 1 },
    { id: "AJR-12", variante_id: "PROD-12", insumo_id: "PKG-01", operacion: "sumar", cantidad: 1 },
    { id: "AJR-CAPRESE", variante_id: "PROD-mrr2vmjb1", insumo_id: "PKG-01", operacion: "sumar", cantidad: 1 },
  ];
  base.complementos_variante = [{ id: "COMPV-12", producto_id: "PROD-14", variante_id: "PROD-12", cantidad: 1 }];

  const resultado = migrarV2aV3(base);

  assert.deepEqual(
    resultado.productos.map((p) => p.id),
    ["PROD-01"]
  );
  assert.deepEqual(
    resultado.producto_variantes.map((v) => v.id),
    ["PROD-08"]
  );
  assert.deepEqual(
    resultado.recetas.map((r) => r.id),
    ["REC-01"]
  );
  assert.deepEqual(
    resultado.receta_items.map((ri) => ri.id),
    ["RECI-01"]
  );
  assert.deepEqual(
    resultado.ajustes_receta_variante.map((a) => a.id),
    ["AJR-01"]
  );
  assert.deepEqual(resultado.complementos_variante, []);
});

test("migrarV2aV3: todo producto sin línea recibe Pasta, salvo PROD-14 que recibe Salsa; uno que ya tiene línea no se toca", () => {
  const base = emptyDataV2();
  base.productos = [
    { id: "PROD-01", nombre: "Ravioles de calabaza", activo: true, linea: undefined as never },
    { id: "PROD-14", nombre: "Salsa", activo: true, linea: undefined as never },
    { id: "PROD-99", nombre: "Pizza casera", activo: true, linea: "Pizza" },
  ];
  const resultado = migrarV2aV3(base);
  const porId = new Map(resultado.productos.map((p) => [p.id, p.linea]));
  assert.equal(porId.get("PROD-01"), "Pasta");
  assert.equal(porId.get("PROD-14"), "Salsa");
  assert.equal(porId.get("PROD-99"), "Pizza"); // ya tenía línea cargada, no se pisa
});

test("migrarV2aV3: borra el egreso de ajuste de saldo y carga el saldo inicial de caja real al 1/9", () => {
  const base = emptyDataV2();
  base.movimientos_financieros = [
    { id: "MOVF-mtk18mvi7", fecha: "2026-09-02", tipo: "egreso", concepto: "2756572", monto: 2756572, estado: "confirmado", origen_tipo: "caja_manual" },
    { id: "MOVF-otro", fecha: "2026-09-05", tipo: "egreso", concepto: "Otro gasto real", monto: 1000, estado: "confirmado" },
  ];
  const resultado = migrarV2aV3(base);
  assert.equal(
    resultado.movimientos_financieros.some((m) => m.id === "MOVF-mtk18mvi7"),
    false
  );
  assert.equal(resultado.movimientos_financieros.some((m) => m.id === "MOVF-otro"), true);
  assert.equal(resultado.configuracion.saldo_inicial_caja, 286000);
  assert.equal(resultado.configuracion.fecha_saldo_inicial_caja, "2026-09-01");
});

test("migrarV2aV3: fuerza la fecha de corte real del negocio (2026-09-01) sobre cualquier valor anterior", () => {
  const base = emptyDataV2();
  base.configuracion.fecha_corte_cmv = "2026-08-01";
  base.configuracion.fecha_corte_compras = "2026-08-01";
  const resultado = migrarV2aV3(base);
  assert.equal(resultado.configuracion.fecha_corte_cmv, "2026-09-01");
  assert.equal(resultado.configuracion.fecha_corte_compras, "2026-09-01");
});
