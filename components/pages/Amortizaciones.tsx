"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  amortizacionActiva,
  cuotaMensualAmortizacion,
  fARS,
  fPct,
  fechaFinAmortizacion,
  mesesRestantesAmortizacion,
  mesesTranscurridosAmortizacion,
  montoAmortizado,
  montoRestanteAmortizacion,
  totalAmortizacionMensualActiva,
} from "@/lib/calc";
import {
  PageHeader,
  Button,
  Card,
  StatGrid,
  KpiCard,
  FilterTabs,
  EmptyState,
  Field,
  Input,
  Select,
  Badge,
  InfoRow,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { Amortizacion } from "@/lib/types";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function emptyForm() {
  return {
    nombre: "",
    precio_total: 0,
    fecha_inicio: new Date().toISOString().slice(0, 10),
    duracion: 12,
    unidad: "Meses" as "Meses" | "Años",
  };
}

function Timeline({ a }: { a: Amortizacion }) {
  const transcurridos = mesesTranscurridosAmortizacion(a);
  const inicio = new Date(a.fecha_inicio);
  const inicioMes = new Date(inicio.getFullYear(), inicio.getMonth(), 1);

  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: a.meses_totales }, (_, i) => {
        const d = addMonths(inicioMes, i);
        const pagado = i < transcurridos;
        return (
          <div
            key={i}
            title={`${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()} — ${pagado ? "Pagado" : "Pendiente"}`}
            className={`flex h-6 w-9 shrink-0 items-center justify-center rounded text-[9px] font-medium ${
              pagado ? "bg-green-dim text-green" : "bg-surface3 text-text3"
            }`}
          >
            {MESES_CORTOS[d.getMonth()]}
            {String(d.getFullYear()).slice(2)}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-text3">{label}</span>
      <span className={`text-[13px] font-medium text-text ${className}`}>{value}</span>
    </div>
  );
}

function BienCard({ a, onDelete }: { a: Amortizacion; onDelete: () => void }) {
  const activa = amortizacionActiva(a);
  const cuota = cuotaMensualAmortizacion(a);
  const amortizado = montoAmortizado(a);
  const restante = montoRestanteAmortizacion(a);
  const mesesRestantes = mesesRestantesAmortizacion(a);
  const fin = fechaFinAmortizacion(a);
  const pct = a.precio_total > 0 ? (amortizado / a.precio_total) * 100 : 0;

  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-text">{a.nombre}</span>
          <Badge color={activa ? "green" : "blue"}>{activa ? "Activo" : "Amortizado por completo"}</Badge>
        </div>
        <Button size="sm" variant="danger" onClick={onDelete}>
          Eliminar
        </Button>
      </div>

      <div className="mb-3 h-2 overflow-hidden rounded bg-surface3">
        <div
          className="h-full rounded bg-accent transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Precio total" value={fARS(a.precio_total)} />
        <Stat label="Cuota mensual" value={fARS(cuota)} className="text-accent" />
        <Stat label="Amortizado" value={fARS(amortizado)} className="text-green" />
        <Stat label="Restante" value={fARS(restante)} className={restante > 0 ? "text-orange" : "text-green"} />
        <Stat label="Cuotas restantes" value={String(mesesRestantes)} />
        <Stat label="Fin estimado" value={fin.toLocaleDateString("es-AR", { month: "short", year: "numeric" })} />
      </div>

      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text3">
        Calendario ({fPct(pct, 0)} amortizado)
      </div>
      <Timeline a={a} />
    </Card>
  );
}

export function Amortizaciones() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [filtro, setFiltro] = useState("activos");

  const conEstado = useMemo(
    () => data.amortizaciones.map((a) => ({ a, activa: amortizacionActiva(a) })),
    [data.amortizaciones]
  );

  const filtrados = conEstado.filter(({ activa }) =>
    filtro === "todos" ? true : filtro === "activos" ? activa : !activa
  );

  const totalMensualActiva = totalAmortizacionMensualActiva(data);
  const bienesActivos = conEstado.filter((c) => c.activa).length;
  const bienesCompletados = conEstado.length - bienesActivos;
  const invertidoTotal = data.amortizaciones.reduce((acc, a) => acc + a.precio_total, 0);

  function guardar() {
    if (!form.nombre || form.precio_total <= 0 || form.duracion <= 0) {
      toast("Completá nombre, precio y duración", "error");
      return;
    }
    const meses_totales = form.unidad === "Años" ? form.duracion * 12 : form.duracion;
    const nuevo: Amortizacion = {
      id: uid("AMORT"),
      nombre: form.nombre,
      precio_total: form.precio_total,
      fecha_inicio: form.fecha_inicio,
      meses_totales,
    };
    setData((d) => ({ ...d, amortizaciones: [...d.amortizaciones, nuevo] }));
    toast("Bien agregado a amortizaciones");
    setModalOpen(false);
    setForm(emptyForm());
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, amortizaciones: d.amortizaciones.filter((a) => a.id !== id) }));
    toast("Bien eliminado", "info");
  }

  return (
    <div>
      <PageHeader
        title="Amortizaciones"
        sub="Bienes de uso amortizándose — la cuota activa suma a Costos Fijos"
        right={<Button onClick={() => setModalOpen(true)}>+ Nuevo Bien</Button>}
      />

      <StatGrid>
        <KpiCard label="Amortización mensual activa" value={fARS(totalMensualActiva)} color="gold" />
        <KpiCard label="Bienes activos" value={bienesActivos} color="green" />
        <KpiCard label="Amortizados por completo" value={bienesCompletados} color="blue" />
        <KpiCard label="Invertido total (histórico)" value={fARS(invertidoTotal)} color="purple" />
      </StatGrid>

      <FilterTabs
        value={filtro}
        onChange={setFiltro}
        options={[
          { value: "activos", label: "Activos" },
          { value: "completados", label: "Completados" },
          { value: "todos", label: "Todos" },
        ]}
      />

      {filtrados.length === 0 ? (
        <Card>
          <EmptyState text="Sin bienes en amortización con este filtro." />
        </Card>
      ) : (
        filtrados
          .sort((x, y) => new Date(y.a.fecha_inicio).getTime() - new Date(x.a.fecha_inicio).getTime())
          .map(({ a }) => <BienCard key={a.id} a={a} onDelete={() => eliminar(a.id)} />)
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo Bien a Amortizar"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Nombre del bien" full>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Sobadora, Horno…" />
          </Field>
          <Field label="Precio total">
            <Input
              type="number"
              value={form.precio_total}
              onChange={(e) => setForm({ ...form, precio_total: Number(e.target.value) })}
            />
          </Field>
          <Field label="Fecha de inicio">
            <Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          </Field>
          <Field label="Duración">
            <Input type="number" min={1} value={form.duracion} onChange={(e) => setForm({ ...form, duracion: Number(e.target.value) })} />
          </Field>
          <Field label="Unidad">
            <Select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value as "Meses" | "Años" })}>
              <option value="Meses">Meses</option>
              <option value="Años">Años</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <InfoRow
            label="Cuota mensual estimada"
            value={fARS(
              form.precio_total / Math.max(1, form.unidad === "Años" ? form.duracion * 12 : form.duracion)
            )}
            color="gold"
          />
        </div>
      </Modal>
    </div>
  );
}
