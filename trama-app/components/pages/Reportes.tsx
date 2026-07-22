"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod, MESES } from "@/lib/period";
import {
  Alert,
  BarRow,
  Card,
  EmptyState,
  Field,
  Input,
  KpiCard,
  PageHeader,
  StatGrid,
  Td,
  Th,
  TableWrap,
  TrHover,
} from "@/components/ui";
import {
  calcularAlertas,
  calcularPuntoEquilibrio,
  fARS,
  fPct,
  gastosMes,
  rentabilidadPorCliente,
  resumenMes,
} from "@/lib/calc";
import type { AppData, Servicio } from "@/lib/types";

function serviciosPorParticipacion(servicios: Servicio[]) {
  return servicios
    .filter((s) => s.participacionPct > 0)
    .map((s) => ({ servicio: s, participacionPct: s.participacionPct }))
    .sort((a, b) => b.participacionPct - a.participacionPct);
}

function horasPorServicio(data: AppData) {
  const map = new Map<string, number>();
  for (const p of data.presupuestos) {
    for (const it of p.items) {
      const s = it.servicioId ? data.servicios.find((sv) => sv.id === it.servicioId) : null;
      if (!s) continue;
      map.set(s.id, (map.get(s.id) ?? 0) + it.cantidad * s.horasEstimadas);
    }
  }
  return Array.from(map.entries())
    .map(([id, horas]) => ({ servicio: data.servicios.find((s) => s.id === id)!, horas }))
    .filter((x) => x.servicio)
    .sort((a, b) => b.horas - a.horas);
}

export function Reportes() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const [objetivoGanancia, setObjetivoGanancia] = useState(String(data.config.sueldoObjetivoDirectora || 0));

  const resumen = resumenMes(data, mes, anio);
  const rentabilidad = useMemo(() => rentabilidadPorCliente(data, mes, anio), [data, mes, anio]);
  const masRentable = rentabilidad[0];
  const menosRentable = rentabilidad[rentabilidad.length - 1];

  const porParticipacion = useMemo(() => serviciosPorParticipacion(data.servicios), [data.servicios]);
  const servicioMasRentable = porParticipacion[0];
  const porHoras = useMemo(() => horasPorServicio(data), [data]);

  const ingresoPromedio =
    rentabilidad.length > 0 ? rentabilidad.reduce((a, r) => a + r.ingresos, 0) / rentabilidad.length : 0;

  const gastoPromedio = useMemo(() => {
    const now = new Date();
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      total += gastosMes(data, d.getMonth() + 1, d.getFullYear());
    }
    return total / 3;
  }, [data]);

  const pe = calcularPuntoEquilibrio(data);
  const facturacionObjetivo = pe.facturacionParaGanancia(Number(objetivoGanancia) || 0);

  const alertas = calcularAlertas(data, data.config);

  const maxRent = Math.max(1, ...rentabilidad.map((r) => Math.abs(r.ganancia)));
  const maxHoras = Math.max(1, ...porHoras.map((h) => h.horas));

  return (
    <div>
      <PageHeader title="Reportes de rentabilidad" sub={`${MESES[mes - 1]} ${anio}`} />

      <StatGrid>
        <KpiCard label="Cliente más rentable" value={masRentable ? masRentable.cliente.marca : "—"} color="green" sub={masRentable ? fARS(masRentable.ganancia) : undefined} />
        <KpiCard label="Cliente menos rentable" value={menosRentable ? menosRentable.cliente.marca : "—"} color={menosRentable && menosRentable.ganancia < 0 ? "red" : "orange"} sub={menosRentable ? fARS(menosRentable.ganancia) : undefined} />
        <KpiCard label="Servicio con mayor participación" value={servicioMasRentable ? servicioMasRentable.servicio.nombre : "—"} color="accent" sub={servicioMasRentable ? fPct(servicioMasRentable.participacionPct, 0) : undefined} />
        <KpiCard label="Servicio que más horas consume" value={porHoras[0] ? porHoras[0].servicio.nombre : "—"} sub={porHoras[0] ? `${porHoras[0].horas.toFixed(0)} hs` : undefined} />
        <KpiCard label="Margen bruto" value={fPct(resumen.cobrado > 0 ? (resumen.gananciaBruta / resumen.cobrado) * 100 : 0, 1)} />
        <KpiCard label="Margen neto" value={fPct(resumen.margenGanancia, 1)} color={resumen.margenGanancia >= 0 ? "green" : "red"} />
        <KpiCard label="Ingreso promedio por cliente" value={fARS(ingresoPromedio)} />
        <KpiCard label="Gasto promedio mensual" value={fARS(gastoPromedio)} color="orange" />
      </StatGrid>

      {alertas.length > 0 && (
        <Card title="Alertas" className="mb-4">
          <div className="flex flex-col gap-2">
            {alertas.map((a) => (
              <Alert key={a.id} kind={a.kind}>{a.texto}</Alert>
            ))}
          </div>
        </Card>
      )}

      <Card title="Punto de equilibrio y proyección" className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Costos fijos mensuales (prom.)" value={fARS(pe.costosFijosMensuales)} />
          <KpiCard label="Facturación para cubrir costos" value={fARS(pe.facturacionNecesariaCubrirCostos)} color="orange" />
          <KpiCard label="Facturación para la ganancia objetivo" value={fARS(facturacionObjetivo)} color="accent" />
        </div>
        <div className="mt-3">
          <Field label="Ganancia objetivo mensual">
            <Input type="number" min={0} value={objetivoGanancia} onChange={(e) => setObjetivoGanancia(e.target.value)} style={{ maxWidth: 220 }} />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-text3">
          Estimación basada en el promedio de gastos y sueldos de los últimos 3 meses, más los sueldos fijos actuales del equipo.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Rentabilidad por cliente (mes)">
          {rentabilidad.length === 0 ? (
            <EmptyState text="Sin datos suficientes." />
          ) : (
            <div className="flex flex-col gap-2">
              {rentabilidad.map((r) => (
                <BarRow key={r.cliente.id} label={r.cliente.marca} value={fARS(r.ganancia)} pct={(Math.abs(r.ganancia) / maxRent) * 100} color={r.ganancia >= 0 ? "green" : "red"} />
              ))}
            </div>
          )}
        </Card>
        <Card title="Horas consumidas por servicio (histórico presupuestado)">
          {porHoras.length === 0 ? (
            <EmptyState text="Sin datos suficientes." />
          ) : (
            <div className="flex flex-col gap-2">
              {porHoras.slice(0, 8).map((h) => (
                <BarRow key={h.servicio.id} label={h.servicio.nombre} value={`${h.horas.toFixed(0)} hs`} pct={(h.horas / maxHoras) * 100} color="blue" />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Detalle: costo y ganancia real por cliente" className="mt-4">
        {rentabilidad.length === 0 ? (
          <EmptyState text="Sin movimientos suficientes para este período." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Ingresos</Th>
                  <Th>Costos</Th>
                  <Th>Ganancia</Th>
                  <Th>Margen</Th>
                </tr>
              </thead>
              <tbody>
                {rentabilidad.map((r) => (
                  <TrHover key={r.cliente.id}>
                    <Td main>{r.cliente.marca}</Td>
                    <Td>{fARS(r.ingresos)}</Td>
                    <Td>{fARS(r.gastos)}</Td>
                    <Td className={r.ganancia >= 0 ? "text-green" : "text-red"}>{fARS(r.ganancia)}</Td>
                    <Td>{fPct(r.margen, 1)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
