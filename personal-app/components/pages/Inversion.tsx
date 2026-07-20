"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import type { Inversion as InversionMov } from "@/lib/types";
import { aniosConInversion, fARS, inversionPorMes, totalInversionAnio } from "@/lib/calc";
import { MESES, todayISO } from "@/lib/date";
import {
  BarRow,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  KpiCard,
  PageHeader,
  Select,
  StatGrid,
  Td,
  Th,
  TrHover,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";

function emptyForm() {
  return { fecha: todayISO(), monto: "", descripcion: "" };
}

export function Inversion() {
  const { data, setData } = useStore();
  const { toast } = useToast();

  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [form, setForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const anios = useMemo(() => aniosConInversion(data), [data]);
  const totalAnio = totalInversionAnio(data, anio);
  const porMes = useMemo(() => inversionPorMes(data, anio), [data, anio]);
  const maxMes = Math.max(1, ...porMes.map((m) => m.monto));

  const lista = useMemo(
    () =>
      data.inversiones
        .filter((i) => i.fecha.startsWith(String(anio)))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.inversiones, anio]
  );

  function openForm(inv?: InversionMov) {
    if (inv) {
      setEditingId(inv.id);
      setForm({ fecha: inv.fecha, monto: String(inv.monto), descripcion: inv.descripcion });
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
    const payload: InversionMov = {
      id: editingId ?? uid("INV"),
      fecha: form.fecha,
      monto,
      descripcion: form.descripcion.trim(),
    };
    setData((d) => ({
      ...d,
      inversiones: editingId
        ? d.inversiones.map((i) => (i.id === editingId ? payload : i))
        : [...d.inversiones, payload],
    }));
    toast(editingId ? "Inversión actualizada." : "Inversión cargada.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, inversiones: d.inversiones.filter((i) => i.id !== id) }));
    toast("Inversión eliminada.", "info");
    setForm(null);
    setEditingId(null);
  }

  return (
    <div>
      <PageHeader
        title="Inversión"
        sub="Plata destinada a invertir — no se descuenta del balance, se acumula aparte"
        right={
          <>
            <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 100 }}>
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => openForm()}>+ Nueva inversión</Button>
          </>
        }
      />

      <StatGrid>
        <KpiCard label={`Invertido en ${anio}`} value={fARS(totalAnio)} color="purple" />
      </StatGrid>

      <Card title={`Evolución mensual — ${anio}`} className="mb-4">
        <div className="flex flex-col gap-2">
          {porMes.map((m) => (
            <BarRow
              key={m.mes}
              label={MESES[m.mes - 1]}
              value={fARS(m.monto)}
              pct={(m.monto / maxMes) * 100}
              color="purple"
            />
          ))}
        </div>
      </Card>

      <Card title={`Historial de ${anio}`}>
        {lista.length === 0 ? (
          <EmptyState icon="📈" text="Todavía no cargaste inversiones en este año." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Descripción</Th>
                  <Th>Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <TrHover key={i.id}>
                    <Td>{i.fecha}</Td>
                    <Td main>{i.descripcion}</Td>
                    <Td className="text-purple">{fARS(i.monto)}</Td>
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
        title={editingId ? "Editar inversión" : "Nueva inversión"}
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
                placeholder="Plazo fijo, FCI, acciones…"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
