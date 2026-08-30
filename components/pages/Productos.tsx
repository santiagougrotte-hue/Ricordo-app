"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  calcCosto,
  estaMigrado,
  fARS,
  fPct,
  gustosTodos,
  pvr,
  tipoVentaDeProducto,
  TIPO_VENTA_LABEL,
  TIPO_VENTA_ORDEN,
} from "@/lib/calc";
import type { GustoBase } from "@/lib/calc";
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
  SearchInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Wizard } from "@/components/Wizard";
import { FileAttach } from "@/components/FileAttach";
import { ProductoBaseEditor } from "@/components/ProductoBaseEditor";
import { ProductoVentaEditor } from "@/components/ProductoVentaEditor";
import { Bar } from "@/components/ds";
import type { Adjunto, Ingrediente, Packaging, CostoFijo, Producto, RecetaLinea, TipoRecetaLinea, TipoVenta } from "@/lib/types";
import type { RicordoData } from "@/lib/types";

const TIPO_VENTA_BADGE: Record<TipoVenta, "green" | "red" | "orange" | "blue" | "purple" | "gold"> = {
  Minorista: "blue",
  Mayorista: "purple",
  VacioSinSalsa: "gold",
  VacioConSalsa: "green",
  SinClasificar: "red",
};

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
  const [editarVenta, setEditarVenta] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [draftForm, setDraftForm] = useState(emptyForm());
  const [draftLineas, setDraftLineas] = useState<DraftLinea[]>([]);
  const [draftLinea, setDraftLinea] = useState(emptyDraftLinea());

  const [search, setSearch] = useState("");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

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
  // Soft-delete: un producto de venta discontinuado se da de baja, nunca se borra — conserva
  // su historial de pedidos, producción y costos intacto.
  function eliminar(id: string) {
    if (!confirm("¿Dar de baja este producto? Se excluye de los gustos activos pero el registro queda para trazabilidad.")) return;
    setData((d) => ({ ...d, productos: d.productos.map((p) => (p.id === id ? { ...p, activo: false } : p)) }));
    toast("Producto dado de baja", "info");
  }
  function reactivar(id: string) {
    setData((d) => ({ ...d, productos: d.productos.map((p) => (p.id === id ? { ...p, activo: true } : p)) }));
    toast("Producto reactivado");
  }

  function nombreConceptoDraft(l: DraftLinea) {
    if (l.tipo === "Ingrediente") return data.ingredientes.find((i) => i.id === l.concepto)?.nombre ?? l.concepto;
    if (l.tipo === "Packaging") return data.packaging.find((p) => p.id === l.concepto)?.nombre ?? l.concepto;
    return data.costos_fijos.find((c) => c.id === l.concepto)?.descripcion ?? l.concepto;
  }
  function costoLineaDraft(l: DraftLinea) {
    if (l.tipo === "Ingrediente") return l.cantidad * pvr(data.ingredientes.find((i) => i.id === l.concepto));
    if (l.tipo === "Packaging") return l.cantidad * pvr(data.packaging.find((p) => p.id === l.concepto));
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

  // Un gusto por producto base (id_base), con sus variantes (tipos de venta) agrupadas adentro
  // — así cada gusto existe como un solo producto principal en la lista, en vez de una fila por
  // cada Minorista/Mayorista/Vacío suelto.
  const gustos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return gustosTodos(data)
      .filter((g) => (mostrarInactivos ? true : g.variantes.some((v) => v.activo)))
      .filter((g) => !term || g.nombre.toLowerCase().includes(term))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [data, search, mostrarInactivos]);

  const prodReceta = verReceta ? data.productos.find((p) => p.id === verReceta) : null;
  const lineasReceta = verReceta ? data.recetas.filter((r) => r.id_producto === verReceta) : [];
  const costoReceta = verReceta ? calcCosto(data, verReceta) : 0;
  const margenReceta =
    prodReceta && prodReceta.precio_venta > 0 ? ((prodReceta.precio_venta - costoReceta) / prodReceta.precio_venta) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Productos"
        sub="Cada gusto es un solo producto principal, con sus tipos de venta (Minorista, Mayorista, Vacío) adentro"
        right={
          <>
            <Button variant={mostrarInactivos ? "primary" : "ghost"} onClick={() => setMostrarInactivos((v) => !v)}>
              {mostrarInactivos ? "Ocultar dados de baja" : "Mostrar dados de baja"}
            </Button>
            <Button onClick={openNew}>+ Nuevo</Button>
          </>
        }
      />

      <div className="mb-4 max-w-xs">
        <SearchInput placeholder="Buscar gusto…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {gustos.length === 0 ? (
        <Card>
          <EmptyState text="Sin productos que coincidan." />
        </Card>
      ) : (
        gustos.map((gusto) => (
          <GustoCard
            key={gusto.id_base}
            gusto={gusto}
            data={data}
            expanded={!!expandido[gusto.id_base]}
            onToggle={() => setExpandido((e) => ({ ...e, [gusto.id_base]: !e[gusto.id_base] }))}
            onVerReceta={setVerReceta}
            onEditarBase={setEditarBase}
            onEditarVenta={setEditarVenta}
            onEditar={openEdit}
            onEliminar={eliminar}
            onReactivar={reactivar}
          />
        ))
      )}

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
                      costoUnit = pvr(ing);
                    } else if (r.tipo === "Packaging") {
                      const pkg = data.packaging.find((p) => p.id === r.concepto);
                      nombre = pkg?.nombre ?? r.concepto;
                      costoUnit = pvr(pkg);
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

      <ProductoVentaEditor
        producto={editarVenta ? data.productos.find((p) => p.id === editarVenta) ?? null : null}
        onClose={() => setEditarVenta(null)}
      />
    </div>
  );
}

