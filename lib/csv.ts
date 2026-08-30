/** Utilidades genéricas para exportar datos a CSV (Excel/Google Sheets) — sin dependencias
 * externas, misma filosofía liviana que el resto de la app. */

function escapeCampoCSV(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const str = String(valor);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface ColumnaCSV<T> {
  header: string;
  value: (row: T) => unknown;
}

/** Arma un CSV con salto de línea CRLF (compatibilidad Excel) a partir de filas tipadas y una
 * lista de columnas — cada columna decide cómo extraer su valor de la fila. */
export function toCSV<T>(rows: T[], columnas: ColumnaCSV<T>[]): string {
  const encabezado = columnas.map((c) => escapeCampoCSV(c.header)).join(",");
  const lineas = rows.map((row) => columnas.map((c) => escapeCampoCSV(c.value(row))).join(","));
  return [encabezado, ...lineas].join("\r\n");
}

/** Dispara la descarga de un string CSV como archivo — agrega BOM UTF-8 para que Excel abra
 * tildes/ñ correctamente sin pedir elegir codificación. */
export function descargarCSV(nombreArchivo: string, contenido: string): void {
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
