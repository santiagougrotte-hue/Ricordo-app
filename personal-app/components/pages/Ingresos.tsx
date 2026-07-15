"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import type { IngresoAdicional } from "@/lib/types";
import { fARS } from "@/lib/calc";
import { todayISO } from "@/lib/date";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Td,
  Th,
  TrHover,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";

function emptyForm() {
  return { fecha: todayISO(), monto: "", descripcion: "", categoria: "" };
}

export function Ingresos() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [sueldoInput, setSueldoInput] = useState(String(data.sueldoFijo || ""));
  const [form, setForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const lista = useMemo(
    () => [...data.ingresosAdicionales].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.ingresosAdicionales]
  );

  function guardarSueldo() {
    const monto = Number(sueldoInput) || 0;
    setData((d) => ({ ...d, sueldoFijo: monto }));
    toast("Sueldo fijo actualizado.");
  }

  function openForm(i?: IngresoAdicional) {
    if (i) {
      setEditingId(i.id);
      setForm({ fecha: i.fecha, monto: String(i.monto), descripcion: i.descripcion, categoria: i.categoria });
    } else {
      setEditingId(null);
      setForm(emptyForm());
    }
  }

  function save() {
    if (!form) return;
    const monto = Number(form.monto);
    if (!form.descripcion.trim() || !monto || monto <= 0) {
      toast("Completá descripción y un monto válido.", "error");
      return;
    }
    const payload: IngresoAdicional = {
      id: editingId ?? uid("ING"),
      fecha: form.fecha,
      monto,
      descripcion: form.descripcion.trim(),
      categoria: form.categoria.trim(),
    };
    setData((d) => ({
      ...d,
      ingresosAdicionales: editingId
        ? d.ingresosAdicionales.map((i) => (i.id === editingId ? payload : i))
        : [...d.ingresosAdicionales, payload],
    }));
    toast(editingId ? "Ingreso actualizado." : "Ingreso agregado.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, ingresosAdicionales: d.ingresosAdicionales.filter((i) => i.id !== id) }));
    toast("Ingreso eliminado.", "info");
    setForm(null);
    setEditingId(null);
  }

  return (
    <div>
      <PageHeader title="Ingresos" sub="Sueldo fijo e ingresos adicionales" />

      <Card title="Sueldo / ingreso fijo mensual" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Monto mensual">
            <Input
              type="number"
              min={0}
              value={sueldoInput}
              onChange={(e) => setSueldoInput(e.target.value)}
              placeholder="0"
              style={{ maxWidth: 220 }}
            />
          </Field>
          <Button onClick={guardarSueldo}>Guardar</Button>
          <span className="text-[11px] text-text3">Se suma automáticamente todos los meses.</span>
        </div>
      </Card>

      <Card
        title="Ingresos adicionales"
        right={<Button size="sm" onClick={() => openForm()}>+ Nuevo ingreso</Button>}
      >
        {lista.length === 0 ? (
          <EmptyState icon="💰" text="Todavía no cargaste ingresos adicionales." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <TrHover key={i.id}>
                    <Td>{i.fecha}</Td>
                    <Td main>{i.descripcion}</Td>
                    <Td>{i.categoria || "—"}</Td>
                    <Td className="text-green">{fARS(i.monto)}</Td>
                    <Td>
                      <button onClick={() => openForm(i)} className="text-text3 hover:text-accent">
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
        onClose={() => {
          setForm(null);
          setEditingId(null);
        }}
        title={editingId ? "Editar ingreso" : "Nuevo ingreso"}
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
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Monto">
              <Input
                type="number"
                min={0}
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
              />
            </Field>
            <Field label="Descripción" full>
              <Input
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Freelance, venta, regalo…"
              />
            </Field>
            <Field label="Categoría" full>
              <Input
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Freelance, Extra, Regalo…"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
