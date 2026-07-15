"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Button,
  FilterTabs,
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
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fARS, inPeriod } from "@/lib/calc";
import type { Canal, EstadoPedido, Pedido } from "@/lib/types";

const ESTADOS: EstadoPedido[] = ["Confirmado", "Produccion", "Entregado", "Cancelado"];
const ESTADO_COLOR: Record<EstadoPedido, "blue" | "orange" | "green" | "red"> = {
  Confirmado: "blue",
  Produccion: "orange",
  Entregado: "green",
  Cancelado: "red",
};

function emptyForm() {
  return {
    id_cliente: "",
    id_producto: "",
    gusto: "",
    cantidad: 1,
    precio_unitario: 0,
    descuento_monto: 0,
    fecha: new Date().toISOString().slice(0, 10),
    estado: "Confirmado" as EstadoPedido,
    canal: "Minorista" as Canal,
    km_envio: 0,
    costo_envio: 0,
    metodo_pago: "",
    notas: "",
  };
}

export function Pedidos() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();

  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [canalFiltro, setCanalFiltro] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  const filtrados = useMemo(() => {
    return data.pedidos
      .filter((p) => inPeriod(p.fecha, mes, anio))
      .filter((p) => estadoFiltro === "todos" || p.estado === estadoFiltro)
      .filter((p) => !canalFiltro || p.canal === canalFiltro)
      .filter((p) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
          p.nombre_producto.toLowerCase().includes(s) ||
          clienteNombre(p.id_cliente).toLowerCase().includes(s)
        );
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [data.pedidos, data.clientes, mes, anio, estadoFiltro, canalFiltro, search]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(p: Pedido) {
    setEditing(p.id_detalle);
    setForm({
      id_cliente: p.id_cliente,
      id_producto: p.id_producto,
      gusto: p.gusto ?? "",
      cantidad: p.cantidad,
      precio_unitario: p.precio_unitario,
      descuento_monto: p.descuento_monto,
      fecha: p.fecha,
      estado: p.estado,
      canal: p.canal,
      km_envio: p.km_envio,
      costo_envio: p.costo_envio,
      metodo_pago: p.metodo_pago ?? "",
      notas: p.notas ?? "",
    });
    setModalOpen(true);
  }

  function save() {
    if (!form.id_cliente || !form.id_producto) {
      toast("Completá cliente y producto", "error");
      return;
    }
    const producto = data.productos.find((pr) => pr.id === form.id_producto);
    const total = form.precio_unitario * form.cantidad;
    const neto = total - form.descuento_monto;

    if (editing) {
      setData((d) => ({
        ...d,
        pedidos: d.pedidos.map((p) =>
          p.id_detalle === editing
            ? {
                ...p,
                ...form,
                nombre_producto: producto?.nombre ?? p.nombre_producto,
                precio_total: total,
                precio_neto: neto,
              }
            : p
        ),
      }));
      toast("Pedido actualizado");
    } else {
      const idPedido = uid("PED");
      const nuevo: Pedido = {
        id_pedido: idPedido,
        id_detalle: idPedido,
        ...form,
        nombre_producto: producto?.nombre ?? "",
        precio_total: total,
        precio_neto: neto,
      };
      setData((d) => ({ ...d, pedidos: [...d.pedidos, nuevo] }));
      toast("Pedido creado");
    }
    setModalOpen(false);
  }

  function cambiarEstado(idDetalle: string, estado: EstadoPedido) {
    setData((d) => ({
      ...d,
      pedidos: d.pedidos.map((p) => (p.id_detalle === idDetalle ? { ...p, estado } : p)),
    }));
    toast(`Estado → ${estado}`);
  }

  function eliminar(idDetalle: string) {
    setData((d) => ({ ...d, pedidos: d.pedidos.filter((p) => p.id_detalle !== idDetalle) }));
    toast("Pedido eliminado", "info");
  }

  return (
    <div>
      <PageHeader
        title="Pedidos"
        sub="Gestión de pedidos"
        right={<Button onClick={openNew}>+ Nuevo Pedido</Button>}
      />

      <FilterTabs
        value={estadoFiltro}
        onChange={setEstadoFiltro}
        options={[
          { value: "todos", label: "Todos" },
          { value: "Confirmado", label: "Confirmados" },
          { value: "Produccion", label: "Producción" },
          { value: "Entregado", label: "Entregados" },
          { value: "Cancelado", label: "Cancelados" },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative min-w-[180px] max-w-[300px] flex-1">
          <Input placeholder="Buscar cliente o producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)} style={{ width: 160 }}>
          <option value="">Todos los canales</option>
          <option value="Minorista">Minorista</option>
          <option value="Mayorista">Mayorista</option>
        </Select>
      </div>

      <Card>
        {filtrados.length === 0 ? (
          <EmptyState text="No hay pedidos en este período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Cliente</Th>
                  <Th>Producto</Th>
                  <Th>Cant.</Th>
                  <Th>Precio neto</Th>
                  <Th>Envío</Th>
                  <Th>Canal</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <TrHover key={p.id_detalle}>
                    <Td>{p.fecha}</Td>
                    <Td main>{clienteNombre(p.id_cliente)}</Td>
                    <Td>
                      {p.nombre_producto}
                      {p.gusto ? ` (${p.gusto})` : ""}
                    </Td>
                    <Td>{p.cantidad}</Td>
                    <Td main>{fARS(p.precio_neto)}</Td>
                    <Td>{p.costo_envio ? fARS(p.costo_envio) : "—"}</Td>
                    <Td>{p.canal}</Td>
                    <Td>
                      <Select
                        value={p.estado}
                        onChange={(e) => cambiarEstado(p.id_detalle, e.target.value as EstadoPedido)}
                        style={{ width: 120, padding: "4px 8px" }}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(p.id_detalle)}>
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
        title={editing ? "Editar Pedido" : "Nuevo Pedido"}
        wide
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
          <Field label="Cliente">
            <Select value={form.id_cliente} onChange={(e) => setForm({ ...form, id_cliente: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Producto">
            <Select
              value={form.id_producto}
              onChange={(e) => {
                const prod = data.productos.find((pr) => pr.id === e.target.value);
                setForm({ ...form, id_producto: e.target.value, precio_unitario: prod?.precio_venta ?? 0 });
              }}
            >
              <option value="">Seleccionar…</option>
              {data.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gusto / Variante">
            <Input value={form.gusto} onChange={(e) => setForm({ ...form, gusto: e.target.value })} />
          </Field>
          <Field label="Cantidad">
            <Input
              type="number"
              value={form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })}
            />
          </Field>
          <Field label="Precio unitario">
            <Input
              type="number"
              value={form.precio_unitario}
              onChange={(e) => setForm({ ...form, precio_unitario: Number(e.target.value) })}
            />
          </Field>
          <Field label="Descuento $">
            <Input
              type="number"
              value={form.descuento_monto}
              onChange={(e) => setForm({ ...form, descuento_monto: Number(e.target.value) })}
            />
          </Field>
          <Field label="Precio neto (calculado)">
            <Input readOnly value={fARS(form.precio_unitario * form.cantidad - form.descuento_monto)} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoPedido })}>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal">
            <Select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as Canal })}>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
            </Select>
          </Field>
          <Field label="Km de envío">
            <Input
              type="number"
              value={form.km_envio}
              onChange={(e) => setForm({ ...form, km_envio: Number(e.target.value) })}
            />
          </Field>
          <Field label="Costo de envío">
            <Input
              type="number"
              value={form.costo_envio}
              onChange={(e) => setForm({ ...form, costo_envio: Number(e.target.value) })}
            />
          </Field>
          <Field label="Método de pago">
            <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
