"use client";

import React, { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useStore } from "@/lib/store";
import { usePeriod, MESES } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fNum, fPct } from "@/lib/calc";
import { referenciaVentasPorGusto, desvioPlanSemana, type ReferenciaVentasGusto, type TendenciaVentas } from "@/lib/planificacion";
import { PageHeader, Card, TableWrap, Th, Td, TrHover, EmptyState, Button, Field, Input, Badge } from "@/components/ui";
import type { Producto, PlanProduccionMes } from "@/lib/types";

function TendenciaIcono({ tendencia }: { tendencia: TendenciaVentas }) {
  if (tendencia === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-green">
        <TrendingUp className="h-4 w-4" />
      </span>
    );
  }
  if (tendencia === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-red">
        <TrendingDown className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-text3">
      <Minus className="h-4 w-4" />
    </span>
  );
}

/** Bloque 1 — solo lectura, calculado. Muestra siempre todos los gustos activos, aunque
 * estén en cero, y la ventana de cálculo es configurable (no hardcodeada). */
function ReferenciaVentas({ referencia }: { referencia: ReferenciaVentasGusto[] }) {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [ventana, setVentana] = useState(data.config_planificacion.ventana_meses_referencia);

  function guardarVentana() {
    if (ventana < 1) {
      toast("La ventana tiene que ser de al menos 1 mes", "error");
      return;
    }
    setData((d) => ({ ...d, config_planificacion: { ...d.config_planificacion, ventana_meses_referencia: ventana } }));
    toast("Ventana de cálculo guardada");
  }

  return (
    <Card title="Referencia de ventas" className="mb-4">
      <div className="mb-3.5 flex flex-wrap items-end gap-3">
        <Field label="Ventana de cálculo (meses cerrados)">
          <Input type="number" min={1} value={ventana} onChange={(e) => setVentana(Number(e.target.value))} style={{ width: 100 }} />
        </Field>
        <Button size="sm" onClick={guardarVentana}>
          Guardar
        </Button>
      </div>
      {referencia.length === 0 ? (
        <EmptyState text="Sin productos activos todavía." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Gusto</Th>
                <Th>Prom. cajas/mes</Th>
                <Th>Prom. cajas/semana</Th>
                <Th>Último mes cerrado</Th>
                <Th>Tendencia</Th>
              </tr>
            </thead>
            <tbody>
              {referencia.map((r) => (
                <TrHover key={r.id_producto}>
                  <Td main>{r.nombre}</Td>
                  <Td>{fNum(r.promedioMes, 1)}</Td>
                  <Td>{fNum(r.promedioSemana, 1)}</Td>
                  <Td>{fNum(r.ultimoMesCerrado, 0)}</Td>
                  <Td>
                    <TendenciaIcono tendencia={r.tendencia} />
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

/** Bloque 2 — editable. Se remonta (vía `key` en el padre) cada vez que cambia mes/año, para
 * cargar limpio lo ya guardado de ese período sin necesitar un efecto de sincronización. */
function PlanEditable({
  mes,
  anio,
  referencia,
  productos,
  planesGuardados,
}: {
  mes: number;
  anio: number;
  referencia: ReferenciaVentasGusto[];
  productos: Producto[];
  planesGuardados: PlanProduccionMes[];
}) {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [umbral, setUmbral] = useState(data.config_planificacion.umbral_desvio_semana_pct);
  const [filas, setFilas] = useState<Record<string, { cajas_mes: number; cajas_semana: number }>>(() => {
    const inicial: Record<string, { cajas_mes: number; cajas_semana: number }> = {};
    for (const p of productos) {
      const guardado = planesGuardados.find((g) => g.id_producto === p.id);
      inicial[p.id] = { cajas_mes: guardado?.cajas_mes ?? 0, cajas_semana: guardado?.cajas_semana ?? 0 };
    }
    return inicial;
  });

  function actualizarFila(idProducto: string, patch: Partial<{ cajas_mes: number; cajas_semana: number }>) {
    setFilas((f) => ({ ...f, [idProducto]: { ...f[idProducto], ...patch } }));
  }

  function traerPromedio(idProducto: string) {
    const ref = referencia.find((r) => r.id_producto === idProducto);
    if (!ref) return;
    actualizarFila(idProducto, {
      cajas_mes: Math.round(ref.promedioMes * 10) / 10,
      cajas_semana: Math.round(ref.promedioSemana * 10) / 10,
    });
  }

  function traerPromedioTodos() {
    setFilas((f) => {
      const nuevo = { ...f };
      for (const r of referencia) {
        nuevo[r.id_producto] = { cajas_mes: Math.round(r.promedioMes * 10) / 10, cajas_semana: Math.round(r.promedioSemana * 10) / 10 };
      }
      return nuevo;
    });
  }

  function guardarUmbral() {
    setData((d) => ({ ...d, config_planificacion: { ...d.config_planificacion, umbral_desvio_semana_pct: umbral } }));
    toast("Umbral guardado");
  }

  function guardarPlan() {
    const fecha_guardado = new Date().toISOString();
    setData((d) => {
      const sinEsteMes = d.plan_produccion.filter((p) => !(p.mes === mes && p.anio === anio));
      const nuevas: PlanProduccionMes[] = productos.map((p) => ({
        id: uid("PLAN"),
        mes,
        anio,
        id_producto: p.id,
        cajas_mes: filas[p.id]?.cajas_mes ?? 0,
        cajas_semana: filas[p.id]?.cajas_semana ?? 0,
        fecha_guardado,
      }));
      return { ...d, plan_produccion: [...sinEsteMes, ...nuevas] };
    });
    toast(`Plan de ${MESES[mes - 1]} ${anio} guardado`);
  }

  return (
    <Card title={`Plan de producción — ${MESES[mes - 1]} ${anio}`} className="mb-4">
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Umbral de aviso por desvío (%)">
            <Input type="number" min={0} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} style={{ width: 100 }} />
          </Field>
          <Button size="sm" variant="ghost" onClick={guardarUmbral}>
            Guardar umbral
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={traerPromedioTodos}>
          Traer promedio (todos)
        </Button>
      </div>

      {productos.length === 0 ? (
        <EmptyState text="Sin productos activos todavía." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Gusto</Th>
                <Th>Cajas/mes</Th>
                <Th>Cajas/semana</Th>
                <Th title="Cajas/semana × 4,33 comparado contra cajas/mes">Aviso</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const fila = filas[p.id] ?? { cajas_mes: 0, cajas_semana: 0 };
                const desvio = desvioPlanSemana(fila.cajas_mes, fila.cajas_semana, umbral);
                return (
                  <TrHover key={p.id}>
                    <Td main>{p.nombre}</Td>
                    <Td>
                      <Input
                        type="number"
                        value={fila.cajas_mes}
                        onChange={(e) => actualizarFila(p.id, { cajas_mes: Number(e.target.value) })}
                        style={{ width: 90 }}
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={fila.cajas_semana}
                        onChange={(e) => actualizarFila(p.id, { cajas_semana: Number(e.target.value) })}
                        style={{ width: 90 }}
                      />
                    </Td>
                    <Td>
                      {desvio.excedeUmbral && (
                        <Badge color="orange">
                          {desvio.desviacionPct !== null ? `${desvio.desviacionPct >= 0 ? "+" : ""}${fPct(desvio.desviacionPct)}` : "revisar"}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => traerPromedio(p.id)}>
                        Traer promedio
                      </Button>
                    </Td>
                  </TrHover>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={guardarPlan}>Guardar plan del mes</Button>
      </div>
    </Card>
  );
}

export function PlanProduccion() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const referencia = useMemo(() => referenciaVentasPorGusto(data), [data]);
  const productosActivos = useMemo(() => data.productos.filter((p) => p.activo), [data.productos]);
  const planesGuardados = useMemo(
    () => data.plan_produccion.filter((p) => p.mes === mes && p.anio === anio),
    [data.plan_produccion, mes, anio]
  );

  return (
    <div>
      <PageHeader title="Planificación" sub="Cuánto ingrediente comprar cada semana o mes, por gusto" />
      <ReferenciaVentas referencia={referencia} />
      <PlanEditable
        key={`${mes}-${anio}`}
        mes={mes}
        anio={anio}
        referencia={referencia}
        productos={productosActivos}
        planesGuardados={planesGuardados}
      />
    </div>
  );
}
