"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Card,
  Button,
  FilterTabs,
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
  SearchInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fARS, fNum, inPeriod, costoVariante, margenVariante, productosConVariantes, estadoCobroPedido } from "@/lib/calc-v2";
import type { EstadoCobro } from "@/lib/calc-v2";
import type { Canal, EstadoPedido, Pedido, PedidoItem, ProductoVariante } from "@/lib/types-v2";
import type { Cliente } from "@/lib/types";

const ESTADOS: EstadoPedido[] = ["Confirmado", "Produccion", "Entregado", "Cancelado"];
const ESTADO_COLOR: Record<EstadoPedido, "blue" | "orange" | "green" | "red"> = {
  Confirmado: "blue",
  Produccion: "orange",
  Entregado: "green",
  Cancelado: "red",
};
const COBRO_COLOR: Record<EstadoCobro, "orange" | "blue" | "green"> = { Pendiente: "orange", Parcial: "blue", Cobrado: "green" };

interface ItemForm {
  // canal y productoBaseId son solo para el selector en cascada — lo único que se guarda en el
  // pedido_item final es producto_variante_id (ya resuelto a partir de esos dos).
  canal: Canal;
  productoBaseId: string;
  producto_variante_id: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
}

function itemVacio(canal: Canal): ItemForm {
  return { canal, productoBaseId: "", producto_variante_id: "", cantidad: 1, precio_unitario: 0, descuento: 0 };
}

interface PedidoForm {
  cliente_id: string;
  fecha: string;
  canal: Canal;
  estado: EstadoPedido;
  metodo_pago: string;
  costo_envio: number;
  costo_real_envio: number;
  descuento: number;
  notas: string;
  items: ItemForm[];
}

function formVacio(): PedidoForm {
  return {
    cliente_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    canal: "Minorista",
    estado: "Confirmado",
    metodo_pago: "",
    costo_envio: 0,
    costo_real_envio: 0,
    descuento: 0,
    notas: "",
    items: [itemVacio("Minorista")],
  };
}

function subtotalItem(i: ItemForm): number {
  return i.precio_unitario * i.cantidad - i.descuento;
}

function totalPedido(form: PedidoForm): number {
  return form.items.reduce((acc, i) => acc + subtotalItem(i), 0) - form.descuento + form.costo_envio;
}

/** Registrar una entrega genera, de forma idempotente (por `origen_id`), el movimiento de salida
 * de stock por cada ítem — la trazabilidad pedido→inventario que pide el esquema nuevo. Entregar
 * un pedido NO genera caja: una venta entregada y no cobrada es una cuenta por cobrar, no plata en
 * la cuenta (ver Finanzas → Cuentas pendientes para registrar el cobro real, total o parcial). */
function conMovimientosDeEntrega(
  d: ReturnType<typeof useStoreV2>["data"],
  pedido: Pedido,
  items: PedidoItem[]
): Pick<typeof d, "inventario_movimientos"> {
  const yaTieneMovStock = d.inventario_movimientos.some((m) => m.origen_tipo === "pedido" && m.origen_id === pedido.id);
  const nuevosMovStock = yaTieneMovStock
    ? []
    : items
        .filter((i) => i.producto_variante_id)
        .map((i) => ({
          id: uid("MOV"),
          fecha: pedido.fecha,
          tipo: "venta" as const,
          origen_tipo: "pedido",
          origen_id: pedido.id,
          item_tipo: "producto_variante" as const,
          item_id: i.producto_variante_id!,
          cantidad: -i.cantidad,
        }));

  return {
    inventario_movimientos: [...d.inventario_movimientos, ...nuevosMovStock],
  };
}

