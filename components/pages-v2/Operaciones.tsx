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
import type { EstadoPagoCompra } from "@/lib/types-v2";
import type { Proveedor } from "@/lib/types";

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

export function Operaciones() {
  const [tab, setTab] = useState("compras");
  return (
    <div>
      <PageHeader title="Operaciones" sub="Compras, proveedores, producción y planificación" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "compras", label: "Compras" },
          { value: "proveedores", label: "Proveedores" },
          { value: "produccion", label: "Producción" },
          { value: "planificacion", label: "Planificación" },
        ]}
      />
      {tab === "compras" && <ComprasTab />}
      {tab === "proveedores" && <ProveedoresTab />}
      {tab === "produccion" && <ProduccionTab />}
      {tab === "planificacion" && <PlanificacionTab />}
    </div>
  );
}
