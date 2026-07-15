"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { usePeriod } from "@/lib/period";
import { fARS, inPeriod, saldoCaja } from "@/lib/calc";
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
  StatGrid,
  KpiCard,
  Badge,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { CajaMovimiento, TipoMovCaja } from "@/lib/types";

function emptyForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    tipo: "ingreso" as TipoMovCaja,
    concepto: "",
    monto: 0,
    metodo: "Efectivo",
    ref: "",
  };
}

export function Caja() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saldoAnterior, setSaldoAnterior] = useState(data.saldo_anterior_caja.valor);

  const movsPeriodo = useMemo(
    () =>
      data.caja_movimientos
        .filter((m) => inPeriod(m.fecha, mes, anio))
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
    [data.caja_movimientos, mes, anio]
  );

  const ingresosPeriodo = movsPeriodo.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + m.monto, 0);
  const egresosPeriodo = movsPeriodo.filter((m) => m.tipo === "egreso").reduce((a, m) => a + m.monto, 0);
  const saldoActual = saldoCaja(data);

  const movsConSaldo = useMemo(() => {
    return movsPeriodo.reduce<Array<CajaMovimiento & { saldoAcumulado: number }>>((acc, m) => {
      const previo = acc.length > 0 ? acc[acc.length - 1].saldoAcumulado : data.saldo_anterior_caja.valor;
      const saldoAcumulado = previo + (m.tipo === "ingreso" ? m.monto : -m.monto);
      return [...acc, { ...m, saldoAcumulado }];
    }, []);
  }, [movsPeriodo, data.saldo_anterior_caja]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(m: CajaMovimiento) {
    setEditing(m.id);
    setForm({ fecha: m.fecha, tipo: m.tipo, concepto: m.concepto, monto: m.monto, metodo: m.metodo, ref: m.ref ?? "" });
    setModalOpen(true);
  }
  function save() {
    if (!form.concepto || form.monto <= 0) {
      toast("Completá concepto y monto", "error");
      return;
    }
    if (editing) {
      setData((d) => ({ ...d, caja_movimientos: d.caja_movimientos.map((m) => (m.id === editing ? { ...m, ...form } : m)) }));
      toast("Movimiento actualizado");
    } else {
      setData((d) => ({ ...d, caja_movimientos: [...d.caja_movimientos, { id: uid("CAJ"), ...form }] }));
      toast("Movimiento registrado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    setData((d) => ({ ...d, caja_movimientos: d.caja_movimientos.filter((m) => m.id !== id) }));
    toast("Movimiento eliminado", "info");
  }
  function guardarSaldoAnterior() {
    setData((d) => ({ ...d, saldo_anterior_caja: { valor: saldoAnterior } }));
    toast("Saldo anterior actualizado");
  }

  return (
    <div>
      <PageHeader title="Caja" sub="Movimientos de ingresos y egresos" right={<Button onClick={openNew}>+ Movimiento</Button>} />

      <StatGrid>
        <KpiCard label="Saldo actual" value={fARS(saldoActual)} color="gold" />
        <KpiCard label="Ingresos del período" value={fARS(ingresosPeriodo)} color="green" />
        <KpiCard label="Egresos del período" value={fARS(egresosPeriodo)} color="red" />
      </StatGrid>

      <Card title="Saldo anterior (arrastre)" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Saldo anterior">
            <Input type="number" value={saldoAnterior} onChange={(e) => setSaldoAnterior(Number(e.target.value))} />
          </Field>
          <Button onClick={guardarSaldoAnterior}>Guardar</Button>
        </div>
      </Card>

      <Card>
        {movsPeriodo.length === 0 ? (
          <EmptyState text="Sin movimientos en este período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Concepto</Th>
                  <Th>Tipo</Th>
                  <Th>Monto</Th>
                  <Th>Método</Th>
                  <Th>Saldo acumulado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {movsConSaldo.map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td main>{m.concepto}</Td>
                    <Td>
                      <Badge color={m.tipo === "ingreso" ? "green" : "red"}>{m.tipo}</Badge>
                    </Td>
                    <Td className={m.tipo === "ingreso" ? "text-green" : "text-red"}>
                      {m.tipo === "ingreso" ? "+" : "-"}
                      {fARS(m.monto)}
                    </Td>
                    <Td>{m.metodo}</Td>
                    <Td>{fARS(m.saldoAcumulado)}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(m.id)}>
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
        title={editing ? "Editar Movimiento" : "Nuevo Movimiento"}
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
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMovCaja })}>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Concepto" full>
            <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </Field>
          <Field label="Monto">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Método">
            <Input value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value })} />
          </Field>
          <Field label="Referencia">
            <Input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
