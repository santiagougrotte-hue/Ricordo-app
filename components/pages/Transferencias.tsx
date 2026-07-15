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
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { TransferenciaInterna } from "@/lib/types";

function emptyForm() {
  return { fecha: new Date().toISOString().slice(0, 10), origen: "", destino: "", monto: 0, descripcion: "" };
}

export function Transferencias() {
  const { items, add, remove } = useEntityCrud<TransferenciaInterna>("transferencias_internas");
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  function save() {
    if (!form.origen || !form.destino || form.monto <= 0) {
      toast("Completá origen, destino y monto", "error");
      return;
    }
    add({ id: uid("TRF"), ...form });
    toast("Transferencia registrada");
    setModalOpen(false);
    setForm(emptyForm());
  }

  return (
    <div>
      <PageHeader title="Transferencias" sub="Movimientos entre fondos internos" right={<Button onClick={() => setModalOpen(true)}>+ Nueva</Button>} />
      <Card>
        {items.length === 0 ? (
          <EmptyState text="Sin transferencias registradas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Origen</Th>
                  <Th>Destino</Th>
                  <Th>Monto</Th>
                  <Th>Descripción</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {[...items]
                  .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                  .map((t) => (
                    <TrHover key={t.id}>
                      <Td>{t.fecha}</Td>
                      <Td main>{t.origen}</Td>
                      <Td main>{t.destino}</Td>
                      <Td>{fARS(t.monto)}</Td>
                      <Td>{t.descripcion || "—"}</Td>
                      <Td>
                        <Button size="sm" variant="danger" onClick={() => remove(t.id)}>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nueva Transferencia"
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
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Monto">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Origen">
            <Input value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} placeholder="Ej: Caja, Reinversión…" />
          </Field>
          <Field label="Destino">
            <Input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} placeholder="Ej: Seguridad, Banco…" />
          </Field>
          <Field label="Descripción" full>
            <Textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
