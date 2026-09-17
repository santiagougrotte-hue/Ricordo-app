"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
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
import { fARS, fNum, recetaEfectivaVariante } from "@/lib/calc-v2";
import { obtenerProveedorMapa, urlNavegacionMultiparada } from "@/lib/mapas";
import { calcularRuta, calcularCostosRuta, distribuirCostoRuta, paradasSinCoordenadas } from "@/lib/rutas";
import type { ParadaEntrada } from "@/lib/rutas";
import type { EstadoPagoCompra, RutaEntrega } from "@/lib/types-v2";
import type { Proveedor, Cliente } from "@/lib/types";

interface ItemCompraForm {
  insumo_id: string;
  cantidad: number;
  precio_unitario: number;
}
function itemCompraVacio(): ItemCompraForm {
  return { insumo_id: "", cantidad: 0, precio_unitario: 0 };
}

function ComprasTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    proveedor_id: "",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    estado_pago: "pagado" as EstadoPagoCompra,
    metodo_pago: "",
    notas: "",
    items: [itemCompraVacio()],
  });

  const proveedorNombre = (id: string) => data.proveedores.find((p) => p.id === id)?.nombre ?? "—";
  const insumoNombre = (id: string) => data.insumos.find((i) => i.id === id)?.nombre ?? "(eliminado)";
  const compras = useMemo(() => [...data.compras].sort((a, b) => b.fecha.localeCompare(a.fecha)), [data.compras]);

  function actualizarItem(idx: number, patch: Partial<ItemCompraForm>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, itemCompraVacio()] }));
  }
  function quitarItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }
  const total = form.items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);

  function guardar() {
    if (!form.proveedor_id) {
      toast("Elegí un proveedor", "error");
      return;
    }
    const itemsValidos = form.items.filter((i) => i.insumo_id && i.cantidad > 0);
    if (itemsValidos.length === 0) {
      toast("Agregá al menos un insumo", "error");
      return;
    }
    const compraId = uid("COM");
    const totalCompra = itemsValidos.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
    setData((d) => ({
      ...d,
      compras: [
        ...d.compras,
        {
          id: compraId,
          fecha: form.fecha,
          proveedor_id: form.proveedor_id,
          descripcion: form.descripcion || undefined,
          estado_pago: form.estado_pago,
          metodo_pago: form.metodo_pago || undefined,
          total: totalCompra,
          notas: form.notas || undefined,
        },
      ],
      compra_items: [
        ...d.compra_items,
        ...itemsValidos.map((i) => ({ id: uid("CI"), compra_id: compraId, insumo_id: i.insumo_id, cantidad: i.cantidad, precio_unitario: i.precio_unitario, subtotal: i.cantidad * i.precio_unitario })),
      ],
      inventario_movimientos: [
        ...d.inventario_movimientos,
        ...itemsValidos.map((i) => ({ id: uid("MOV"), fecha: form.fecha, tipo: "compra" as const, origen_tipo: "compra", origen_id: compraId, item_tipo: "insumo" as const, item_id: i.insumo_id, cantidad: i.cantidad })),
      ],
      movimientos_financieros:
        form.estado_pago === "pagado"
          ? [
              ...d.movimientos_financieros,
              { id: uid("MOVF"), fecha: form.fecha, tipo: "egreso" as const, concepto: `Compra ${compraId}`, monto: totalCompra, metodo_pago: form.metodo_pago || undefined, origen_tipo: "compra_pago", origen_id: compraId, estado: "confirmado" as const },
            ]
          : d.movimientos_financieros,
    }));
    toast("Compra registrada");
    setModalOpen(false);
    setForm({ proveedor_id: "", fecha: new Date().toISOString().slice(0, 10), descripcion: "", estado_pago: "pagado", metodo_pago: "", notas: "", items: [itemCompraVacio()] });
  }

  function marcarPagada(compraId: string) {
    setData((d) => {
      const compra = d.compras.find((c) => c.id === compraId);
      if (!compra) return d;
      const yaTieneMov = d.movimientos_financieros.some((m) => m.origen_tipo === "compra_pago" && m.origen_id === compraId);
      return {
        ...d,
        compras: d.compras.map((c) => (c.id === compraId ? { ...c, estado_pago: "pagado" } : c)),
        movimientos_financieros: yaTieneMov
          ? d.movimientos_financieros
          : [
              ...d.movimientos_financieros,
              { id: uid("MOVF"), fecha: new Date().toISOString().slice(0, 10), tipo: "egreso" as const, concepto: `Compra ${compraId}`, monto: compra.total, origen_tipo: "compra_pago", origen_id: compraId, estado: "confirmado" as const },
            ],
      };
    });
    toast("Compra marcada como pagada");
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Nueva compra</Button>
      </div>
      <Card>
        {compras.length === 0 ? (
          <EmptyState text="No hay compras registradas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Proveedor</Th>
                  <Th>Total</Th>
                  <Th>Estado de pago</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => {
                  const items = data.compra_items.filter((i) => i.compra_id === c.id);
                  return (
                    <React.Fragment key={c.id}>
                      <tr className="bg-surface2/60">
                        <Td colSpan={5} className="py-2">
                          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                              <span className="font-semibold text-text">{c.fecha}</span>
                              <span className="text-text3">·</span>
                              <span className="font-medium text-text">{proveedorNombre(c.proveedor_id)}</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <span className="text-[12.5px]">
                                <span className="text-text3">Total:&nbsp;</span>
                                <span className="font-semibold text-accent">{fARS(c.total)}</span>
                              </span>
                              <Badge color={c.estado_pago === "pagado" ? "green" : "orange"}>{c.estado_pago}</Badge>
                              {c.estado_pago === "pendiente" && (
                                <Button size="sm" onClick={() => marcarPagada(c.id)}>
                                  Marcar pagada
                                </Button>
                              )}
                            </div>
                          </div>
                        </Td>
                      </tr>
                      {items.map((i) => (
                        <TrHover key={i.id}>
                          <Td></Td>
                          <Td main>{insumoNombre(i.insumo_id)}</Td>
                          <Td colSpan={3}>
                            {fNum(i.cantidad, 2)} × {fARS(i.precio_unitario)} = {fARS(i.subtotal)}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nueva compra"
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
          <Field label="Proveedor">
            <Select value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Estado de pago">
            <Select value={form.estado_pago} onChange={(e) => setForm({ ...form, estado_pago: e.target.value as EstadoPagoCompra })}>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
            </Select>
          </Field>
          <Field label="Método de pago">
            <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Insumos</span>
            <Button size="sm" variant="ghost" onClick={agregarItem}>
              + Agregar insumo
            </Button>
          </div>
          {form.items.map((it, idx) => (
            <div key={idx} className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5">
              <div className="w-full sm:w-auto sm:flex-[2]">
                <Select value={it.insumo_id} onChange={(e) => actualizarItem(idx, { insumo_id: e.target.value })}>
                  <option value="">Insumo…</option>
                  {data.insumos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <Input type="number" placeholder="Cant." className="w-[calc(50%-4px)] sm:w-24" value={it.cantidad} onChange={(e) => actualizarItem(idx, { cantidad: Number(e.target.value) })} />
              <Input
                type="number"
                placeholder="Precio unit."
                className="w-[calc(50%-4px)] sm:w-28"
                value={it.precio_unitario}
                onChange={(e) => actualizarItem(idx, { precio_unitario: Number(e.target.value) })}
              />
              <div className="w-[calc(50%-4px)] shrink-0 text-right text-[12.5px] font-medium text-accent sm:w-28">{fARS(it.cantidad * it.precio_unitario)}</div>
              <button onClick={() => quitarItem(idx)} disabled={form.items.length === 1} className="text-red hover:text-red/70 disabled:opacity-30">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="mt-2 flex justify-end text-sm">
            <span className="text-text3">Total:&nbsp;</span>
            <span className="font-semibold text-accent">{fARS(total)}</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function proveedorVacio(): Omit<Proveedor, "id"> {
  return { nombre: "", contacto: "", telefono: "", email: "", notas: "" };
}

function ProveedoresTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(proveedorVacio());

  const filtrados = data.proveedores.filter((p) => !search || p.nombre.toLowerCase().includes(search.toLowerCase()));

  function abrirNuevo() {
    setEditando(null);
    setForm(proveedorVacio());
    setModalOpen(true);
  }
  function abrirEdicion(p: Proveedor) {
    setEditando(p.id);
    setForm({ nombre: p.nombre, contacto: p.contacto ?? "", telefono: p.telefono ?? "", email: p.email ?? "", notas: p.notas ?? "" });
    setModalOpen(true);
  }
  function guardar() {
    if (!form.nombre.trim()) {
      toast("El nombre es obligatorio", "error");
      return;
    }
    if (editando) {
      setData((d) => ({ ...d, proveedores: d.proveedores.map((p) => (p.id === editando ? { ...p, ...form } : p)) }));
      toast("Proveedor actualizado");
    } else {
      setData((d) => ({ ...d, proveedores: [...d.proveedores, { id: uid("PROV"), ...form }] }));
      toast("Proveedor creado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    if (data.compras.some((c) => c.proveedor_id === id)) {
      toast("No se puede eliminar: tiene compras asociadas", "error");
      return;
    }
    setData((d) => ({ ...d, proveedores: d.proveedores.filter((p) => p.id !== id) }));
    toast("Proveedor eliminado", "info");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-[180px] max-w-[300px] flex-1">
          <SearchInput placeholder="Buscar proveedor…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={abrirNuevo}>+ Nuevo proveedor</Button>
      </div>
      <Card>
        {filtrados.length === 0 ? (
          <EmptyState text="No hay proveedores cargados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Contacto</Th>
                  <Th>Teléfono</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <TrHover key={p.id}>
                    <Td main>{p.nombre}</Td>
                    <Td>{p.contacto || "—"}</Td>
                    <Td>{p.telefono || "—"}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicion(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(p.id)}>
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
        title={editando ? "Editar proveedor" : "Nuevo proveedor"}
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
          <Field label="Contacto">
            <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function ProduccionTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ producto_variante_id: "", cantidad: 1, fecha: new Date().toISOString().slice(0, 10), notas: "" });

  const varianteNombre = (id: string) => data.producto_variantes.find((v) => v.id === id)?.nombre ?? "(eliminado)";
  const producciones = useMemo(() => [...data.produccion].sort((a, b) => b.fecha.localeCompare(a.fecha)), [data.produccion]);

  function registrar() {
    if (!form.producto_variante_id || form.cantidad <= 0) {
      toast("Elegí un producto y una cantidad mayor a 0", "error");
      return;
    }
    const variante = data.producto_variantes.find((v) => v.id === form.producto_variante_id);
    if (!variante) return;
    const produccionId = uid("PRD");
    const consumo = recetaEfectivaVariante(data, variante);
    setData((d) => ({
      ...d,
      produccion: [...d.produccion, { id: produccionId, producto_variante_id: form.producto_variante_id, cantidad: form.cantidad, fecha: form.fecha, notas: form.notas || undefined }],
      inventario_movimientos: [
        ...d.inventario_movimientos,
        { id: uid("MOV"), fecha: form.fecha, tipo: "produccion" as const, origen_tipo: "produccion", origen_id: produccionId, item_tipo: "producto_variante" as const, item_id: form.producto_variante_id, cantidad: form.cantidad },
        ...consumo.map((c) => ({
          id: uid("MOV"),
          fecha: form.fecha,
          tipo: "consumo" as const,
          origen_tipo: "produccion",
          origen_id: produccionId,
          item_tipo: "insumo" as const,
          item_id: c.insumo_id,
          cantidad: -(c.cantidad * form.cantidad),
        })),
      ],
    }));
    toast("Producción registrada, stock de insumos descontado según receta");
    setModalOpen(false);
    setForm({ producto_variante_id: "", cantidad: 1, fecha: new Date().toISOString().slice(0, 10), notas: "" });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Registrar producción</Button>
      </div>
      <Card>
        {producciones.length === 0 ? (
          <EmptyState text="No hay producción registrada." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Producto</Th>
                  <Th>Cantidad</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody>
                {producciones.map((p) => (
                  <TrHover key={p.id}>
                    <Td>{p.fecha}</Td>
                    <Td main>{varianteNombre(p.producto_variante_id)}</Td>
                    <Td>{fNum(p.cantidad, 0)}</Td>
                    <Td>{p.notas ?? "—"}</Td>
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
        title="Registrar producción"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={registrar}>Registrar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Producto" full>
            <Select value={form.producto_variante_id} onChange={(e) => setForm({ ...form, producto_variante_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.producto_variantes.filter((v) => v.activo).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function PlanificacionTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const now = new Date();
  const [form, setForm] = useState({ mes: now.getMonth() + 1, anio: now.getFullYear(), producto_id: "", cajas_mes: 0, cajas_semana: 0 });

  const productoNombre = (id: string) => data.productos.find((p) => p.id === id)?.nombre ?? "(eliminado)";
  const planes = useMemo(() => [...data.plan_produccion].sort((a, b) => b.anio - a.anio || b.mes - a.mes), [data.plan_produccion]);

  function guardar() {
    if (!form.producto_id) {
      toast("Elegí un producto", "error");
      return;
    }
    setData((d) => ({
      ...d,
      plan_produccion: [
        ...d.plan_produccion.filter((p) => !(p.mes === form.mes && p.anio === form.anio && p.producto_id === form.producto_id)),
        { id: uid("PP"), ...form, fecha_guardado: new Date().toISOString() },
      ],
    }));
    toast("Plan guardado");
    setModalOpen(false);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Cargar plan del mes</Button>
      </div>
      <Card>
        {planes.length === 0 ? (
          <EmptyState text="No hay planes de producción cargados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Período</Th>
                  <Th>Producto</Th>
                  <Th>Cajas/mes</Th>
                  <Th>Cajas/semana</Th>
                </tr>
              </thead>
              <tbody>
                {planes.map((p) => (
                  <TrHover key={p.id}>
                    <Td>
                      {p.mes}/{p.anio}
                    </Td>
                    <Td main>{productoNombre(p.producto_id)}</Td>
                    <Td>{fNum(p.cajas_mes, 0)}</Td>
                    <Td>{fNum(p.cajas_semana, 0)}</Td>
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
        title="Cargar plan de producción"
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
          <Field label="Mes">
            <Input type="number" min={1} max={12} value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })} />
          </Field>
          <Field label="Año">
            <Input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} />
          </Field>
          <Field label="Producto" full>
            <Select value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cajas por mes">
            <Input type="number" value={form.cajas_mes} onChange={(e) => setForm({ ...form, cajas_mes: Number(e.target.value) })} />
          </Field>
          <Field label="Cajas por semana">
            <Input type="number" value={form.cajas_semana} onChange={(e) => setForm({ ...form, cajas_semana: Number(e.target.value) })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function direccionCliente(cliente: Cliente | undefined): { texto: string; lat: number | null; lng: number | null } {
  if (!cliente) return { texto: "(cliente eliminado)", lat: null, lng: null };
  const texto = cliente.direccion?.trim() || [cliente.calle, cliente.numero].filter(Boolean).join(" ") || "Sin dirección cargada";
  return { texto, lat: cliente.latitud ?? null, lng: cliente.longitud ?? null };
}

const ESTADO_RUTA_LABEL: Record<RutaEntrega["estado"], string> = {
  planificada: "Planificada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
};
const ESTADO_RUTA_COLOR: Record<RutaEntrega["estado"], "blue" | "orange" | "green" | "red"> = {
  planificada: "blue",
  en_curso: "orange",
  completada: "green",
  cancelada: "red",
};

function EntregasTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const envios = data.configuracion.envios;
  const provider = obtenerProveedorMapa(envios.proveedor_mapa);

  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [construyendo, setConstruyendo] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [regresaOrigen, setRegresaOrigen] = useState(envios.regresar_a_base_default ?? true);
  const [peajes, setPeajes] = useState(0);
  const [estacionamiento, setEstacionamiento] = useState(0);
  const [otrosCostos, setOtrosCostos] = useState(0);

  const idsEnRutaActiva = useMemo(() => {
    const rutasActivas = new Set(data.rutas_entrega.filter((r) => r.estado !== "cancelada").map((r) => r.id));
    return new Set(data.ruta_paradas.filter((rp) => rutasActivas.has(rp.ruta_id)).map((rp) => rp.pedido_id));
  }, [data.rutas_entrega, data.ruta_paradas]);

  const pedidosEntregables = useMemo(
    () =>
      data.pedidos
        .filter((p) => (p.estado === "Confirmado" || p.estado === "Produccion") && !idsEnRutaActiva.has(p.id))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [data.pedidos, idsEnRutaActiva]
  );

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";
  const direccionPedido = (pedidoId: string) => {
    const pedido = data.pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return { texto: "—", lat: null, lng: null };
    if (pedido.direccion_entrega_snapshot) return { texto: pedido.direccion_entrega_snapshot, lat: pedido.latitud_entrega ?? null, lng: pedido.longitud_entrega ?? null };
    return direccionCliente(data.clientes.find((c) => c.id === pedido.cliente_id));
  };

  function alternarSeleccion(id: string) {
    setSeleccionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function moverParada(idx: number, delta: number) {
    setSeleccionados((s) => {
      const copia = [...s];
      const destino = idx + delta;
      if (destino < 0 || destino >= copia.length) return s;
      [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
      return copia;
    });
  }

  const paradasEntrada: ParadaEntrada[] = useMemo(
    () =>
      seleccionados.map((id) => {
        const dir = direccionPedido(id);
        return { pedido_id: id, direccion: dir.texto, lat: dir.lat, lng: dir.lng };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seleccionados, data.pedidos, data.clientes]
  );
  const sinCoordenadas = paradasSinCoordenadas(paradasEntrada);
  const origenCoord = envios.lat_base != null && envios.lng_base != null ? { lat: envios.lat_base, lng: envios.lng_base } : null;
  const rutaCalculada = calcularRuta(origenCoord, paradasEntrada, regresaOrigen, provider);
  const distanciaTotal = rutaCalculada?.distancia_total_km ?? 0;
  const duracionTotal = rutaCalculada?.duracion_total_min ?? 0;
  const tramos = rutaCalculada?.tramos ?? paradasEntrada.map((p) => ({ pedido_id: p.pedido_id, distancia_km: NaN, duracion_min: NaN }));
  const costos = calcularCostosRuta(distanciaTotal, envios, peajes, estacionamiento, otrosCostos);
  const metodoDistribucion = envios.metodo_distribucion_costo ?? "equitativo";
  const reparto = distribuirCostoRuta(tramos, costos.costo_total_ruta, metodoDistribucion);

  function abrirBuilder() {
    if (seleccionados.length === 0) {
      toast("Elegí al menos un pedido para planificar la ruta", "error");
      return;
    }
    setConstruyendo(true);
  }

  function guardarRuta() {
    const ahora = new Date().toISOString();
    const rutaId = uid("RUTA");
    const nuevaRuta: RutaEntrega = {
      id: rutaId,
      fecha,
      estado: "planificada",
      direccion_origen: envios.direccion_base ?? "",
      lat_origen: envios.lat_base ?? null,
      lng_origen: envios.lng_base ?? null,
      regresa_origen: regresaOrigen,
      distancia_total_km: Math.round(distanciaTotal * 100) / 100,
      duracion_estimada_min: Math.round(duracionTotal),
      precio_litro_snapshot: envios.litro_nafta,
      consumo_100km_snapshot: envios.consumo_100km,
      litros_estimados: costos.litros_estimados,
      costo_nafta_estimado: costos.costo_nafta_estimado,
      peajes,
      estacionamiento,
      otros_costos: otrosCostos,
      costo_total_ruta: costos.costo_total_ruta,
      metodo_distribucion_costo: metodoDistribucion,
      proveedor_mapa: envios.proveedor_mapa ?? "ninguno",
      created_at: ahora,
      updated_at: ahora,
    };
    const nuevasParadas = seleccionados.map((id, idx) => {
      const entrada = paradasEntrada.find((p) => p.pedido_id === id)!;
      const tramo = tramos.find((t) => t.pedido_id === id);
      return {
        id: uid("PARADA"),
        ruta_id: rutaId,
        pedido_id: id,
        orden: idx + 1,
        direccion_snapshot: entrada.direccion,
        lat: entrada.lat,
        lng: entrada.lng,
        distancia_tramo_km: tramo && Number.isFinite(tramo.distancia_km) ? Math.round(tramo.distancia_km * 100) / 100 : 0,
        duracion_tramo_min: tramo && Number.isFinite(tramo.duracion_min) ? Math.round(tramo.duracion_min) : 0,
        costo_asignado: reparto.get(id) ?? 0,
        estado: "pendiente" as const,
      };
    });

    setData((d) => ({
      ...d,
      rutas_entrega: [...d.rutas_entrega, nuevaRuta],
      ruta_paradas: [...d.ruta_paradas, ...nuevasParadas],
      pedidos: d.pedidos.map((p) => {
        if (!seleccionados.includes(p.id)) return p;
        const entrada = paradasEntrada.find((e) => e.pedido_id === p.id)!;
        return {
          ...p,
          costo_real_envio: reparto.get(p.id) ?? p.costo_real_envio,
          direccion_entrega_snapshot: p.direccion_entrega_snapshot ?? entrada.direccion,
          latitud_entrega: p.latitud_entrega ?? entrada.lat ?? undefined,
          longitud_entrega: p.longitud_entrega ?? entrada.lng ?? undefined,
        };
      }),
    }));
    toast("Ruta guardada");
    setConstruyendo(false);
    setSeleccionados([]);
    setPeajes(0);
    setEstacionamiento(0);
  }

  function cambiarEstadoRuta(id: string, estado: RutaEntrega["estado"]) {
    setData((d) => ({ ...d, rutas_entrega: d.rutas_entrega.map((r) => (r.id === id ? { ...r, estado, updated_at: new Date().toISOString() } : r)) }));
  }

  const rutasOrdenadas = useMemo(() => [...data.rutas_entrega].sort((a, b) => b.fecha.localeCompare(a.fecha)), [data.rutas_entrega]);

  return (
    <div>
      {!construyendo ? (
        <>
          <p className="mb-4 text-[12.5px] text-text3">
            Pedidos Confirmados o En producción que todavía necesitan entrega. Seleccioná los que van en la misma
            salida y armá la ruta — el costo de combustible se calcula con los parámetros de Configuración → Envíos.
          </p>
          <Card title="Pedidos para entregar">
            {pedidosEntregables.length === 0 ? (
              <EmptyState text="No hay pedidos Confirmados o en Producción pendientes de entrega." />
            ) : (
              <TableWrap>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th></Th>
                      <Th>Fecha</Th>
                      <Th>Cliente</Th>
                      <Th>Dirección</Th>
                      <Th>Importe</Th>
                      <Th>Envío cobrado</Th>
                      <Th>Estado</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosEntregables.map((p) => {
                      const dir = direccionPedido(p.id);
                      return (
                        <TrHover key={p.id}>
                          <Td>
                            <input type="checkbox" checked={seleccionados.includes(p.id)} onChange={() => alternarSeleccion(p.id)} />
                          </Td>
                          <Td>{p.fecha}</Td>
                          <Td main>{clienteNombre(p.cliente_id)}</Td>
                          <Td className="text-[11px] text-text3">
                            {dir.texto}
                            {dir.lat == null && <span className="ml-1 text-orange">(sin coordenadas)</span>}
                          </Td>
                          <Td>{fARS(p.total)}</Td>
                          <Td>{fARS(p.costo_envio)}</Td>
                          <Td>
                            <Badge color={p.estado === "Confirmado" ? "blue" : "orange"}>{p.estado}</Badge>
                          </Td>
                        </TrHover>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <div className="mt-3 flex justify-end">
              <Button onClick={abrirBuilder}>Planificar ruta ({seleccionados.length})</Button>
            </div>
          </Card>
        </>
      ) : (
        <Card title="Planificar ruta">
          {provider === null && (
            <p className="mb-3 rounded-md border border-orange/40 bg-orange-dim/30 p-2.5 text-[12.5px] text-orange">
              Sin proveedor de mapas configurado (Configuración → Envíos) — no se puede estimar distancia ni tiempo.
              La ruta se puede guardar igual, solo con los costos fijos que cargues abajo.
            </p>
          )}
          {origenCoord === null && provider !== null && (
            <p className="mb-3 rounded-md border border-orange/40 bg-orange-dim/30 p-2.5 text-[12.5px] text-orange">
              Falta la dirección/coordenadas base en Configuración → Envíos — no se puede calcular la ruta.
            </p>
          )}
          {sinCoordenadas.length > 0 && (
            <p className="mb-3 rounded-md border border-orange/40 bg-orange-dim/30 p-2.5 text-[12.5px] text-orange">
              {sinCoordenadas.length} parada(s) sin coordenadas — cargá la dirección estructurada del cliente en Ventas
              → Clientes para incluirla en el cálculo de distancia.
            </p>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Fecha de la ruta">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Regresar al origen">
              <Select value={regresaOrigen ? "si" : "no"} onChange={(e) => setRegresaOrigen(e.target.value === "si")}>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Peajes">
              <Input type="number" value={peajes} onChange={(e) => setPeajes(Number(e.target.value))} />
            </Field>
            <Field label="Estacionamiento">
              <Input type="number" value={estacionamiento} onChange={(e) => setEstacionamiento(Number(e.target.value))} />
            </Field>
            <Field label="Otros costos">
              <Input type="number" value={otrosCostos} onChange={(e) => setOtrosCostos(Number(e.target.value))} />
            </Field>
          </div>

          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text3">Orden de paradas</div>
          <TableWrap>
            <table className="mb-3 w-full">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Cliente</Th>
                  <Th>Dirección</Th>
                  <Th>Tramo</Th>
                  <Th>Costo asignado</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {seleccionados.map((id, idx) => {
                  const pedido = data.pedidos.find((p) => p.id === id);
                  const tramo = tramos.find((t) => t.pedido_id === id);
                  return (
                    <TrHover key={id}>
                      <Td>{idx + 1}</Td>
                      <Td main>{pedido ? clienteNombre(pedido.cliente_id) : "—"}</Td>
                      <Td className="text-[11px] text-text3">{direccionPedido(id).texto}</Td>
                      <Td>{tramo && Number.isFinite(tramo.distancia_km) ? `${fNum(tramo.distancia_km, 1)} km` : "—"}</Td>
                      <Td>{fARS(reparto.get(id) ?? 0)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => moverParada(idx, -1)} disabled={idx === 0}>
                            ↑
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => moverParada(idx, 1)} disabled={idx === seleccionados.length - 1}>
                            ↓
                          </Button>
                        </div>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] text-text3">Kilómetros</div>
              <div className="text-lg font-semibold text-text">{rutaCalculada ? fNum(distanciaTotal, 1) : "—"}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] text-text3">Litros estimados</div>
              <div className="text-lg font-semibold text-text">{fNum(costos.litros_estimados, 2)}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] text-text3">Costo combustible</div>
              <div className="text-lg font-semibold text-text">{fARS(costos.costo_nafta_estimado)}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[11px] text-text3">Costo total</div>
              <div className="text-lg font-semibold text-accent">{fARS(costos.costo_total_ruta)}</div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {origenCoord && (
              <Button
                variant="ghost"
                onClick={() => {
                  const puntos = [origenCoord, ...paradasEntrada.filter((p) => p.lat != null && p.lng != null).map((p) => ({ lat: p.lat!, lng: p.lng! }))];
                  if (regresaOrigen) puntos.push(origenCoord);
                  const url = urlNavegacionMultiparada(puntos);
                  if (url) window.open(url, "_blank");
                }}
              >
                Abrir en navegación
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConstruyendo(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarRuta}>Guardar ruta</Button>
          </div>
        </Card>
      )}

      {rutasOrdenadas.length > 0 && (
        <Card title="Rutas planificadas" className="mt-4">
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Estado</Th>
                  <Th>Paradas</Th>
                  <Th>Km</Th>
                  <Th>Costo total</Th>
                  <Th>Cambiar estado</Th>
                </tr>
              </thead>
              <tbody>
                {rutasOrdenadas.map((r) => (
                  <TrHover key={r.id}>
                    <Td>{r.fecha}</Td>
                    <Td>
                      <Badge color={ESTADO_RUTA_COLOR[r.estado]}>{ESTADO_RUTA_LABEL[r.estado]}</Badge>
                    </Td>
                    <Td>{data.ruta_paradas.filter((rp) => rp.ruta_id === r.id).length}</Td>
                    <Td>{fNum(r.distancia_total_km, 1)}</Td>
                    <Td>{fARS(r.costo_total_ruta)}</Td>
                    <Td>
                      <Select value={r.estado} onChange={(e) => cambiarEstadoRuta(r.id, e.target.value as RutaEntrega["estado"])} style={{ width: 140 }}>
                        {(Object.keys(ESTADO_RUTA_LABEL) as RutaEntrega["estado"][]).map((e) => (
                          <option key={e} value={e}>
                            {ESTADO_RUTA_LABEL[e]}
                          </option>
                        ))}
                      </Select>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}

export function Operaciones() {
  const [tab, setTab] = useState("compras");
  return (
    <div>
      <PageHeader title="Operaciones" sub="Compras, proveedores, producción, planificación y entregas" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "compras", label: "Compras" },
          { value: "proveedores", label: "Proveedores" },
          { value: "produccion", label: "Producción" },
          { value: "planificacion", label: "Planificación" },
          { value: "entregas", label: "Entregas" },
        ]}
      />
      {tab === "compras" && <ComprasTab />}
      {tab === "proveedores" && <ProveedoresTab />}
      {tab === "produccion" && <ProduccionTab />}
      {tab === "planificacion" && <PlanificacionTab />}
      {tab === "entregas" && <EntregasTab />}
    </div>
  );
}
