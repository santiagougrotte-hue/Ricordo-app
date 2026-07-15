"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { calcCosto, fARS, fPct } from "@/lib/calc";
import { Card, PageHeader, Field, Select, Input, Button, InfoRow, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";

function clasificar(e: number) {
  const abs = Math.abs(e);
  if (abs > 1.05) return { label: "Elástica", color: "orange" as const };
  if (abs < 0.95) return { label: "Inelástica", color: "blue" as const };
  return { label: "Unitaria", color: "gold" as const };
}

export function Elasticidad() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [idProducto, setIdProducto] = useState(data.productos[0]?.id ?? "");
  const [p1, setP1] = useState(0);
  const [q1, setQ1] = useState(0);
  const [p2, setP2] = useState(0);
  const [q2, setQ2] = useState(0);
  const [aumentoPct, setAumentoPct] = useState(10);

  const producto = data.productos.find((p) => p.id === idProducto);
  const guardada = idProducto ? data.af_elasticidades[idProducto] : undefined;

  const deltaQ = q1 !== 0 ? (q2 - q1) / q1 : 0;
  const deltaP = p1 !== 0 ? (p2 - p1) / p1 : 0;
  const e = deltaP !== 0 ? deltaQ / deltaP : 0;
  const clasificacion = clasificar(e);

  function guardar() {
    if (!idProducto || p1 === 0 || p2 === 0) {
      toast("Completá P1, Q1, P2 y Q2", "error");
      return;
    }
    setData((d) => ({
      ...d,
      af_elasticidades: { ...d.af_elasticidades, [idProducto]: { p1, q1, p2, q2, e, fecha: new Date().toISOString().slice(0, 10) } },
    }));
    toast("Elasticidad guardada");
  }

  // Pricing tolerance: max tolerable sales drop % to keep contribution unchanged
  const costo = idProducto ? calcCosto(data, idProducto) : 0;
  const precioActual = producto?.precio_venta ?? 0;
  const margenPct = precioActual > 0 ? ((precioActual - costo) / precioActual) * 100 : 0;
  const caidaMaximaTolerable = margenPct + aumentoPct > 0 ? (aumentoPct / (margenPct + aumentoPct)) * 100 : 0;

  return (
    <div>
      <PageHeader title="Elasticidad" sub="Sensibilidad de la demanda al precio" />

      <Card title="Calcular elasticidad" className="mb-4">
        {guardada && (
          <div className="mb-3 text-[11.5px] text-text3">
            Última guardada para este producto: E={guardada.e.toFixed(2)} ({guardada.fecha})
          </div>
        )}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-5">
          <Field label="Producto">
            <Select value={idProducto} onChange={(e) => setIdProducto(e.target.value)}>
              {data.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="P1 (precio inicial)">
            <Input type="number" value={p1} onChange={(e) => setP1(Number(e.target.value))} />
          </Field>
          <Field label="Q1 (cantidad inicial)">
            <Input type="number" value={q1} onChange={(e) => setQ1(Number(e.target.value))} />
          </Field>
          <Field label="P2 (precio nuevo)">
            <Input type="number" value={p2} onChange={(e) => setP2(Number(e.target.value))} />
          </Field>
          <Field label="Q2 (cantidad nueva)">
            <Input type="number" value={q2} onChange={(e) => setQ2(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <InfoRow label="Elasticidad (E)" value={e.toFixed(2)} />
          <Badge color={clasificacion.color}>{clasificacion.label}</Badge>
          <Button onClick={guardar} className="ml-auto">
            Guardar para {producto?.nombre}
          </Button>
        </div>
      </Card>

      <Card title="Pricing — caída de ventas tolerable" className="mb-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="% de aumento de precio propuesto">
            <Input type="number" value={aumentoPct} onChange={(e) => setAumentoPct(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4">
          <InfoRow label="Margen actual" value={fPct(margenPct)} />
          <InfoRow label="Caída máxima tolerable de ventas" value={fPct(caidaMaximaTolerable)} color="orange" />
        </div>
      </Card>

      <Card title="Elasticidades guardadas">
        {Object.keys(data.af_elasticidades).length === 0 ? (
          <EmptyState text="Sin elasticidades guardadas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>P1 → P2</Th>
                  <Th>Q1 → Q2</Th>
                  <Th>E</Th>
                  <Th>Clasificación</Th>
                  <Th>Fecha</Th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.af_elasticidades).map(([id, el]) => {
                  const prod = data.productos.find((p) => p.id === id);
                  const c = clasificar(el.e);
                  return (
                    <TrHover key={id}>
                      <Td main>{prod?.nombre ?? id}</Td>
                      <Td>
                        {fARS(el.p1)} → {fARS(el.p2)}
                      </Td>
                      <Td>
                        {el.q1} → {el.q2}
                      </Td>
                      <Td>{el.e.toFixed(2)}</Td>
                      <Td>
                        <Badge color={c.color}>{c.label}</Badge>
                      </Td>
                      <Td>{el.fecha}</Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
