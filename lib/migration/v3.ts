// Migración del esquema "v2 tal cual se guardó antes de la Fase 0" al esquema v3.
//
// A diferencia de `migrarAV2` (que reconstruye un modelo completamente distinto desde el esquema
// viejo de un solo archivo), acá los tipos ya son casi los mismos: V3 solo formaliza, a nivel de
// *datos reales ya guardados*, secciones que el código (tipos + UI) ya había dejado de usar —
// `plan_produccion`, `ordenes_produccion`, `preparaciones` y afines, `activos`, `rutas_entrega`/
// `ruta_paradas`, `configuracion.caja_inteligente`, `configuracion.fondo_reposicion`,
// `configuracion.planificacion`, `configuracion.tipo_cambio`, y los campos de
// `configuracion.envios` que solo usaba la planificación de rutas (`direccion_base`, `lat_base`,
// `lng_base`, `vehiculo`, `fecha_actualizacion_combustible`, `regresar_a_base_default`,
// `proveedor_mapa`, `metodo_distribucion_costo`, `peajes_default`, `otros_costos_default`). Sin
// este paso, un documento real sincronizado desde antes de esa limpieza sigue cargando esas claves
// para siempre (el resto del código las tolera por compatibilidad hacia atrás, pero nunca las saca
// solo).
//
// Idempotente: correrla dos veces sobre el mismo documento da exactamente el mismo resultado — ya
// no quedan campos huérfanos para sacar la segunda vez, así que es seguro migrar en cada carga sin
// quedar en un loop ni perder nada.
//
// Nunca se pierde dinero real: lo que haya en `caja_inteligente`/`fondo_reposicion` (saldos,
// porcentajes, cargas históricas) se preserva tal cual en `legacy.caja_inteligente_v2` /
// `legacy.fondo_reposicion_v2`, igual que `activos` en `legacy.activos_v2` — no hay forma
// automática de saber si esos saldos ya se reflejaron en otro lado, así que no se descartan solo
// porque la pantalla que los mostraba ya no existe.

import type { RicordoDataV2, LineaProducto } from "../types-v2";

// --- Fase 2 (limpieza de datos del negocio) -------------------------------------------------------
// A diferencia de lo de arriba (secciones que el código ya no usa, para cualquier instalación), acá
// son decisiones puntuales del negocio real de Ricordo — IDs concretos, no una regla general — pero
// viven en el mismo paso de migración porque el pedido original (Fase 2) las define "dentro de
// migrarV2aV3", no como un cambio al archivo semilla.

/** Caprese (producto + sus 2 variantes) y las 4 variantes "con salsa" (ya desactivadas en el
 * catálogo) — los `pedido_items` históricos que las usan quedan intactos: ya tienen
 * `nombre_historico`/`costo_unitario_historico` congelados, no dependen de que el producto/variante
 * siga existiendo (ver `costoPedidoItem`/`calcularMargenPorItem` en calc-v2.ts). */
const PRODUCTOS_A_ELIMINAR = new Set(["PROD-mrr2vmjb1"]);
const VARIANTES_A_ELIMINAR = new Set([
  "PROD-mrr2vmjb1", // Cappresse (variante Minorista, mismo id que el producto base)
  "VAR-mulxognj1", // Capresse mayorista
  "PROD-12", // Calabaza mayorista con salsa
  "PROD-13", // Espinaca mayorista con salsa
  "PROD-11", // Jamón y queso mayorista con salsa
  "PROD-mtc1mcw8l", // Osobuco mayorista con salsa
]);

function limpiarCapreseYConSalsa(data: RicordoDataV2): RicordoDataV2 {
  const productos = data.productos.filter((p) => !PRODUCTOS_A_ELIMINAR.has(p.id));
  const producto_variantes = data.producto_variantes.filter((v) => !VARIANTES_A_ELIMINAR.has(v.id));
  const recetasAEliminar = new Set(
    data.recetas.filter((r) => PRODUCTOS_A_ELIMINAR.has(r.producto_id) || VARIANTES_A_ELIMINAR.has(r.producto_id)).map((r) => r.id)
  );
  const recetas = data.recetas.filter((r) => !recetasAEliminar.has(r.id));
  const receta_items = data.receta_items.filter((ri) => !recetasAEliminar.has(ri.receta_id));
  const ajustes_receta_variante = data.ajustes_receta_variante.filter((a) => !VARIANTES_A_ELIMINAR.has(a.variante_id));
  const complementos_variante = data.complementos_variante.filter((c) => !VARIANTES_A_ELIMINAR.has(c.variante_id));
  return { ...data, productos, producto_variantes, recetas, receta_items, ajustes_receta_variante, complementos_variante };
}

/** Todo producto sin línea asignada (el campo es nuevo, un documento viejo nunca lo tuvo) recibe la
 * línea por default que se definió para el catálogo actual: `PROD-14` (Salsa) es la única línea
 * Salsa, el resto es Pasta. Si ya tiene una línea cargada (elegida a mano en Configuración después
 * de esta migración), no se toca. */
