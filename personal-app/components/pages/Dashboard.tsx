"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { useRouter } from "@/lib/nav-context";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  KpiCard,
  PageHeader,
  StatGrid,
} from "@/components/ui";
import {
  CATEGORIA_EVENTO_COLOR,
  balanceMes,
  eventosDelDia,
  eventosProximos,
  fARS,
  totalEgresosMes,
  totalIngresosMes,
} from "@/lib/calc";
import { todayISO } from "@/lib/date";

function fechaCorta(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  const s = d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Dashboard() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const { go } = useRouter();

  const hoy = todayISO();
  const eventosHoy = eventosDelDia(data, hoy);
  const proximos = eventosProximos(data, 14).filter((e) => e.fecha !== hoy);

  const ingresos = totalIngresosMes(data, mes, anio);
  const egresos = totalEgresosMes(data, mes, anio);
  const balance = balanceMes(data, mes, anio);

  return (
    <div>
      <PageHeader title="Inicio" sub="Tu resumen del día" />

      {eventosHoy.length > 0 && (
        <Alert kind="warning">
          <span>📌</span>
          <span>
            Hoy tenés {eventosHoy.length} {eventosHoy.length === 1 ? "evento" : "eventos"}:{" "}
            {eventosHoy.map((e) => e.titulo).join(", ")}
          </span>
        </Alert>
      )}

      <StatGrid>
        <KpiCard label="Balance del mes" value={fARS(balance)} color={balance >= 0 ? "green" : "red"} />
        <KpiCard label="Ingresos del mes" value={fARS(ingresos)} color="blue" />
        <KpiCard label="Egresos del mes" value={fARS(egresos)} color="orange" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Próximos eventos"
          right={
            <Button size="sm" variant="ghost" onClick={() => go("calendario")}>
              Ver calendario
            </Button>
          }
        >
          {eventosHoy.length === 0 && proximos.length === 0 ? (
            <EmptyState icon="📅" text="No hay eventos en los próximos 14 días." />
          ) : (
            <div className="flex flex-col gap-2">
              {[...eventosHoy, ...proximos].map((e) => (
                <div
                  key={e.id}
                  onClick={() => go("calendario")}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface2 px-3 py-2 hover:border-accent/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-text">{e.titulo}</div>
                    <div className="text-[10.5px] text-text3">
                      {e.fecha === hoy ? "Hoy" : fechaCorta(e.fecha)}
                      {e.hora ? ` · ${e.hora}` : ""}
                    </div>
                  </div>
                  <Badge color={CATEGORIA_EVENTO_COLOR[e.categoria]}>{e.categoria}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Finanzas"
          right={
            <Button size="sm" variant="ghost" onClick={() => go("finanzas")}>
              Ver resumen
            </Button>
          }
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-text3">Balance de este mes</span>
              <span className={`text-lg font-semibold ${balance >= 0 ? "text-green" : "text-red"}`}>
                {fARS(balance)}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-border/50 pt-2.5">
              <span className="text-xs text-text3">Ingresos</span>
              <span className="text-[12.5px] text-text2">{fARS(ingresos)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-text3">Egresos</span>
              <span className="text-[12.5px] text-text2">{fARS(egresos)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
