"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { Badge, Button, Card, EmptyState, InfoRow, PageHeader } from "@/components/ui";
import { fMoney, fPct, revisionClientes, todayISO } from "@/lib/calc";

export function RevisionClientes() {
  const { data, setData } = useStore();
  const { toast } = useToast();

  const lista = revisionClientes(data);

  function marcarActualizado(clienteId: string, nuevoAbono?: number) {
    setData((d) => ({
      ...d,
      clientes: d.clientes.map((c) =>
        c.id === clienteId
          ? { ...c, fechaUltimoAumento: todayISO(), abonoMensual: nuevoAbono != null ? Math.round(nuevoAbono) : c.abonoMensual }
          : c
      ),
    }));
    toast(nuevoAbono != null ? "Abono actualizado y marcado al día." : "Cliente marcado como actualizado hoy.");
  }

  return (
    <div>
      <PageHeader
        title="Revisión de clientes"
        sub="Sugerencia automática de aumento según inflación acumulada y tiempo sin actualizar el abono"
      />

      <Card>
        {lista.length === 0 ? (
          <EmptyState icon="↻" text="No hay clientes activos con abono mensual para revisar." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((r) => (
              <div
                key={r.cliente.id}
                className={`rounded-[10px] border p-4 ${r.convieneActualizar ? "border-orange/30 bg-orange-dim" : "border-border bg-surface"}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-display text-[14px] font-semibold text-text">{r.cliente.marca}</div>
                  <Badge color={r.convieneActualizar ? "orange" : "green"}>
                    {r.convieneActualizar ? "Conviene actualizar" : "Al día"}
                  </Badge>
                </div>
                <InfoRow label="Abono actual" value={fMoney(r.cliente.abonoMensual, r.cliente.moneda)} />
                <InfoRow label="Último aumento" value={r.mesesSinAumento === 0 ? "Este mes" : `Hace ${r.mesesSinAumento} ${r.mesesSinAumento === 1 ? "mes" : "meses"}`} />
                <InfoRow label="Inflación acumulada" value={fPct(r.inflacionAcumulada, 0)} />
                <InfoRow label="Aumento sugerido" value={fPct(r.aumentoSugerido, 0)} color="orange" />
                <InfoRow label="Nuevo abono recomendado" value={fMoney(r.nuevoAbonoRecomendado, r.cliente.moneda)} color="accent" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => marcarActualizado(r.cliente.id, r.nuevoAbonoRecomendado)}>
                    Aplicar y marcar al día
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => marcarActualizado(r.cliente.id)}>
                    Solo marcar al día
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="mt-3 text-[11px] text-text3">
        El aumento sugerido se calcula con la inflación anual estimada configurada en Configuración, repartida por los
        meses transcurridos desde el último aumento (o desde el inicio del cliente, si nunca se registró uno).
      </p>
    </div>
  );
}
