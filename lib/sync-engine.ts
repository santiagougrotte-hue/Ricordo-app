// Lógica pura de sincronización — sin tocar Supabase acá, para poder testearla sin mockear la
// red. store-v2.tsx es la única pieza que sabe hablar con Supabase; este archivo solo calcula.

import type { RicordoDataV2 } from "./types-v2";

/** Backoff exponencial con techo — 2s, 4s, 8s, 16s, 30s, 30s, 30s... Nunca reintenta más rápido
 * que el intento anterior, nunca crece sin límite (no queremos esperar 10 minutos por un blip de
 * red momentáneo, pero tampoco martillar Supabase con reintentos cada 400ms). */
export function backoffDelayMs(intento: number, base = 2000, techo = 30000): number {
  if (intento <= 0) return base;
  return Math.min(techo, base * 2 ** (intento - 1));
}

/** Nombres legibles para el diff de conflicto — cae al nombre técnico si no está mapeado (nunca
 * oculta una sección solo porque no la conocemos). */
const NOMBRE_SECCION: Partial<Record<keyof RicordoDataV2, string>> = {
  categorias: "Categorías",
  clientes: "Clientes",
  pedidos: "Pedidos",
  pedido_items: "Líneas de pedido",
  productos: "Productos",
  producto_variantes: "Variantes de producto",
  recetas: "Recetas",
  receta_items: "Ítems de receta",
  ajustes_receta_variante: "Ajustes de receta por variante",
  complementos_variante: "Complementos de variante",
  insumos: "Insumos",
  inventario_movimientos: "Movimientos de inventario",
  historial_precios: "Historial de precios",
  compras: "Compras",
  compra_items: "Ítems de compra",
  proveedores: "Proveedores",
  produccion: "Producción",
  plan_produccion: "Plan de producción",
  movimientos_financieros: "Movimientos financieros",
  activos: "Activos",
  configuracion: "Configuración",
  datos_pendientes_revision: "Datos pendientes de revisión",
  legacy: "Datos heredados (legacy)",
};

export interface SeccionDiff {
  clave: string;
  nombre: string;
  distinto: boolean;
  cantidad_local: number | null;
  cantidad_remoto: number | null;
}

/** Compara documento local (con la edición sin guardar) contra el remoto (que ya avanzó de
 * versión) sección por sección — nunca intenta fusionar automáticamente, solo informa QUÉ
 * secciones difieren para que la persona elija qué conservar (pedido explícito: nunca fusionar
 * solo, mostrar ambas versiones). Si una sección es un array, además muestra cuántos registros
 * tiene cada lado — ayuda a detectar "solo se agregaron cosas" vs "se perdió algo". */
export function diferenciasPorSeccion(local: RicordoDataV2, remoto: RicordoDataV2): SeccionDiff[] {
  const claves = new Set<keyof RicordoDataV2>([...(Object.keys(local) as (keyof RicordoDataV2)[]), ...(Object.keys(remoto) as (keyof RicordoDataV2)[])]);
  const resultado: SeccionDiff[] = [];
  for (const clave of claves) {
    const valorLocal = local[clave];
    const valorRemoto = remoto[clave];
    const distinto = JSON.stringify(valorLocal) !== JSON.stringify(valorRemoto);
    resultado.push({
      clave: String(clave),
      nombre: NOMBRE_SECCION[clave] ?? String(clave),
      distinto,
      cantidad_local: Array.isArray(valorLocal) ? valorLocal.length : null,
      cantidad_remoto: Array.isArray(valorRemoto) ? valorRemoto.length : null,
    });
  }
  return resultado.sort((a, b) => Number(b.distinto) - Number(a.distinto) || a.nombre.localeCompare(b.nombre));
}

/** true si hay al menos una sección realmente distinta — si da false, el conflicto de versión no
 * tiene ningún cambio de contenido real (puede pasar si dos guardados con el mismo contenido
 * pisaron el número de versión) y se puede resolver solo, sin molestar a la persona. */
export function hayDiferenciasReales(diffs: SeccionDiff[]): boolean {
  return diffs.some((d) => d.distinto);
}
