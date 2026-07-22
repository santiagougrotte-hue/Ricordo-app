"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { Modal } from "@/components/Modal";
import {
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  KpiCard,
  PageHeader,
  StatGrid,
  Td,
  Th,
  TableWrap,
  Textarea,
  TrHover,
} from "@/components/ui";
import type { CostoFijo } from "@/lib/types";
import { costoFijoPorHora, fMoney } from "@/lib/calc";
import { useRouter } from "@/lib/nav-context";

function emptyForm(): CostoFijo {
  return { id: "", nombre: "", montoMensual: 0, observaciones: "" };
}

export function CostosFijos() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const { go } = useRouter();
  const [form, setForm] = useState<CostoFijo | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const lista = [...data.costosFijos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const totalMensual = lista.reduce((acc, c) => acc + c.montoMensual, 0);
  const porHora = costoFijoPorHora(data);

  function openForm(c?: CostoFijo) {
    if (c) {
      setEditingId(c.id);
      setForm({ ...c });
    } else {
      setEditingId(null);
      setForm(emptyForm());
    }
  }

  function save() {
    if (!form) return;
    if (!form.nombre.trim()) {
      toast("Ingresá el nombre del costo fijo.", "error");
      return;
    }
    const payload: CostoFijo = { ...form, id: editingId ?? uid("cf") };
    setData((d) => ({
      ...d,
      costosFijos: editingId ? d.costosFijos.map((c) => (c.id === editingId ? payload : c)) : [...d.costosFijos, payload],
    }));
    toast(editingId ? "Costo fijo actualizado." : "Costo fijo creado.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, costosFijos: d.costosFijos.filter((c) => c.id !== id) }));
    toast("Costo fijo eliminado.", "info");
    setForm(null);
    setEditingId(null);
  }

  return (
    <div>
      <PageHeader
        title="Costos fijos"
        sub="Gastos recurrentes del estudio (suscripciones, alquiler, impuestos…) — se prorratean automáticamente entre los presupuestos según las horas de cada uno"
        right={<Button onClick={() => openForm()}>+ Nuevo costo fijo</Button>}
      />

      <StatGrid>
        <KpiCard label="Total mensual" value={fMoney(totalMensual)} color="orange" />
        <KpiCard label="Horas mensuales del estudio" value={data.config.horasMensualesEstudio} sub={<button className="text-accent hover:underline" onClick={() => go("configuracion")}>Editar en Configuración</button>} />
        <KpiCard label="Costo fijo por hora" value={fMoney(porHora)} color="accent" sub="Se suma al costo de cada presupuesto según sus horas" />
      </StatGrid>

      <Card>
        {lista.length === 0 ? (
          <EmptyState icon="▥" text="No hay costos fijos cargados." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Monto mensual</Th>
                  <Th>Observaciones</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{c.nombre}</Td>
                    <Td>{fMoney(c.montoMensual)}</Td>
                    <Td>{c.observaciones || "—"}</Td>
                    <Td>
                      <button onClick={() => openForm(c)} className="text-text3 hover:text-accent">
                        Editar
                      </button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? "Editar costo fijo" : "Nuevo costo fijo"}
        footer={
          <>
            {editingId && (
              <Button variant="danger" onClick={() => eliminar(editingId)}>
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </>
        }
      >
        {form && (
          <div className="flex flex-col gap-4">
            <FormGrid>
              <Field label="Nombre" full>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Adobe, Alquiler, Monotributo…" autoFocus />
              </Field>
              <Field label="Monto mensual">
                <Input type="number" min={0} value={form.montoMensual || ""} onChange={(e) => setForm({ ...form, montoMensual: Number(e.target.value) })} />
              </Field>
            </FormGrid>
            <Field label="Observaciones">
              <Textarea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
