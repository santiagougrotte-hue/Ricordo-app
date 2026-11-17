import { NextRequest, NextResponse } from "next/server";
import { leerDatosNegocio } from "@/lib/server/app-state";
import { reemplazarBloque } from "@/lib/server/google-sheets";
import { resumenImportApp } from "@/lib/resumen-sheets";

// Export semanal automático a la planilla "Ricordo · Finanzas" → pestaña IMPORT_APP.
// Es exactamente el mismo contenido que el botón "Exportar a Sheets → import_app.csv" de la app,
// escrito desde A2 (la fila 1 son los encabezados y las columnas AD:AG son fórmulas de la planilla,
// que no se tocan). "Ricordo · Productos y Compras" lo lee de Finanzas vía VINC_FINANZAS.
//
// Lo dispara Vercel Cron (ver vercel.json) con `Authorization: Bearer $CRON_SECRET`. También se
// puede correr a mano con el mismo header.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FINANZAS_SHEET_ID_DEFAULT = "1mgZdwqhzs4fS-uQ4PVcy8c-OcOp4LrPYXhYLnaVSR7o";
const PESTANA = "IMPORT_APP";
const ULTIMA_COLUMNA = "AB"; // 28 columnas de HEADERS_IMPORT_APP

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  try {
    const { data, version, updatedAt } = await leerDatosNegocio();
    const filas = resumenImportApp(data);
    const spreadsheetId = process.env.FINANZAS_SHEET_ID || FINANZAS_SHEET_ID_DEFAULT;
    const { celdasActualizadas } = await reemplazarBloque(
      spreadsheetId,
      `${PESTANA}!A2:${ULTIMA_COLUMNA}`,
      `${PESTANA}!A2`,
      filas
    );
    const resumen = {
      ok: true,
      filas: filas.length,
      celdasActualizadas,
      versionDatos: version,
      datosAl: updatedAt,
      ms: Date.now() - inicio,
    };
    console.log("[export-sheets]", JSON.stringify(resumen));
    return NextResponse.json(resumen);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export-sheets] ERROR", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
