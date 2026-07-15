"use client";

import React, { useState } from "react";
import { useEntityCrud } from "@/lib/useEntity";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
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
  Select,
  Badge,
  StatGrid,
  KpiCard,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { CostoFijo } from "@/lib/types";

function emptyForm() {
  return { descripcion: "", monto: 0, categoria: "General", activo: true };
}

export function CostosFijos() {
  const { items, add, update, remove } = useEntityCrud<CostoFijo>("costos_fijos");
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const totalActivos = items.filter((c) => c.activo).reduce((a, c) => a + c.monto, 0);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(c: CostoFijo) {
    setEditing(c.id);
    setForm({ descripcion: c.descripcion, monto: c.monto, categoria: c.categoria, activo: c.activo });
    setModalOpen(true);
  }
  function save() {
    if (!form.descripcion) {
      toast("Ingresá una descripción", "error");
      return;
    }
    if (editing) update(editing, form);
    else add({ id: uid("CF"), ...form });
    toast(editing ? "Costo actualizado" : "Costo creado");
    setModalOpen(false);
  }

  return (
    <div>
      <PageHeader title="Costos Fijos" sub="Costos recurrentes mensuales" right={<Button onClick={openNew}>+ Nuevo</Button>} />

      <StatGrid>
        <KpiCard label="Total mensual (activos)" value={fARS(totalActivos)} color="gold" />
        <KpiCard label="Cantidad de conceptos" value={items.length} color="blue" />
      </StatGrid>

      <Card>
        {items.length === 0 ? (
          <EmptyState text="Sin costos fijos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Monto</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{c.descripcion}</Td>
                    <Td>{c.categoria}</Td>
                    <Td>{fARS(c.monto)}</Td>
                    <Td>
                      <button onClick={() => update(c.id, { activo: !c.activo })}>
                        <Badge color={c.activo ? "green" : "red"}>{c.activo ? "Activo" : "Inactivo"}</Badge>
                      </button>
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(c.id)}>
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
        title={editing ? "Editar Costo Fijo" : "Nuevo Costo Fijo"}
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
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Alquiler, Servicios, Personal…" />
          </Field>
          <Field label="Monto mensual">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Activo">
            <Select value={form.activo ? "1" : "0"} onChange={(e) => setForm({ ...form, activo: e.target.value === "1" })}>
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
