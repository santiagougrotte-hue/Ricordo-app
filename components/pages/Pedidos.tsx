"use client";

import React, { useMemo, useState } from "react";
import { Paperclip, X, MessageSquareText } from "lucide-react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { useIaClient } from "@/lib/ia-client";
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
  Alert,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Wizard } from "@/components/Wizard";
import { FileAttach } from "@/components/FileAttach";
import { crearMovimientoCajaDesdePedido, fARS, inPeriod } from "@/lib/calc";
import type { Adjunto, Canal, EstadoPedido, Pedido } from "@/lib/types";

type Confianza = "alta" | "media" | "baja";

interface ItemParseado {
  id_producto: string;
  nombre: string;
  cantidad: number;
  confianza: Confianza;
}

interface ParsePedidoResponse {
  cliente: { id: string | null; nombre_detectado: string | null; confianza: Confianza };
  canal: Canal | null;
  fecha_entrega: string | null;
  items: ItemParseado[];
  no_identificado: string[];
  notas: string;
  error?: string;
}

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
    canal: "Minorista" as Canal,
    km_envio: 0,
    costo_envio: 0,
    metodo_pago: "",
    notas: "",
    adjunto: undefined as Adjunto | undefined,
  };
}

// Chequeo de salud de datos permanente: líneas de pedido sin id_producto, o con un
// id_producto que ya no existe en el catálogo (por ejemplo, si el producto se borró después).
function LineasHuerfanas() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  const huerfanas = useMemo(
    () => data.pedidos.filter((p) => !p.id_producto || !data.productos.some((pr) => pr.id === p.id_producto)),
    [data.pedidos, data.productos]
  );

  function asignar(idDetalle: string) {
    const idProducto = seleccion[idDetalle];
    const producto = data.productos.find((p) => p.id === idProducto);
    if (!producto) {
      toast("Elegí un producto para asignar", "error");
      return;
    }
    setData((d) => ({
      ...d,
      pedidos: d.pedidos.map((p) =>
        p.id_detalle === idDetalle ? { ...p, id_producto: producto.id, nombre_producto: producto.nombre } : p
      ),
    }));
    setSeleccion((s) => {
      const resto = { ...s };
      delete resto[idDetalle];
      return resto;
    });
    toast("Producto asignado");
  }

  return (
    <Card title="Líneas de pedido sin producto asignado">
      {huerfanas.length === 0 ? (
        <EmptyState text="No hay líneas sin producto asignado. Todo está bien." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th>Cantidad</Th>
                <Th>Precio neto</Th>
                <Th>Asignar producto</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {huerfanas.map((p) => (
                <TrHover key={p.id_detalle}>
                  <Td>{p.fecha}</Td>
                  <Td main>{clienteNombre(p.id_cliente)}</Td>
                  <Td>{p.cantidad}</Td>
                  <Td>{fARS(p.precio_neto)}</Td>
                  <Td>
                    <Select
                      value={seleccion[p.id_detalle] ?? ""}
                      onChange={(e) => setSeleccion((s) => ({ ...s, [p.id_detalle]: e.target.value }))}
                    >
                      <option value="">Elegir producto…</option>
                      {data.productos.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.nombre}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Button size="sm" onClick={() => asignar(p.id_detalle)}>
                      Asignar
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

function PedidosTab() {
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

  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteTexto, setPasteTexto] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const [pasteResultado, setPasteResultado] = useState<ParsePedidoResponse | null>(null);
  const { call: llamarIa } = useIaClient();

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

  function abrirPasteModal() {
    setPasteTexto("");
    setPasteResultado(null);
    setPasteModalOpen(true);
  }

  async function analizarWhatsapp() {
    if (!pasteTexto.trim()) {
      toast("Pegá el mensaje del cliente primero", "error");
      return;
    }
    setPasteLoading(true);
    const catalogo = data.productos.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre }));
    const clientes = data.clientes.map((c) => ({ id: c.id, nombre: c.nombre }));
    const resultado = await llamarIa<ParsePedidoResponse>(
      "parse-pedido",
      { texto: pasteTexto, catalogo, clientes },
      "parse-pedido"
    );
    setPasteLoading(false);
    if (resultado) setPasteResultado(resultado);
  }

  function crearClienteDetectado() {
    if (!pasteResultado?.cliente.nombre_detectado) return;
    const nuevo = {
      id: uid("CLI"),
      nombre: pasteResultado.cliente.nombre_detectado,
      canal: pasteResultado.canal ?? ("Minorista" as Canal),
    };
    setData((d) => ({ ...d, clientes: [...d.clientes, nuevo] }));
    setPasteResultado((r) => (r ? { ...r, cliente: { ...r.cliente, id: nuevo.id, confianza: "alta" } } : r));
    toast("Cliente creado");
  }

  function usarResultadoPaste() {
    if (!pasteResultado) return;
    const lineasDesdeItems: LineaPedido[] = pasteResultado.items.map((item) => {
      const producto = data.productos.find((p) => p.id === item.id_producto);
      return {
        id_producto: item.id_producto,
        gusto: "",
        cantidad: item.cantidad,
        precio_unitario: producto?.precio_venta ?? 0,
        descuento_monto: 0,
      };
    });
    setOrderForm({
      ...emptyOrderForm(),
      id_cliente: pasteResultado.cliente.id ?? "",
      canal: pasteResultado.canal ?? "Minorista",
      fecha: pasteResultado.fecha_entrega ?? new Date().toISOString().slice(0, 10),
      notas: pasteResultado.notas || "",
      lineas: lineasDesdeItems.length > 0 ? lineasDesdeItems : [emptyLinea()],
    });
    setPasteModalOpen(false);
    setOrderModalOpen(true);
    if (pasteResultado.no_identificado.length > 0) {
      toast(`No se pudieron identificar: ${pasteResultado.no_identificado.join(", ")} — agregalos manualmente si corresponde`, "info");
    }
  }

  function descartarPasteYCargarManual() {
    setPasteModalOpen(false);
    setPasteResultado(null);
    setPasteTexto("");
    openNew();
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
    if (orderForm.lineas.some((l) => !l.id_producto)) {
      toast("Hay una línea sin producto seleccionado — elegí uno o quitá esa línea", "error");
      return;
    }
    const idsCatalogo = new Set(data.productos.map((p) => p.id));
    if (orderForm.lineas.some((l) => !idsCatalogo.has(l.id_producto))) {
      toast("Una línea tiene un producto que ya no existe en el catálogo", "error");
      return;
    }
    const lineasValidas = orderForm.lineas.filter((l) => l.cantidad > 0);
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

    setData((d) => {
      let caja_movimientos = d.caja_movimientos;
      if (orderForm.estado === "Entregado") {
        const nuevosMovs = nuevos
          .filter((p) => !caja_movimientos.some((m) => m.ref === p.id_detalle))
          .map((p) => crearMovimientoCajaDesdePedido(p));
        caja_movimientos = [...caja_movimientos, ...nuevosMovs];
      }
      return { ...d, pedidos: [...d.pedidos, ...nuevos], caja_movimientos };
    });
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
    if (!producto) {
      toast("Ese producto ya no existe en el catálogo — elegí otro", "error");
      return;
    }
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

  // El estado es del pedido entero, no de cada línea de producto — cambiar uno cambia todas
  // las líneas de ese id_pedido a la vez. Al marcar "Entregado" se crea automáticamente el
  // ingreso en Caja de cada línea (idempotente por ref = id_detalle). Si un pedido sale de
  // "Entregado" los movimientos ya creados no se tocan — quedan para revisar en Caja.
  function cambiarEstadoPedido(idPedido: string, estado: EstadoPedido) {
    setData((d) => {
      const pedidos = d.pedidos.map((p) => (p.id_pedido === idPedido ? { ...p, estado } : p));
      let caja_movimientos = d.caja_movimientos;
      if (estado === "Entregado") {
        const lineasDelPedido = pedidos.filter((p) => p.id_pedido === idPedido);
        const nuevosMovs = lineasDelPedido
          .filter((p) => !caja_movimientos.some((m) => m.ref === p.id_detalle))
          .map((p) => crearMovimientoCajaDesdePedido(p));
        caja_movimientos = [...caja_movimientos, ...nuevosMovs];
      }
      return { ...d, pedidos, caja_movimientos };
    });
    toast(`Estado → ${estado}`);
  }

  function eliminar(idDetalle: string) {
    setData((d) => ({ ...d, pedidos: d.pedidos.filter((p) => p.id_detalle !== idDetalle) }));
    toast("Pedido eliminado", "info");
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={abrirPasteModal}>
          <MessageSquareText className="h-3.5 w-3.5" /> Pegar de WhatsApp
        </Button>
        <Button onClick={openNew}>+ Nuevo Pedido</Button>
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
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
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
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-[12.5px]">
                                <span className="text-text3">Total pedido:&nbsp;</span>
                                <span className="font-semibold text-accent">{fARS(totalOrden)}</span>
                              </span>
                              <Badge color={ESTADO_COLOR[primero.estado]}>{primero.estado}</Badge>
                              <Select
                                value={primero.estado}
                                onChange={(e) => cambiarEstadoPedido(primero.id_pedido, e.target.value as EstadoPedido)}
                                style={{ width: 130, padding: "4px 8px" }}
                              >
                                {ESTADOS.map((e) => (
                                  <option key={e} value={e}>
                                    {e}
                                  </option>
                                ))}
                              </Select>
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
                            <Badge color={ESTADO_COLOR[p.estado]}>{p.estado}</Badge>
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
            validate: () => {
              if (orderForm.lineas.some((l) => !l.id_producto)) {
                return "Hay una línea sin producto seleccionado — elegí uno o quitá esa línea";
              }
              return orderForm.lineas.filter((l) => l.cantidad > 0).length === 0 ? "Agregá al menos un producto" : null;
            },
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

      {/* Pegar de WhatsApp: la IA propone, el usuario confirma — nunca guarda nada directo. */}
      <Modal
        open={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        title="Pegar pedido de WhatsApp"
        wide
        footer={
          pasteResultado ? (
            <>
              <Button variant="ghost" onClick={descartarPasteYCargarManual}>
                Descartar y cargar manual
              </Button>
              <Button onClick={usarResultadoPaste}>Usar estos datos</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPasteModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={analizarWhatsapp} disabled={pasteLoading}>
                {pasteLoading ? "Analizando…" : "Analizar"}
              </Button>
            </>
          )
        }
      >
        {!pasteResultado ? (
          <Field label="Mensaje del cliente" full>
            <Textarea
              rows={8}
              placeholder="Pegá acá el mensaje tal cual lo mandó el cliente por WhatsApp…"
              value={pasteTexto}
              onChange={(e) => setPasteTexto(e.target.value)}
              disabled={pasteLoading}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Cliente</div>
                <div className="flex items-center gap-1.5 text-[13px] text-text">
                  {pasteResultado.cliente.id
                    ? clienteNombre(pasteResultado.cliente.id)
                    : pasteResultado.cliente.nombre_detectado ?? "No detectado"}
                  <Badge color={pasteResultado.cliente.confianza === "alta" ? "green" : "orange"}>
                    {pasteResultado.cliente.confianza}
                  </Badge>
                </div>
                {!pasteResultado.cliente.id && pasteResultado.cliente.nombre_detectado && (
                  <button onClick={crearClienteDetectado} className="mt-1 text-[11.5px] font-medium text-accent hover:text-accent2">
                    + Crear cliente &quot;{pasteResultado.cliente.nombre_detectado}&quot;
                  </button>
                )}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Canal</div>
                <div className="text-[13px] text-text">{pasteResultado.canal ?? "No informado"}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Fecha de entrega</div>
                <div className="text-[13px] text-text">{pasteResultado.fecha_entrega ?? "No informada"}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text3">Productos identificados</div>
              {pasteResultado.items.length === 0 ? (
                <EmptyState text="No se identificó ningún producto del catálogo en el mensaje." />
              ) : (
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Producto</Th>
                        <Th>Cantidad</Th>
                        <Th>Confianza</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {pasteResultado.items.map((item, idx) => (
                        <tr key={idx} className={item.confianza !== "alta" ? "bg-orange-dim/40" : ""}>
                          <Td main>{item.nombre}</Td>
                          <Td>{item.cantidad}</Td>
                          <Td>
                            <Badge color={item.confianza === "alta" ? "green" : "orange"}>{item.confianza}</Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </div>

            {pasteResultado.no_identificado.length > 0 && (
              <Alert kind="warning">
                No se pudieron identificar: {pasteResultado.no_identificado.join(", ")}. Agregalos manualmente si corresponde.
              </Alert>
            )}

            {pasteResultado.notas && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Notas</div>
                <div className="text-[13px] text-text2">{pasteResultado.notas}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function Pedidos() {
  const [tab, setTab] = useState("pedidos");
  return (
    <div>
      <PageHeader title="Pedidos" sub="Gestión de pedidos" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "pedidos", label: "Pedidos" },
          { value: "huerfanas", label: "Líneas sin producto" },
        ]}
      />
      {tab === "pedidos" ? <PedidosTab /> : <LineasHuerfanas />}
    </div>
  );
}
