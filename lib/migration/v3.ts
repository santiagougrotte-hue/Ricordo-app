// Migración del esquema "v2 tal cual se guardó antes de la Fase 0" al esquema v3.
//
// A diferencia de `migrarAV2` (que reconstruye un modelo completamente distinto desde el esquema
// viejo de un solo archivo), acá los tipos ya son casi los mismos: V3 solo formaliza, a nivel de
// *datos reales ya guardados*, secciones que el código (tipos + UI) ya había dejado de usar en la
// Parte A de esta migración — `plan_produccion`, `ordenes_produccion`, `preparaciones` y afines,
// `activos`, `configuracion.caja_inteligente`, `configuracion.fondo_reposicion`. Sin este paso, un
// documento real sincronizado desde antes de esa limpieza sigue cargando esas claves para siempre
// (el resto del código las tolera por compatibilidad hacia atrás, pero nunca las saca solo).
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
  if ("caja_inteligente" in configuracion) {
    legacy.caja_inteligente_v2 = configuracion.caja_inteligente;
    delete configuracion.caja_inteligente;
  }
  if ("fondo_reposicion" in configuracion) {
    legacy.fondo_reposicion_v2 = configuracion.fondo_reposicion;
    delete configuracion.fondo_reposicion;
  }
  data.configuracion = configuracion;
  data.legacy = legacy;

  return data as unknown as RicordoDataV2;
}
