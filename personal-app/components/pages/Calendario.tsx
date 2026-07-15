"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import type { CategoriaEvento, Evento } from "@/lib/types";
import { CATEGORIA_EVENTO_COLOR, eventosDelDia } from "@/lib/calc";
import {
  DIAS_SEMANA,
  addDays,
  addMonths,
  monthGrid,
  parseISODate,
  toISODate,
  todayISO,
  weekDays,
} from "@/lib/date";
import { Badge, Button, Field, FilterTabs, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";

const CATEGORIAS: CategoriaEvento[] = ["Trabajo", "Facultad", "Personal"];

function emptyForm(fecha: string) {
  return { titulo: "", fecha, hora: "", categoria: "Trabajo" as CategoriaEvento, notas: "" };
}

function fechaLarga(d: Date): string {
  const s = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Calendario() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<"mes" | "semana">("mes");
  const [cursor, setCursor] = useState(() => new Date());
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [form, setForm] = useState<ReturnType<typeof emptyForm> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hoy = todayISO();

  const dias = useMemo(
    () => (viewMode === "mes" ? monthGrid(cursor) : weekDays(cursor)),
    [viewMode, cursor]
  );

  function nav(delta: number) {
    setCursor((c) => (viewMode === "mes" ? addMonths(c, delta) : addDays(c, delta * 7)));
  }

  function openForm(fecha: string, evento?: Evento) {
    if (evento) {
      setEditingId(evento.id);
      setForm({
        titulo: evento.titulo,
        fecha: evento.fecha,
        hora: evento.hora ?? "",
        categoria: evento.categoria,
        notas: evento.notas ?? "",
      });
    } else {
      setEditingId(null);
      setForm(emptyForm(fecha));
    }
  }

  function save() {
    if (!form) return;
    if (!form.titulo.trim()) {
      toast("Ponele un título al evento.", "error");
      return;
    }
    const payload: Evento = {
      id: editingId ?? uid("EVT"),
      titulo: form.titulo.trim(),
      fecha: form.fecha,
      hora: form.hora || undefined,
      categoria: form.categoria,
      notas: form.notas.trim() || undefined,
    };
    setData((d) => ({
      ...d,
      eventos: editingId ? d.eventos.map((e) => (e.id === editingId ? payload : e)) : [...d.eventos, payload],
    }));
    toast(editingId ? "Evento actualizado." : "Evento creado.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, eventos: d.eventos.filter((e) => e.id !== id) }));
    toast("Evento eliminado.", "info");
    setForm(null);
    setEditingId(null);
  }

  const cabecera =
    viewMode === "mes"
      ? cursor.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
      : `Semana del ${fechaLarga(weekDays(cursor)[0])}`;

  return (
    <div>
      <PageHeader
        title="Calendario"
        sub={cabecera.charAt(0).toUpperCase() + cabecera.slice(1)}
        right={
          <>
            <Button variant="ghost" size="sm" onClick={() => nav(-1)}>◀</Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Hoy</Button>
            <Button variant="ghost" size="sm" onClick={() => nav(1)}>▶</Button>
            <Button size="sm" onClick={() => openForm(hoy)}>+ Nuevo evento</Button>
          </>
        }
      />

      <FilterTabs
        options={[
          { value: "mes", label: "Mes" },
          { value: "semana", label: "Semana" },
        ]}
        value={viewMode}
        onChange={(v) => setViewMode(v as "mes" | "semana")}
      />

      {viewMode === "mes" ? (
        <div className="overflow-hidden rounded-[10px] border border-border">
          <div className="grid grid-cols-7 border-b border-border bg-surface">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-text3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const iso = toISODate(d);
              const enMes = d.getMonth() === cursor.getMonth();
              const esHoy = iso === hoy;
              const eventos = eventosDelDia(data, iso);
              return (
                <div
                  key={iso}
                  onClick={() => setDayModal(iso)}
                  className={`min-h-[92px] cursor-pointer border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                    enMes ? "bg-surface" : "bg-bg/40"
                  } hover:bg-surface2/60`}
                >
                  <div
                    className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      esHoy ? "bg-accent font-semibold text-[#0d0d1a]" : enMes ? "text-text2" : "text-text3"
                    }`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {eventos.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className={`truncate rounded px-1 py-0.5 text-[10px] ${
                          e.categoria === "Trabajo"
                            ? "bg-blue-dim text-blue"
                            : e.categoria === "Facultad"
                            ? "bg-purple-dim text-purple"
                            : "bg-accent-dim text-accent"
                        }`}
                      >
                        {e.hora ? `${e.hora} ` : ""}
                        {e.titulo}
                      </div>
                    ))}
                    {eventos.length > 3 && (
                      <div className="px-1 text-[10px] text-text3">+{eventos.length - 3} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          {dias.map((d) => {
            const iso = toISODate(d);
            const esHoy = iso === hoy;
            const eventos = eventosDelDia(data, iso);
            return (
              <div
                key={iso}
                className={`rounded-[10px] border p-3 ${esHoy ? "border-accent/40 bg-accent-dim/20" : "border-border bg-surface"}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className={`text-[12px] font-medium ${esHoy ? "text-accent" : "text-text2"}`}>
                    {DIAS_SEMANA[(d.getDay() + 6) % 7]} {d.getDate()}
                  </div>
                  <button
                    onClick={() => openForm(iso)}
                    className="text-text3 hover:text-accent"
                    aria-label="Agregar evento"
                  >
                    +
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {eventos.length === 0 && <div className="text-[11px] text-text3">Sin eventos</div>}
                  {eventos.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => openForm(iso, e)}
                      className="cursor-pointer rounded-md border border-border bg-surface2 px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11.5px] font-medium text-text">{e.titulo}</span>
                        <Badge color={CATEGORIA_EVENTO_COLOR[e.categoria]}>{e.categoria}</Badge>
                      </div>
                      {e.hora && <div className="mt-0.5 text-[10.5px] text-text3">{e.hora}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: eventos de un día (vista mensual) */}
      <Modal
        open={dayModal !== null}
        onClose={() => setDayModal(null)}
        title={dayModal ? fechaLarga(parseISODate(dayModal)) : ""}
      >
        <div className="flex flex-col gap-2">
          {dayModal &&
            eventosDelDia(data, dayModal).map((e) => (
              <div
                key={e.id}
                onClick={() => {
                  setDayModal(null);
                  openForm(e.fecha, e);
                }}
                className="cursor-pointer rounded-md border border-border bg-surface2 px-3 py-2 hover:border-accent/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-text">{e.titulo}</span>
                  <Badge color={CATEGORIA_EVENTO_COLOR[e.categoria]}>{e.categoria}</Badge>
                </div>
                {(e.hora || e.notas) && (
                  <div className="mt-0.5 text-[11px] text-text3">
                    {e.hora && <span>{e.hora}</span>}
                    {e.hora && e.notas && <span> — </span>}
                    {e.notas}
                  </div>
                )}
              </div>
            ))}
          {dayModal && eventosDelDia(data, dayModal).length === 0 && (
            <div className="py-4 text-center text-[12px] text-text3">Sin eventos este día.</div>
          )}
          <Button
            variant="ghost"
            className="mt-1 justify-center"
            onClick={() => {
              const fecha = dayModal!;
              setDayModal(null);
              openForm(fecha);
            }}
          >
            + Agregar evento
          </Button>
        </div>
      </Modal>

      {/* Modal: crear/editar evento */}
      <Modal
        open={form !== null}
        onClose={() => {
          setForm(null);
          setEditingId(null);
        }}
        title={editingId ? "Editar evento" : "Nuevo evento"}
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
          <div className="flex flex-col gap-3.5">
            <Field label="Título">
              <Input
                autoFocus
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Reunión, entrega, cumpleaños…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3.5">
              <Field label="Fecha">
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </Field>
              <Field label="Hora (opcional)">
                <Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
              </Field>
            </div>
            <Field label="Categoría">
              <Select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaEvento })}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notas">
              <Textarea
                rows={3}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Detalles opcionales…"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
