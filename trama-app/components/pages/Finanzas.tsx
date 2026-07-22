"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { usePeriod, MESES } from "@/lib/period";
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
  KpiCard,
  PageHeader,
  Select,
  StatGrid,
  Td,
  Th,
  TableWrap,
  Textarea,
  TrHover,
} from "@/components/ui";
import { TIPOS_MOVIMIENTO, type EstadoMovimiento, type Moneda, type Movimiento, type TipoMovimiento } from "@/lib/types";
import { esIngreso, fMoney, inPeriod, movimientoEnARS, resumenMes, todayISO } from "@/lib/calc";

function emptyForm(): Movimiento {
  return {
    id: "",
    fecha: todayISO(),
    tipo: "ingreso_cliente",
    categoria: "",
    descripcion: "",
    clienteId: null,
    proyectoId: null,
    personaId: null,
    monto: 0,
    moneda: "ARS",
    tipoCambio: 1000,
    medioPago: "",
    estado: "pendiente",
    comprobante: "",
    observaciones: "",
  };
}

export function Finanzas() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const { mes, anio } = usePeriod();
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [personaFiltro, setPersonaFiltro] = useState("todos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [form, setForm] = useState<Movimiento | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resumen = resumenMes(data, mes, anio);

  const lista = useMemo(() => {
    return data.movimientos
      .filter((m) => inPeriod(m.fecha, mes, anio))
      .filter((m) => clienteFiltro === "todos" || m.clienteId === clienteFiltro)
      .filter((m) => personaFiltro === "todos" || m.personaId === personaFiltro)
      .filter((m) => tipoFiltro === "todos" || m.tipo === tipoFiltro)
      .filter((m) => estadoFiltro === "todos" || m.estado === estadoFiltro)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [data.movimientos, mes, anio, clienteFiltro, personaFiltro, tipoFiltro, estadoFiltro]);

  function openForm(m?: Movimiento) {
    if (m) {
      setEditingId(m.id);
      setForm({ ...m });
    } else {
      setEditingId(null);
      setForm(emptyForm());
    }
  }

  function save() {
    if (!form) return;
    if (!form.descripcion.trim() || !form.monto) {
      toast("Completá descripción y un monto válido.", "error");
      return;
    }
    const payload: Movimiento = { ...form, id: editingId ?? uid("mov") };
    setData((d) => ({
      ...d,
      movimientos: editingId ? d.movimientos.map((m) => (m.id === editingId ? payload : m)) : [...d.movimientos, payload],
    }));
    toast(editingId ? "Movimiento actualizado." : "Movimiento cargado.");
    setForm(null);
    setEditingId(null);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, movimientos: d.movimientos.filter((m) => m.id !== id) }));
    toast("Movimiento eliminado.", "info");
    setForm(null);
    setEditingId(null);
  }

  return (
    <div>
      <PageHeader
        title="Finanzas mensuales"
        sub={`${MESES[mes - 1]} ${anio}`}
        right={<Button onClick={() => openForm()}>+ Nuevo movimiento</Button>}
      />

      <StatGrid>
        <KpiCard label="Facturación" value={fMoney(resumen.facturacion)} color="blue" />
        <KpiCard label="Cobrado" value={fMoney(resumen.cobrado)} color="green" />
        <KpiCard label="Pendiente de cobro" value={fMoney(resumen.pendienteCobro)} color="orange" />
        <KpiCard label="Gastos" value={fMoney(resumen.gastos)} color="orange" />
        <KpiCard label="Sueldos y colaboradoras" value={fMoney(resumen.sueldos)} color="purple" />
        <KpiCard label="Ganancia neta" value={fMoney(resumen.gananciaNeta)} color={resumen.gananciaNeta >= 0 ? "green" : "red"} />
      </StatGrid>

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Cliente">
            <Select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              {data.clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.marca}</option>
              ))}
            </Select>
          </Field>
          <Field label="Persona">
            <Select value={personaFiltro} onChange={(e) => setPersonaFiltro(e.target.value)}>
              <option value="todos">Todas</option>
              {data.equipo.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
              <option value="cobrado">Cobrado</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        {lista.length === 0 ? (
          <EmptyState icon="▥" text="Sin movimientos para este período y filtros." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Descripción</Th>
                  <Th>Cliente</Th>
                  <Th>Persona</Th>
                  <Th>Estado</Th>
                  <Th>Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => {
                  const cliente = data.clientes.find((c) => c.id === m.clienteId);
                  const persona = data.equipo.find((p) => p.id === m.personaId);
                  const ingreso = esIngreso(m.tipo);
                  return (
                    <TrHover key={m.id}>
                      <Td>{m.fecha}</Td>
                      <Td>{TIPOS_MOVIMIENTO.find((t) => t.value === m.tipo)?.label}</Td>
                      <Td main>{m.descripcion}</Td>
                      <Td>{cliente?.marca ?? "—"}</Td>
                      <Td>{persona?.nombre ?? "—"}</Td>
                      <Td>
                        <Badge color={m.estado === "pendiente" ? "orange" : "green"}>{m.estado}</Badge>
                      </Td>
                      <Td className={ingreso ? "text-green" : "text-red"}>
                        {ingreso ? "+" : "-"}{fMoney(movimientoEnARS(m))}
                      </Td>
                      <Td>
                        <button onClick={() => openForm(m)} className="text-text3 hover:text-accent">Editar</button>
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
        title={editingId ? "Editar movimiento" : "Nuevo movimiento"}
        wide
        footer={
          <>
            {editingId && (
              <Button variant="danger" onClick={() => eliminar(editingId)}>Eliminar</Button>
            )}
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </>
        }
      >
        {form && (
          <div className="flex flex-col gap-4">
            <FormGrid>
              <Field label="Fecha">
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </Field>
              <Field label="Tipo">
                <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMovimiento })}>
                  {TIPOS_MOVIMIENTO.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Categoría">
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} list="categorias-gastos" />
                <datalist id="categorias-gastos">
                  {data.config.categoriasGastos.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Descripción" full>
                <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} autoFocus />
              </Field>
              <Field label="Cliente relacionado">
                <Select value={form.clienteId ?? ""} onChange={(e) => setForm({ ...form, clienteId: e.target.value || null })}>
                  <option value="">—</option>
                  {data.clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.marca}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Persona relacionada">
                <Select value={form.personaId ?? ""} onChange={(e) => setForm({ ...form, personaId: e.target.value || null })}>
                  <option value="">—</option>
                  {data.equipo.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Monto">
                <Input type="number" min={0} value={form.monto || ""} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
              </Field>
              <Field label="Moneda">
                <Select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value as Moneda })}>
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </Select>
              </Field>
              {form.moneda === "USD" && (
                <Field label="Tipo de cambio usado">
                  <Input type="number" min={0} value={form.tipoCambio} onChange={(e) => setForm({ ...form, tipoCambio: Number(e.target.value) })} />
                </Field>
              )}
              <Field label="Medio de pago">
                <Input value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })} placeholder="Transferencia, efectivo…" />
              </Field>
              <Field label="Estado">
                <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoMovimiento })}>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                  <option value="cobrado">Cobrado</option>
                </Select>
              </Field>
              <Field label="Comprobante (link o referencia)">
                <Input value={form.comprobante} onChange={(e) => setForm({ ...form, comprobante: e.target.value })} />
              </Field>
            </FormGrid>
            <Field label="Observaciones">
              <Textarea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
