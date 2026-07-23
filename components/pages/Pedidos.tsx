"use client";

import React, { useMemo, useState } from "react";
import { Paperclip, X } from "lucide-react";
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
  SearchInput,
  Select,
  Textarea,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Wizard } from "@/components/Wizard";
import { FileAttach } from "@/components/FileAttach";
import { fARS, inPeriod } from "@/lib/calc";
import type { Adjunto, Canal, EstadoPedido, Pedido } from "@/lib/types";

const ESTADOS: EstadoPedido[] = ["Confirmado", "Produccion", "Entregado", "Cancelado"];
const ESTADO_COLOR: Record<EstadoPedido, "blue" | "orange" | "green" | "red"> = {
  Confirmado: "blue",
  Produccion: "orange",
  Entregado: "green",
  Cancelado: "red",
};
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface LineaPedido {
  id_producto: string;
  gusto: string;
  cantidad: number;
  precio_unitario: number;
  descuento_monto: number;
}

function emptyLinea(): LineaPedido {
  return { id_producto: "", gusto: "", cantidad: 1, precio_unitario: 0, descuento_monto: 0 };
}

function emptyOrderForm() {
  return {
    id_cliente: "",
    fecha: new Date().toISOString().slice(0, 10),
    estado: "Confirmado" as EstadoPedido,
    canal: "Minorista" as Canal,
    km_envio: 0,
    costo_envio: 0,
    metodo_pago: "",
    notas: "",
    lineas: [emptyLinea()],
    adjunto: undefined as Adjunto | undefined,
  };
}

function emptyEditForm() {
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
    adjunto: undefined as Adjunto | undefined,
  };
}

