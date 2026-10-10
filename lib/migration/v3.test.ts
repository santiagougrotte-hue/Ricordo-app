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

test("migrarV2aV3: un documento que ya no tiene ninguna sección huérfana queda igual", () => {
  const base = emptyDataV2();
  const resultado = migrarV2aV3(base);
  assert.deepEqual(resultado, base);
});
