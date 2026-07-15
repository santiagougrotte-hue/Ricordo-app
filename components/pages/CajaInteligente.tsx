"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fARS } from "@/lib/calc";
import {
  PageHeader,
  Card,
  StatGrid,
  KpiCard,
  Field,
  Input,
  Button,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
} from "@/components/ui";

export function CajaInteligente() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const ci = data.caja_inteligente;
  const [pctReinversion, setPctReinversion] = useState(ci.porcentaje_reinversion);
  const [pctSeguridad, setPctSeguridad] = useState(ci.porcentaje_seguridad);
  const [usoConcepto, setUsoConcepto] = useState("");
  const [usoMonto, setUsoMonto] = useState(0);

  const totalIngresos = data.caja_movimientos.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
  const fondoReinversion = totalIngresos * (pctReinversion / 100);
  const fondoSeguridad = totalIngresos * (pctSeguridad / 100);
  const usadoReinversion = ci.usos_reinversion.reduce((a, u) => a + u.monto, 0);
  const usadoSeguridad = ci.usos_seguridad.reduce((a, u) => a + u.monto, 0);
  const disponibleReinversion = fondoReinversion - usadoReinversion;
  const disponibleSeguridad = fondoSeguridad - usadoSeguridad;

  function guardarPorcentajes() {
    setData((d) => ({
      ...d,
      caja_inteligente: { ...d.caja_inteligente, porcentaje_reinversion: pctReinversion, porcentaje_seguridad: pctSeguridad },
    }));
    toast("Porcentajes guardados");
  }

  function registrarUso(fondo: "reinversion" | "seguridad") {
    if (!usoConcepto || usoMonto <= 0) {
      toast("Completá concepto y monto", "error");
      return;
    }
    const uso = { id: uid("USO"), fecha: new Date().toISOString().slice(0, 10), concepto: usoConcepto, monto: usoMonto };
    setData((d) => ({
      ...d,
      caja_inteligente: {
        ...d.caja_inteligente,
        usos_reinversion: fondo === "reinversion" ? [...d.caja_inteligente.usos_reinversion, uso] : d.caja_inteligente.usos_reinversion,
        usos_seguridad: fondo === "seguridad" ? [...d.caja_inteligente.usos_seguridad, uso] : d.caja_inteligente.usos_seguridad,
      },
    }));
    setUsoConcepto("");
    setUsoMonto(0);
    toast("Uso registrado");
  }

  return (
    <div>
      <PageHeader title="Caja Inteligente" sub="Distribución de ingresos entre reinversión y seguridad" />

      <StatGrid>
        <KpiCard label="Ingresos totales" value={fARS(totalIngresos)} color="gold" />
        <KpiCard label="Fondo reinversión" value={fARS(disponibleReinversion)} sub={`de ${fARS(fondoReinversion)}`} color="blue" />
        <KpiCard label="Fondo seguridad" value={fARS(disponibleSeguridad)} sub={`de ${fARS(fondoSeguridad)}`} color="purple" />
      </StatGrid>

      <Card title="Configuración de porcentajes" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="% Reinversión">
            <Input type="number" value={pctReinversion} onChange={(e) => setPctReinversion(Number(e.target.value))} />
          </Field>
          <Field label="% Seguridad">
            <Input type="number" value={pctSeguridad} onChange={(e) => setPctSeguridad(Number(e.target.value))} />
          </Field>
          <Button onClick={guardarPorcentajes}>Guardar</Button>
        </div>
      </Card>

      <Card title="Registrar uso de fondo" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Concepto">
            <Input value={usoConcepto} onChange={(e) => setUsoConcepto(e.target.value)} />
          </Field>
          <Field label="Monto">
            <Input type="number" value={usoMonto} onChange={(e) => setUsoMonto(Number(e.target.value))} />
          </Field>
          <Button variant="green" onClick={() => registrarUso("reinversion")}>
            + Usar de Reinversión
          </Button>
          <Button variant="ghost" onClick={() => registrarUso("seguridad")}>
            + Usar de Seguridad
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Usos — Reinversión">
          {ci.usos_reinversion.length === 0 ? (
            <EmptyState text="Sin usos registrados." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Concepto</Th>
                    <Th>Monto</Th>
                  </tr>
                </thead>
                <tbody>
                  {ci.usos_reinversion.map((u) => (
                    <TrHover key={u.id}>
                      <Td>{u.fecha}</Td>
                      <Td main>{u.concepto}</Td>
                      <Td>{fARS(u.monto)}</Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
        <Card title="Usos — Seguridad">
          {ci.usos_seguridad.length === 0 ? (
            <EmptyState text="Sin usos registrados." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Concepto</Th>
                    <Th>Monto</Th>
                  </tr>
                </thead>
                <tbody>
                  {ci.usos_seguridad.map((u) => (
                    <TrHover key={u.id}>
                      <Td>{u.fecha}</Td>
                      <Td main>{u.concepto}</Td>
                      <Td>{fARS(u.monto)}</Td>
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
