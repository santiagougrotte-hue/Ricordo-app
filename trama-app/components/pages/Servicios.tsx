"use client";

import React, { useMemo, useState } from "react";
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
  FilterTabs,
  FormGrid,
  Input,
  PageHeader,
  Select,
  Td,
  Th,
  TableWrap,
  Textarea,
  TrHover,
} from "@/components/ui";
import { NIVELES_COMPLEJIDAD, UNIDADES_COBRO, type Complejidad, type Servicio, type UnidadCobro } from "@/lib/types";
import { costoManoDeObra, fMoney, fPct } from "@/lib/calc";

const COMPLEJIDAD_BADGE: Record<Complejidad, "green" | "orange" | "red"> = {
  baja: "green",
  media: "orange",
  alta: "red",
};

function emptyForm(): Servicio {
  return {
    id: "",
    nombre: "",
    categoria: "",
    participacionPct: 0,
    unidad: "pieza",
    horasEstimadas: 0,
    costoInterno: 0,
    personaId: null,
    profesionalResponsable: "",
    margenMinimo: 30,
    complejidad: "media",
    observaciones: "",
  };
}

export function Servicios() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [categoria, setCategoria] = useState("todas");
  const [form, setForm] = useState<Servicio | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const set = new Set(data.servicios.map((s) => s.categoria).filter(Boolean));
    return Array.from(set).sort();
  }, [data.servicios]);

  const lista = useMemo(
    () =>
      data.servicios
        .filter((s) => categoria === "todas" || s.categoria === categoria)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [data.servicios, categoria]
  );

  function openForm(s?: Servicio) {
    if (s) {
      setEditingId(s.id);
      setForm({ ...s });
    } else {
      setEditingId(null);
      setForm(emptyForm());
    }
  }

  function save() {
    if (!form) return;
    if (!form.nombre.trim()) {
      toast("Ingresá el nombre del servicio.", "error");
      return;
    }
    const payload: Servicio = { ...form, id: editingId ?? uid("srv") };
    setData((d) => ({
      ...d,
      servicios: editingId ? d.servicios.map((s) => (s.id === editingId ? payload : s)) : [...d.servicios, payload],
    }));
    toast(editingId ? "Servicio actualizado." : "Servicio creado.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, servicios: d.servicios.filter((s) => s.id !== id) }));
    toast("Servicio eliminado.", "info");
    setForm(null);
    setEditingId(null);
  }

  return (
    <div>
      <PageHeader
        title="Servicios y precios base"
        sub="Catálogo editable de TRAMA — se usa como base en el creador de presupuestos"
        right={<Button onClick={() => openForm()}>+ Nuevo servicio</Button>}
      />

      <FilterTabs
        value={categoria}
        onChange={setCategoria}
        options={[{ value: "todas", label: "Todas" }, ...categorias.map((c) => ({ value: c, label: c }))]}
      />

      <Card>
        {lista.length === 0 ? (
          <EmptyState icon="✦" text="No hay servicios cargados." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Servicio</Th>
                  <Th>Unidad</Th>
                  <Th title="% del valor total de un proyecto que representa este servicio">Participación (%)</Th>
                  <Th title="Costo interno estimado por unidad. 'Auto' = calculado desde horas × valor hora del profesional.">Costo interno</Th>
                  <Th>Responsable</Th>
                  <Th>Complejidad</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => {
                  return (
                    <TrHover key={s.id}>
                      <Td main>{s.nombre}</Td>
                      <Td>{UNIDADES_COBRO.find((u) => u.value === s.unidad)?.label}</Td>
                      <Td>{fPct(s.participacionPct, 0)}</Td>
                      <Td>
                        {fMoney(s.costoInterno)}
                        {s.personaId && <span className="ml-1.5 text-[10px] text-text3">auto</span>}
                      </Td>
                      <Td>{s.profesionalResponsable || "—"}</Td>
                      <Td>
                        <Badge color={COMPLEJIDAD_BADGE[s.complejidad]}>{NIVELES_COMPLEJIDAD.find((c) => c.value === s.complejidad)?.label}</Badge>
                      </Td>
                      <Td>
                        <button onClick={() => openForm(s)} className="text-text3 hover:text-accent">
                          Editar
                        </button>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? "Editar servicio" : "Nuevo servicio"}
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
              <Field label="Categoría">
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Contenido, Producción…" />
              </Field>
              <Field label="Unidad de cobro">
                <Select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value as UnidadCobro })}>
                  {UNIDADES_COBRO.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Participación del Servicio (%)">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.participacionPct || ""}
                    onChange={(e) => setForm({ ...form, participacionPct: Number(e.target.value) })}
                  />
                  <span className="text-text3">%</span>
                </div>
              </Field>
              <Field label="Horas estimadas">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.horasEstimadas || ""}
                  onChange={(e) => {
                    const horasEstimadas = Number(e.target.value);
                    const costo = costoManoDeObra(horasEstimadas, form.personaId, data.equipo);
                    setForm({ ...form, horasEstimadas, costoInterno: costo ?? form.costoInterno });
                  }}
                />
              </Field>
              <Field label="Profesional (Equipo)">
                <Select
                  value={form.personaId ?? ""}
                  onChange={(e) => {
                    const personaId = e.target.value || null;
                    const persona = data.equipo.find((p) => p.id === personaId);
                    const costo = costoManoDeObra(form.horasEstimadas, personaId, data.equipo);
                    setForm({
                      ...form,
                      personaId,
                      profesionalResponsable: persona ? persona.nombre : form.profesionalResponsable,
                      costoInterno: costo ?? form.costoInterno,
                    });
                  }}
                >
                  <option value="">— Sin vincular (costo manual) —</option>
                  {data.equipo.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} — {p.rol}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Costo interno">
                {form.personaId ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" value={Math.round(form.costoInterno) || ""} disabled className="opacity-70" />
                    <span className="whitespace-nowrap text-[10.5px] text-text3">= horas × valor hora</span>
                  </div>
                ) : (
                  <Input type="number" min={0} value={form.costoInterno || ""} onChange={(e) => setForm({ ...form, costoInterno: Number(e.target.value) })} />
                )}
              </Field>
              <Field label="Profesional responsable (texto libre)">
                <Input
                  value={form.profesionalResponsable}
                  onChange={(e) => setForm({ ...form, profesionalResponsable: e.target.value })}
                  placeholder="Rol o nombre"
                  disabled={Boolean(form.personaId)}
                  className={form.personaId ? "opacity-70" : ""}
                />
              </Field>
              <Field label="Margen mínimo deseado (%)">
                <Input type="number" min={0} max={100} value={form.margenMinimo || ""} onChange={(e) => setForm({ ...form, margenMinimo: Number(e.target.value) })} />
              </Field>
              <Field label="Nivel de complejidad">
                <Select value={form.complejidad} onChange={(e) => setForm({ ...form, complejidad: e.target.value as Complejidad })}>
                  {NIVELES_COMPLEJIDAD.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>
            </FormGrid>
            <Field label="Observaciones">
              <Textarea rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
