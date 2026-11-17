import { NextRequest, NextResponse } from "next/server";
import { leerDatosNegocio } from "@/lib/server/app-state";
import { HEADERS_IMPORT_APP, resumenImportApp } from "@/lib/resumen-sheets";

// Export para la planilla "Ricordo · Finanzas" → pestaña IMPORT_APP.
// Devuelve exactamente las mismas filas que el botón "Exportar a Sheets → import_app.csv" de la app.
// Lo consume el Apps Script de la planilla (ver docs/apps-script-export.gs), que todos los miércoles
// a la mañana limpia IMPORT_APP!A2:AB y escribe estas filas. Así no hacen falta claves de Google.
//
// Protegido con `Authorization: Bearer $EXPORT_TOKEN` (variable server-only en Vercel; el mismo
// valor va en las Propiedades del script de la planilla).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // trim(): un espacio pegado sin querer al cargar la contraseña no debería dejar afuera al script.
  const token = process.env.EXPORT_TOKEN?.trim();
  const recibido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 20 || recibido !== token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { data, version, updatedAt } = await leerDatosNegocio();
    const filas = resumenImportApp(data);
    console.log("[export-import-app]", JSON.stringify({ filas: filas.length, version }));
    return NextResponse.json({
      headers: HEADERS_IMPORT_APP,
      filas,
      versionDatos: version,
      datosAl: updatedAt,
      generado: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export-import-app] ERROR", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
