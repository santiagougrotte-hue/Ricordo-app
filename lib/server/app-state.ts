import "server-only";
import { emptyDataV2, type RicordoDataV2 } from "@/lib/types-v2";
import { conCobrosSeptiembreConfirmados, conStockPorProducto } from "@/lib/migration/v3";

// Lectura del documento del negocio desde el servidor (para tareas automáticas como el export
// semanal a Sheets). Usa la service role key de Supabase, que saltea RLS: vive SOLO como variable
// de entorno server-only en Vercel (sin NEXT_PUBLIC_), nunca llega al navegador.

const ROW_ID = "main";

/** Mismo armado que `comoV3` en store-v2.tsx para un documento ya v3 (ese archivo es de cliente). */
export function normalizarDocumentoV3(valorCrudo: unknown): RicordoDataV2 {
  const doc = valorCrudo as { schema_version?: number; data?: unknown } | null;
  if (!doc || doc.schema_version !== 3) {
    throw new Error(`El documento guardado no es schema v3 (vino ${doc?.schema_version ?? "sin versión"}). Abrí la app una vez para que lo migre.`);
  }
  const base = emptyDataV2();
  const parcial = (doc.data ?? {}) as Partial<RicordoDataV2>;
  const conBase: RicordoDataV2 = { ...base, ...parcial, configuracion: { ...base.configuracion, ...parcial.configuracion } };
  return conStockPorProducto(conCobrosSeptiembreConfirmados(conBase));
}

export async function leerDatosNegocio(): Promise<{ data: RicordoDataV2; version: number; updatedAt: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  }
  const res = await fetch(`${url}/rest/v1/app_state?id=eq.${ROW_ID}&select=data,version,updated_at`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const filas = (await res.json()) as { data: unknown; version: number; updated_at: string }[];
  if (!filas[0]) throw new Error("No hay datos guardados en app_state.");
  return { data: normalizarDocumentoV3(filas[0].data), version: filas[0].version, updatedAt: filas[0].updated_at };
}