export function Pedidos() {
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();

  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [canalFiltro, setCanalFiltro] = useState("");
  const [search, setSearch] = useState("");

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState(emptyOrderForm());

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm());

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  const filtrados = useMemo(() => {
    return data.pedidos
      .filter((p) => inPeriod(p.fecha, mes, anio))
      .filter((p) => estadoFiltro === "todos" || p.estado === estadoFiltro)
      .filter((p) => !canalFiltro || p.canal === canalFiltro)
      .filter((p) => {
        if (!search) return true;
        const s = search.toLowerCase();
        const nombreCliente = data.clientes.find((c) => c.id === p.id_cliente)?.nombre ?? "";
        return p.nombre_producto.toLowerCase().includes(s) || nombreCliente.toLowerCase().includes(s);
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [data.pedidos, data.clientes, mes, anio, estadoFiltro, canalFiltro, search]);

  // Agrupa las líneas por pedido para mostrar cada orden junta, aunque tenga varios productos.
  const agrupados = useMemo(() => {
    const orden: string[] = [];
    const grupos = new Map<string, Pedido[]>();
    for (const p of filtrados) {
      if (!grupos.has(p.id_pedido)) {
        orden.push(p.id_pedido);
        grupos.set(p.id_pedido, []);
      }
      grupos.get(p.id_pedido)!.push(p);
    }
    return orden.map((id) => grupos.get(id)!);
  }, [filtrados]);

  function openNew() {
    setOrderForm(emptyOrderForm());
    setOrderModalOpen(true);
  }

  function openEdit(p: Pedido) {
    setEditing(p.id_detalle);
    setEditForm({
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
      adjunto: p.adjunto,
    });
    setEditModalOpen(true);
  }

  function addLinea() {
    setOrderForm((f) => ({ ...f, lineas: [...f.lineas, emptyLinea()] }));
  }
  function quitarLinea(idx: number) {
    setOrderForm((f) => ({ ...f, lineas: f.lineas.filter((_, i) => i !== idx) }));
  }
  function actualizarLinea(idx: number, patch: Partial<LineaPedido>) {
    setOrderForm((f) => ({ ...f, lineas: f.lineas.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  }

  const totalOrden = orderForm.lineas.reduce(
    (acc, l) => acc + (l.precio_unitario * l.cantidad - l.descuento_monto),
    0
  );

  function guardarOrden() {
    if (!orderForm.id_cliente) {
      toast("Elegí un cliente", "error");
      return;
    }
    const lineasValidas = orderForm.lineas.filter((l) => l.id_producto && l.cantidad > 0);
    if (lineasValidas.length === 0) {
      toast("Agregá al menos un producto", "error");
      return;
    }

    const idPedido = uid("PED");
    const nuevos: Pedido[] = lineasValidas.map((l, idx) => {
      const producto = data.productos.find((pr) => pr.id === l.id_producto);
      const total = l.precio_unitario * l.cantidad;
      const neto = total - l.descuento_monto;
      return {
        id_pedido: idPedido,
        id_detalle: `${idPedido}-${LETRAS[idx] ?? idx}`,
        id_cliente: orderForm.id_cliente,
        id_producto: l.id_producto,
        nombre_producto: producto?.nombre ?? "",
        gusto: l.gusto,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        precio_total: total,
        descuento_monto: l.descuento_monto,
        precio_neto: neto,
        fecha: orderForm.fecha,
        estado: orderForm.estado,
        canal: orderForm.canal,
        km_envio: orderForm.km_envio,
        costo_envio: orderForm.costo_envio,
        metodo_pago: orderForm.metodo_pago,
        notas: orderForm.notas,
        adjunto: orderForm.adjunto,
      };
    });

    setData((d) => ({ ...d, pedidos: [...d.pedidos, ...nuevos] }));
    toast(lineasValidas.length > 1 ? `Pedido creado con ${lineasValidas.length} productos` : "Pedido creado");
    setOrderModalOpen(false);
  }

  function guardarEdicion() {
    if (!editing) return;
    if (!editForm.id_cliente || !editForm.id_producto) {
      toast("Completá cliente y producto", "error");
      return;
    }
    const producto = data.productos.find((pr) => pr.id === editForm.id_producto);
    const total = editForm.precio_unitario * editForm.cantidad;
    const neto = total - editForm.descuento_monto;
    setData((d) => ({
      ...d,
      pedidos: d.pedidos.map((p) =>
        p.id_detalle === editing
          ? { ...p, ...editForm, nombre_producto: producto?.nombre ?? p.nombre_producto, precio_total: total, precio_neto: neto }
          : p
      ),
    }));
    toast("Pedido actualizado");
    setEditModalOpen(false);
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
        <div className="min-w-[180px] max-w-[300px] flex-1">
          <SearchInput placeholder="Buscar cliente o producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <Th>Producto</Th>
                  <Th>Cant.</Th>
                  <Th>Precio neto</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {agrupados.map((grupo) => {
                  const primero = grupo[0];
                  const totalOrden = grupo.reduce((acc, p) => acc + p.precio_neto, 0);
                  return (
                    <React.Fragment key={primero.id_pedido}>
                      <tr className="bg-surface2/60">
                        <Td colSpan={5} className="py-2">
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                              <span className="font-semibold text-text">{primero.fecha}</span>
                              <span className="text-text3">·</span>
                              <span className="font-medium text-text">{clienteNombre(primero.id_cliente)}</span>
                              <span className="text-text3">·</span>
                              <span className="text-text2">{primero.canal}</span>
                              {primero.costo_envio > 0 && (
                                <>
                                  <span className="text-text3">·</span>
                                  <span className="text-text2">Envío {fARS(primero.costo_envio)}</span>
                                </>
                              )}
                              {primero.adjunto && (
                                <a
                                  href={primero.adjunto.data}
                                  download={primero.adjunto.nombre}
                                  title={primero.adjunto.nombre}
                                  className="text-text3 hover:text-accent"
                                >
                                  <Paperclip className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                            <div className="text-[12.5px]">
                              <span className="text-text3">Total pedido:&nbsp;</span>
                              <span className="font-semibold text-accent">{fARS(totalOrden)}</span>
                            </div>
                          </div>
                        </Td>
                      </tr>
                      {grupo.map((p) => (
                        <TrHover key={p.id_detalle}>
                          <Td main>
                            {p.nombre_producto}
                            {p.gusto ? ` (${p.gusto})` : ""}
                          </Td>
                          <Td>{p.cantidad}</Td>
                          <Td main>{fARS(p.precio_neto)}</Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <Badge color={ESTADO_COLOR[p.estado]}>{p.estado}</Badge>
                            </div>
                            <Select
                              value={p.estado}
                              onChange={(e) => cambiarEstado(p.id_detalle, e.target.value as EstadoPedido)}
                              style={{ width: 120, padding: "4px 8px", marginTop: 4 }}
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {/* Nuevo pedido: wizard de 3 pasos */}
      <Wizard
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title="Nuevo Pedido"
        wide
        finishLabel="Crear pedido"
        onFinish={guardarOrden}
        steps={[
          {
            title: "Cliente",
            validate: () => (!orderForm.id_cliente ? "Elegí un cliente para continuar" : null),
            content: (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field label="Cliente" full>
                  <Select value={orderForm.id_cliente} onChange={(e) => setOrderForm({ ...orderForm, id_cliente: e.target.value })}>
                    <option value="">Seleccionar…</option>
                    {data.clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={orderForm.fecha} onChange={(e) => setOrderForm({ ...orderForm, fecha: e.target.value })} />
                </Field>
                <Field label="Canal">
                  <Select value={orderForm.canal} onChange={(e) => setOrderForm({ ...orderForm, canal: e.target.value as Canal })}>
                    <option value="Minorista">Minorista</option>
                    <option value="Mayorista">Mayorista</option>
                  </Select>
                </Field>
                <Field label="Estado">
                  <Select value={orderForm.estado} onChange={(e) => setOrderForm({ ...orderForm, estado: e.target.value as EstadoPedido })}>
                    {ESTADOS.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ),
          },
          {
            title: "Productos",
            validate: () =>
              orderForm.lineas.filter((l) => l.id_producto && l.cantidad > 0).length === 0
                ? "Agregá al menos un producto"
                : null,
            content: (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Productos del pedido</span>
                  <Button size="sm" variant="ghost" onClick={addLinea}>
                    + Agregar producto
                  </Button>
                </div>

                {orderForm.lineas.map((l, idx) => {
                  const neto = l.precio_unitario * l.cantidad - l.descuento_monto;
                  return (
                    <div key={idx} className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5 sm:flex-nowrap">
                      <div className="w-full sm:w-auto sm:flex-[2]">
                        <Select
                          value={l.id_producto}
                          onChange={(e) => {
                            const prod = data.productos.find((pr) => pr.id === e.target.value);
                            actualizarLinea(idx, { id_producto: e.target.value, precio_unitario: prod?.precio_venta ?? 0 });
                          }}
                        >
                          <option value="">Producto…</option>
                          {data.productos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Input
                        placeholder="Gusto"
                        className="w-full sm:w-28"
                        value={l.gusto}
                        onChange={(e) => actualizarLinea(idx, { gusto: e.target.value })}
                      />
                      <Input
                        type="number"
                        placeholder="Cant."
                        className="w-[calc(50%-4px)] sm:w-20"
                        value={l.cantidad}
                        onChange={(e) => actualizarLinea(idx, { cantidad: Number(e.target.value) })}
                      />
                      <Input
                        type="number"
                        placeholder="Precio unit."
                        className="w-[calc(50%-4px)] sm:w-28"
                        value={l.precio_unitario}
                        onChange={(e) => actualizarLinea(idx, { precio_unitario: Number(e.target.value) })}
                      />
                      <Input
                        type="number"
                        placeholder="Desc. $"
                        className="w-[calc(50%-4px)] sm:w-24"
                        value={l.descuento_monto}
                        onChange={(e) => actualizarLinea(idx, { descuento_monto: Number(e.target.value) })}
                      />
                      <div className="w-[calc(50%-4px)] shrink-0 text-right text-[12.5px] font-medium text-accent sm:w-28">
                        {fARS(neto)}
                      </div>
                      <button
                        onClick={() => quitarLinea(idx)}
                        disabled={orderForm.lineas.length === 1}
                        className="text-red hover:text-red/70 disabled:opacity-30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}

                <div className="mt-3 flex justify-end text-sm">
                  <span className="text-text3">Total del pedido:&nbsp;</span>
                  <span className="font-semibold text-accent">{fARS(totalOrden)}</span>
                </div>
              </div>
            ),
          },
          {
            title: "Envío y confirmación",
            content: (
              <div>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  <Field label="Km de envío">
                    <Input
                      type="number"
                      value={orderForm.km_envio}
                      onChange={(e) => setOrderForm({ ...orderForm, km_envio: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Costo de envío">
                    <Input
                      type="number"
                      value={orderForm.costo_envio}
                      onChange={(e) => setOrderForm({ ...orderForm, costo_envio: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Método de pago">
                    <Input value={orderForm.metodo_pago} onChange={(e) => setOrderForm({ ...orderForm, metodo_pago: e.target.value })} />
                  </Field>
                  <Field label="Notas" full>
                    <Textarea rows={2} value={orderForm.notas} onChange={(e) => setOrderForm({ ...orderForm, notas: e.target.value })} />
                  </Field>
                  <Field label="Comprobante de pago" full>
                    <FileAttach value={orderForm.adjunto} onChange={(adjunto) => setOrderForm({ ...orderForm, adjunto })} />
                  </Field>
                </div>

                <div className="mt-5 rounded-lg border border-border bg-surface2/40 p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text3">Resumen del pedido</div>
                  <div className="flex justify-between py-1 text-[13px]">
                    <span className="text-text2">Cliente</span>
                    <span className="font-medium">{clienteNombre(orderForm.id_cliente)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-[13px]">
                    <span className="text-text2">Productos</span>
                    <span className="font-medium">
                      {orderForm.lineas.filter((l) => l.id_producto && l.cantidad > 0).length}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-[13px]">
                    <span className="text-text2">Fecha</span>
                    <span className="font-medium">{orderForm.fecha}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-border pt-2 text-sm">
                    <span className="text-text3">Total</span>
                    <span className="font-semibold text-accent">{fARS(totalOrden)}</span>
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Editar una línea existente */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Editar Pedido"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicion}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Cliente">
            <Select value={editForm.id_cliente} onChange={(e) => setEditForm({ ...editForm, id_cliente: e.target.value })}>
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
              value={editForm.id_producto}
              onChange={(e) => {
                const prod = data.productos.find((pr) => pr.id === e.target.value);
                setEditForm({ ...editForm, id_producto: e.target.value, precio_unitario: prod?.precio_venta ?? 0 });
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
            <Input value={editForm.gusto} onChange={(e) => setEditForm({ ...editForm, gusto: e.target.value })} />
          </Field>
          <Field label="Cantidad">
            <Input
              type="number"
              value={editForm.cantidad}
              onChange={(e) => setEditForm({ ...editForm, cantidad: Number(e.target.value) })}
            />
          </Field>
          <Field label="Precio unitario">
            <Input
              type="number"
              value={editForm.precio_unitario}
              onChange={(e) => setEditForm({ ...editForm, precio_unitario: Number(e.target.value) })}
            />
          </Field>
          <Field label="Descuento $">
            <Input
              type="number"
              value={editForm.descuento_monto}
              onChange={(e) => setEditForm({ ...editForm, descuento_monto: Number(e.target.value) })}
            />
          </Field>
          <Field label="Precio neto (calculado)">
            <Input readOnly value={fARS(editForm.precio_unitario * editForm.cantidad - editForm.descuento_monto)} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={editForm.fecha} onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={editForm.estado} onChange={(e) => setEditForm({ ...editForm, estado: e.target.value as EstadoPedido })}>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal">
            <Select value={editForm.canal} onChange={(e) => setEditForm({ ...editForm, canal: e.target.value as Canal })}>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
            </Select>
          </Field>
          <Field label="Km de envío">
            <Input
              type="number"
              value={editForm.km_envio}
              onChange={(e) => setEditForm({ ...editForm, km_envio: Number(e.target.value) })}
            />
          </Field>
          <Field label="Costo de envío">
            <Input
              type="number"
              value={editForm.costo_envio}
              onChange={(e) => setEditForm({ ...editForm, costo_envio: Number(e.target.value) })}
            />
          </Field>
          <Field label="Método de pago">
            <Input value={editForm.metodo_pago} onChange={(e) => setEditForm({ ...editForm, metodo_pago: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={editForm.notas} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} />
          </Field>
          <Field label="Comprobante de pago" full>
            <FileAttach value={editForm.adjunto} onChange={(adjunto) => setEditForm({ ...editForm, adjunto })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
