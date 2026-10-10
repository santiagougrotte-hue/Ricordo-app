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

import type { RicordoDataV2 } from "../types-v2";

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

  return data as unknown as RicordoDataV2;
}
