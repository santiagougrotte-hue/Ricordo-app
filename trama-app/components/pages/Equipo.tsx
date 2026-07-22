"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { Modal } from "@/components/Modal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  Textarea,
  YesNo,
} from "@/components/ui";
import { TIPOS_CONTRATACION, type Persona, type TipoContratacion } from "@/lib/types";
import { estimacionCobroPersona, fARS, pagosPendientesPersona, pagosRealizadosPersona } from "@/lib/calc";
import { usePeriod } from "@/lib/period";

function emptyForm(): Persona {
  return {
    id: "",
    nombre: "",
    rol: "",
    esDirectora: false,
    tipoContratacion: "mensual",
    sueldoFijo: 0,
    valorHora: 0,
    valorJornada: 0,
    valorPieza: 0,
    porcentajeProyecto: 0,
    clientesAsignados: [],
    observaciones: "",
    activa: true,
  };
}

export function Equipo() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const { mes, anio } = usePeriod();
  const [form, setForm] = useState<Persona | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const lista = [...data.equipo].sort((a, b) => (b.esDirectora ? 1 : 0) - (a.esDirectora ? 1 : 0) || a.nombre.localeCompare(b.nombre));

  function openForm(p?: Persona) {
    if (p) {
      setEditingId(p.id);
      setForm({ ...p });
    } else {
      setEditingId(null);
      setForm(emptyForm());
    }
  }

  function save() {
    if (!form) return;
    if (!form.nombre.trim()) {
      toast("Ingresá el nombre.", "error");
      return;
    }
    const payload: Persona = { ...form, id: editingId ?? uid("per") };
    setData((d) => ({
      ...d,
      equipo: editingId ? d.equipo.map((p) => (p.id === editingId ? payload : p)) : [...d.equipo, payload],
    }));
    toast(editingId ? "Persona actualizada." : "Persona creada.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, equipo: d.equipo.filter((p) => p.id !== id) }));
    toast("Persona eliminada.", "info");
    setForm(null);
    setEditingId(null);
  }

  function toggleCliente(clienteId: string) {
    if (!form) return;
    const set = new Set(form.clientesAsignados);
    if (set.has(clienteId)) set.delete(clienteId);
    else set.add(clienteId);
    setForm({ ...form, clientesAsignados: Array.from(set) });
  }

  return (
    <div>
      <PageHeader
        title="Equipo y colaboradoras"
        sub="Personas que trabajan en TRAMA o colaboran de forma externa"
        right={<Button onClick={() => openForm()}>+ Nueva persona</Button>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <Card>
              <EmptyState icon="◎" text="Todavía no cargaste a nadie del equipo." />
            </Card>
          </div>
        ) : (
          lista.map((p) => {
            const estimado = estimacionCobroPersona(data, p);
            const pendiente = pagosPendientesPersona(data, p.id);
            const realizado = pagosRealizadosPersona(data, p.id, mes, anio);
            return (
              <Card key={p.id} className="flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display flex items-center gap-1.5 text-[14px] font-semibold text-text">
                      {p.nombre}
                      {p.esDirectora && <Badge color="accent">Directora</Badge>}
                      {!p.activa && <Badge color="red">Inactiva</Badge>}
                    </div>
                    <div className="text-[11px] text-text3">{p.rol}</div>
                  </div>
                  <button onClick={() => openForm(p)} className="text-[11px] text-text3 hover:text-accent">
                    Editar
                  </button>
                </div>
                <div className="text-[11px] text-text3">
                  Contratación: <span className="text-text2">{TIPOS_CONTRATACION.find((t) => t.value === p.tipoContratacion)?.label}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11.5px]">
                  <span className="text-text3">Estimado este mes</span>
                  <span className="font-medium text-text">{fARS(estimado)}</span>
                </div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-text3">Pagado este mes</span>
                  <span className="font-medium text-green">{fARS(realizado)}</span>
                </div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-text3">Pendiente de pago</span>
                  <span className={`font-medium ${pendiente > 0 ? "text-orange" : "text-text3"}`}>{fARS(pendiente)}</span>
                </div>
                {p.clientesAsignados.length > 0 && (
                  <div className="flex flex-wrap gap-1 border-t border-border/50 pt-2">
                    {p.clientesAsignados.map((cid) => {
                      const c = data.clientes.find((cl) => cl.id === cid);
                      return c ? <Badge key={cid} color="blue">{c.marca}</Badge> : null;
                    })}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      <Modal
        open={form !== null}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? "Editar persona" : "Nueva persona"}
        wide
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
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
              </Field>
              <Field label="Rol">
                <Input value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} placeholder="Diseñadora gráfica, Productora…" />
              </Field>
              <Field label="Tipo de contratación">
                <Select value={form.tipoContratacion} onChange={(e) => setForm({ ...form, tipoContratacion: e.target.value as TipoContratacion })}>
                  {TIPOS_CONTRATACION.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Sueldo fijo (mensual)">
                <Input type="number" min={0} value={form.sueldoFijo || ""} onChange={(e) => setForm({ ...form, sueldoFijo: Number(e.target.value) })} />
              </Field>
              <Field label="Valor por hora">
                <Input type="number" min={0} value={form.valorHora || ""} onChange={(e) => setForm({ ...form, valorHora: Number(e.target.value) })} />
              </Field>
              <Field label="Valor por jornada">
                <Input type="number" min={0} value={form.valorJornada || ""} onChange={(e) => setForm({ ...form, valorJornada: Number(e.target.value) })} />
              </Field>
              <Field label="Valor por pieza">
                <Input type="number" min={0} value={form.valorPieza || ""} onChange={(e) => setForm({ ...form, valorPieza: Number(e.target.value) })} />
              </Field>
              <Field label="% sobre proyecto">
                <Input type="number" min={0} max={100} value={form.porcentajeProyecto || ""} onChange={(e) => setForm({ ...form, porcentajeProyecto: Number(e.target.value) })} />
              </Field>
              <Field label="¿Es la directora?">
                <YesNo value={form.esDirectora} onChange={(v) => setForm({ ...form, esDirectora: v })} />
              </Field>
              <Field label="Activa">
                <YesNo value={form.activa} onChange={(v) => setForm({ ...form, activa: v })} />
              </Field>
            </FormGrid>

            <Field label="Clientes asignados">
              <div className="flex flex-wrap gap-1.5">
                {data.clientes.length === 0 && <span className="text-[11px] text-text3">Cargá clientes primero.</span>}
                {data.clientes.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => toggleCliente(c.id)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors ${
                      form.clientesAsignados.includes(c.id)
                        ? "border-accent/30 bg-accent-dim text-accent"
                        : "border-border bg-surface2 text-text3"
                    }`}
                  >
                    {c.marca}
                  </div>
                ))}
              </div>
            </Field>

            <Field label="Observaciones">
              <Textarea rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
