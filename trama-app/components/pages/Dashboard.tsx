"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { usePeriod, MESES } from "@/lib/period";
import { useRouter } from "@/lib/nav-context";
import {
  Alert,
  Badge,
  BarRow,
  Button,
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  StatGrid,
} from "@/components/ui";
import {
  calcularAlertas,
  evolucionFacturacion,
  fARS,
  fPct,
  gastosPorCategoria,
  mesAnterior,
  movimientoEnARS,
  rentabilidadPorCliente,
  resumenMes,
} from "@/lib/calc";
import { ESTADOS_PRESUPUESTO } from "@/lib/types";

function deltaPct(actual: number, previo: number): number | null {
  if (previo === 0) return null;
  return ((actual - previo) / Math.abs(previo)) * 100;
}

function DeltaSub({ actual, previo }: { actual: number; previo: number }) {
  const d = deltaPct(actual, previo);
  if (d === null) return <span>vs. mes anterior: sin datos</span>;
  const up = d >= 0;
  return (
    <span className={up ? "text-green" : "text-red"}>
      {up ? "▲" : "▼"} {fPct(Math.abs(d))} vs. mes anterior
    </span>
  );
}

function Trend({ data }: { data: ReturnType<typeof evolucionFacturacion> }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.facturacion, d.gastos, Math.abs(d.gananciaNeta)]));
  return (
    <div className="flex items-end justify-between gap-2 px-1 pt-2" style={{ height: 160 }}>
      {data.map((d) => (
        <div key={`${d.mes}-${d.anio}`} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-[120px] w-full items-end justify-center gap-[3px]">
            <div
              className="w-2 rounded-t bg-blue"
              style={{ height: `${Math.max(2, (d.facturacion / max) * 120)}px` }}
              title={`Facturación: ${fARS(d.facturacion)}`}
            />
            <div
              className="w-2 rounded-t bg-orange"
              style={{ height: `${Math.max(2, (d.gastos / max) * 120)}px` }}
              title={`Gastos: ${fARS(d.gastos)}`}
            />
            <div
              className={`w-2 rounded-t ${d.gananciaNeta >= 0 ? "bg-green" : "bg-red"}`}
              style={{ height: `${Math.max(2, (Math.abs(d.gananciaNeta) / max) * 120)}px` }}
              title={`Ganancia neta: ${fARS(d.gananciaNeta)}`}
            />
          </div>
          <div className="text-[10px] capitalize text-text3">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const { go } = useRouter();

  const resumen = resumenMes(data, mes, anio);
  const prev = mesAnterior(mes, anio);
  const resumenPrev = resumenMes(data, prev.mes, prev.anio);

  const clientesActivos = data.clientes.filter((c) => c.estado === "activo").length;
  const presEnviados = data.presupuestos.filter((p) => ["enviado", "visto", "negociacion"].includes(p.estado)).length;
  const presAprobados = data.presupuestos.filter((p) => p.estado === "aprobado").length;
  const presPendientes = data.presupuestos.filter((p) =>
    ["borrador", "revision", "enviado", "visto", "negociacion"].includes(p.estado)
  ).length;

  const alertas = calcularAlertas(data, data.config).slice(0, 3);
  const trend = evolucionFacturacion(data, 6);
  const porCategoria = gastosPorCategoria(data, mes, anio).slice(0, 6);
  const maxCategoria = Math.max(1, ...porCategoria.map((c) => c.monto));
  const rentabilidad = rentabilidadPorCliente(data, mes, anio).slice(0, 5);
  const maxRentabilidad = Math.max(1, ...rentabilidad.map((r) => Math.abs(r.ganancia)));

  const vencimientos = data.movimientos
    .filter((m) => m.estado === "pendiente")
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 6);

  return (
    <div>
      <PageHeader title="Inicio" sub={`${MESES[mes - 1]} ${anio} · Panorama general de TRAMA Studio`} />

      {alertas.length > 0 && (
        <div className="mb-1">
          {alertas.map((a) => (
            <Alert key={a.id} kind={a.kind}>
              {a.texto}
            </Alert>
          ))}
        </div>
      )}

      <StatGrid>
        <KpiCard label="Facturación del mes" value={fARS(resumen.facturacion)} color="blue" sub={<DeltaSub actual={resumen.facturacion} previo={resumenPrev.facturacion} />} />
        <KpiCard label="Cobrado" value={fARS(resumen.cobrado)} color="green" />
        <KpiCard label="Pendiente de cobro" value={fARS(resumen.pendienteCobro)} color="orange" />
        <KpiCard label="Gastos totales" value={fARS(resumen.gastos)} color="orange" />
        <KpiCard label="Sueldos y colaboradoras" value={fARS(resumen.sueldos)} color="purple" />
        <KpiCard label="Ganancia bruta" value={fARS(resumen.gananciaBruta)} color={resumen.gananciaBruta >= 0 ? "green" : "red"} />
        <KpiCard label="Ganancia neta" value={fARS(resumen.gananciaNeta)} color={resumen.gananciaNeta >= 0 ? "green" : "red"} />
        <KpiCard label="Margen de ganancia" value={fPct(resumen.margenGanancia, 1)} color={resumen.margenGanancia >= 0 ? "green" : "red"} />
        <KpiCard label="Mi sueldo (directora)" value={fARS(resumen.sueldoDirectora)} color="accent" />
        <KpiCard label="Disponible p/ reinversión" value={fARS(resumen.reinversionDisponible)} color="accent" />
        <KpiCard label="Clientes activos" value={clientesActivos} />
        <KpiCard label="Presupuestos enviados" value={presEnviados} color="blue" />
        <KpiCard label="Presupuestos aprobados" value={presAprobados} color="green" />
        <KpiCard label="Presupuestos pendientes" value={presPendientes} color="orange" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Evolución de la facturación (6 meses)">
          <Trend data={trend} />
          <div className="mt-2 flex justify-center gap-4 text-[10.5px] text-text3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue" /> Facturación</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange" /> Gastos</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green" /> Ganancia neta</span>
          </div>
        </Card>

        <Card
          title="Próximos vencimientos"
          right={
            <Button size="sm" variant="ghost" onClick={() => go("finanzas")}>
              Ver finanzas
            </Button>
          }
        >
          {vencimientos.length === 0 ? (
            <EmptyState icon="✓" text="No hay pagos ni cobros pendientes." />
          ) : (
            <div className="flex flex-col gap-2">
              {vencimientos.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-text">{m.descripcion}</div>
                    <div className="text-[10.5px] text-text3">{m.fecha}</div>
                  </div>
                  <div className="text-right text-[12.5px] font-medium text-text2">{fARS(movimientoEnARS(m))}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Gastos por categoría (mes)">
          {porCategoria.length === 0 ? (
            <EmptyState text="Sin gastos registrados este mes." />
          ) : (
            <div className="flex flex-col gap-2">
              {porCategoria.map((c) => (
                <BarRow key={c.categoria} label={c.categoria} value={fARS(c.monto)} pct={(c.monto / maxCategoria) * 100} color="orange" />
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Rentabilidad por cliente (mes)"
          right={
            <Button size="sm" variant="ghost" onClick={() => go("reportes")}>
              Ver reportes
            </Button>
          }
        >
          {rentabilidad.length === 0 ? (
            <EmptyState text="Sin movimientos suficientes para calcular rentabilidad." />
          ) : (
            <div className="flex flex-col gap-2">
              {rentabilidad.map((r) => (
                <BarRow
                  key={r.cliente.id}
                  label={r.cliente.marca}
                  value={fARS(r.ganancia)}
                  pct={(Math.abs(r.ganancia) / maxRentabilidad) * 100}
                  color={r.ganancia >= 0 ? "green" : "red"}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px] text-text3">
        {ESTADOS_PRESUPUESTO.map((e) => (
          <Badge key={e.value} color="accent">
            {e.label}: {data.presupuestos.filter((p) => p.estado === e.value).length}
          </Badge>
        ))}
      </div>
    </div>
  );
}
