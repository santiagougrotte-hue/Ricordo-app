/**
 * Ricordo · Export semanal automático App → IMPORT_APP
 *
 * Va pegado en la planilla "Ricordo_Finanzas" → Extensiones → Apps Script.
 * Todos los miércoles entre las 8 y las 9 (hora de Argentina) le pide a la app las filas del
 * export y reemplaza IMPORT_APP!A2:AB. No toca la fila 1 (encabezados) ni las fórmulas de AD:AG.
 *
 * Configuración (una sola vez):
 *  1. Configuración del proyecto (⚙️) → Propiedades del script → Agregar:
 *       EXPORT_TOKEN = el mismo valor que cargaste en Vercel como EXPORT_TOKEN
 *  2. Elegí la función `instalarDisparadorSemanal` arriba y tocá ▶ Ejecutar (acepta los permisos).
 *  3. Para probar ya: elegí `exportarDesdeApp` y tocá ▶ Ejecutar.
 */

const URL_EXPORT = "https://ricordo-app-rose.vercel.app/api/export/import-app";
const PESTANA = "IMPORT_APP";
const COLUMNAS = 28; // A:AB

function exportarDesdeApp() {
  const token = PropertiesService.getScriptProperties().getProperty("EXPORT_TOKEN");
  if (!token) throw new Error("Falta la propiedad del script EXPORT_TOKEN (Configuración del proyecto → Propiedades del script).");

  const res = UrlFetchApp.fetch(URL_EXPORT, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  const codigo = res.getResponseCode();
  const cuerpo = JSON.parse(res.getContentText() || "{}");
  if (codigo !== 200) throw new Error("La app respondió " + codigo + ": " + (cuerpo.error || res.getContentText().slice(0, 200)));

  const filas = cuerpo.filas || [];
  if (!filas.length) throw new Error("La app devolvió 0 filas: no se tocó la planilla.");
  if (filas[0].length !== COLUMNAS) throw new Error("Cambió la cantidad de columnas (" + filas[0].length + "): revisar antes de escribir.");

  const hoja = SpreadsheetApp.getActive().getSheetByName(PESTANA);
  if (!hoja) throw new Error("No existe la pestaña " + PESTANA);

  // Las fechas vienen como texto "2026-09-02": se convierten a fecha real, igual que al pegar el CSV.
  const valores = filas.map(function (f) {
    return f.map(function (c) {
      if (typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c)) {
        const p = c.split("-");
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      }
      return c;
    });
  });

  const ultima = Math.max(hoja.getLastRow(), 2);
  hoja.getRange(2, 1, ultima - 1, COLUMNAS).clearContent();
  hoja.getRange(2, 1, valores.length, COLUMNAS).setValues(valores);
  hoja.getRange(2, 2, valores.length, 1).setNumberFormat("yyyy-mm-dd");

  console.log("Export OK: " + valores.length + " filas · datos al " + cuerpo.datosAl);
}

function instalarDisparadorSemanal() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "exportarDesdeApp"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("exportarDesdeApp")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(8)
    .inTimezone("America/Argentina/Buenos_Aires")
    .create();
  console.log("Listo: se va a exportar todos los miércoles entre las 8 y las 9.");
}
