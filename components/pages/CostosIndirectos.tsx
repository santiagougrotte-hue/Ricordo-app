"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { usePeriod } from "@/lib/period";
import { fARS } from "@/lib/calc";
import {
  PageHeader,
  Button,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  FormGrid,
  Field,
  Input,
  StatGrid,
  KpiCard,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { CostoIndirecto } from "@/lib/types";

function emptyForm(mes: number, anio: number) {
  return { descripcion: "", monto: 0, categoria: "General", mes, anio };
}

export function CostosIndirectos() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(mes, anio));

  const delPeriodo = useMemo(
    () => data.costos_indirectos.filter((c) => c.mes === mes && c.anio === anio),
    [data.costos_indirectos, mes, anio]
  );
  const total = delPeriodo.reduce((a, c) => a + c.monto, 0);

  function openNew() {
    setEditing(null);
    setForm(emptyForm(mes, anio));
    setModalOpen(true);
  }
  function openEdit(c: CostoIndirecto) {
    setEditing(c.id);
    setForm({ descripcion: c.descripcion, monto: c.monto, categoria: c.categoria, mes: c.mes, anio: c.anio });
    setModalOpen(true);
  }
  function save() {
    if (!form.descripcion) {
      toast("Ingresá una descripción", "error");
      return;
    }
    if (editing) {
      setData((d) => ({ ...d, costos_indirectos: d.costos_indirectos.map((c) => (c.id === editing ? { ...c, ...form } : c)) }));
      toast("Costo actualizado");
    } else {
      setData((d) => ({ ...d, costos_indirectos: [...d.costos_indirectos, { id: uid("IND"), ...form }] }));
      toast("Costo creado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    setData((d) => ({ ...d, costos_indirectos: d.costos_indirectos.filter((c) => c.id !== id) }));
    toast("Costo eliminado", "info");
  }

  return (
    <div>
      <PageHeader title="Costos Indirectos" sub="Costos del período (usados en EERR y punto de equilibrio)" right={<Button onClick={openNew}>+ Nuevo</Button>} />

      <StatGrid>
        <KpiCard label="Total del período" value={fARS(total)} color="orange" />
        <KpiCard label="Conceptos" value={delPeriodo.length} color="blue" />
      </StatGrid>

      <Card>
        {delPeriodo.length === 0 ? (
          <EmptyState text="Sin costos indirectos en este período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Monto</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {delPeriodo.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{c.descripcion}</Td>
                    <Td>{c.categoria}</Td>
                    <Td>{fARS(c.monto)}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(c.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar Costo Indirecto" : "Nuevo Costo Indirecto"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Descripción" full>
            <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          </Field>
          <Field label="Monto">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Mes">
            <Input type="number" min={1} max={12} value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })} />
          </Field>
          <Field label="Año">
            <Input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
