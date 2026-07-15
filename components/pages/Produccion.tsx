"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fNum, inPeriod } from "@/lib/calc";
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
  Textarea,
  StatGrid,
  KpiCard,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { Produccion as ProduccionT } from "@/lib/types";

function emptyForm() {
  return { id_producto: "", cantidad: 0, fecha: new Date().toISOString().slice(0, 10), notas: "" };
}

export function Produccion() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const lotes = useMemo(
    () =>
      data.produccion
        .filter((p) => inPeriod(p.fecha, mes, anio))
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [data.produccion, mes, anio]
  );
  const totalUnidades = lotes.reduce((acc, p) => acc + p.cantidad, 0);
  const lotesCount = lotes.length;

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(p: ProduccionT) {
    setEditing(p.id);
    setForm({ id_producto: p.id_producto, cantidad: p.cantidad, fecha: p.fecha, notas: p.notas ?? "" });
    setModalOpen(true);
  }
  function save() {
    if (!form.id_producto || form.cantidad <= 0) {
      toast("Completá producto y cantidad", "error");
      return;
    }
    const nombre = data.productos.find((p) => p.id === form.id_producto)?.nombre ?? "";
    if (editing) {
      setData((d) => ({
        ...d,
        produccion: d.produccion.map((p) => (p.id === editing ? { ...p, ...form, nombre_producto: nombre } : p)),
      }));
      toast("Lote actualizado");
    } else {
      setData((d) => ({
        ...d,
        produccion: [...d.produccion, { id: uid("PRODLOG"), ...form, nombre_producto: nombre }],
      }));
      toast("Lote registrado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    setData((d) => ({ ...d, produccion: d.produccion.filter((p) => p.id !== id) }));
    toast("Lote eliminado", "info");
  }

  return (
    <div>
      <PageHeader title="Producción" sub="Registro de lotes" right={<Button onClick={openNew}>+ Registrar</Button>} />

      <StatGrid>
        <KpiCard label="Unidades producidas" value={fNum(totalUnidades, 0)} color="gold" />
        <KpiCard label="Lotes registrados" value={lotesCount} color="blue" />
      </StatGrid>

      <Card>
        {lotes.length === 0 ? (
          <EmptyState text="Sin lotes en este período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Producto</Th>
                  <Th>Cantidad</Th>
                  <Th>Notas</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((p) => (
                  <TrHover key={p.id}>
                    <Td>{p.fecha}</Td>
                    <Td main>{p.nombre_producto}</Td>
                    <Td>{fNum(p.cantidad, 0)}</Td>
                    <Td>{p.notas || "—"}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(p.id)}>
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
        title={editing ? "Editar Lote" : "Registrar Lote"}
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
          <Field label="Producto" full>
            <Select value={form.id_producto} onChange={(e) => setForm({ ...form, id_producto: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
