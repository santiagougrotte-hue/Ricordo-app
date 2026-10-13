"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { useToast } from "@/lib/toast";
import { fARS } from "@/lib/calc-v2";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  resumenProductosSheets,
  resumenGastosSheets,
  resumenRecetasRellenoSheets,
  resumenRepartoSheets,
  resumenPreciosFormatosSheets,
  resumenStockInsumosSheets,
  celdaTexto,
  decimalesPorColumna,
  type SeparadorDecimal,
} from "@/lib/resumen-sheets";

function mesAnteriorAHoy(): string {
  const hoy = new Date();
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
const HEADERS_RECETAS = ["producto_id", "producto", "insumo_id", "insumo", "cantidad_por_unidad", "unidad", "precio_actual", "stock_actual"];
const HEADERS_REPARTO = ["mes", "recorrido", "tipo", "viajes", "km", "litros", "nafta", "peajes", "costo_total", "envios_cobrados"];
const HEADERS_PRECIOS_FORMATOS = [
  "mes",
  "producto_id",
  "producto",
  "variante_id",
  "variante",
  "canal",
  "unidades_por_paquete",
  "precio_venta",
  "costo_insumos_paquete",
  "costo_mo_paquete",
  "costo_total_paquete",
  "paquetes_vendidos_mes",
  "descuentos_mes",
];
const HEADERS_STOCK_INSUMOS = [
  "insumo_id",
  "insumo",
  "tipo",
  "categoria",
  "unidad",
  "stock_actual",
  "stock_minimo",
  "precio_actual",
  "valor_stock",
  "fecha_ultimo_conteo",
];

// cantidad_por_unidad (índice 4) con 5 decimales, stock_actual (índice 7) con 3 — el resto, 2 por default.
const DECIMALES_RECETAS = decimalesPorColumna(HEADERS_RECETAS.length, { 4: 5, 7: 3 });
// stock_actual (índice 5) con 3 decimales.
const DECIMALES_STOCK_INSUMOS = decimalesPorColumna(HEADERS_STOCK_INSUMOS.length, { 5: 3 });
const DECIMALES_PRODUCTOS = decimalesPorColumna(HEADERS_PRODUCTOS.length);
const DECIMALES_GASTOS = decimalesPorColumna(HEADERS_GASTOS.length);
const DECIMALES_REPARTO = decimalesPorColumna(HEADERS_REPARTO.length);
const DECIMALES_PRECIOS_FORMATOS = decimalesPorColumna(HEADERS_PRECIOS_FORMATOS.length);

export function ResumenSheetsButton() {
  const { data } = useStoreV2();
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(mesAnteriorAHoy);
  const [separador, setSeparador] = useState<SeparadorDecimal>(leerSeparadorGuardado);

  function cambiarSeparador(nuevo: SeparadorDecimal) {
    setSeparador(nuevo);
    guardarSeparador(nuevo);
  }

  const productos = useMemo(() => (open ? resumenProductosSheets(data, mes) : []), [open, data, mes]);
  const gastos = useMemo(() => (open ? resumenGastosSheets(data, mes) : []), [open, data, mes]);
  const recetas = useMemo(() => (open ? resumenRecetasRellenoSheets(data) : []), [open, data]);
  const reparto = useMemo(() => (open ? resumenRepartoSheets(data, mes) : []), [open, data, mes]);
  const preciosFormatos = useMemo(() => (open ? resumenPreciosFormatosSheets(data, mes) : []), [open, data, mes]);
  const stockInsumos = useMemo(() => (open ? resumenStockInsumosSheets(data) : []), [open, data]);
  const totalValorStock = useMemo(() => stockInsumos.reduce((acc, f) => acc + f.valor_stock, 0), [stockInsumos]);

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
    () => recetas.map((f) => [f.producto_id, f.producto, f.insumo_id, f.insumo, f.cantidad_por_unidad, f.unidad, f.precio_actual, f.stock_actual]),
    [recetas]
  );
  const filasReparto = useMemo(
    () => reparto.map((f) => [f.mes, f.recorrido, f.tipo, f.viajes, f.km, f.litros, f.nafta, f.peajes, f.costo_total, f.envios_cobrados]),
    [reparto]
  );
  const filasPreciosFormatos = useMemo(
    () =>
      preciosFormatos.map((f) => [
        f.mes,
        f.producto_id,
        f.producto,
        f.variante_id,
        f.variante,
        f.canal,
        f.unidades_por_paquete,
        f.precio_venta,
        f.costo_insumos_paquete,
        f.costo_mo_paquete,
        f.costo_total_paquete,
        f.paquetes_vendidos_mes,
        f.descuentos_mes,
      ]),
    [preciosFormatos]
  );
  const filasStockInsumos = useMemo(
    () =>
      stockInsumos.map((f) => [
        f.insumo_id,
        f.insumo,
        f.tipo,
        f.categoria,
        f.unidad,
        f.stock_actual,
        f.stock_minimo ?? "",
        f.precio_actual,
        f.valor_stock,
        f.fecha_ultimo_conteo,
      ]),
    [stockInsumos]
  );

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Exportar a Sheets
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Exportar a Sheets — ${mes}`} wide>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Mes">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </Field>
          <Field label="Separador decimal">
            <Select value={separador} onChange={(e) => cambiarSeparador(e.target.value as SeparadorDecimal)}>
              <option value="coma">Coma (0,03)</option>
              <option value="punto">Punto (0.03)</option>
            </Select>
          </Field>
        </div>
        <TablaResumen
          titulo="RESUMEN_PRODUCTOS"
          ayuda="Una fila por cada producto activo (aunque no tenga ventas en el mes), con cajas equivalentes por canal, ingresos, costos, precios, stock y cajas producidas."
          headers={HEADERS_PRODUCTOS}
          filas={filasProductos}
          archivo={`resumen_productos_${mes}.csv`}
          decimales={DECIMALES_PRODUCTOS}
          separador={separador}
        />
        <TablaResumen
          titulo="RESUMEN_GASTOS"
          ayuda="Compras de insumos del mes + un gasto por categoría financiera (no incluye las categorías de reparto, van en RESUMEN_REPARTO)."
          headers={HEADERS_GASTOS}
          filas={filasGastos}
          archivo={`resumen_gastos_${mes}.csv`}
          decimales={DECIMALES_GASTOS}
          separador={separador}
        />
        <TablaResumen
          titulo="RECETAS_RELLENO"
          ayuda="Receta vigente de cada producto activo — no depende del mes elegido. En Pasta, solo el relleno (la masa se planifica aparte, el packaging no va); en cualquier otra línea (Lasaña, Pizza, Salsa, etc.) toda la receta salvo el packaging. Incluye el stock actual de cada insumo (se arma en tanda mensual, no está en Inventario → Alertas de stock) para planificar la próxima compra/tanda."
          headers={HEADERS_RECETAS}
          filas={filasRecetas}
          archivo="recetas_relleno.csv"
          decimales={DECIMALES_RECETAS}
          separador={separador}
        />
        <TablaResumen
          titulo="RESUMEN_REPARTO"
          ayuda="Una fila por cada zona de la lista fija (pedidos entregados en el mes) + la fila de Compras Berazategui."
          headers={HEADERS_REPARTO}
          filas={filasReparto}
          archivo={`resumen_reparto_${mes}.csv`}
          decimales={DECIMALES_REPARTO}
          separador={separador}
        />
        <TablaResumen
          titulo="PRECIOS_FORMATOS"
          ayuda="Una fila por cada variante/presentación activa (minorista y mayorista, todos los tamaños de caja), aunque no haya tenido ventas en el mes. Costo = costoVariante/costoManoDeObraVariante, igual que la pantalla Productos → Variantes."
          headers={HEADERS_PRECIOS_FORMATOS}
          filas={filasPreciosFormatos}
          archivo={`precios_formatos_${mes}.csv`}
          decimales={DECIMALES_PRECIOS_FORMATOS}
          separador={separador}
        />
        <TablaResumen
          titulo="STOCK_INSUMOS"
          ayuda="Foto del stock de materia prima al momento de exportar (no depende del mes) — una fila por cada insumo activo con stock controlado, ingredientes y packaging, cada uno una sola vez."
          nota="Se pega ENCIMA de lo anterior (reemplaza), con encabezados, en la celda A1 de la pestaña IMPORT_STOCK."
          headers={HEADERS_STOCK_INSUMOS}
          filas={filasStockInsumos}
          archivo="stock_insumos.csv"
          decimales={DECIMALES_STOCK_INSUMOS}
          separador={separador}
        />
        <p className="mb-2 text-[12.5px] text-text2">
          Valor total de stock de insumos: <span className="font-semibold">{fARS(totalValorStock)}</span>
        </p>
      </Modal>
    </>
  );
}
