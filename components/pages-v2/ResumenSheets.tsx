"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod, MESES } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { Button, Card } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { primerDiaMes, ultimoDiaMes } from "@/lib/calc-v2";
import {
  resumenProductosSheets,
  productosATSV,
  resumenRepartoPorZonaSheets,
  repartoZonaATSV,
  resumenGastosSheets,
  gastosATSV,
  resumenRecetasRellenoSheets,
  recetasRellenoATSV,
} from "@/lib/resumen-sheets";

function TablaCopiable({ titulo, texto, ayuda }: { titulo: string; texto: string; ayuda?: string }) {
  const { toast } = useToast();
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast(`${titulo} copiado`);
    } catch {
      toast("No se pudo copiar — copialo a mano de la caja de abajo", "error");
    }
  }
  return (
    <Card
      title={titulo}
      className="mb-4"
      right={
        <Button size="sm" onClick={copiar}>
          Copiar
        </Button>
      }
    >
      {ayuda && <p className="mb-2 text-[11.5px] text-text3">{ayuda}</p>}
      <textarea
        readOnly
        value={texto}
        rows={6}
        className="w-full rounded-md border border-border bg-surface2 p-2.5 font-mono text-[11.5px] text-text"
        onFocus={(e) => e.target.select()}
      />
    </Card>
  );
}

export function ResumenSheetsButton() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();
  const [open, setOpen] = useState(false);

  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);

  const productos = useMemo(() => (open ? productosATSV(resumenProductosSheets(data, desde, hasta)) : ""), [open, data, desde, hasta]);
  const reparto = useMemo(() => (open ? repartoZonaATSV(resumenRepartoPorZonaSheets(data, desde, hasta)) : ""), [open, data, desde, hasta]);
  const gastos = useMemo(() => (open ? gastosATSV(resumenGastosSheets(data, desde, hasta)) : ""), [open, data, desde, hasta]);
  const recetas = useMemo(() => (open ? recetasRellenoATSV(resumenRecetasRellenoSheets(data, desde, hasta)) : ""), [open, data, desde, hasta]);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Resumen para Sheets
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Resumen para Sheets — ${MESES[mes - 1]} ${anio}`} wide>
        <p className="mb-4 text-[12.5px] text-text3">
          4 tablas listas para copiar y pegar en una fila/celda de tu planilla (separadas por tabulador, como una
          tabla de Sheets/Excel) — tocá &ldquo;Copiar&rdquo; en cada una y pegá donde corresponda.
        </p>
        <TablaCopiable
          titulo="Productos"
          texto={productos}
          ayuda="Cajas equivalentes por canal, ingresos, costos, precio promedio, stock actual y cajas producidas en el período."
        />
        <TablaCopiable titulo="Reparto por zona" texto={reparto} ayuda="Pedidos entregados con envío cobrado, agrupados por zona." />
        <TablaCopiable
          titulo="Gastos del mes por categoría, más envíos"
          texto={gastos}
          ayuda="No incluye las categorías de reparto (diferencia de envío, viaje a Berazategui) — ya están en la fila de envíos, para no contarlas dos veces."
        />
        <TablaCopiable
          titulo="Recetas de relleno (batch de compras)"
          texto={recetas}
          ayuda="Insumos de la etapa 'relleno' que hicieron falta según lo entregado en el período, contra el stock actual."
        />
      </Modal>
    </>
  );
}
