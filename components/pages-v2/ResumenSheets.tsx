"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { useToast } from "@/lib/toast";
import { useRouter } from "@/lib/nav-context";
import { productosSinManoDeObra } from "@/lib/calc-v2";
import { Button, Card, Field, Select, Alert } from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  resumenImportApp,
  fechaInicioImportApp,
  HEADERS_IMPORT_APP,
  DECIMALES_IMPORT_APP,
  celdaTexto,
  type SeparadorDecimal,
} from "@/lib/resumen-sheets";

/** Mes anterior al de `hoy`, en formato AAAA-MM — el bloque mensual (mes cerrado) arranca acá por
 * defecto: pegar el mes en curso antes de que termine duplicaría esos totales el día 1 siguiente. */
export function mesAnteriorAHoy(hoy: Date = new Date()): string {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth(); // 0-11; mes-1 del actual = este índice ya es el mes anterior en base 1
  const d = mes === 0 ? new Date(anio - 1, 11, 1) : new Date(anio, mes - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// La elección de separador se recuerda en localStorage para no tener que elegirla cada vez —
// detalle de UI, por eso vive acá y no en lib/resumen-sheets.ts (que sí tiene formatearNumero/
// celdaTexto/decimalesPorColumna, reusados también desde los tests).
const STORAGE_KEY_SEPARADOR = "ricordo_sheets_separador_decimal";

function leerSeparadorGuardado(): SeparadorDecimal {
  if (typeof window === "undefined") return "coma";
  try {
    const guardado = window.localStorage.getItem(STORAGE_KEY_SEPARADOR);
    return guardado === "punto" ? "punto" : "coma";
  } catch {
    return "coma";
  }
}

function guardarSeparador(separador: SeparadorDecimal) {
  try {
    window.localStorage.setItem(STORAGE_KEY_SEPARADOR, separador);
  } catch {
    /* storage no disponible — la elección solo dura la sesión */
  }
}

function filasATSV(
  headers: string[],
  filas: (string | number)[][],
  decimales: number[],
  separador: SeparadorDecimal,
  conEncabezado: boolean
): string {
  const linea = (celdas: (string | number)[]) => celdas.map((c, i) => celdaTexto(c, decimales[i] ?? 2, separador)).join("\t");
  const cuerpo = filas.map(linea);
  return conEncabezado ? [linea(headers), ...cuerpo].join("\n") : cuerpo.join("\n");
}

function celdaCSV(texto: string): string {
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function filasACSV(headers: string[], filas: (string | number)[][], decimales: number[], separador: SeparadorDecimal): string {
  const linea = (celdas: (string | number)[]) => celdas.map((c, i) => celdaCSV(celdaTexto(c, decimales[i] ?? 2, separador))).join(",");
  return [linea(headers), ...filas.map(linea)].join("\r\n");
}

function descargarCSV(nombreArchivo: string, headers: string[], filas: (string | number)[][], decimales: number[], separador: SeparadorDecimal) {
  const blob = new Blob([filasACSV(headers, filas, decimales, separador)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

async function copiarTexto(texto: string, toast: ReturnType<typeof useToast>["toast"], etiqueta: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(`${etiqueta} copiado`);
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      toast(`${etiqueta} copiado`);
    } catch {
      toast("No se pudo copiar — seleccioná el texto de la vista previa a mano", "error");
    }
  }
}

function BloqueExportacion({ titulo, explicacion, children }: { titulo: string; explicacion: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="mb-1 text-[14px] font-semibold text-text">{titulo}</h3>
      <p className="mb-3 text-[12.5px] text-text3">{explicacion}</p>
      {children}
    </div>
  );
}

function TablaResumen({
  titulo,
  ayuda,
  nota,
  headers,
  filas,
  archivo,
  decimales,
  separador,
}: {
  titulo: string;
  ayuda?: string;
  nota?: string;
  headers: string[];
  filas: (string | number)[][];
  archivo: string;
  decimales: number[];
  separador: SeparadorDecimal;
}) {
  const { toast } = useToast();
  return (
    <Card title={titulo} className="mb-4">
      {ayuda && <p className="mb-2 text-[11.5px] text-text3">{ayuda}</p>}
      {nota && <p className="mb-2 text-[11.5px] font-semibold text-accent">{nota}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copiarTexto(filasATSV(headers, filas, decimales, separador, true), toast, "Con encabezados")}>
          Copiar con encabezados
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => copiarTexto(filasATSV(headers, filas, decimales, separador, false), toast, "Sin encabezados")}
        >
          Copiar sin encabezados
        </Button>
        <Button size="sm" variant="ghost" onClick={() => descargarCSV(archivo, headers, filas, decimales, separador)}>
          Descargar CSV
        </Button>
      </div>
      <div className="max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-[11.5px]">
          <thead className="sticky top-0 bg-surface2">
            <tr>
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-border px-2 py-1.5 text-left font-semibold text-text2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-2 py-3 text-center text-text3">
                  Sin filas.
                </td>
              </tr>
            ) : (
              filas.map((fila, idx) => (
                <tr key={idx} className="border-b border-border/60 last:border-0">
                  {fila.map((c, i) => (
                    <td key={i} className="whitespace-nowrap px-2 py-1 text-text">
                      {celdaTexto(c, decimales[i] ?? 2, separador)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ResumenSheetsButton() {
  const { data, setData } = useStoreV2();
  const { go } = useRouter();
  const [open, setOpen] = useState(false);
  const [separador, setSeparador] = useState<SeparadorDecimal>(leerSeparadorGuardado);

  function cambiarSeparador(nuevo: SeparadorDecimal) {
    setSeparador(nuevo);
    guardarSeparador(nuevo);
  }

  const sinManoDeObra = useMemo(() => (open ? productosSinManoDeObra(data) : []), [open, data]);
  const filasImportApp = useMemo(() => (open ? resumenImportApp(data) : []), [open, data]);
  const inicioImportApp = fechaInicioImportApp(data);

  function marcarNoAplica(recetaId: string) {
    setData((d) => ({ ...d, recetas: d.recetas.map((r) => (r.id === recetaId ? { ...r, sin_mano_obra_ok: true } : r)) }));
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Exportar a Sheets
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Exportar a Sheets" wide>
        {sinManoDeObra.length > 0 && (
          <Alert kind="warning">
            <p className="mb-2">
              Estos productos activos no tienen minutos de mano de obra y su costo sale sin MO:{" "}
              {sinManoDeObra.map((a) => a.producto).join(", ")}.
            </p>
            <div className="flex flex-wrap gap-2">
              {sinManoDeObra.map((a) => (
                <div key={a.producto_id} className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => go("productos")}>
                    Editar receta de {a.producto}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => marcarNoAplica(a.receta_id)}>
                    No aplica
                  </Button>
                </div>
              ))}
            </div>
          </Alert>
        )}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Separador decimal">
            <Select value={separador} onChange={(e) => cambiarSeparador(e.target.value as SeparadorDecimal)}>
              <option value="coma">Coma (0,03)</option>
              <option value="punto">Punto (0.03)</option>
            </Select>
          </Field>
        </div>

        <BloqueExportacion
          titulo="Planillas Ricordo · Finanzas y Productos y compras — cada semana, se pega ENCIMA"
          explicacion={`Todo junto en una sola tabla (ventas, pedidos, compras, caja, producción, rellenos, stock de masa y packaging, y recetas) desde ${inicioImportApp || "el inicio"}. En Finanzas → pestaña IMPORT_APP: seleccioná A1:AB, borrá y pegá en A1. El archivo de Productos y compras lo lee solo de Finanzas.`}
        >
          <TablaResumen
            titulo="IMPORT_APP"
            ayuda={`${filasImportApp.length} renglones. Usá «Copiar con encabezados»: la planilla espera la fila de títulos en la fila 1.`}
            nota="Ricordo · Finanzas → pestaña IMPORT_APP, celda A1."
            headers={[...HEADERS_IMPORT_APP]}
            filas={filasImportApp}
            archivo="import_app.csv"
            decimales={DECIMALES_IMPORT_APP}
            separador={separador}
          />
        </BloqueExportacion>
      </Modal>
    </>
  );
}
