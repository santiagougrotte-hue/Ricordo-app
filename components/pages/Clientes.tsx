"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Button,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Badge,
  FormGrid,
  Field,
  Input,
  Select,
  StatGrid,
  KpiCard,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fARS, fNum } from "@/lib/calc";
import type { Canal, Cliente } from "@/lib/types";

function emptyForm() {
  return { nombre: "", canal: "Minorista" as Canal, direccion: "", telefono: "", email: "" };
}

export function Clientes() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [historialCliente, setHistorialCliente] = useState<string | null>(null);

  const stats = useMemo(() => {
    return data.clientes.map((c) => {
      const pedidos = data.pedidos.filter((p) => p.id_cliente === c.id && p.estado !== "Cancelado");
      const idsUnicos = new Set(pedidos.map((p) => p.id_pedido));
      const total = pedidos.reduce((acc, p) => acc + p.precio_neto, 0);
      return {
        cliente: c,
        totalGastado: total,
        cantidadPedidos: idsUnicos.size,
        ticketPromedio: idsUnicos.size > 0 ? total / idsUnicos.size : 0,
      };
    });
  }, [data.clientes, data.pedidos]);

  const totalClientes = data.clientes.length;
  const mayoristas = data.clientes.filter((c) => c.canal === "Mayorista").length;
  const totalFacturado = stats.reduce((acc, s) => acc + s.totalGastado, 0);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditing(c.id);
    setForm({
      nombre: c.nombre,
      canal: c.canal,
      direccion: c.direccion ?? "",
      telefono: c.telefono ?? "",
      email: c.email ?? "",
    });
    setModalOpen(true);
  }

  function save() {
    if (!form.nombre) {
      toast("Ingresá un nombre", "error");
      return;
    }
    if (editing) {
      setData((d) => ({
        ...d,
        clientes: d.clientes.map((c) => (c.id === editing ? { ...c, ...form } : c)),
      }));
      toast("Cliente actualizado");
    } else {
      setData((d) => ({ ...d, clientes: [...d.clientes, { id: uid("CLI"), ...form }] }));
      toast("Cliente creado");
    }
    setModalOpen(false);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, clientes: d.clientes.filter((c) => c.id !== id) }));
    toast("Cliente eliminado", "info");
  }

  const historial = historialCliente
    ? data.pedidos
        .filter((p) => p.id_cliente === historialCliente)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    : [];
  const clienteSel = data.clientes.find((c) => c.id === historialCliente);

  return (
    <div>
      <PageHeader title="Clientes" right={<Button onClick={openNew}>+ Nuevo</Button>} />

      <StatGrid>
        <KpiCard label="Clientes totales" value={totalClientes} color="gold" />
        <KpiCard label="Mayoristas" value={mayoristas} color="purple" />
        <KpiCard label="Facturado histórico" value={fARS(totalFacturado)} color="green" />
      </StatGrid>

      <Card>
        {stats.length === 0 ? (
          <EmptyState text="Todavía no hay clientes." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Canal</Th>
                  <Th>Teléfono</Th>
                  <Th>Total gastado</Th>
                  <Th>Pedidos</Th>
                  <Th>Ticket promedio</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {stats.map(({ cliente: c, totalGastado, cantidadPedidos, ticketPromedio }) => (
                  <TrHover key={c.id}>
                    <Td main>{c.nombre}</Td>
                    <Td>
                      <Badge color={c.canal === "Mayorista" ? "purple" : "blue"}>{c.canal}</Badge>
                    </Td>
                    <Td>{c.telefono || "—"}</Td>
                    <Td>{fARS(totalGastado)}</Td>
                    <Td>{cantidadPedidos}</Td>
                    <Td>{fARS(ticketPromedio)}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setHistorialCliente(c.id)}>
                          Historial
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(c.id)}>
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
        title={editing ? "Editar Cliente" : "Nuevo Cliente"}
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
          <Field label="Nombre" full>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Canal">
            <Select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as Canal })}>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
            </Select>
          </Field>
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Dirección" full>
            <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>

      <Modal
        open={!!historialCliente}
        onClose={() => setHistorialCliente(null)}
        title={`Historial — ${clienteSel?.nombre ?? ""}`}
        wide
      >
        {historial.length === 0 ? (
          <EmptyState text="Sin pedidos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Producto</Th>
                  <Th>Cant.</Th>
                  <Th>Neto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {historial.map((p) => (
                  <TrHover key={p.id_detalle}>
                    <Td>{p.fecha}</Td>
                    <Td main>{p.nombre_producto}</Td>
                    <Td>{fNum(p.cantidad, 0)}</Td>
                    <Td>{fARS(p.precio_neto)}</Td>
                    <Td>{p.estado}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Modal>
    </div>
  );
}
