"use client";

import React, { useState } from "react";
import { useEntityCrud } from "@/lib/useEntity";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { useStore } from "@/lib/store";
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
import type { Proveedor } from "@/lib/types";

function emptyForm() {
  return { nombre: "", contacto: "", telefono: "", email: "", notas: "" };
}

export function Proveedores() {
  const { items, add, update, remove } = useEntityCrud<Proveedor>("proveedores");
  const { data } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const totalCompras = (idProveedor: string) =>
    data.compras.filter((c) => c.id_proveedor === idProveedor).reduce((acc, c) => acc + c.total, 0);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(p: Proveedor) {
    setEditing(p.id);
    setForm({
      nombre: p.nombre,
      contacto: p.contacto ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      notas: p.notas ?? "",
    });
    setModalOpen(true);
  }
  function save() {
    if (!form.nombre) {
      toast("Ingresá un nombre", "error");
      return;
    }
    if (editing) update(editing, form);
    else add({ id: uid("PROV"), ...form });
    toast(editing ? "Proveedor actualizado" : "Proveedor creado");
    setModalOpen(false);
  }

  return (
    <div>
      <PageHeader title="Proveedores" right={<Button onClick={openNew}>+ Nuevo</Button>} />
      <Card>
        {items.length === 0 ? (
          <EmptyState text="Sin proveedores registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Contacto</Th>
                  <Th>Teléfono</Th>
                  <Th>Total compras</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <TrHover key={p.id}>
                    <Td main>{p.nombre}</Td>
                    <Td>{p.contacto || "—"}</Td>
                    <Td>{p.telefono || "—"}</Td>
                    <Td>{fARS(totalCompras(p.id))}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(p.id)}>
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
        title={editing ? "Editar Proveedor" : "Nuevo Proveedor"}
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
          <Field label="Nombre" full>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Contacto">
            <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Email" full>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
