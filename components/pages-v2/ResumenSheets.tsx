"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { useToast } from "@/lib/toast";
import { Button, Card, Field, Input } from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  resumenProductosSheets,
  resumenGastosSheets,
  resumenRecetasRellenoSheets,
  resumenRepartoSheets,
} from "@/lib/resumen-sheets";

function mesAnteriorAHoy(): string {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth(); // 0-11; mes-1 del actual = este índice ya es el mes anterior en base 1
  const d = mes === 0 ? new Date(anio - 1, 11, 1) : new Date(anio, mes - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function celdaTexto(c: string | number): string {
  if (typeof c !== "number") return c;
  return Number.isInteger(c) ? String(c) : String(Math.round(c * 100) / 100);
}

function filasATSV(headers: string[], filas: (string | number)[][], conEncabezado: boolean): string {
  const linea = (celdas: (string | number)[]) => celdas.map(celdaTexto).join("\t");
  const cuerpo = filas.map(linea);
  return conEncabezado ? [linea(headers), ...cuerpo].join("\n") : cuerpo.join("\n");
}

function celdaCSV(c: string | number): string {
  const texto = celdaTexto(c);
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function filasACSV(headers: string[], filas: (string | number)[][]): string {
  const linea = (celdas: (string | number)[]) => celdas.map(celdaCSV).join(",");
  return [linea(headers), ...filas.map(linea)].join("\r\n");
}

function descargarCSV(nombreArchivo: string, headers: string[], filas: (string | number)[][]) {
  const blob = new Blob([filasACSV(headers, filas)], { type: "text/csv;charset=utf-8" });
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

function TablaResumen({
  titulo,
  ayuda,
  headers,
  filas,
  archivo,
}: {
  titulo: string;
  ayuda?: string;
  headers: string[];
  filas: (string | number)[][];
  archivo: string;
}) {
  const { toast } = useToast();
  return (
    <Card title={titulo} className="mb-4">
      {ayuda && <p className="mb-2 text-[11.5px] text-text3">{ayuda}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => copiarTexto(filasATSV(headers, filas, true), toast, "Con encabezados")}>
          Copiar con encabezados
        </Button>
        <Button size="sm" variant="ghost" onClick={() => copiarTexto(filasATSV(headers, filas, false), toast, "Sin encabezados")}>
          Copiar sin encabezados
        </Button>
        <Button size="sm" variant="ghost" onClick={() => descargarCSV(archivo, headers, filas)}>
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
                      {celdaTexto(c)}
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

const HEADERS_PRODUCTOS = [
  "mes",
  "producto_id",
  "producto",
  "linea",
  "unidades_por_caja_ref",
  "cajas_eq_minorista",
  "cajas_eq_mayorista",
  "cajas_eq_total",
  "ingresos_minorista",
  "ingresos_mayorista",
  "descuentos_total",
  "costo_insumos_caja_ref",
  "costo_mo_caja_ref",
  "costo_total_caja_ref",
  "precio_minorista_caja_ref",
  "precio_mayorista_caja_ref",
  "stock_terminado_cajas_eq",
  "cajas_producidas_eq",
];
const HEADERS_GASTOS = ["mes", "tipo", "categoria", "monto"];
const HEADERS_RECETAS = ["producto_id", "producto", "insumo_id", "insumo", "cantidad_por_unidad", "unidad", "precio_actual"];
const HEADERS_REPARTO = ["mes", "recorrido", "tipo", "viajes", "km", "litros", "nafta", "peajes", "costo_total", "envios_cobrados"];

export function ResumenSheetsButton() {
  const { data } = useStoreV2();
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(mesAnteriorAHoy);

  const productos = useMemo(() => (open ? resumenProductosSheets(data, mes) : []), [open, data, mes]);
  const gastos = useMemo(() => (open ? resumenGastosSheets(data, mes) : []), [open, data, mes]);
  const recetas = useMemo(() => (open ? resumenRecetasRellenoSheets(data) : []), [open, data]);
  const reparto = useMemo(() => (open ? resumenRepartoSheets(data, mes) : []), [open, data, mes]);

  const filasProductos = useMemo(
    () =>
      productos.map((f) => [
        f.mes,
        f.producto_id,
        f.producto,
        f.linea,
        f.unidades_por_caja_ref,
        f.cajas_eq_minorista,
        f.cajas_eq_mayorista,
        f.cajas_eq_total,
        f.ingresos_minorista,
        f.ingresos_mayorista,
        f.descuentos_total,
        f.costo_insumos_caja_ref,
        f.costo_mo_caja_ref,
        f.costo_total_caja_ref,
        f.precio_minorista_caja_ref,
        f.precio_mayorista_caja_ref,
        f.stock_terminado_cajas_eq,
        f.cajas_producidas_eq,
      ]),
    [productos]
  );
  const filasGastos = useMemo(() => gastos.map((f) => [f.mes, f.tipo, f.categoria, f.monto]), [gastos]);
  const filasRecetas = useMemo(
    () => recetas.map((f) => [f.producto_id, f.producto, f.insumo_id, f.insumo, f.cantidad_por_unidad, f.unidad, f.precio_actual]),
    [recetas]
  );
  const filasReparto = useMemo(
    () => reparto.map((f) => [f.mes, f.recorrido, f.tipo, f.viajes, f.km, f.litros, f.nafta, f.peajes, f.costo_total, f.envios_cobrados]),
    [reparto]
  );

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Exportar a Sheets
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Exportar a Sheets — ${mes}`} wide>
        <div className="mb-4 flex items-end gap-3">
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </Field>
        </div>
        <TablaResumen
          titulo="RESUMEN_PRODUCTOS"
          ayuda="Una fila por cada producto activo (aunque no tenga ventas en el mes), con cajas equivalentes por canal, ingresos, costos, precios, stock y cajas producidas."
          headers={HEADERS_PRODUCTOS}
          filas={filasProductos}
          archivo={`resumen_productos_${mes}.csv`}
        />
        <TablaResumen
          titulo="RESUMEN_GASTOS"
          ayuda="Compras de insumos del mes + un gasto por categoría financiera (no incluye las categorías de reparto, van en RESUMEN_REPARTO)."
          headers={HEADERS_GASTOS}
          filas={filasGastos}
          archivo={`resumen_gastos_${mes}.csv`}
        />
        <TablaResumen
          titulo="RECETAS_RELLENO"
          ayuda="Receta vigente de cada producto activo — no depende del mes elegido. Es lo que necesita el batch de compras."
          headers={HEADERS_RECETAS}
          filas={filasRecetas}
          archivo="recetas_relleno.csv"
        />
        <TablaResumen
          titulo="RESUMEN_REPARTO"
          ayuda="Una fila por cada zona de la lista fija (pedidos entregados en el mes) + la fila de Compras Berazategui."
          headers={HEADERS_REPARTO}
          filas={filasReparto}
          archivo={`resumen_reparto_${mes}.csv`}
        />
      </Modal>
    </>
  );
}
