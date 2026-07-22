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
  InfoRow,
  Input,
  PageHeader,
  Select,
  Tabs,
  Td,
  Th,
  TableWrap,
  Textarea,
  TrHover,
} from "@/components/ui";
import { ESTADOS_CLIENTE, ESTADOS_PRESUPUESTO, type Cliente, type EstadoCliente, type Moneda } from "@/lib/types";
import { fARS, fMoney, fPct, rentabilidadCliente } from "@/lib/calc";

const ESTADO_BADGE: Record<EstadoCliente, "accent" | "green" | "orange" | "blue" | "red" | "purple"> = {
  potencial: "blue",
  presupuesto_enviado: "purple",
  negociacion: "orange",
  activo: "green",
  pausado: "orange",
  finalizado: "red",
};

function emptyForm(): Cliente {
  return {
    id: "",
    marca: "",
    contacto: "",
    telefono: "",
    email: "",
    instagram: "",
    rubro: "",
    fechaInicio: "",
    estado: "potencial",
    serviciosContratados: [],
    abonoMensual: 0,
    moneda: "ARS",
    fechaPago: "",
    modalidadPago: "",
    observaciones: "",
    equipoAsignado: [],
    fechaUltimoAumento: "",
  };
}

export function Clientes() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<Cliente | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [tab, setTab] = useState("resumen");

  const lista = useMemo(() => {
    return data.clientes
      .filter((c) => filtro === "todos" || c.estado === filtro)
      .filter((c) => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return true;
        return c.marca.toLowerCase().includes(q) || c.contacto.toLowerCase().includes(q) || c.rubro.toLowerCase().includes(q);
      })
      .sort((a, b) => a.marca.localeCompare(b.marca));
  }, [data.clientes, filtro, busqueda]);

  const detalle = data.clientes.find((c) => c.id === detalleId) ?? null;

  function openForm(c?: Cliente) {
    if (c) {
      setEditingId(c.id);
      setForm({ ...c });
    } else {
      setEditingId(null);
      setForm(emptyForm());
    }
  }

  function save() {
    if (!form) return;
    if (!form.marca.trim()) {
      toast("Ingresá el nombre de la marca.", "error");
      return;
    }
    const payload: Cliente = { ...form, id: editingId ?? uid("cli") };
    setData((d) => ({
      ...d,
      clientes: editingId ? d.clientes.map((c) => (c.id === editingId ? payload : c)) : [...d.clientes, payload],
    }));
    toast(editingId ? "Cliente actualizado." : "Cliente creado.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, clientes: d.clientes.filter((c) => c.id !== id) }));
    toast("Cliente eliminado.", "info");
    setForm(null);
    setEditingId(null);
    if (detalleId === id) setDetalleId(null);
  }

  function toggleEquipo(personaId: string) {
    if (!form) return;
    const set = new Set(form.equipoAsignado);
    if (set.has(personaId)) set.delete(personaId);
    else set.add(personaId);
    setForm({ ...form, equipoAsignado: Array.from(set) });
  }

  function toggleServicio(servicioId: string) {
    if (!form) return;
    const set = new Set(form.serviciosContratados);
    if (set.has(servicioId)) set.delete(servicioId);
    else set.add(servicioId);
    setForm({ ...form, serviciosContratados: Array.from(set) });
  }

  const presupuestosCliente = detalle ? data.presupuestos.filter((p) => p.clienteId === detalle.id) : [];
  const pagosCliente = detalle ? data.movimientos.filter((m) => m.clienteId === detalle.id) : [];
  const rentabilidadTotal = detalle ? rentabilidadCliente(data, detalle) : null;

  return (
    <div>
      <PageHeader
        title="Clientes"
        sub="Marcas activas y potenciales"
        right={<Button onClick={() => openForm()}>+ Nuevo cliente</Button>}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          value={filtro}
          onChange={setFiltro}
          options={[{ value: "todos", label: "Todos" }, ...ESTADOS_CLIENTE.map((e) => ({ value: e.value, label: e.label }))]}
        />
        <Input placeholder="Buscar marca, contacto o rubro…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ maxWidth: 260 }} />
      </div>

      <Card>
        {lista.length === 0 ? (
          <EmptyState icon="○" text="No hay clientes que coincidan con el filtro." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th>Contacto</Th>
                  <Th>Rubro</Th>
                  <Th>Estado</Th>
                  <Th>Abono mensual</Th>
                  <Th>Día de pago</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <TrHover key={c.id}>
                    <Td main className="cursor-pointer" onClick={() => { setDetalleId(c.id); setTab("resumen"); }}>
                      {c.marca}
                    </Td>
                    <Td>{c.contacto || "—"}</Td>
                    <Td>{c.rubro || "—"}</Td>
                    <Td>
                      <Badge color={ESTADO_BADGE[c.estado]}>{ESTADOS_CLIENTE.find((e) => e.value === c.estado)?.label}</Badge>
                    </Td>
                    <Td>{c.abonoMensual > 0 ? fMoney(c.abonoMensual, c.moneda) : "—"}</Td>
                    <Td>{c.fechaPago || "—"}</Td>
                    <Td>
                      <button onClick={() => openForm(c)} className="text-text3 hover:text-accent">
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

      {/* Alta / edición */}
      <Modal
        open={form !== null}
        onClose={() => { setForm(null); setEditingId(null); }}
        title={editingId ? "Editar cliente" : "Nuevo cliente"}
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
              <Field label="Marca" full>
                <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} autoFocus />
              </Field>
              <Field label="Persona de contacto">
                <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
              </Field>
              <Field label="Rubro">
                <Input value={form.rubro} onChange={(e) => setForm({ ...form, rubro: e.target.value })} />
              </Field>
              <Field label="Teléfono">
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Instagram / redes">
                <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@marca" />
              </Field>
              <Field label="Estado">
                <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoCliente })}>
                  {ESTADOS_CLIENTE.map((e) => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha de inicio">
                <Input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} />
              </Field>
              <Field label="Fecha del último aumento">
                <Input type="date" value={form.fechaUltimoAumento} onChange={(e) => setForm({ ...form, fechaUltimoAumento: e.target.value })} />
              </Field>
              <Field label="Abono mensual">
                <Input type="number" min={0} value={form.abonoMensual || ""} onChange={(e) => setForm({ ...form, abonoMensual: Number(e.target.value) })} />
              </Field>
              <Field label="Moneda">
                <Select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value as Moneda })}>
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </Select>
              </Field>
              <Field label="Día habitual de pago">
                <Input value={form.fechaPago} onChange={(e) => setForm({ ...form, fechaPago: e.target.value })} placeholder="Ej: 10" />
              </Field>
              <Field label="Modalidad de pago">
                <Input value={form.modalidadPago} onChange={(e) => setForm({ ...form, modalidadPago: e.target.value })} placeholder="Transferencia, adelantado…" />
              </Field>
            </FormGrid>

            <Field label="Servicios contratados">
              <div className="flex flex-wrap gap-1.5">
                {data.servicios.length === 0 && <span className="text-[11px] text-text3">Cargá servicios primero en el módulo Servicios.</span>}
                {data.servicios.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => toggleServicio(s.id)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors ${
                      form.serviciosContratados.includes(s.id)
                        ? "border-accent/30 bg-accent-dim text-accent"
                        : "border-border bg-surface2 text-text3"
                    }`}
                  >
                    {s.nombre}
                  </div>
                ))}
              </div>
            </Field>

            <Field label="Equipo asignado">
              <div className="flex flex-wrap gap-1.5">
                {data.equipo.length === 0 && <span className="text-[11px] text-text3">Cargá personas primero en el módulo Equipo.</span>}
                {data.equipo.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => toggleEquipo(p.id)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[11px] transition-colors ${
                      form.equipoAsignado.includes(p.id)
                        ? "border-accent/30 bg-accent-dim text-accent"
                        : "border-border bg-surface2 text-text3"
                    }`}
                  >
                    {p.nombre}
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

      {/* Detalle */}
      <Modal open={detalle !== null} onClose={() => setDetalleId(null)} title={detalle?.marca ?? ""} wide>
        {detalle && (
          <div>
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: "resumen", label: "Resumen" },
                { value: "presupuestos", label: "Presupuestos" },
                { value: "pagos", label: "Pagos" },
                { value: "rentabilidad", label: "Rentabilidad" },
              ]}
            />

            {tab === "resumen" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <InfoRow label="Contacto" value={detalle.contacto || "—"} />
                  <InfoRow label="Teléfono" value={detalle.telefono || "—"} />
                  <InfoRow label="Email" value={detalle.email || "—"} />
                  <InfoRow label="Instagram" value={detalle.instagram || "—"} />
                  <InfoRow label="Rubro" value={detalle.rubro || "—"} />
                </div>
                <div>
                  <InfoRow label="Estado" value={<Badge color={ESTADO_BADGE[detalle.estado]}>{ESTADOS_CLIENTE.find((e) => e.value === detalle.estado)?.label}</Badge>} />
                  <InfoRow label="Abono mensual" value={detalle.abonoMensual > 0 ? fMoney(detalle.abonoMensual, detalle.moneda) : "—"} />
                  <InfoRow label="Día de pago" value={detalle.fechaPago || "—"} />
                  <InfoRow label="Modalidad de pago" value={detalle.modalidadPago || "—"} />
                  <InfoRow label="Fecha de inicio" value={detalle.fechaInicio || "—"} />
                </div>
                {detalle.observaciones && (
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-text3">Observaciones</div>
                    <p className="text-[12.5px] text-text2">{detalle.observaciones}</p>
                  </div>
                )}
              </div>
            )}

            {tab === "presupuestos" && (
              presupuestosCliente.length === 0 ? (
                <EmptyState text="Sin presupuestos para este cliente todavía." />
              ) : (
                <TableWrap>
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr>
                        <Th>N°</Th>
                        <Th>Fecha</Th>
                        <Th>Estado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {presupuestosCliente.map((p) => (
                        <TrHover key={p.id}>
                          <Td main>#{p.numero}</Td>
                          <Td>{p.fecha}</Td>
                          <Td>{ESTADOS_PRESUPUESTO.find((e) => e.value === p.estado)?.label}</Td>
                        </TrHover>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )
            )}

            {tab === "pagos" && (
              pagosCliente.length === 0 ? (
                <EmptyState text="Sin movimientos registrados para este cliente." />
              ) : (
                <TableWrap>
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr>
                        <Th>Fecha</Th>
                        <Th>Descripción</Th>
                        <Th>Estado</Th>
                        <Th>Monto</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagosCliente
                        .sort((a, b) => b.fecha.localeCompare(a.fecha))
                        .map((m) => (
                          <TrHover key={m.id}>
                            <Td>{m.fecha}</Td>
                            <Td main>{m.descripcion}</Td>
                            <Td>
                              <Badge color={m.estado === "cobrado" || m.estado === "pagado" ? "green" : "orange"}>{m.estado}</Badge>
                            </Td>
                            <Td>{fMoney(m.monto, m.moneda)}</Td>
                          </TrHover>
                        ))}
                    </tbody>
                  </table>
                </TableWrap>
              )
            )}

            {tab === "rentabilidad" && rentabilidadTotal && (
              <div>
                <InfoRow label="Ingresos totales registrados" value={fARS(rentabilidadTotal.ingresos)} color="blue" />
                <InfoRow label="Gastos atribuidos" value={fARS(rentabilidadTotal.gastos)} color="orange" />
                <InfoRow label="Ganancia" value={fARS(rentabilidadTotal.ganancia)} color={rentabilidadTotal.ganancia >= 0 ? "green" : "red"} />
                <InfoRow label="Margen" value={fPct(rentabilidadTotal.margen, 1)} color={rentabilidadTotal.margen >= 0 ? "green" : "red"} />
                <p className="mt-3 text-[11px] text-text3">
                  Calculado a partir de los movimientos de Finanzas vinculados a este cliente (histórico completo).
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
