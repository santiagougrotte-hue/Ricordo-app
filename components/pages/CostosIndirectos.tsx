"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { usePeriod } from "@/lib/period";
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
  Select,
  Badge,
  StatGrid,
  KpiCard,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { CostoIndirecto, TipoCosto } from "@/lib/types";

function emptyForm(mes: number, anio: number) {
  return { descripcion: "", monto: 0, categoria: "General", mes, anio, tipo_costo: "Fijo" as TipoCosto };
}

export function CostosIndirectos() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(mes, anio));
  const [mostrarAnulados, setMostrarAnulados] = useState(false);

  const delPeriodoTodos = useMemo(
    () => data.costos_indirectos.filter((c) => c.mes === mes && c.anio === anio),
    [data.costos_indirectos, mes, anio]
  );
  const delPeriodo = mostrarAnulados ? delPeriodoTodos : delPeriodoTodos.filter((c) => !c.anulado);
  const activos = delPeriodoTodos.filter((c) => !c.anulado);
  const total = activos.reduce((a, c) => a + c.monto, 0);
  const totalFijo = activos.filter((c) => (c.tipo_costo ?? "Fijo") === "Fijo").reduce((a, c) => a + c.monto, 0);
  const totalVariable = activos.filter((c) => c.tipo_costo === "Variable").reduce((a, c) => a + c.monto, 0);

  function openNew() {
    setEditing(null);
    setForm(emptyForm(mes, anio));
    setModalOpen(true);
  }
  function openEdit(c: CostoIndirecto) {
    setEditing(c.id);
    setForm({ descripcion: c.descripcion, monto: c.monto, categoria: c.categoria, mes: c.mes, anio: c.anio, tipo_costo: c.tipo_costo ?? "Fijo" });
    setModalOpen(true);
  }
  function save() {
    if (!form.descripcion) {
      toast("Ingresá una descripción", "error");
      return;
    }
    if (editing) {
      setData((d) => ({ ...d, costos_indirectos: d.costos_indirectos.map((c) => (c.id === editing ? { ...c, ...form } : c)) }));
      toast("Costo actualizado");
    } else {
      setData((d) => ({ ...d, costos_indirectos: [...d.costos_indirectos, { id: uid("IND"), ...form }] }));
      toast("Costo creado");
    }
    setModalOpen(false);
  }
  // Soft-delete: se anula en vez de borrarse — se excluye de los totales pero queda para
  // trazabilidad, igual que el resto de los registros financieros.
  function eliminar(id: string) {
    if (!confirm("¿Anular este costo indirecto? Se excluye de los totales pero el registro queda para trazabilidad.")) return;
    setData((d) => ({ ...d, costos_indirectos: d.costos_indirectos.map((c) => (c.id === id ? { ...c, anulado: true } : c)) }));
    toast("Costo anulado", "info");
  }
  function reactivar(id: string) {
    setData((d) => ({ ...d, costos_indirectos: d.costos_indirectos.map((c) => (c.id === id ? { ...c, anulado: false } : c)) }));
    toast("Costo reactivado");
  }

  return (
    <div>
      <PageHeader
        title="Costos Indirectos"
        sub="Costos del período — se clasifican como Fijo o Variable para el EERR y el punto de equilibrio"
        right={
          <>
            <Button variant={mostrarAnulados ? "primary" : "ghost"} onClick={() => setMostrarAnulados((v) => !v)}>
              {mostrarAnulados ? "Ocultar anulados" : "Mostrar anulados"}
            </Button>
            <Button onClick={openNew}>+ Nuevo</Button>
          </>
        }
      />

      <StatGrid>
        <KpiCard label="Total del período" value={fARS(total)} color="orange" />
        <KpiCard label="Fijos" value={fARS(totalFijo)} color="blue" />
        <KpiCard label="Variables" value={fARS(totalVariable)} color="red" />
        <KpiCard label="Conceptos" value={delPeriodo.length} color="purple" />
      </StatGrid>

      <Card color="red">
        {delPeriodo.length === 0 ? (
          <EmptyState text="Sin costos indirectos en este período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Tipo</Th>
                  <Th>Monto</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {delPeriodo.map((c) => (
                  <TrHover key={c.id} className={c.anulado ? "opacity-50" : undefined}>
                    <Td main>{c.descripcion}</Td>
                    <Td>{c.categoria}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <Badge color={(c.tipo_costo ?? "Fijo") === "Variable" ? "red" : "blue"}>{c.tipo_costo ?? "Fijo"}</Badge>
                        {c.anulado && <Badge color="red">Anulado</Badge>}
                      </div>
                    </Td>
                    <Td>{fARS(c.monto)}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          Editar
                        </Button>
                        {c.anulado ? (
                          <Button size="sm" variant="green" onClick={() => reactivar(c.id)}>
                            Reactivar
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => eliminar(c.id)}>
                            Anular
                          </Button>
                        )}
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
        title={editing ? "Editar Costo Indirecto" : "Nuevo Costo Indirecto"}
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
          <Field label="Descripción" full>
            <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
          <Field label="Categoría">
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          </Field>
          <Field label="Tipo de costo">
            <Select value={form.tipo_costo} onChange={(e) => setForm({ ...form, tipo_costo: e.target.value as TipoCosto })}>
              <option value="Fijo">Fijo</option>
              <option value="Variable">Variable (ej. comisiones, envíos)</option>
            </Select>
          </Field>
          <Field label="Monto">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Mes">
            <Input type="number" min={1} max={12} value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })} />
          </Field>
          <Field label="Año">
            <Input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