function conLineaPorDefecto(data: RicordoDataV2): RicordoDataV2 {
  const productos = data.productos.map((p) => (p.linea ? p : { ...p, linea: (p.id === "PROD-14" ? "Salsa" : "Pasta") as LineaProducto }));
  return { ...data, productos };
}

/** Fecha de corte del negocio real: desde acá arrancan CMV y compras vs. consumo. Se fuerza una
 * sola vez (esta función solo corre en la transición v2→v3 de un documento real, nunca de nuevo
 * sobre uno que ya es v3) — un cambio posterior a mano en Configuración no se vuelve a pisar. */
function conFechaDeCorte(data: RicordoDataV2): RicordoDataV2 {
  return { ...data, configuracion: { ...data.configuracion, fecha_corte_cmv: "2026-09-01", fecha_corte_compras: "2026-09-01" } };
}

/** El egreso `MOVF-mtk18mvi7` ($2.756.572, 2026-09-02, concepto literal "2756572", sin categoría)
 * fue un intento viejo de ajustar el saldo de caja a mano, cargado como si fuera un gasto real del
 * mes — se borra, y en su lugar se carga el saldo inicial de caja real al 1/9 que confirmó el dueño
 * del negocio (no un valor calculado). Desde esa fecha, `saldoCaja`/`saldoCajaAlFecha` ya no suman
 * los movimientos anteriores — quedan como historial puro. */
const EGRESO_AJUSTE_SALDO_A_BORRAR = "MOVF-mtk18mvi7";
const SALDO_INICIAL_CAJA_1_9_2026 = 286000;

function conSaldoInicialCaja(data: RicordoDataV2): RicordoDataV2 {
  return {
    ...data,
    movimientos_financieros: data.movimientos_financieros.filter((m) => m.id !== EGRESO_AJUSTE_SALDO_A_BORRAR),
    configuracion: { ...data.configuracion, saldo_inicial_caja: SALDO_INICIAL_CAJA_1_9_2026, fecha_saldo_inicial_caja: "2026-09-01" },
  };
}

const CAMPOS_HUERFANOS_RAIZ = [
  "plan_produccion",
  "ordenes_produccion",
  "preparaciones",
  "preparacion_recetas",
  "preparacion_receta_items",
  "lotes_preparacion",
  "activos",
  "rutas_entrega",
  "ruta_paradas",
] as const;

const CAMPOS_HUERFANOS_CONFIGURACION = ["caja_inteligente", "fondo_reposicion", "planificacion", "tipo_cambio"] as const;

const CAMPOS_HUERFANOS_ENVIOS = [
  "direccion_base",
  "lat_base",
  "lng_base",
  "vehiculo",
  "fecha_actualizacion_combustible",
  "regresar_a_base_default",
  "proveedor_mapa",
  "metodo_distribucion_costo",
  "peajes_default",
  "otros_costos_default",
] as const;

export function migrarV2aV3(dataV2: RicordoDataV2): RicordoDataV2 {
  // `dataV2` puede venir de un documento real sincronizado antes de esta fase, así que puede traer
  // más claves de las que el tipo `RicordoDataV2` actual declara (el tipo ya no las tiene porque la
  // Parte A las sacó del modelo) — por eso el `as unknown as` acá, no en el resto del archivo.
  const data = { ...(dataV2 as unknown as Record<string, unknown>) };
  const legacy: Record<string, unknown> = { ...(data.legacy as Record<string, unknown> | undefined) };

  for (const campo of CAMPOS_HUERFANOS_RAIZ) {
    if (!(campo in data)) continue;
    const valor = data[campo];
    const tieneDatos = Array.isArray(valor) ? valor.length > 0 : !!valor && typeof valor === "object" && Object.keys(valor).length > 0;
    if (tieneDatos) legacy[`${campo}_v2`] = valor;
    delete data[campo];
  }

  const configuracion = { ...(data.configuracion as Record<string, unknown>) };
  for (const campo of CAMPOS_HUERFANOS_CONFIGURACION) {
    if (!(campo in configuracion)) continue;
    const valor = configuracion[campo];
    const tieneDatos = !!valor && typeof valor === "object" && Object.keys(valor).length > 0;
    if (tieneDatos) legacy[`${campo}_v2`] = valor;
    delete configuracion[campo];
  }

  const envios = { ...(configuracion.envios as Record<string, unknown>) };
  for (const campo of CAMPOS_HUERFANOS_ENVIOS) delete envios[campo];
  configuracion.envios = envios;

  data.configuracion = configuracion;
  data.legacy = legacy;

  return conSaldoInicialCaja(conFechaDeCorte(conLineaPorDefecto(limpiarCapreseYConSalsa(data as unknown as RicordoDataV2))));
}
