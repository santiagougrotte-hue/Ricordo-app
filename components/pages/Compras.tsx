"use client";

import React, { useMemo, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { comprasVsConsumoUltimosMeses, fARS, fPct } from "@/lib/calc";
import {
  PageHeader,
  Button,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Field,
  Select,
  Input,
  Textarea,
  StatGrid,
  KpiCard,
  Semaforo,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { FileAttach } from "@/components/FileAttach";
import type { Adjunto, Compra, CompraLineaIngrediente, CompraLineaPackaging } from "@/lib/types";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function emptyForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    id_proveedor: "",
    descripcion: "",
    notas: "",
    metodo_pago: "",
    total_manual: false,
    total: 0,
    registrar_caja: true,
    lineas: [] as CompraLineaIngrediente[],
    lineasPkg: [] as CompraLineaPackaging[],
    adjunto: undefined as Adjunto | undefined,
  };
}

export function Compras() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const now = new Date();
  const comprasMes = data.compras.filter((c) => {
    const d = new Date(c.fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMes = comprasMes.reduce((acc, c) => acc + c.total, 0);
  const totalHistorico = data.compras.reduce((acc, c) => acc + c.total, 0);

  const totalCalculado = useMemo(
    () =>
      form.lineas.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0) +
      form.lineasPkg.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0),
    [form.lineas, form.lineasPkg]
  );

  const [umbralAmber, setUmbralAmber] = useState(data.umbral_compras_consumo_amber);
  const [umbralRed, setUmbralRed] = useState(data.umbral_compras_consumo_red);
  const comprasVsConsumo = useMemo(() => comprasVsConsumoUltimosMeses(data), [data]);

  function guardarUmbrales() {
    setData((d) => ({ ...d, umbral_compras_consumo_amber: umbralAmber, umbral_compras_consumo_red: umbralRed }));
    toast("Umbrales guardados");
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(c: Compra) {
    setEditing(c.id);
    setForm({
      fecha: c.fecha,
      id_proveedor: c.id_proveedor,
      descripcion: c.descripcion ?? "",
      notas: c.notas ?? "",
      metodo_pago: c.metodo_pago ?? "",
      total_manual: c.total_manual,
      total: c.total,
      registrar_caja: false,
      lineas: c.lineas,
      lineasPkg: c.lineasPkg,
      adjunto: c.adjunto,
    });
    setModalOpen(true);
  }

  function addLinea() {
    setForm((f) => ({ ...f, lineas: [...f.lineas, { id_ingrediente: "", cantidad: 0, precio_unitario: 0 }] }));
  }
  function addLineaPkg() {
    setForm((f) => ({ ...f, lineasPkg: [...f.lineasPkg, { id_packaging: "", cantidad: 0, precio_unitario: 0 }] }));
  }

  function save() {
    const total = form.total_manual ? form.total : totalCalculado;
    const proveedor = data.proveedores.find((p) => p.id === form.id_proveedor);
    const compraGuardada: Compra = {
      id: editing ?? uid("COM"),
      fecha: form.fecha,
      id_proveedor: form.id_proveedor,
      descripcion: form.descripcion,
      notas: form.notas,
      metodo_pago: form.metodo_pago,
      total_manual: form.total_manual,
      total,
      lineas: form.lineas.filter((l) => l.id_ingrediente),
      lineasPkg: form.lineasPkg.filter((l) => l.id_packaging),
      registrar_caja: false,
      adjunto: form.adjunto,
    };

    setData((d) => {
      let ingredientes = d.ingredientes;
      let packaging = d.packaging;
      let historial = d.historial_precios;

      for (const l of compraGuardada.lineas) {
        const ing = ingredientes.find((i) => i.id === l.id_ingrediente);
        if (ing && (ing.precio_vigente ?? ing.precio_ref) !== l.precio_unitario) {
          historial = [
            ...historial,
            {
              id: uid("HIST"),
              id_insumo: ing.id,
              insumo: ing.nombre,
              precio_anterior: ing.precio_vigente ?? ing.precio_ref,
              precio_nuevo: l.precio_unitario,
              fecha: form.fecha,
            },
          ];
          ingredientes = ingredientes.map((i) => (i.id === ing.id ? { ...i, precio_vigente: l.precio_unitario } : i));
        }
      }
      for (const l of compraGuardada.lineasPkg) {
        packaging = packaging.map((p) => (p.id === l.id_packaging ? { ...p, precio: l.precio_unitario } : p));
      }

      const compras = editing
        ? d.compras.map((c) => (c.id === editing ? compraGuardada : c))
        : [...d.compras, compraGuardada];

      const caja_movimientos =
        !editing && form.registrar_caja
          ? [
              ...d.caja_movimientos,
              {
                id: uid("CAJ"),
                fecha: form.fecha,
                tipo: "egreso" as const,
                concepto: `Compra${proveedor ? " — " + proveedor.nombre : ""}${form.descripcion ? ": " + form.descripcion : ""}`,
                monto: total,
                metodo: form.metodo_pago || "Efectivo",
                ref: compraGuardada.id,
              },
            ]
          : d.caja_movimientos;

      return { ...d, ingredientes, packaging, historial_precios: historial, compras, caja_movimientos };
    });

    toast(editing ? "Compra actualizada" : "Compra registrada");
    setModalOpen(false);
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, compras: d.compras.filter((c) => c.id !== id) }));
    toast("Compra eliminada", "info");
  }

  return (
    <div>
      <PageHeader title="Compras" sub="Historial con actualización automática de precios" right={<Button onClick={openNew}>+ Nueva Compra</Button>} />

      <StatGrid>
        <KpiCard label="Compras del mes" value={fARS(totalMes)} color="gold" />
        <KpiCard label="Total histórico" value={fARS(totalHistorico)} color="blue" />
        <KpiCard label="Registros" value={data.compras.length} color="purple" />
      </StatGrid>

      <Card title="Compras vs. consumo real (últimos 3 meses)" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Compara lo comprado en materia prima contra el costo de lo efectivamente vendido. Una diferencia positiva no es
          necesariamente un problema — puede ser stock intencional o pruebas. El indicador señala, no juzga.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {comprasVsConsumo.map((m) => (
            <div key={`${m.anio}-${m.mes}`} className="rounded-lg border border-border bg-surface2/40 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">
                  {MESES_CORTOS[m.mes - 1]} {m.anio}
                </span>
                <Semaforo nivel={m.nivel} size="sm" />
              </div>
              <div className="flex justify-between py-0.5 text-[12.5px]">
                <span className="text-text2">Comprado</span>
                <span className="font-medium">{fARS(m.compras)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-[12.5px]">
                <span className="text-text2">Consumido (vendido)</span>
                <span className="font-medium">{fARS(m.consumoVendido)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-[12.5px]">
                <span className="text-text3">Diferencia</span>
                <span className={m.diferencia >= 0 ? "font-semibold text-orange" : "font-semibold text-green"}>
                  {fARS(m.diferencia)} {m.porcentaje !== null ? `(${m.porcentaje >= 0 ? "+" : ""}${fPct(m.porcentaje)})` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-3.5">
          <Field label="Umbral amarillo (%)">
            <Input type="number" value={umbralAmber} onChange={(e) => setUmbralAmber(Number(e.target.value))} />
          </Field>
          <Field label="Umbral rojo (%)">
            <Input type="number" value={umbralRed} onChange={(e) => setUmbralRed(Number(e.target.value))} />
          </Field>
          <Button size="sm" onClick={guardarUmbrales}>
            Guardar umbrales
          </Button>
        </div>
      </Card>

      <Card>
        {data.compras.length === 0 ? (
          <EmptyState text="Sin compras registradas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Proveedor</Th>
                  <Th>Descripción</Th>
                  <Th>Líneas</Th>
                  <Th>Total</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {[...data.compras]
                  .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                  .map((c) => (
                    <TrHover key={c.id}>
                      <Td>{c.fecha}</Td>
                      <Td>{data.proveedores.find((p) => p.id === c.id_proveedor)?.nombre ?? "—"}</Td>
                      <Td main>
                        <div className="flex items-center gap-1.5">
                          {c.descripcion || "—"}
                          {c.adjunto && (
                            <a href={c.adjunto.data} download={c.adjunto.nombre} title={c.adjunto.nombre} className="text-text3 hover:text-accent">
                              <Paperclip className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </Td>
                      <Td>{c.lineas.length + c.lineasPkg.length}</Td>
                      <Td main>{fARS(c.total)}</Td>
                      <Td>
                        <div className="flex gap-1.5">
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
        title={editing ? "Editar Compra" : "Nueva Compra"}
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
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Proveedor">
            <Select value={form.id_proveedor} onChange={(e) => setForm({ ...form, id_proveedor: e.target.value })}>
              <option value="">Seleccionar…</option>
              {data.proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Método de pago">
            <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
          </Field>
          <Field label="Descripción" full>
            <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Líneas de ingredientes</span>
            <Button size="sm" variant="ghost" onClick={addLinea}>
              + Línea
            </Button>
          </div>
          {form.lineas.map((l, idx) => (
            <div key={idx} className="mb-2 flex flex-wrap items-center gap-2 sm:grid sm:grid-cols-[1fr_100px_120px_40px]">
              <Select
                className="w-full sm:w-auto"
                value={l.id_ingrediente}
                onChange={(e) => {
                  const lineas = [...form.lineas];
                  lineas[idx] = { ...l, id_ingrediente: e.target.value };
                  setForm({ ...form, lineas });
                }}
              >
                <option value="">Ingrediente…</option>
                {data.ingredientes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                placeholder="Cant."
                className="flex-1 sm:flex-none"
                value={l.cantidad}
                onChange={(e) => {
                  const lineas = [...form.lineas];
                  lineas[idx] = { ...l, cantidad: Number(e.target.value) };
                  setForm({ ...form, lineas });
                }}
              />
              <Input
                type="number"
                placeholder="Precio unit."
                className="flex-1 sm:flex-none"
                value={l.precio_unitario}
                onChange={(e) => {
                  const lineas = [...form.lineas];
                  lineas[idx] = { ...l, precio_unitario: Number(e.target.value) };
                  setForm({ ...form, lineas });
                }}
              />
              <button
                onClick={() => setForm({ ...form, lineas: form.lineas.filter((_, i) => i !== idx) })}
                className="text-red hover:text-red/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Líneas de packaging</span>
            <Button size="sm" variant="ghost" onClick={addLineaPkg}>
              + Línea
            </Button>
          </div>
          {form.lineasPkg.map((l, idx) => (
            <div key={idx} className="mb-2 flex flex-wrap items-center gap-2 sm:grid sm:grid-cols-[1fr_100px_120px_40px]">
              <Select
                className="w-full sm:w-auto"
                value={l.id_packaging}
                onChange={(e) => {
                  const lineasPkg = [...form.lineasPkg];
                  lineasPkg[idx] = { ...l, id_packaging: e.target.value };
                  setForm({ ...form, lineasPkg });
                }}
              >
                <option value="">Packaging…</option>
                {data.packaging.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                placeholder="Cant."
                className="flex-1 sm:flex-none"
                value={l.cantidad}
                onChange={(e) => {
                  const lineasPkg = [...form.lineasPkg];
                  lineasPkg[idx] = { ...l, cantidad: Number(e.target.value) };
                  setForm({ ...form, lineasPkg });
                }}
              />
              <Input
                type="number"
                placeholder="Precio unit."
                className="flex-1 sm:flex-none"
                value={l.precio_unitario}
                onChange={(e) => {
                  const lineasPkg = [...form.lineasPkg];
                  lineasPkg[idx] = { ...l, precio_unitario: Number(e.target.value) };
                  setForm({ ...form, lineasPkg });
                }}
              />
              <button
                onClick={() => setForm({ ...form, lineasPkg: form.lineasPkg.filter((_, i) => i !== idx) })}
                className="text-red hover:text-red/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-xs text-text2">
            <input
              type="checkbox"
              checked={form.total_manual}
              onChange={(e) => setForm({ ...form, total_manual: e.target.checked })}
            />
            Total manual
          </label>
          {form.total_manual ? (
            <Input
              type="number"
              value={form.total}
              onChange={(e) => setForm({ ...form, total: Number(e.target.value) })}
              style={{ width: 160 }}
            />
          ) : (
            <span className="text-sm font-medium text-accent">{fARS(totalCalculado)}</span>
          )}
          {!editing && (
            <label className="ml-auto flex items-center gap-2 text-xs text-text2">
              <input
                type="checkbox"
                checked={form.registrar_caja}
                onChange={(e) => setForm({ ...form, registrar_caja: e.target.checked })}
              />
              Registrar como egreso en Caja
            </label>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
          <Field label="Comprobante / factura" full>
            <FileAttach value={form.adjunto} onChange={(adjunto) => setForm({ ...form, adjunto })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