function PedidosTab() {
  const { data, setData } = useStoreV2();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();

  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [canalFiltro, setCanalFiltro] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<PedidoForm>(formVacio());

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";
  const varianteNombre = (id: string | null) => {
    if (!id) return "(producto eliminado)";
    const v = data.producto_variantes.find((x) => x.id === id);
    return v?.nombre ?? "(producto eliminado)";
  };

  const pedidosFiltrados = useMemo(() => {
    return data.pedidos
      .filter((p) => inPeriod(p.fecha, mes, anio))
      .filter((p) => estadoFiltro === "todos" || p.estado === estadoFiltro)
      .filter((p) => !canalFiltro || p.canal === canalFiltro)
      .filter((p) => {
        if (!search) return true;
        const s = search.toLowerCase();
        const nombreCliente = (data.clientes.find((c) => c.id === p.cliente_id)?.nombre ?? "").toLowerCase();
        const items = data.pedido_items.filter((i) => i.pedido_id === p.id);
        return nombreCliente.includes(s) || items.some((i) => i.nombre_historico.toLowerCase().includes(s));
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [data.pedidos, data.pedido_items, data.clientes, mes, anio, estadoFiltro, canalFiltro, search]);

  function abrirNuevo() {
    setEditando(null);
    setForm(formVacio());
    setModalOpen(true);
  }

  function abrirEdicion(p: Pedido) {
    const items = data.pedido_items.filter((i) => i.pedido_id === p.id);
    setEditando(p.id);
    setForm({
      cliente_id: p.cliente_id,
      fecha: p.fecha,
      canal: p.canal,
      estado: p.estado,
      metodo_pago: p.metodo_pago ?? "",
      costo_envio: p.costo_envio,
      costo_real_envio: p.costo_real_envio ?? p.costo_envio,
      descuento: p.descuento,
      notas: p.notas ?? "",
      items: items.map((i) => {
        const variante = i.producto_variante_id ? data.producto_variantes.find((v) => v.id === i.producto_variante_id) : undefined;
        return {
          canal: variante?.canal ?? p.canal,
          productoBaseId: variante?.producto_id ?? "",
          producto_variante_id: i.producto_variante_id ?? "",
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
          descuento: i.descuento,
        };
      }),
    });
    setModalOpen(true);
  }

  function actualizarItem(idx: number, patch: Partial<ItemForm>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, itemVacio(f.canal)] }));
  }
  function saboresDelCanal(canal: Canal) {
    return data.productos.filter((p) => data.producto_variantes.some((v) => v.activo && v.producto_id === p.id && v.canal === canal));
  }
  function variantesDeCanalYSabor(canal: Canal, productoBaseId: string) {
    if (!productoBaseId) return [];
    return data.producto_variantes.filter((v) => v.activo && v.canal === canal && v.producto_id === productoBaseId);
  }
  // Cambiar el canal invalida el sabor y la variante elegidos (spec: "limpiar el sabor si deja de
  // ser válido, limpiar la variante, actualizar las opciones disponibles").
  function actualizarCanalItem(idx: number, canal: Canal) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, canal, productoBaseId: "", producto_variante_id: "", precio_unitario: 0 } : it)) }));
  }
  // Cambiar el sabor recalcula las presentaciones y auto-selecciona si solo queda una.
  function actualizarSaborItem(idx: number, productoBaseId: string) {
    const item = form.items[idx];
    const variantes = variantesDeCanalYSabor(item.canal, productoBaseId);
    const unica = variantes.length === 1 ? variantes[0] : undefined;
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, productoBaseId, producto_variante_id: unica?.id ?? "", precio_unitario: unica?.precio_venta ?? 0 } : it)),
    }));
  }
  function actualizarVarianteItem(idx: number, varianteId: string) {
    const v = data.producto_variantes.find((x) => x.id === varianteId);
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, producto_variante_id: varianteId, precio_unitario: v?.precio_venta ?? 0 } : it)) }));
  }
  function quitarItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function guardar() {
    if (!form.cliente_id) {
      toast("Elegí un cliente", "error");
      return;
    }
    const itemsValidos = form.items.filter((i) => i.producto_variante_id && i.cantidad > 0);
    if (itemsValidos.length === 0) {
      toast("Agregá al menos un producto", "error");
      return;
    }

    const pedidoId = editando ?? uid("PED");
    const total = totalPedido(form);
    const nuevoPedido: Pedido = {
      id: pedidoId,
      fecha: form.fecha,
      cliente_id: form.cliente_id,
      estado: form.estado,
      canal: form.canal,
      metodo_pago: form.metodo_pago || undefined,
      descuento: form.descuento,
      costo_envio: form.costo_envio,
      costo_real_envio: form.costo_real_envio,
      total,
      notas: form.notas || undefined,
    };
    const nuevosItems: PedidoItem[] = itemsValidos.map((i) => {
      const variante = data.producto_variantes.find((v) => v.id === i.producto_variante_id);
      return {
        id: uid("PI"),
        pedido_id: pedidoId,
        producto_variante_id: i.producto_variante_id,
        nombre_historico: variante?.nombre ?? "",
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        descuento: i.descuento,
        subtotal: subtotalItem(i),
      };
    });

    setData((d) => {
      const otrosItems = d.pedido_items.filter((i) => i.pedido_id !== pedidoId);
      const otrosPedidos = d.pedidos.filter((p) => p.id !== pedidoId);
      const base = { ...d, pedidos: [...otrosPedidos, nuevoPedido], pedido_items: [...otrosItems, ...nuevosItems] };
      if (nuevoPedido.estado === "Entregado") {
        return { ...base, ...conMovimientosDeEntrega(base, nuevoPedido, nuevosItems) };
      }
      return base;
    });
    toast(editando ? "Pedido actualizado" : "Pedido creado");
    setModalOpen(false);
  }

  function cambiarEstado(pedido: Pedido, estado: EstadoPedido) {
    setData((d) => {
      const pedidos = d.pedidos.map((p) => (p.id === pedido.id ? { ...p, estado } : p));
      const base = { ...d, pedidos };
      if (estado === "Entregado") {
        const items = d.pedido_items.filter((i) => i.pedido_id === pedido.id);
        return { ...base, ...conMovimientosDeEntrega(base, { ...pedido, estado }, items) };
      }
      return base;
    });
    toast(`Estado → ${estado}`);
  }

  function eliminar(pedido: Pedido) {
    if (!confirm("¿Eliminar este pedido y sus movimientos asociados?")) return;
    setData((d) => ({
      ...d,
      pedidos: d.pedidos.filter((p) => p.id !== pedido.id),
      pedido_items: d.pedido_items.filter((i) => i.pedido_id !== pedido.id),
      inventario_movimientos: d.inventario_movimientos.filter((m) => !(m.origen_tipo === "pedido" && m.origen_id === pedido.id)),
      movimientos_financieros: d.movimientos_financieros.filter((m) => !(m.origen_tipo === "venta_pedido" && m.origen_id === pedido.id)),
    }));
    toast("Pedido eliminado", "info");
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={abrirNuevo}>+ Nuevo pedido</Button>
      </div>

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

      {pedidosFiltrados.length === 0 ? (
        <Card>
          <EmptyState text="No hay pedidos en este período." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pedidosFiltrados.map((p) => {
            const items = data.pedido_items.filter((i) => i.pedido_id === p.id);
            return (
              <Card key={p.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    <span className="font-semibold text-text">{p.fecha}</span>
                    <span className="text-text3">·</span>
                    <span className="font-medium text-text">{clienteNombre(p.cliente_id)}</span>
                    <span className="text-text3">·</span>
                    <span className="text-text2">{p.canal}</span>
                    {p.costo_envio > 0 && (
                      <>
                        <span className="text-text3">·</span>
                        <span className="text-text2">Envío {fARS(p.costo_envio)}</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[12.5px]">
                      <span className="text-text3">Total:&nbsp;</span>
                      <span className="font-semibold text-accent">{fARS(p.total)}</span>
                    </span>
                    <Badge color={ESTADO_COLOR[p.estado]}>{p.estado}</Badge>
                    <Badge color={COBRO_COLOR[estadoCobroPedido(data, p)]}>{estadoCobroPedido(data, p)}</Badge>
                    <Select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value as EstadoPedido)} style={{ width: 130, padding: "4px 8px" }}>
                      {ESTADOS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => eliminar(p)}>
                      Eliminar
                    </Button>
                  </div>
                </div>
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Producto</Th>
                        <Th>Cant.</Th>
                        <Th>Precio unit.</Th>
                        <Th>Subtotal</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <TrHover key={i.id}>
                          <Td main>{i.nombre_historico || varianteNombre(i.producto_variante_id)}</Td>
                          <Td>{i.cantidad}</Td>
                          <Td>{fARS(i.precio_unitario)}</Td>
                          <Td>{fARS(i.subtotal)}</Td>
                        </TrHover>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? "Editar pedido" : "Nuevo pedido"}
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Cliente">
            <Select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Canal">
            <Select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as Canal })}>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
            </Select>
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
          <Field label="Método de pago">
            <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
          </Field>
          <Field label="Envío cobrado al cliente">
            <Input
              type="number"
              value={form.costo_envio}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Mientras no se haya editado aparte, el costo real sigue al cobrado (caso común:
                // no hay margen en el envío) — apenas se lo toca a mano, deja de seguirlo.
                setForm((f) => ({ ...f, costo_envio: v, costo_real_envio: f.costo_real_envio === f.costo_envio ? v : f.costo_real_envio }));
              }}
            />
          </Field>
          <Field label="Costo real de envío (combustible/logística)">
            <Input type="number" value={form.costo_real_envio} onChange={(e) => setForm({ ...form, costo_real_envio: Number(e.target.value) })} />
          </Field>
          <Field label="Descuento $ (total del pedido)">
            <Input type="number" value={form.descuento} onChange={(e) => setForm({ ...form, descuento: Number(e.target.value) })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Productos</span>
            <Button size="sm" variant="ghost" onClick={agregarItem}>
              + Agregar producto
            </Button>
          </div>
          {form.items.map((it, idx) => {
            const variantesDisponibles = variantesDeCanalYSabor(it.canal, it.productoBaseId);
            const mostrarPresentacion = variantesDisponibles.length > 1;
            return (
            <div key={idx} className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5">
              <Select value={it.canal} onChange={(e) => actualizarCanalItem(idx, e.target.value as Canal)} className="w-full sm:w-32">
                <option value="Minorista">Minorista</option>
                <option value="Mayorista">Mayorista</option>
              </Select>
              <Select value={it.productoBaseId} onChange={(e) => actualizarSaborItem(idx, e.target.value)} className="w-full sm:w-40">
                <option value="">Sabor…</option>
                {saboresDelCanal(it.canal).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
              {mostrarPresentacion && (
                <Select value={it.producto_variante_id} onChange={(e) => actualizarVarianteItem(idx, e.target.value)} className="w-full sm:w-36">
                  <option value="">Presentación…</option>
                  {variantesDisponibles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.presentacion || v.nombre}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                type="number"
                placeholder="Cant."
                className="w-[calc(50%-4px)] sm:w-20"
                value={it.cantidad}
                onChange={(e) => actualizarItem(idx, { cantidad: Number(e.target.value) })}
              />
              <Input
                type="number"
                placeholder="Precio unit."
                className="w-[calc(50%-4px)] sm:w-28"
                value={it.precio_unitario}
                onChange={(e) => actualizarItem(idx, { precio_unitario: Number(e.target.value) })}
              />
              <Input
                type="number"
                placeholder="Desc. $"
                className="w-[calc(50%-4px)] sm:w-24"
                value={it.descuento}
                onChange={(e) => actualizarItem(idx, { descuento: Number(e.target.value) })}
              />
              <div className="w-[calc(50%-4px)] shrink-0 text-right text-[12.5px] font-medium text-accent sm:w-28">{fARS(subtotalItem(it))}</div>
              <button onClick={() => quitarItem(idx)} disabled={form.items.length === 1} className="text-red hover:text-red/70 disabled:opacity-30">
                <X className="h-4 w-4" />
              </button>
            </div>
            );
          })}
          <div className="mt-2 flex justify-end text-sm">
            <span className="text-text3">Total del pedido:&nbsp;</span>
            <span className="font-semibold text-accent">{fARS(totalPedido(form))}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function clienteVacio(): Omit<Cliente, "id"> {
  return { nombre: "", canal: "Minorista", direccion: "", telefono: "", email: "" };
}

function ClientesTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(clienteVacio());

  const filtrados = useMemo(
    () => data.clientes.filter((c) => !search || c.nombre.toLowerCase().includes(search.toLowerCase())),
    [data.clientes, search]
  );

  function abrirNuevo() {
    setEditando(null);
    setForm(clienteVacio());
    setModalOpen(true);
  }
  function abrirEdicion(c: Cliente) {
    setEditando(c.id);
    setForm({ nombre: c.nombre, canal: c.canal, direccion: c.direccion ?? "", telefono: c.telefono ?? "", email: c.email ?? "" });
    setModalOpen(true);
  }
  function guardar() {
    if (!form.nombre.trim()) {
      toast("El nombre es obligatorio", "error");
      return;
    }
    if (editando) {
      setData((d) => ({ ...d, clientes: d.clientes.map((c) => (c.id === editando ? { ...c, ...form } : c)) }));
      toast("Cliente actualizado");
    } else {
      setData((d) => ({ ...d, clientes: [...d.clientes, { id: uid("CLI"), ...form }] }));
      toast("Cliente creado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    if (data.pedidos.some((p) => p.cliente_id === id)) {
      toast("No se puede eliminar: tiene pedidos asociados", "error");
      return;
    }
    setData((d) => ({ ...d, clientes: d.clientes.filter((c) => c.id !== id) }));
    toast("Cliente eliminado", "info");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-[180px] max-w-[300px] flex-1">
          <SearchInput placeholder="Buscar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={abrirNuevo}>+ Nuevo cliente</Button>
      </div>
      <Card>
        {filtrados.length === 0 ? (
          <EmptyState text="No hay clientes cargados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Canal</Th>
                  <Th>Teléfono</Th>
                  <Th>Email</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{c.nombre}</Td>
                    <Td>{c.canal}</Td>
                    <Td>{c.telefono || "—"}</Td>
                    <Td>{c.email || "—"}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicion(c)}>
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
        title={editando ? "Editar cliente" : "Nuevo cliente"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
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
          <Field label="Dirección" full>
            <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Field>
          <Field label="Email" full>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function ListaPreciosTab() {
  const { data } = useStoreV2();
  const [search, setSearch] = useState("");
  const grupos = useMemo(() => productosConVariantes(data), [data]);

  return (
    <div>
      <div className="mb-4 max-w-[300px]">
        <SearchInput placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card>
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Variante</Th>
                <Th>Canal</Th>
                <Th>Precio de venta</Th>
                <Th>Costo</Th>
                <Th>Margen</Th>
              </tr>
            </thead>
            <tbody>
              {grupos
                .filter((g) => !search || g.producto.nombre.toLowerCase().includes(search.toLowerCase()))
                .flatMap((g) =>
                  g.variantes
                    .filter((v) => v.activo)
                    .map((v: ProductoVariante) => {
                      const margen = margenVariante(data, v);
                      return (
                        <TrHover key={v.id}>
                          <Td main>{g.producto.nombre}</Td>
                          <Td>{v.presentacion || v.nombre}</Td>
                          <Td>{v.canal ?? "—"}</Td>
                          <Td>{fARS(v.precio_venta)}</Td>
                          <Td>{fARS(costoVariante(data, v.id))}</Td>
                          <Td className={margen >= 0 ? "text-green" : "text-red"}>{fNum(margen, 1)}%</Td>
                        </TrHover>
                      );
                    })
                )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

function EntregasTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  const pendientes = useMemo(
    () => data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [data.pedidos]
  );

  function avanzar(p: Pedido) {
    const siguiente: EstadoPedido = p.estado === "Confirmado" ? "Produccion" : "Entregado";
    setData((d) => {
      const pedidos = d.pedidos.map((x) => (x.id === p.id ? { ...x, estado: siguiente } : x));
      const base = { ...d, pedidos };
      if (siguiente === "Entregado") {
        const items = d.pedido_items.filter((i) => i.pedido_id === p.id);
        return { ...base, ...conMovimientosDeEntrega(base, { ...p, estado: siguiente }, items) };
      }
      return base;
    });
    toast(`Pedido → ${siguiente}`);
  }

  return (
    <Card>
      {pendientes.length === 0 ? (
        <EmptyState text="No hay pedidos pendientes de entrega." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th>Total</Th>
                <Th>Estado</Th>
                <Th>Acción</Th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => (
                <TrHover key={p.id}>
                  <Td>{p.fecha}</Td>
                  <Td main>{clienteNombre(p.cliente_id)}</Td>
                  <Td>{fARS(p.total)}</Td>
                  <Td>
                    <Badge color={ESTADO_COLOR[p.estado]}>{p.estado}</Badge>
                  </Td>
                  <Td>
                    <Button size="sm" onClick={() => avanzar(p)}>
                      {p.estado === "Confirmado" ? "Pasar a Producción" : "Marcar Entregado"}
                    </Button>
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function Ventas() {
  const [tab, setTab] = useState("pedidos");
  return (
    <div>
      <PageHeader title="Ventas" sub="Pedidos, clientes, lista de precios y entregas" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "pedidos", label: "Pedidos" },
          { value: "clientes", label: "Clientes" },
          { value: "precios", label: "Lista de precios" },
          { value: "entregas", label: "Entregas" },
        ]}
      />
      {tab === "pedidos" && <PedidosTab />}
      {tab === "clientes" && <ClientesTab />}
      {tab === "precios" && <ListaPreciosTab />}
      {tab === "entregas" && <EntregasTab />}
    </div>
  );
}
