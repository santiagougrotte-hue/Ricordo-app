"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, X, ScanLine } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { useIaClient } from "@/lib/ia-client";
import { compressImageFile } from "@/lib/image-compress";
import {
  comprasVsConsumoUltimosMeses,
  comprasActivas,
  movimientoCajaDeseadoDeCompra,
  sincronizarMovimientoCaja,
  fARS,
  fPct,
  pvr,
} from "@/lib/calc";
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
  Alert,
  Badge,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { FileAttach } from "@/components/FileAttach";
import type { Adjunto, Compra, CompraLineaIngrediente, CompraLineaPackaging } from "@/lib/types";

type Confianza = "alta" | "media" | "baja";

interface RenglonTicket {
  texto_original: string;
  id_ingrediente: string | null;
  cantidad: number;
  unidad_ticket: string;
  precio_unitario: number;
  confianza: Confianza;
}

interface ParseTicketResponse {
  proveedor: string | null;
  fecha: string | null;
  total_ticket: number;
  renglones: RenglonTicket[];
  ilegibles: string[];
  error?: string;
}

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
  const [mostrarAnuladas, setMostrarAnuladas] = useState(false);

  const comprasVisibles = mostrarAnuladas ? data.compras : comprasActivas(data);

  const now = new Date();
  const comprasMes = comprasActivas(data).filter((c) => {
    const d = new Date(c.fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMes = comprasMes.reduce((acc, c) => acc + c.total, 0);
  const totalHistorico = comprasActivas(data).reduce((acc, c) => acc + c.total, 0);

  const totalCalculado = useMemo(
    () =>
      form.lineas.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0) +
      form.lineasPkg.reduce((a, l) => a + l.cantidad * l.precio_unitario, 0),
    [form.lineas, form.lineasPkg]
  );

  const [umbralAmber, setUmbralAmber] = useState(data.umbral_compras_consumo_amber);
  const [umbralRed, setUmbralRed] = useState(data.umbral_compras_consumo_red);
  const comprasVsConsumo = useMemo(() => comprasVsConsumoUltimosMeses(data), [data]);

  // Borrador armado desde "Generar orden de compra" en Planificación: se precarga una única vez
  // al llegar y se limpia enseguida — el usuario siempre revisa y confirma acá, nunca se guarda solo.
  const borradorConsumido = useRef(false);
  useEffect(() => {
    if (borradorConsumido.current || !data.borrador_compra_pendiente) return;
    borradorConsumido.current = true;
    const borrador = data.borrador_compra_pendiente;
    setEditing(null);
    setForm({ ...emptyForm(), descripcion: borrador.descripcion, lineas: borrador.lineas, total_manual: false });
    setModalOpen(true);
    setData((d) => ({ ...d, borrador_compra_pendiente: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe dispararse una vez al montar
  }, []);

  function guardarUmbrales() {
    setData((d) => ({ ...d, umbral_compras_consumo_amber: umbralAmber, umbral_compras_consumo_red: umbralRed }));
    toast("Umbrales guardados");
  }

  // Escanear ticket: la foto se comprime en el cliente (máx. 1600px, JPEG 0.8) antes de
  // mandarla — nada se actualiza sin que el usuario tilde el renglón y confirme.
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketFile, setTicketFile] = useState<{ base64: string; mediaType: string; previewUrl: string } | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketResultado, setTicketResultado] = useState<ParseTicketResponse | null>(null);
  const [seleccionRenglones, setSeleccionRenglones] = useState<Record<number, boolean>>({});
  const { call: llamarIa } = useIaClient();
  const ticketInputRef = useRef<HTMLInputElement>(null);

  function abrirTicketModal() {
    setTicketFile(null);
    setTicketResultado(null);
    setSeleccionRenglones({});
    setTicketModalOpen(true);
  }

  async function handleTicketFile(file: File) {
    try {
      const { base64, mediaType } = await compressImageFile(file);
      setTicketFile({ base64, mediaType, previewUrl: `data:${mediaType};base64,${base64}` });
      setTicketResultado(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo procesar la imagen", "error");
    }
  }

  async function analizarTicket() {
    if (!ticketFile) return;
    setTicketLoading(true);
    const ingredientesRef = data.ingredientes.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      unidad: i.unidad,
      precio_actual: pvr(i),
    }));
    const resultado = await llamarIa<ParseTicketResponse>(
      "parse-ticket",
      { imagen_base64: ticketFile.base64, media_type: ticketFile.mediaType, ingredientes: ingredientesRef },
      "parse-ticket"
    );
    setTicketLoading(false);
    if (resultado) {
      setTicketResultado(resultado);
      const seleccionInicial: Record<number, boolean> = {};
      resultado.renglones.forEach((r, idx) => {
        seleccionInicial[idx] = !!r.id_ingrediente && r.confianza === "alta";
      });
      setSeleccionRenglones(seleccionInicial);
    }
  }

  function confirmarActualizacionesTicket() {
    if (!ticketResultado) return;
    const aplicar = ticketResultado.renglones.filter((r, idx) => seleccionRenglones[idx] && r.id_ingrediente);
    if (aplicar.length === 0) {
      toast("No seleccionaste ningún renglón para actualizar", "error");
      return;
    }
    setData((d) => {
      let ingredientes = d.ingredientes;
      let historial = d.historial_precios;
      for (const r of aplicar) {
        const ing = ingredientes.find((i) => i.id === r.id_ingrediente);
        if (!ing) continue;
        const anterior = pvr(ing);
        historial = [
          ...historial,
          {
            id: uid("HIST"),
            id_insumo: ing.id,
            insumo: ing.nombre,
            precio_anterior: anterior,
            precio_nuevo: r.precio_unitario,
            fecha: ticketResultado.fecha ?? new Date().toISOString().slice(0, 10),
            origen: ticketResultado.proveedor ? `Ticket — ${ticketResultado.proveedor}` : "Ticket escaneado",
          },
        ];
        ingredientes = ingredientes.map((i) => (i.id === ing.id ? { ...i, precio_vigente: r.precio_unitario } : i));
      }
      return { ...d, ingredientes, historial_precios: historial };
    });
    toast(`${aplicar.length} precio${aplicar.length === 1 ? "" : "s"} actualizado${aplicar.length === 1 ? "" : "s"}`);
    setTicketModalOpen(false);
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
      registrar_caja: c.registrar_caja,
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
      registrar_caja: form.registrar_caja,
      adjunto: form.adjunto,
    };

    setData((d) => {
      let ingredientes = d.ingredientes;
      let packaging = d.packaging;
      let historial = d.historial_precios;

      for (const l of compraGuardada.lineas) {
        const ing = ingredientes.find((i) => i.id === l.id_ingrediente);
        if (ing && pvr(ing) !== l.precio_unitario) {
          historial = [
            ...historial,
            {
              id: uid("HIST"),
              id_insumo: ing.id,
              insumo: ing.nombre,
              precio_anterior: pvr(ing),
              precio_nuevo: l.precio_unitario,
              fecha: form.fecha,
            },
          ];
          ingredientes = ingredientes.map((i) => (i.id === ing.id ? { ...i, precio_vigente: l.precio_unitario } : i));
        }
      }
      for (const l of compraGuardada.lineasPkg) {
        const pkg = packaging.find((p) => p.id === l.id_packaging);
        if (pkg && pvr(pkg) !== l.precio_unitario) {
          historial = [
            ...historial,
            {
              id: uid("HIST"),
              id_insumo: pkg.id,
              insumo: pkg.nombre,
              precio_anterior: pvr(pkg),
              precio_nuevo: l.precio_unitario,
              fecha: form.fecha,
            },
          ];
          packaging = packaging.map((p) => (p.id === pkg.id ? { ...p, precio_vigente: l.precio_unitario } : p));
        }
      }

      const compras = editing
        ? d.compras.map((c) => (c.id === editing ? compraGuardada : c))
        : [...d.compras, compraGuardada];

      // Upsert (no solo "crear si falta"): editar una compra ya guardada — cambiar el monto, el
      // método de pago, o tildar/destildar "Registrar en caja" — actualiza su egreso en Caja en
      // vez de dejarlo desactualizado, algo que antes solo pasaba al crearla por primera vez.
      const caja_movimientos = sincronizarMovimientoCaja(
        d.caja_movimientos,
        compraGuardada.id,
        movimientoCajaDeseadoDeCompra(compraGuardada, proveedor?.nombre)
      );

      return { ...d, ingredientes, packaging, historial_precios: historial, compras, caja_movimientos };
    });

    toast(editing ? "Compra actualizada" : "Compra registrada");
    setModalOpen(false);
  }

  // Soft-delete: una compra nunca se borra físicamente (afecta stock, costo vigente y caja
  // históricos) — se anula, lo que además retira su egreso de Caja si tenía uno.
  function eliminar(id: string) {
    if (!confirm("¿Anular esta compra? Se excluye de stock, costos y caja, pero el registro queda para trazabilidad.")) return;
    setData((d) => {
      const compras = d.compras.map((c) => (c.id === id ? { ...c, anulada: true } : c));
      const anulada = compras.find((c) => c.id === id)!;
      return { ...d, compras, caja_movimientos: sincronizarMovimientoCaja(d.caja_movimientos, id, movimientoCajaDeseadoDeCompra(anulada)) };
    });
    toast("Compra anulada", "info");
  }

  function reactivar(id: string) {
    setData((d) => {
      const compras = d.compras.map((c) => (c.id === id ? { ...c, anulada: false } : c));
      const reactivada = compras.find((c) => c.id === id)!;
      const proveedor = data.proveedores.find((p) => p.id === reactivada.id_proveedor);
      return {
        ...d,
        compras,
        caja_movimientos: sincronizarMovimientoCaja(d.caja_movimientos, id, movimientoCajaDeseadoDeCompra(reactivada, proveedor?.nombre)),
      };
    });
    toast("Compra reactivada");
  }

  return (
    <div>
      <PageHeader
        title="Compras"
        sub="Historial con actualización automática de precios"
        right={
          <>
            <Button variant={mostrarAnuladas ? "primary" : "ghost"} onClick={() => setMostrarAnuladas((v) => !v)}>
              {mostrarAnuladas ? "Ocultar anuladas" : "Mostrar anuladas"}
            </Button>
            <Button variant="ghost" onClick={abrirTicketModal}>
              <ScanLine className="h-3.5 w-3.5" /> Escanear ticket
            </Button>
            <Button onClick={openNew}>+ Nueva Compra</Button>
          </>
        }
      />

      <StatGrid>
        <KpiCard label="Compras del mes" value={fARS(totalMes)} color="gold" />
        <KpiCard label="Total histórico" value={fARS(totalHistorico)} color="blue" />
        <KpiCard label="Registros" value={comprasActivas(data).length} color="purple" />
      </StatGrid>

      <Card title="Compras vs. consumo real (últimos 3 meses)" className="mb-4" color="orange">
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

      <Card color="orange">
        {comprasVisibles.length === 0 ? (
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
                {[...comprasVisibles]
                  .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                  .map((c) => (
                    <TrHover key={c.id} className={c.anulada ? "opacity-50" : undefined}>
                      <Td>{c.fecha}</Td>
                      <Td>{data.proveedores.find((p) => p.id === c.id_proveedor)?.nombre ?? "—"}</Td>
                      <Td main>
                        <div className="flex items-center gap-1.5">
                          {c.descripcion || "—"}
                          {c.anulada && <Badge color="red">Anulada</Badge>}
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
                          {c.anulada ? (
                            <Button size="sm" variant="green" onClick={() => reactivar(c.id)}>
                              Reactivar
                            </Button>
                          ) : (
                            <Button size="sm" variant="danger" onClick={() => eliminar(c.id)}>
                              Anular
                            </Button>
                          )}
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

      {/* Escanear ticket: la IA propone precios nuevos, nada se guarda sin tildar y confirmar. */}
      <Modal
        open={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        title="Escanear ticket de compra"
        wide
        footer={
          ticketResultado ? (
            <>
              <Button variant="ghost" onClick={() => setTicketModalOpen(false)}>
                Cerrar sin actualizar
              </Button>
              <Button onClick={confirmarActualizacionesTicket}>Actualizar precios seleccionados</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setTicketModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={analizarTicket} disabled={!ticketFile || ticketLoading}>
                {ticketLoading ? "Analizando…" : "Analizar ticket"}
              </Button>
            </>
          )
        }
      >
        {!ticketResultado ? (
          <div className="flex flex-col items-center gap-3.5 py-4">
            {ticketFile ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL comprimida en el cliente, no un asset optimizable
              <img src={ticketFile.previewUrl} alt="Ticket" className="max-h-72 rounded-lg border border-border object-contain" />
            ) : (
              <button
                type="button"
                onClick={() => ticketInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-text3 hover:border-accent hover:text-accent"
              >
                <ScanLine className="h-8 w-8" />
                <span className="text-[12.5px]">Sacar foto o elegir imagen del ticket</span>
              </button>
            )}
            <input
              ref={ticketInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleTicketFile(file);
                e.target.value = "";
              }}
            />
            {ticketFile && (
              <Button size="sm" variant="ghost" onClick={() => ticketInputRef.current?.click()}>
                Elegir otra foto
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Proveedor</div>
                <div className="text-[13px] text-text">{ticketResultado.proveedor ?? "No detectado"}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Fecha</div>
                <div className="text-[13px] text-text">{ticketResultado.fecha ?? "No detectada"}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text3">Total del ticket</div>
                <div className="text-[13px] text-text">{ticketResultado.total_ticket > 0 ? fARS(ticketResultado.total_ticket) : "—"}</div>
              </div>
            </div>

            {ticketResultado.renglones.length === 0 ? (
              <EmptyState text="No se identificó ningún ingrediente del sistema en el ticket." />
            ) : (
              <TableWrap>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th></Th>
                      <Th>Ingrediente</Th>
                      <Th>Unidad</Th>
                      <Th>Precio actual</Th>
                      <Th>Precio nuevo</Th>
                      <Th>Variación</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketResultado.renglones.map((r, idx) => {
                      const ing = r.id_ingrediente ? data.ingredientes.find((i) => i.id === r.id_ingrediente) : undefined;
                      const precioActual = pvr(ing);
                      const variacion = ing && precioActual > 0 ? ((r.precio_unitario - precioActual) / precioActual) * 100 : null;
                      const variacionAlta = variacion !== null && Math.abs(variacion) > 30;
                      return (
                        <tr key={idx} className={variacionAlta ? "bg-red-dim/40" : !ing ? "opacity-60" : ""}>
                          <Td>
                            <input
                              type="checkbox"
                              checked={!!seleccionRenglones[idx]}
                              disabled={!ing}
                              onChange={(e) => setSeleccionRenglones((s) => ({ ...s, [idx]: e.target.checked }))}
                            />
                          </Td>
                          <Td main>
                            <div className="flex items-center gap-1.5">
                              {ing?.nombre ?? r.texto_original}
                              <Badge color={r.confianza === "alta" ? "green" : "orange"}>{r.confianza}</Badge>
                            </div>
                          </Td>
                          <Td>
                            {r.unidad_ticket}
                            {ing && ing.unidad !== r.unidad_ticket && (
                              <span className="ml-1 text-text3">(app: {ing.unidad})</span>
                            )}
                          </Td>
                          <Td>{ing ? fARS(precioActual) : "—"}</Td>
                          <Td main>{fARS(r.precio_unitario)}</Td>
                          <Td>
                            {variacion !== null ? (
                              <Badge color={variacionAlta ? "red" : variacion >= 0 ? "orange" : "green"}>
                                {variacion >= 0 ? "+" : ""}
                                {fPct(variacion)}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}

            {ticketResultado.ilegibles.length > 0 && (
              <Alert kind="warning">
                No se pudieron leer: {ticketResultado.ilegibles.join(", ")}. Revisalos manualmente contra el ticket.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
