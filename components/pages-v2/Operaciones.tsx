"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { useRouter } from "@/lib/nav-context";
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
  Alert,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { gramosRellenoPorUnidad, kgRellenoDisponible, kgRellenoParaCajasGusto, registrarProduccion, resumenRellenos, usaRellenoPorUnidad } from "@/lib/rellenos";
import { fARS, fNum, deshacerSaldoHistoricoCompra } from "@/lib/calc-v2";
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

  function deshacerHistorico(compraId: string) {
    setData((d) => deshacerSaldoHistoricoCompra(d, compraId));
    toast(`Compra ${compraId} vuelve a estar pendiente de pago`);
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
                              {c.saldo_historico ? (
                                <>
                                  <Badge color="blue">Saldado (histórico) el {c.saldado_el}</Badge>
                                  <Button size="sm" variant="ghost" onClick={() => deshacerHistorico(c.id)}>
                                    Deshacer
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Badge color={c.estado_pago === "pagado" ? "green" : "orange"}>{c.estado_pago}</Badge>
                                  {c.estado_pago === "pendiente" && (
                                    <Button size="sm" onClick={() => marcarPagada(c.id)}>
                                      Marcar pagada
                                    </Button>
                                  )}
                                </>
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
  const hoy = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ producto_id: "", cajas: 1, fecha: hoy(), notas: "" });

  const nombreGusto = (p: (typeof data.produccion)[number]) => {
    const productoId = p.producto_id ?? data.producto_variantes.find((v) => v.id === p.producto_variante_id)?.producto_id;
    return data.productos.find((x) => x.id === productoId)?.nombre ?? data.producto_variantes.find((v) => v.id === p.producto_variante_id)?.nombre ?? "(eliminado)";
  };
  const producciones = useMemo(() => [...data.produccion].sort((a, b) => b.fecha.localeCompare(a.fecha)), [data.produccion]);
  const gustos = data.productos.filter((p) => p.activo);
  const esPasta = form.producto_id ? usaRellenoPorUnidad(data, form.producto_id) : true;
  const kgNecesarios = form.producto_id ? kgRellenoParaCajasGusto(data, form.producto_id, form.cajas) : 0;
  const kgDisponibles = form.producto_id ? kgRellenoDisponible(data, form.producto_id) : 0;

  function registrar() {
    if (!form.producto_id || form.cajas <= 0) {
      toast("Elegí un gusto y una cantidad mayor a 0", "error");
      return;
    }
    // Armar NO descuenta insumos: la masa y el packaging se descuentan al confirmar el pedido, y el
    // relleno se controla por kilo cocido (Operaciones → Rellenos). Acá solo entran las cajas de 12
    // al stock de terminados de ese gusto y se registra cuánto relleno cocido se usó.
    const kgRelleno = kgRellenoParaCajasGusto(data, form.producto_id, form.cajas);
    setData((d) =>
      registrarProduccion(d, { id: uid("PRD"), movId: uid("MOV"), producto_id: form.producto_id, cajas: form.cajas, fecha: form.fecha, notas: form.notas })
    );
    toast(kgRelleno > 0 ? `Producción registrada: ${fNum(kgRelleno, 3)} kg de relleno usados` : "Producción registrada");
    setModalOpen(false);
    setForm({ producto_id: "", cajas: 1, fecha: hoy(), notas: "" });
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
                  <Th>Gusto</Th>
                  <Th>Cajas</Th>
                  <Th>Relleno usado</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody>
                {producciones.map((p) => (
                  <TrHover key={p.id}>
                    <Td>{p.fecha}</Td>
                    <Td main>{nombreGusto(p)}</Td>
                    <Td>{fNum(p.cantidad, 0)}</Td>
                    <Td>{p.kg_relleno ? `${fNum(p.kg_relleno, 3)} kg` : "—"}</Td>
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
          <Field label="Gusto" full>
            <Select value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {gustos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={esPasta ? "Cajas de 12 armadas" : "Unidades producidas"}>
            <Input type="number" value={form.cajas} onChange={(e) => setForm({ ...form, cajas: Number(e.target.value) })} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
        {kgNecesarios > 0 && (
          <div className="mt-3">
            <Alert kind={kgNecesarios > kgDisponibles ? "warning" : "info"}>
              Usa {fNum(kgNecesarios, 3)} kg de relleno cocido. Disponible: {fNum(kgDisponibles, 3)} kg.
              {kgNecesarios > kgDisponibles && " No alcanza con lo cargado: revisá la tanda en Operaciones → Rellenos."}
            </Alert>
          </div>
        )}
        <p className="mt-2 text-[11.5px] text-text3">Armar no descuenta masa ni packaging: eso se descuenta al confirmar el pedido.</p>
      </Modal>
    </div>
  );
}

function RellenosTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ producto_id: "", kg: 0, fecha: hoy, notas: "" });
  const resumen = useMemo(() => resumenRellenos(data), [data]);
  const tandas = useMemo(() => [...(data.rellenos_cocidos ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha)), [data.rellenos_cocidos]);
  const productosPasta = data.productos.filter((p) => p.activo && usaRellenoPorUnidad(data, p.id));
  const gramos = gramosRellenoPorUnidad(data);
  const nombreProducto = (id: string) => data.productos.find((p) => p.id === id)?.nombre ?? id;

  function guardar() {
    if (!form.producto_id || !(form.kg > 0)) {
      toast("Elegí el relleno y cargá los kilos cocidos", "error");
      return;
    }
    setData((d) => ({
      ...d,
      rellenos_cocidos: [...(d.rellenos_cocidos ?? []), { id: uid("REL"), fecha: form.fecha, producto_id: form.producto_id, kg: form.kg, notas: form.notas || undefined }],
    }));
    toast(`Relleno cargado: alcanza para ${Math.floor(form.kg / ((gramos * 12) / 1000))} cajas de 12`);
    setModalOpen(false);
    setForm({ producto_id: "", kg: 0, fecha: hoy, notas: "" });
  }

  function eliminar(id: string) {
    if (!window.confirm("¿Eliminar esta tanda de relleno?")) return;
    setData((d) => ({ ...d, rellenos_cocidos: (d.rellenos_cocidos ?? []).filter((r) => r.id !== id) }));
    toast("Tanda eliminada");
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-text3">
          Al terminar cada relleno, pesalo y cargá los kilos cocidos. A {fNum(gramos, 0)} g por unidad, cada caja de 12 usa {fNum((gramos * 12) / 1000, 3)} kg.
        </p>
        <Button onClick={() => setModalOpen(true)}>+ Cargar relleno</Button>
      </div>
      <Card title="Relleno disponible" className="mb-4">
        {resumen.length === 0 ? (
          <EmptyState text="Todavía no cargaste ningún relleno." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Relleno</Th>
                  <Th>Cargado</Th>
                  <Th>Usado al armar</Th>
                  <Th>Disponible</Th>
                  <Th>Cajas de 12 que alcanza</Th>
                  <Th>Última tanda</Th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <TrHover key={r.producto_id}>
                    <Td main>{r.producto}</Td>
                    <Td>{fNum(r.kg_cargados, 3)} kg</Td>
                    <Td>{fNum(r.kg_usados, 3)} kg</Td>
                    <Td>{fNum(r.kg_disponibles, 3)} kg</Td>
                    <Td>
                      <Badge color={r.cajas_12_disponibles <= 4 ? "red" : "green"}>{fNum(r.cajas_12_disponibles, 0)}</Badge>
                    </Td>
                    <Td>{r.ultima_tanda ?? "—"}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Card title="Tandas cargadas">
        {tandas.length === 0 ? (
          <EmptyState text="Sin tandas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Relleno</Th>
                  <Th>Kilos cocidos</Th>
                  <Th>Notas</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {tandas.map((t) => (
                  <TrHover key={t.id}>
                    <Td>{t.fecha}</Td>
                    <Td main>{nombreProducto(t.producto_id)}</Td>
                    <Td>{fNum(t.kg, 3)} kg</Td>
                    <Td>{t.notas ?? "—"}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => eliminar(t.id)}>
                        Eliminar
                      </Button>
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
        title="Cargar relleno cocido"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar relleno</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Relleno" full>
            <Select value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {productosPasta.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kilos cocidos (pesados)">
            <Input type="number" step="0.001" value={form.kg || ""} onChange={(e) => setForm({ ...form, kg: Number(e.target.value) })} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
        {form.kg > 0 && (
          <p className="mt-2 text-[12.5px] text-text2">Alcanza para {Math.floor(form.kg / ((gramos * 12) / 1000))} cajas de 12.</p>
        )}
      </Modal>
    </div>
  );
}

export function Operaciones() {
  const { tab: tabInicial } = useRouter();
  const [tab, setTab] = useState(tabInicial ?? "compras");
  return (
    <div>
      <PageHeader title="Operaciones" sub="Compras, proveedores, rellenos y producción" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "compras", label: "Compras" },
          { value: "proveedores", label: "Proveedores" },
          { value: "rellenos", label: "Rellenos" },
          { value: "produccion", label: "Producción" },
        ]}
      />
      {tab === "compras" && <ComprasTab />}
      {tab === "proveedores" && <ProveedoresTab />}
      {tab === "rellenos" && <RellenosTab />}
      {tab === "produccion" && <ProduccionTab />}
    </div>
  );
}