function GustoCard({
  gusto,
  data,
  expanded,
  onToggle,
  onVerReceta,
  onEditarBase,
  onEditarVenta,
  onEditar,
  onEliminar,
  onReactivar,
}: {
  gusto: GustoBase;
  data: RicordoData;
  expanded: boolean;
  onToggle: () => void;
  onVerReceta: (id: string) => void;
  onEditarBase: (id: string) => void;
  onEditarVenta: (id: string) => void;
  onEditar: (p: Producto) => void;
  onEliminar: (id: string) => void;
  onReactivar: (id: string) => void;
}) {
  const base = data.productos.find((p) => p.id === gusto.id_base);
  const costoBase = base ? calcCosto(data, base.id) : 0;
  const variantesOrdenadas = [...gusto.variantes].sort(
    (a, b) => TIPO_VENTA_ORDEN.indexOf(tipoVentaDeProducto(a)) - TIPO_VENTA_ORDEN.indexOf(tipoVentaDeProducto(b))
  );
  const activas = gusto.variantes.filter((v) => v.activo).length;

  return (
    <Card className="mb-3">
      <div className="flex cursor-pointer items-center justify-between gap-2" onClick={onToggle}>
        <div className="flex items-center gap-2.5">
          {expanded ? <ChevronDown className="h-4 w-4 text-text3" /> : <ChevronRight className="h-4 w-4 text-text3" />}
          {base?.foto && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not an optimizable remote asset
            <img src={base.foto.data} alt={gusto.nombre} className="h-8 w-8 shrink-0 rounded object-cover" />
          )}
          <span className="text-[14px] font-semibold text-text">{gusto.nombre}</span>
          <Badge color="blue">
            {gusto.variantes.length} {gusto.variantes.length === 1 ? "tipo" : "tipos"}
          </Badge>
          {activas < gusto.variantes.length && <Badge color="red">{gusto.variantes.length - activas} de baja</Badge>}
        </div>
        <span className="text-[12px] text-text3">Costo base: {fARS(costoBase)}</span>
      </div>

      {expanded && (
        <div className="mt-3.5 border-t border-border pt-3.5">
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Tipo de venta</Th>
                  <Th>Origen actual</Th>
                  <Th>Precio</Th>
                  <Th>Costo</Th>
                  <Th>Ganancia</Th>
                  <Th>Margen</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {variantesOrdenadas.map((v) => {
                  const tipo = tipoVentaDeProducto(v);
                  const costo = calcCosto(data, v.id);
                  const ganancia = v.precio_venta - costo;
                  const margen = v.precio_venta > 0 ? (ganancia / v.precio_venta) * 100 : 0;
                  const esBase = v.id === v.id_base;
                  const posibleBase: Producto | undefined = v;
                  const migrado = estaMigrado(data, posibleBase);
                  return (
                    <TrHover key={v.id} className={!v.activo ? "opacity-50" : undefined}>
                      <Td>
                        <Badge color={TIPO_VENTA_BADGE[tipo]}>{TIPO_VENTA_LABEL[tipo]}</Badge>
                      </Td>
                      <Td main>{v.nombre}</Td>
                      <Td>{fARS(v.precio_venta)}</Td>
                      <Td>{fARS(costo)}</Td>
                      <Td className={ganancia >= 0 ? "text-green" : "text-red"}>{fARS(ganancia)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-14">
                            <Bar pct={Math.max(0, margen)} color={margen >= 60 ? "green" : "orange"} />
                          </div>
                          <span className={`text-[12px] font-medium ${margen >= 60 ? "text-green" : "text-orange"}`}>{fPct(margen)}</span>
                        </div>
                      </Td>
                      <Td>
                        <Badge color={v.activo ? "green" : "red"}>{v.activo ? "Activo" : "De baja"}</Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {!migrado && (
                            <Button size="sm" variant="ghost" onClick={() => onVerReceta(v.id)}>
                              Receta
                            </Button>
                          )}
                          {esBase ? (
                            <Button size="sm" variant="ghost" onClick={() => onEditarBase(v.id)}>
                              Base
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => onEditarVenta(v.id)}>
                              Detalle
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => onEditar(v)}>
                            Editar
                          </Button>
                          {v.activo ? (
                            <Button size="sm" variant="danger" onClick={() => onEliminar(v.id)}>
                              Dar de baja
                            </Button>
                          ) : (
                            <Button size="sm" variant="green" onClick={() => onReactivar(v.id)}>
                              Reactivar
                            </Button>
                          )}
                        </div>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </Card>
  );
}
