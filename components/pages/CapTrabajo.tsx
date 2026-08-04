"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { fARS, saldoCaja, valorStockIngredientes } from "@/lib/calc";
import { Card, PageHeader, StatGrid, KpiCard, Field, Input, Button, TableWrap, Th, Td, TrHover, EmptyState, InfoRow, Semaforo } from "@/components/ui";

export function CapTrabajo() {
  const { data, setData } = useStore();
  const [nombreAC, setNombreAC] = useState("");
  const [montoAC, setMontoAC] = useState(0);
  const [nombrePC, setNombrePC] = useState("");
  const [montoPC, setMontoPC] = useState(0);

  const caja = saldoCaja(data);
  const efectivo = data.efectivo_en_mano;
  const stockIngredientes = valorStockIngredientes(data);
  const acExtra = data.af_cap_trabajo.ac_extra.reduce((a, i) => a + i.monto, 0);
  const pcItems = data.af_cap_trabajo.pc_items.reduce((a, i) => a + i.monto, 0);

  const activoCorriente = caja + efectivo + stockIngredientes + acExtra;
  const pasivoCorriente = pcItems;
  const capitalTrabajo = activoCorriente - pasivoCorriente;
  const ratio = pasivoCorriente > 0 ? activoCorriente / pasivoCorriente : activoCorriente > 0 ? Infinity : 0;

  const nivelSemaforo = ratio >= 1.5 || pasivoCorriente === 0 ? "green" : ratio >= 1 ? "orange" : "red";

  function addAC() {
    if (!nombreAC || montoAC <= 0) return;
    setData((d) => ({ ...d, af_cap_trabajo: { ...d.af_cap_trabajo, ac_extra: [...d.af_cap_trabajo.ac_extra, { nombre: nombreAC, monto: montoAC }] } }));
    setNombreAC("");
    setMontoAC(0);
  }
  function addPC() {
    if (!nombrePC || montoPC <= 0) return;
    setData((d) => ({ ...d, af_cap_trabajo: { ...d.af_cap_trabajo, pc_items: [...d.af_cap_trabajo.pc_items, { nombre: nombrePC, monto: montoPC }] } }));
    setNombrePC("");
    setMontoPC(0);
  }
  function removeAC(idx: number) {
    setData((d) => ({ ...d, af_cap_trabajo: { ...d.af_cap_trabajo, ac_extra: d.af_cap_trabajo.ac_extra.filter((_, i) => i !== idx) } }));
  }
  function removePC(idx: number) {
    setData((d) => ({ ...d, af_cap_trabajo: { ...d.af_cap_trabajo, pc_items: d.af_cap_trabajo.pc_items.filter((_, i) => i !== idx) } }));
  }

  return (
    <div>
      <PageHeader title="Capital de Trabajo" sub="Activo corriente − Pasivo corriente" />

      <StatGrid>
        <KpiCard label="Activo corriente" value={fARS(activoCorriente)} color="blue" />
        <KpiCard label="Pasivo corriente" value={fARS(pasivoCorriente)} color="red" />
        <KpiCard label="Capital de trabajo" value={fARS(capitalTrabajo)} color={capitalTrabajo >= 0 ? "green" : "red"} />
        <KpiCard
          label="Semáforo"
          value={<Semaforo nivel={nivelSemaforo} />}
          sub={`Ratio ${ratio === Infinity ? "∞" : ratio.toFixed(2)}`}
        />
      </StatGrid>

      <Card title="Detalle Activo Corriente" className="mb-4">
        <InfoRow label="Caja (sistema)" value={fARS(caja)} />
        <InfoRow label="Efectivo en mano" value={fARS(efectivo)} />
        <InfoRow label="Valor stock ingredientes" value={fARS(stockIngredientes)} />
        <InfoRow label="Ítems manuales" value={fARS(acExtra)} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Activo corriente — ítems manuales">
          <div className="mb-3 flex items-end gap-2">
            <Field label="Nombre">
              <Input value={nombreAC} onChange={(e) => setNombreAC(e.target.value)} />
            </Field>
            <Field label="Monto">
              <Input type="number" value={montoAC} onChange={(e) => setMontoAC(Number(e.target.value))} />
            </Field>
            <Button onClick={addAC}>+ Agregar</Button>
          </div>
          {data.af_cap_trabajo.ac_extra.length === 0 ? (
            <EmptyState text="Sin ítems." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Nombre</Th>
                    <Th>Monto</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {data.af_cap_trabajo.ac_extra.map((i, idx) => (
                    <TrHover key={idx}>
                      <Td main>{i.nombre}</Td>
                      <Td>{fARS(i.monto)}</Td>
                      <Td>
                        <Button size="sm" variant="danger" onClick={() => removeAC(idx)}>
                          Quitar
                        </Button>
                      </Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="Pasivo corriente — ítems manuales">
          <div className="mb-3 flex items-end gap-2">
            <Field label="Nombre">
              <Input value={nombrePC} onChange={(e) => setNombrePC(e.target.value)} />
            </Field>
            <Field label="Monto">
              <Input type="number" value={montoPC} onChange={(e) => setMontoPC(Number(e.target.value))} />
            </Field>
            <Button onClick={addPC}>+ Agregar</Button>
          </div>
          {data.af_cap_trabajo.pc_items.length === 0 ? (
            <EmptyState text="Sin ítems." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Nombre</Th>
                    <Th>Monto</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {data.af_cap_trabajo.pc_items.map((i, idx) => (
                    <TrHover key={idx}>
                      <Td main>{i.nombre}</Td>
                      <Td>{fARS(i.monto)}</Td>
                      <Td>
                        <Button size="sm" variant="danger" onClick={() => removePC(idx)}>
                          Quitar
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
    </div>
  );
}
