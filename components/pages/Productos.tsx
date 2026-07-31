"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { calcCosto, fARS, fPct, pvr } from "@/lib/calc";
import {
  PageHeader,
  Button,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  FormGrid,
  Field,
  Input,
  Select,
  Badge,
  InfoRow,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Wizard } from "@/components/Wizard";
import { FileAttach } from "@/components/FileAttach";
import { ProductoBaseEditor } from "@/components/ProductoBaseEditor";
import { Bar } from "@/components/ds";
import type { Adjunto, Ingrediente, Packaging, CostoFijo, Producto, RecetaLinea, TipoRecetaLinea } from "@/lib/types";

function emptyForm() {
  return { nombre: "", categoria: "", id_base: "", precio_venta: 0, activo: true, foto: undefined as Adjunto | undefined };
}

interface DraftLinea {
  tipo: TipoRecetaLinea;
  concepto: string;
  cantidad: number;
}

function emptyDraftLinea(): DraftLinea {
  return { tipo: "Ingrediente", concepto: "", cantidad: 0 };
}

export function Productos() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [verReceta, setVerReceta] = useState<string | null>(null);
  const [editarBase, setEditarBase] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [draftForm, setDraftForm] = useState(emptyForm());
  const [draftLineas, setDraftLineas] = useState<DraftLinea[]>([]);
  const [draftLinea, setDraftLinea] = useState(emptyDraftLinea());

  function openNew() {
    setDraftForm(emptyForm());
    setDraftLineas([]);
    setDraftLinea(emptyDraftLinea());
    setWizardOpen(true);
  }
  function openEdit(p: Producto) {
    setEditing(p.id);
    setForm({
      nombre: p.nombre,
      categoria: p.categoria ?? "",
      id_base: p.id_base,
      precio_venta: p.precio_venta,
      activo: p.activo,
      foto: p.foto,
    });
    setModalOpen(true);
  }
  function save() {
    if (!form.nombre) {
      toast("Ingresá un nombre", "error");
      return;
    }
    setData((d) => ({
      ...d,
      productos: d.productos.map((p) => (p.id === editing ? { ...p, ...form, id_base: form.id_base || p.id } : p)),
    }));
    toast("Producto actualizado");
    setModalOpen(false);
  }
  function eliminar(id: string) {
    setData((d) => ({ ...d, productos: d.productos.filter((p) => p.id !== id) }));
    toast("Producto eliminado", "info");
  }

  function nombreConceptoDraft(l: DraftLinea) {
    if (l.tipo === "Ingrediente") return data.ingredientes.find((i) => i.id === l.concepto)?.nombre ?? l.concepto;
    if (l.tipo === "Packaging") return data.packaging.find((p) => p.id === l.concepto)?.nombre ?? l.concepto;
    return data.costos_fijos.find((c) => c.id === l.concepto)?.descripcion ?? l.concepto;
  }
  function costoLineaDraft(l: DraftLinea) {
    if (l.tipo === "Ingrediente") return l.cantidad * pvr(data.ingredientes.find((i) => i.id === l.concepto));
    if (l.tipo === "Packaging") return l.cantidad * (data.packaging.find((p) => p.id === l.concepto)?.precio ?? 0);
    return l.cantidad * (data.costos_fijos.find((c) => c.id === l.concepto)?.monto ?? 0);
  }
  function agregarDraftLinea() {
    if (!draftLinea.concepto || draftLinea.cantidad <= 0) {
      toast("Completá concepto y cantidad", "error");
      return;
    }
    setDraftLineas((ls) => [...ls, draftLinea]);
    setDraftLinea(emptyDraftLinea());
  }
  function quitarDraftLinea(idx: number) {
    setDraftLineas((ls) => ls.filter((_, i) => i !== idx));
  }
  const costoDraft = draftLineas.reduce((acc, l) => acc + costoLineaDraft(l), 0);
  const margenDraft = draftForm.precio_venta > 0 ? ((draftForm.precio_venta - costoDraft) / draftForm.precio_venta) * 100 : 0;

  function crearProductoConReceta() {
    const id = uid("PROD");
    const producto: Producto = { id, ...draftForm, id_base: draftForm.id_base || id };
    const recetas: RecetaLinea[] = draftLineas.map((l) => ({
      id: uid("REC"),
      id_producto: id,
      tipo: l.tipo,
      concepto: l.concepto,
      cantidad: l.cantidad,
    }));
    setData((d) => ({ ...d, productos: [...d.productos, producto], recetas: [...d.recetas, ...recetas] }));
    toast(recetas.length > 0 ? `Producto creado con receta de ${recetas.length} ${recetas.length === 1 ? "línea" : "líneas"}` : "Producto creado");
    setWizardOpen(false);
  }

  // Orden por margen % descendente (Parte A, Fase 4).
  const productosOrdenados = useMemo(() => {
    return data.productos
      .map((p) => {
        const costo = calcCosto(data, p.id);
        const margen = p.precio_venta > 0 ? ((p.precio_venta - costo) / p.precio_venta) * 100 : 0;
        return { producto: p, costo, margen };
      })
      .sort((a, b) => b.margen - a.margen);
  }, [data]);

  const prodReceta = verReceta ? data.productos.find((p) => p.id === verReceta) : null;
  const lineasReceta = verReceta ? data.recetas.filter((r) => r.id_producto === verReceta) : [];
  const costoReceta = verReceta ? calcCosto(data, verReceta) : 0;
  const margenReceta =
    prodReceta && prodReceta.precio_venta > 0 ? ((prodReceta.precio_venta - costoReceta) / prodReceta.precio_venta) * 100 : 0;

  return (
    <div>
      <PageHeader title="Productos" sub="Catálogo con recetas y costos" right={<Button onClick={openNew}>+ Nuevo</Button>} />

      <Card>
        {data.productos.length === 0 ? (
          <EmptyState text="Sin productos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Base</Th>
                  <Th>Precio venta</Th>
                  <Th>Costo</Th>
                  <Th>Margen %</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {productosOrdenados.map(({ producto: p, costo, margen }) => {
                  const base = data.productos.find((b) => b.id === p.id_base);
                  return (
                    <TrHover key={p.id}>
                      <Td main>
                        <div className="flex items-center gap-2.5">
                          {p.foto && (
                            // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not an optimizable remote asset
                            <img src={p.foto.data} alt={p.nombre} className="h-8 w-8 shrink-0 rounded object-cover" />
                          )}
                          {p.nombre}
                        </div>
                      </Td>
                      <Td>{p.id_base !== p.id && base ? base.nombre : "—"}</Td>
                      <Td>{fARS(p.precio_venta)}</Td>
                      <Td>{fARS(costo)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-16">
                            <Bar pct={Math.max(0, margen)} color={margen >= 60 ? "green" : "orange"} />
                          </div>
                          <span className={`text-[12px] font-medium ${margen >= 60 ? "text-green" : "text-orange"}`}>
                            {fPct(margen)}
                          </span>
                        </div>
                      </Td>
                      <Td>
                        <Badge color={p.activo ? "green" : "red"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setVerReceta(p.id)}>
                            Receta
                          </Button>
                          {p.id === p.id_base && (
                            <Button size="sm" variant="ghost" onClick={() => setEditarBase(p.id)}>
                              Base
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => eliminar(p.id)}>
                            Eliminar
                          </Button>
                        </div>
                      </Td>
                    </TrHover>
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
        title="Editar Producto"
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
          <Field label="Categoría">
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          </Field>
          <Field label="Producto base (variante de)">
            <Select value={form.id_base} onChange={(e) => setForm({ ...form, id_base: e.target.value })}>
              <option value="">— Es un producto base —</option>
              {data.productos
                .filter((p) => p.id !== editing)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Precio de venta">
            <Input
              type="number"
              value={form.precio_venta}
              onChange={(e) => setForm({ ...form, precio_venta: Number(e.target.value) })}
            />
          </Field>
          <Field label="Activo">
            <Select value={form.activo ? "1" : "0"} onChange={(e) => setForm({ ...form, activo: e.target.value === "1" })}>
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
          <Field label="Foto" full>
            <FileAttach value={form.foto} onChange={(foto) => setForm({ ...form, foto })} accept="image/*" />
          </Field>
        </FormGrid>
      </Modal>

      <Wizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Nuevo Producto"
        wide
        finishLabel="Crear producto"
        onFinish={crearProductoConReceta}
        steps={[
          {
            title: "Datos del producto",
            validate: () => (!draftForm.nombre ? "Ingresá un nombre" : null),
            content: (
              <FormGrid>
                <Field label="Nombre" full>
                  <Input value={draftForm.nombre} onChange={(e) => setDraftForm({ ...draftForm, nombre: e.target.value })} />
                </Field>
                <Field label="Categoría">
                  <Input value={draftForm.categoria} onChange={(e) => setDraftForm({ ...draftForm, categoria: e.target.value })} />
                </Field>
                <Field label="Producto base (variante de)">
                  <Select value={draftForm.id_base} onChange={(e) => setDraftForm({ ...draftForm, id_base: e.target.value })}>
                    <option value="">— Es un producto base —</option>
                    {data.productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Precio de venta">
                  <Input
                    type="number"
                    value={draftForm.precio_venta}
                    onChange={(e) => setDraftForm({ ...draftForm, precio_venta: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Activo">
                  <Select
                    value={draftForm.activo ? "1" : "0"}
                    onChange={(e) => setDraftForm({ ...draftForm, activo: e.target.value === "1" })}
                  >
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </Select>
                </Field>
                <Field label="Foto" full>
                  <FileAttach value={draftForm.foto} onChange={(foto) => setDraftForm({ ...draftForm, foto })} accept="image/*" />
                </Field>
              </FormGrid>
            ),
          },
          {
            title: "Receta",
            content: (
              <div>
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_100px_100px]">
                  <Field label="Tipo">
                    <Select
                      value={draftLinea.tipo}
                      onChange={(e) => setDraftLinea({ ...draftLinea, tipo: e.target.value as TipoRecetaLinea, concepto: "" })}
                    >
                      <option value="Ingrediente">Ingrediente</option>
                      <option value="Packaging">Packaging</option>
                      <option value="CostoFijo">Costo Fijo</option>
                    </Select>
                  </Field>
                  <Field label="Concepto">
                    <Select value={draftLinea.concepto} onChange={(e) => setDraftLinea({ ...draftLinea, concepto: e.target.value })}>
                      <option value="">Seleccionar…</option>
                      {(draftLinea.tipo === "Ingrediente"
                        ? data.ingredientes
                        : draftLinea.tipo === "Packaging"
                        ? data.packaging
                        : data.costos_fijos
                      ).map((o: Ingrediente | Packaging | CostoFijo) => (
                        <option key={o.id} value={o.id}>
                          {"nombre" in o ? o.nombre : o.descripcion}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cantidad">
                    <Input
                      type="number"
                      value={draftLinea.cantidad}
                      onChange={(e) => setDraftLinea({ ...draftLinea, cantidad: Number(e.target.value) })}
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button onClick={agregarDraftLinea} className="w-full justify-center">
                      + Agregar
                    </Button>
                  </div>
                </div>

                {draftLineas.length === 0 ? (
                  <EmptyState text="Sin líneas de receta todavía. Podés dejarlo vacío y cargarlo después." />
                ) : (
                  <TableWrap>
                    <table className="w-full">
                      <thead>
                        <tr>
                          <Th>Tipo</Th>
                          <Th>Concepto</Th>
                          <Th>Cantidad</Th>
                          <Th>Costo</Th>
                          <Th>Acciones</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftLineas.map((l, idx) => (
                          <TrHover key={idx}>
                            <Td>{l.tipo}</Td>
                            <Td main>{nombreConceptoDraft(l)}</Td>
                            <Td>{l.cantidad}</Td>
                            <Td>{fARS(costoLineaDraft(l))}</Td>
                            <Td>
                              <Button size="sm" variant="danger" onClick={() => quitarDraftLinea(idx)}>
                                Quitar
                              </Button>
                            </Td>
                          </TrHover>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                )}
              </div>
            ),
          },
          {
            title: "Revisión",
            content: (
              <div className="rounded-lg border border-border bg-surface2/40 p-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text3">Resumen</div>
                <InfoRow label="Producto" value={draftForm.nombre || "—"} />
                <InfoRow label="Líneas de receta" value={String(draftLineas.length)} />
                <InfoRow label="Costo total de receta" value={fARS(costoDraft)} color="gold" />
                <InfoRow label="Precio de venta" value={fARS(draftForm.precio_venta)} />
                <InfoRow label="Margen" value={fPct(margenDraft)} color={margenDraft >= 30 ? "green" : "red"} />
              </div>
            ),
          },
        ]}
      />

      <Modal open={!!verReceta} onClose={() => setVerReceta(null)} title={`Receta — ${prodReceta?.nombre ?? ""}`}>
        {lineasReceta.length === 0 ? (
          <EmptyState text="Este producto no tiene receta cargada." />
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Tipo</Th>
                    <Th>Concepto</Th>
                    <Th>Cantidad</Th>
                    <Th>Costo</Th>
                  </tr>
                </thead>
                <tbody>
                  {lineasReceta.map((r) => {
                    let nombre = r.concepto;
                    let costoUnit = 0;
                    if (r.tipo === "Ingrediente") {
                      const ing = data.ingredientes.find((i) => i.id === r.concepto);
                      nombre = ing?.nombre ?? r.concepto;
                      costoUnit = ing ? (ing.precio_vigente ?? ing.precio_ref) : 0;
                    } else if (r.tipo === "Packaging") {
                      const pkg = data.packaging.find((p) => p.id === r.concepto);
                      nombre = pkg?.nombre ?? r.concepto;
                      costoUnit = pkg?.precio ?? 0;
                    } else {
                      const cf = data.costos_fijos.find((c) => c.id === r.concepto);
                      nombre = cf?.descripcion ?? r.concepto;
                      costoUnit = cf?.monto ?? 0;
                    }
                    return (
                      <TrHover key={r.id}>
                        <Td>{r.tipo}</Td>
                        <Td main>{nombre}</Td>
                        <Td>{r.cantidad}</Td>
                        <Td>{fARS(r.cantidad * costoUnit)}</Td>
                      </TrHover>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <div className="mt-4">
              <InfoRow label="Costo total" value={fARS(costoReceta)} color="gold" />
              <InfoRow label="Precio de venta" value={fARS(prodReceta?.precio_venta ?? 0)} />
              <InfoRow label="Margen" value={fPct(margenReceta)} color={margenReceta >= 30 ? "green" : "red"} />
            </div>
          </>
        )}
      </Modal>

      <ProductoBaseEditor
        producto={editarBase ? data.productos.find((p) => p.id === editarBase) ?? null : null}
        onClose={() => setEditarBase(null)}
      />
    </div>
  );
}
