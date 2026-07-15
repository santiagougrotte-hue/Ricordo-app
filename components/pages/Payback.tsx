"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fARS, fPct } from "@/lib/calc";
import { Card, PageHeader, Field, Input, Button, TableWrap, Th, Td, TrHover, EmptyState, InfoRow } from "@/components/ui";

export function Payback() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [nombre, setNombre] = useState("");
  const [inversion, setInversion] = useState(0);
  const [flujo, setFlujo] = useState(0);
  const [tasa, setTasa] = useState(0);

  const paybackMeses = flujo > 0 ? inversion / flujo : 0;
  const retornoMensual = inversion > 0 ? (flujo / inversion) * 100 : 0;
  const diferenciaVsAlternativa = retornoMensual - tasa;

  function guardar() {
    if (!nombre || inversion <= 0 || flujo <= 0) {
      toast("Completá nombre, inversión y flujo mensual", "error");
      return;
    }
    setData((d) => ({
      ...d,
      af_payback_items: [
        ...d.af_payback_items,
        { id: uid("PB"), nombre, inversion, flujo, tasa, fecha: new Date().toISOString().slice(0, 10) },
      ],
    }));
    toast("Análisis de payback guardado");
    setNombre("");
    setInversion(0);
    setFlujo(0);
    setTasa(0);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, af_payback_items: d.af_payback_items.filter((i) => i.id !== id) }));
  }

  return (
    <div>
      <PageHeader title="Payback" sub="Período de recupero de una inversión" />

      <Card title="Nueva inversión" className="mb-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
          <Field label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
          <Field label="Inversión inicial">
            <Input type="number" value={inversion} onChange={(e) => setInversion(Number(e.target.value))} />
          </Field>
          <Field label="Flujo mensual incremental">
            <Input type="number" value={flujo} onChange={(e) => setFlujo(Number(e.target.value))} />
          </Field>
          <Field label="Tasa alternativa mensual %">
            <Input type="number" value={tasa} onChange={(e) => setTasa(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4">
          <InfoRow label="Payback estimado" value={`${paybackMeses.toFixed(1)} meses`} color="gold" />
          <InfoRow label="Retorno mensual" value={fPct(retornoMensual)} />
          <InfoRow
            label="Diferencia vs. alternativa"
            value={fPct(diferenciaVsAlternativa)}
            color={diferenciaVsAlternativa >= 0 ? "green" : "red"}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardar}>Guardar</Button>
        </div>
      </Card>

      <Card title="Inversiones guardadas">
        {data.af_payback_items.length === 0 ? (
          <EmptyState text="Sin inversiones guardadas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Inversión</Th>
                  <Th>Flujo mensual</Th>
                  <Th>Payback</Th>
                  <Th>Tasa alt.</Th>
                  <Th>Fecha</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {data.af_payback_items.map((i) => (
                  <TrHover key={i.id}>
                    <Td main>{i.nombre}</Td>
                    <Td>{fARS(i.inversion)}</Td>
                    <Td>{fARS(i.flujo)}</Td>
                    <Td>{(i.inversion / i.flujo).toFixed(1)} meses</Td>
                    <Td>{fPct(i.tasa)}</Td>
                    <Td>{i.fecha}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => eliminar(i.id)}>
                        Eliminar
                      </Button>
                    </Td>
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
