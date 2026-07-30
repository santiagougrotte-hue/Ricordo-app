"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { usePeriod } from "@/lib/period";
import { crearMovimientoCajaDesdePedido, discrepanciasCaja, fARS, inPeriod, saldoCaja } from "@/lib/calc";
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
  FilterTabs,
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

function MovimientosTab() {
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
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>+ Movimiento</Button>
      </div>

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

function ConciliacionTab() {
  const { data, setData } = useStore();
  const { toast } = useToast();

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  const discrepancias = useMemo(() => discrepanciasCaja(data), [data]);

  function corregir(idDetalle: string) {
    setData((d) => {
      const pedido = d.pedidos.find((p) => p.id_detalle === idDetalle);
      if (!pedido) return d;
      const existente = d.caja_movimientos.find((m) => m.ref === idDetalle);
      const caja_movimientos = existente
        ? d.caja_movimientos.map((m) => (m.ref === idDetalle ? { ...m, monto: pedido.precio_neto } : m))
        : [...d.caja_movimientos, crearMovimientoCajaDesdePedido(pedido)];
      return { ...d, caja_movimientos };
    });
    toast("Movimiento corregido");
  }

  function corregirTodos() {
    setData((d) => {
      let caja_movimientos = d.caja_movimientos;
      for (const { pedido } of discrepanciasCaja(d)) {
        const existente = caja_movimientos.find((m) => m.ref === pedido.id_detalle);
        caja_movimientos = existente
          ? caja_movimientos.map((m) => (m.ref === pedido.id_detalle ? { ...m, monto: pedido.precio_neto } : m))
          : [...caja_movimientos, crearMovimientoCajaDesdePedido(pedido)];
      }
      return { ...d, caja_movimientos };
    });
    toast("Todas las discrepancias corregidas");
  }

  function marcarRevisado(idDetalle: string) {
    setData((d) => ({ ...d, conciliacion_ignorados: [...(d.conciliacion_ignorados ?? []), idDetalle] }));
    toast("Marcado como revisado, sin cobrar", "info");
  }

  return (
    <div>
      <Card
        title="Pedidos entregados sin conciliar"
        right={
          discrepancias.length > 0 ? (
            <Button size="sm" onClick={corregirTodos}>
              Corregir todos
            </Button>
          ) : undefined
        }
      >
        {discrepancias.length === 0 ? (
          <EmptyState text="No hay discrepancias entre pedidos entregados y caja. Todo concilia." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>Producto</Th>
                  <Th>Esperado (precio neto)</Th>
                  <Th>Cargado en Caja</Th>
                  <Th>Diferencia</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {discrepancias.map(({ pedido, movimiento }) => {
                  const diferencia = pedido.precio_neto - (movimiento?.monto ?? 0);
                  return (
                    <TrHover key={pedido.id_detalle}>
                      <Td>{pedido.fecha}</Td>
                      <Td main>{clienteNombre(pedido.id_cliente)}</Td>
                      <Td>
                        {pedido.nombre_producto}
                        {pedido.gusto ? ` (${pedido.gusto})` : ""}
                      </Td>
                      <Td>{fARS(pedido.precio_neto)}</Td>
                      <Td>{movimiento ? fARS(movimiento.monto) : "—"}</Td>
                      <Td className={diferencia === 0 ? "" : "text-red"}>{fARS(diferencia)}</Td>
                      <Td>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => corregir(pedido.id_detalle)}>
                            Crear/ajustar movimiento
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => marcarRevisado(pedido.id_detalle)}>
                            Revisado, sin cobrar
                          </Button>
                        </div>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

export function Caja() {
  const { data } = useStore();
  const [tab, setTab] = useState("movimientos");

  // Siempre visible: cuánto de lo vendido (pedidos entregados) todavía no tiene su
  // ingreso de caja cargado, o cargado con un monto distinto (Parte A, Fase 4).
  const discrepancias = useMemo(() => discrepanciasCaja(data), [data]);
  const diferenciaTotal = discrepancias.reduce((acc, { pedido, movimiento }) => acc + (pedido.precio_neto - (movimiento?.monto ?? 0)), 0);

  return (
    <div>
      <PageHeader title="Caja" sub="Movimientos de ingresos y egresos" />

      <Card title="Ventas vs. ingresos de caja cargados" className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={`text-2xl font-[750] tracking-[-0.8px] [font-variant-numeric:tabular-nums] ${diferenciaTotal === 0 ? "text-green" : "text-red"}`}>
              {fARS(diferenciaTotal)}
            </div>
            <div className="text-[11.5px] text-text3">
              {discrepancias.length === 0
                ? "Todo lo entregado tiene su ingreso cargado y coincide."
                : `${discrepancias.length} ${discrepancias.length === 1 ? "pedido entregado" : "pedidos entregados"} sin conciliar en Caja.`}
            </div>
          </div>
          {discrepancias.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setTab("conciliacion")}>
              Ver conciliación
            </Button>
          )}
        </div>
      </Card>

      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "movimientos", label: "Movimientos" },
          { value: "conciliacion", label: "Conciliación" },
        ]}
      />
      {tab === "movimientos" ? <MovimientosTab /> : <ConciliacionTab />}
    </div>
  );
}
