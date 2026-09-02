"use client";

import React, { useMemo, useState } from "react";
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
  SearchInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  fARS,
  fNum,
  costoVariante,
  costoUnidadProductoBase,
  margenVariante,
  recetaEfectivaVariante,
  categoriasPorAmbito,
  detectarCanalInconsistente,
  variantesSinFactorReceta,
  ETAPAS_POR_UNIDAD,
} from "@/lib/calc-v2";
import type { Canal, EtapaReceta, OperacionAjusteReceta, ProductoVariante } from "@/lib/types-v2";

const ETAPAS: EtapaReceta[] = ["masa", "relleno", "salsa", "terminacion", "packaging"];
const OPERACIONES: OperacionAjusteReceta[] = ["sumar", "reemplazar", "restar"];
const OPERACION_LABEL: Record<OperacionAjusteReceta, string> = {
  sumar: "Agregar (insumo extra, no toca la receta base)",
  reemplazar: "Reemplazar (cambia la cantidad de un insumo de la receta base)",
  restar: "Restar (quita cantidad a un insumo de la receta base)",
};
const OPERACION_COLOR: Record<OperacionAjusteReceta, "green" | "blue" | "red"> = { sumar: "green", reemplazar: "blue", restar: "red" };

function varianteVacia(): Omit<ProductoVariante, "id" | "producto_id"> {
  return { nombre: "", canal: "Minorista", presentacion: "", incluye_salsa: undefined, unidades_por_paquete: undefined, precio_venta: 0, activo: true };
}

function FichaProducto({ productoId }: { productoId: string }) {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const producto = data.productos.find((p) => p.id === productoId);
  const variantes = data.producto_variantes.filter((v) => v.producto_id === productoId);
  const receta = data.recetas.find((r) => r.producto_id === productoId);
  const recetaItems = receta ? data.receta_items.filter((i) => i.receta_id === receta.id) : [];

  const [varianteModalOpen, setVarianteModalOpen] = useState(false);
  const [editandoVariante, setEditandoVariante] = useState<string | null>(null);
  const [varianteForm, setVarianteForm] = useState(varianteVacia());

  const [nuevoItem, setNuevoItem] = useState<{ insumo_id: string; etapa: EtapaReceta; cantidad: number }>({
    insumo_id: "",
    etapa: "masa",
    cantidad: 0,
  });

  const [varianteAjusteId, setVarianteAjusteId] = useState<string>(variantes[0]?.id ?? "");
  const [nuevoAjuste, setNuevoAjuste] = useState<{ insumo_id: string; operacion: OperacionAjusteReceta; cantidad: number; etapa: EtapaReceta | "" }>({
    insumo_id: "",
    operacion: "sumar",
    cantidad: 0,
    etapa: "",
  });
  const [nuevoComplemento, setNuevoComplemento] = useState<{ producto_id: string; cantidad: number }>({ producto_id: "", cantidad: 1 });

  if (!producto) return null;
  const nombreProducto = producto.nombre;

  const varianteSeleccionadaAjustes = varianteAjusteId || variantes[0]?.id || "";
  const ajustesVariante = data.ajustes_receta_variante.filter((a) => a.variante_id === varianteSeleccionadaAjustes);
  const complementosVariante = data.complementos_variante.filter((c) => c.variante_id === varianteSeleccionadaAjustes);
  const insumoNombre = (id: string) => data.insumos.find((i) => i.id === id)?.nombre ?? "(insumo eliminado)";
  const precioInsumo = (id: string) => data.insumos.find((i) => i.id === id)?.precio_actual ?? 0;
  const insumoUnidad = (id: string) => data.insumos.find((i) => i.id === id)?.unidad ?? "—";
  const idsSinFactor = new Set(variantesSinFactorReceta(data).map((s) => s.variante_id));
  const costoNuevoItem = precioInsumo(nuevoItem.insumo_id) * nuevoItem.cantidad;
  const costoNuevoAjuste = precioInsumo(nuevoAjuste.insumo_id) * nuevoAjuste.cantidad;
  const costoUnidad = costoUnidadProductoBase(data, productoId);

  function abrirNuevaVariante() {
    setEditandoVariante(null);
    setVarianteForm(varianteVacia());
    setVarianteModalOpen(true);
  }
  function abrirEdicionVariante(v: ProductoVariante) {
    setEditandoVariante(v.id);
    setVarianteForm({
      nombre: v.nombre,
      canal: v.canal,
      presentacion: v.presentacion ?? "",
      incluye_salsa: v.incluye_salsa,
      unidades_por_paquete: v.unidades_por_paquete,
      precio_venta: v.precio_venta,
      activo: v.activo,
    });
    setVarianteModalOpen(true);
  }
  function guardarVariante() {
    if (!varianteForm.nombre.trim()) {
      toast("El nombre es obligatorio", "error");
      return;
    }
    if (editandoVariante) {
      setData((d) => ({ ...d, producto_variantes: d.producto_variantes.map((v) => (v.id === editandoVariante ? { ...v, ...varianteForm } : v)) }));
      toast("Variante actualizada");
    } else {
      const nueva: ProductoVariante = { id: uid("VAR"), producto_id: productoId, ...varianteForm };
      setData((d) => ({ ...d, producto_variantes: [...d.producto_variantes, nueva] }));
      toast("Variante creada");
    }
    setVarianteModalOpen(false);
  }
  function eliminarVariante(id: string) {
    if (data.pedido_items.some((i) => i.producto_variante_id === id)) {
      toast("No se puede eliminar: tiene pedidos asociados", "error");
      return;
    }
    setData((d) => ({
      ...d,
      producto_variantes: d.producto_variantes.filter((v) => v.id !== id),
      ajustes_receta_variante: d.ajustes_receta_variante.filter((a) => a.variante_id !== id),
      complementos_variante: d.complementos_variante.filter((c) => c.variante_id !== id),
    }));
    toast("Variante eliminada", "info");
  }

  function agregarRecetaItem() {
    if (!nuevoItem.insumo_id || nuevoItem.cantidad <= 0) {
      toast("Elegí un insumo y una cantidad mayor a 0", "error");
      return;
    }
    setData((d) => {
      let recetas = d.recetas;
      let recetaActual = recetas.find((r) => r.producto_id === productoId);
      if (!recetaActual) {
        recetaActual = { id: uid("REC"), producto_id: productoId, nombre: `Receta de ${nombreProducto}`, activa: true };
        recetas = [...recetas, recetaActual];
      }
      return {
        ...d,
        recetas,
        receta_items: [...d.receta_items, { id: uid("RECI"), receta_id: recetaActual.id, insumo_id: nuevoItem.insumo_id, etapa: nuevoItem.etapa, cantidad: nuevoItem.cantidad }],
      };
    });
    setNuevoItem({ insumo_id: "", etapa: "masa", cantidad: 0 });
  }
  function quitarRecetaItem(id: string) {
    setData((d) => ({ ...d, receta_items: d.receta_items.filter((i) => i.id !== id) }));
  }
  function actualizarCantidadRecetaItem(id: string, cantidad: number) {
    if (cantidad < 0) return; // una cantidad negativa generaría un costo (y CMV) negativo
    setData((d) => ({ ...d, receta_items: d.receta_items.map((i) => (i.id === id ? { ...i, cantidad } : i)) }));
  }

  function agregarAjuste() {
    if (!varianteSeleccionadaAjustes || !nuevoAjuste.insumo_id) {
      toast("Elegí una variante y un insumo", "error");
      return;
    }
    setData((d) => ({
      ...d,
      ajustes_receta_variante: [
        ...d.ajustes_receta_variante,
        {
          id: uid("AJR"),
          variante_id: varianteSeleccionadaAjustes,
          insumo_id: nuevoAjuste.insumo_id,
          operacion: nuevoAjuste.operacion,
          cantidad: nuevoAjuste.cantidad,
          etapa: nuevoAjuste.etapa || undefined,
        },
      ],
    }));
    setNuevoAjuste({ insumo_id: "", operacion: "sumar", cantidad: 0, etapa: "" });
  }
  function quitarAjuste(id: string) {
    setData((d) => ({ ...d, ajustes_receta_variante: d.ajustes_receta_variante.filter((a) => a.id !== id) }));
  }

  function agregarComplemento() {
    if (!varianteSeleccionadaAjustes || !nuevoComplemento.producto_id) {
      toast("Elegí una variante y un producto complemento", "error");
      return;
    }
    setData((d) => ({
      ...d,
      complementos_variante: [
        ...d.complementos_variante,
        { id: uid("COMPV"), variante_id: varianteSeleccionadaAjustes, producto_id: nuevoComplemento.producto_id, cantidad: nuevoComplemento.cantidad },
      ],
    }));
    setNuevoComplemento({ producto_id: "", cantidad: 1 });
  }
  function quitarComplemento(id: string) {
    setData((d) => ({ ...d, complementos_variante: d.complementos_variante.filter((c) => c.id !== id) }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Datos del producto">
        <FormGrid>
          <Field label="Nombre" full>
            <Input
              value={producto.nombre}
              onChange={(e) => setData((d) => ({ ...d, productos: d.productos.map((p) => (p.id === productoId ? { ...p, nombre: e.target.value } : p)) }))}
            />
          </Field>
          <Field label="Categoría">
            <Select
              value={producto.categoria_id ?? ""}
              onChange={(e) =>
                setData((d) => ({ ...d, productos: d.productos.map((p) => (p.id === productoId ? { ...p, categoria_id: e.target.value || undefined } : p)) }))
              }
            >
              <option value="">Sin categoría</option>
              {categoriasPorAmbito(data, "producto").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Activo">
            <Select
              value={producto.activo ? "si" : "no"}
              onChange={(e) => setData((d) => ({ ...d, productos: d.productos.map((p) => (p.id === productoId ? { ...p, activo: e.target.value === "si" } : p)) }))}
            >
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Card>

      <Card
        title="Variantes"
        right={
          <Button size="sm" onClick={abrirNuevaVariante}>
            + Nueva variante
          </Button>
        }
      >
        {variantes.length === 0 ? (
          <EmptyState text="Este producto todavía no tiene variantes de venta." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Canal</Th>
                  <Th>Un./paquete</Th>
                  <Th>Precio venta</Th>
                  <Th>Costo</Th>
                  <Th>Margen</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {variantes.map((v) => {
                  const margen = margenVariante(data, v);
                  return (
                    <TrHover key={v.id}>
                      <Td main>{v.nombre}</Td>
                      <Td>{v.canal ?? "—"}</Td>
                      <Td>
                        {v.unidades_por_paquete ?? (idsSinFactor.has(v.id) ? <Badge color="red">Falta — receta en $0</Badge> : "—")}
                      </Td>
                      <Td>{fARS(v.precio_venta)}</Td>
                      <Td>
                        {fARS(costoVariante(data, v.id))}
                        {v.unidades_por_paquete != null && (
                          <div className="text-[11px] text-text3">
                            Receta base: {fARS(costoUnidad)} × {v.unidades_por_paquete} = {fARS(costoUnidad * v.unidades_por_paquete)}
                          </div>
                        )}
                      </Td>
                      <Td className={margen >= 0 ? "text-green" : "text-red"}>{fNum(margen, 1)}%</Td>
                      <Td>
                        <Badge color={v.activo ? "green" : "red"}>{v.activo ? "Activo" : "Inactivo"}</Badge>
                      </Td>
                      <Td>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => abrirEdicionVariante(v)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => eliminarVariante(v.id)}>
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

      <Card title="Receta por unidad">
        <p className="mb-3 text-[12.5px] text-text3">
          Ingresá las cantidades de masa y relleno utilizadas para fabricar 1 unidad. La app multiplicará
          automáticamente estas cantidades según las unidades que contenga cada presentación — no hace falta cargar
          la receta de nuevo por canal ni por presentación. Si alguna variante no muestra el costo esperado, revisá
          la tabla de Variantes: la fila roja indica que le falta ese factor de conversión.
        </p>
        <p className="mb-3 text-[12.5px] text-text3">
          Packaging, salsa, complementos y otros insumos de una presentación puntual NO se cargan acá — se agregan
          por variante más abajo (Ajustes) o como complementos, y nunca se multiplican por unidades por paquete.
        </p>
        {recetaItems.length === 0 ? (
          <EmptyState text="Sin receta cargada todavía." />
        ) : (
          <TableWrap>
            <table className="mb-3 w-full">
              <thead>
                <tr>
                  <Th>Etapa</Th>
                  <Th>Insumo</Th>
                  <Th>Cantidad por unidad</Th>
                  <Th>Unidad</Th>
                  <Th>Costo por unidad</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {recetaItems.map((i) => (
                  <TrHover key={i.id}>
                    <Td>
                      {i.etapa}
                      {!ETAPAS_POR_UNIDAD.includes(i.etapa) && (
                        <span className="ml-1.5 text-[11px] text-text3">(no escala por presentación)</span>
                      )}
                    </Td>
                    <Td main>{insumoNombre(i.insumo_id)}</Td>
                    <Td>
                      <Input
                        type="number"
                        className="w-24"
                        value={i.cantidad}
                        onChange={(e) => actualizarCantidadRecetaItem(i.id, Number(e.target.value))}
                      />
                    </Td>
                    <Td>{insumoUnidad(i.insumo_id)}</Td>
                    <Td className="font-medium text-text">{fARS(precioInsumo(i.insumo_id) * i.cantidad)}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => quitarRecetaItem(i.id)}>
                        Quitar
                      </Button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="mb-3 rounded-md border border-border bg-surface2/40 p-2.5 text-[13px]">
          <span className="text-text2">Costo de 1 unidad (masa + relleno): </span>
          <span className="font-semibold text-text">{fARS(costoUnidad)}</span>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5">
          <div className="w-full sm:w-auto sm:flex-[2]">
            <Select value={nuevoItem.insumo_id} onChange={(e) => setNuevoItem({ ...nuevoItem, insumo_id: e.target.value })}>
              <option value="">Insumo…</option>
              {data.insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </Select>
          </div>
          <Select value={nuevoItem.etapa} onChange={(e) => setNuevoItem({ ...nuevoItem, etapa: e.target.value as EtapaReceta })} className="w-full sm:w-32">
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            placeholder="Cantidad"
            className="w-full sm:w-28"
            value={nuevoItem.cantidad}
            onChange={(e) => setNuevoItem({ ...nuevoItem, cantidad: Number(e.target.value) })}
          />
          {nuevoItem.insumo_id && (
            <div className="w-full text-[12.5px] text-text2 sm:w-auto">
              Precio: <span className="font-medium text-text">{fARS(precioInsumo(nuevoItem.insumo_id))}</span> · Costo de esta línea:{" "}
              <span className="font-medium text-accent">{fARS(costoNuevoItem)}</span>
            </div>
          )}
          <Button size="sm" onClick={agregarRecetaItem}>
            + Agregar
          </Button>
        </div>
      </Card>

      {variantes.length > 0 && (
        <Card title="Insumos por canal de venta (sin tocar la receta base)">
          <p className="mb-3 text-[12.5px] text-text3">
            Esta variante hereda la receta base tal cual. Acá podés agregarle insumos propios (por ejemplo, algo distinto
            para Mayorista que para Minorista) sin modificar la receta compartida por el resto de las variantes.
          </p>
          <div className="mb-3 max-w-[260px]">
            <Select value={varianteSeleccionadaAjustes} onChange={(e) => setVarianteAjusteId(e.target.value)}>
              {variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text3">Insumos agregados o ajustados</div>
          {ajustesVariante.length === 0 ? (
            <EmptyState text="Sin insumos propios — usa la receta base tal cual." />
          ) : (
            <table className="mb-2 w-full">
              <tbody>
                {ajustesVariante.map((a) => (
                  <tr key={a.id}>
                    <Td main>{insumoNombre(a.insumo_id)}</Td>
                    <Td>
                      <Badge color={OPERACION_COLOR[a.operacion]}>{OPERACION_LABEL[a.operacion].split(" (")[0]}</Badge>
                    </Td>
                    <Td>{fNum(a.cantidad, 3)}</Td>
                    <Td>{a.etapa ?? "—"}</Td>
                    <Td>{fARS(precioInsumo(a.insumo_id) * a.cantidad)}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => quitarAjuste(a.id)}>
                        Quitar
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5">
            <Select value={nuevoAjuste.insumo_id} onChange={(e) => setNuevoAjuste({ ...nuevoAjuste, insumo_id: e.target.value })} className="w-full sm:w-40">
              <option value="">Insumo…</option>
              {data.insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </Select>
            <Select
              value={nuevoAjuste.operacion}
              onChange={(e) => setNuevoAjuste({ ...nuevoAjuste, operacion: e.target.value as OperacionAjusteReceta })}
              className="w-full sm:w-64"
            >
              {OPERACIONES.map((o) => (
                <option key={o} value={o}>
                  {OPERACION_LABEL[o]}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              placeholder="Cantidad"
              className="w-full sm:w-24"
              value={nuevoAjuste.cantidad}
              onChange={(e) => setNuevoAjuste({ ...nuevoAjuste, cantidad: Number(e.target.value) })}
            />
            <Select
              value={nuevoAjuste.etapa}
              onChange={(e) => setNuevoAjuste({ ...nuevoAjuste, etapa: e.target.value as EtapaReceta | "" })}
              className="w-full sm:w-32"
            >
              <option value="">(cualquier etapa)</option>
              {ETAPAS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
            {nuevoAjuste.insumo_id && (
              <div className="w-full text-[12.5px] text-text2 sm:w-auto">
                Precio: <span className="font-medium text-text">{fARS(precioInsumo(nuevoAjuste.insumo_id))}</span> · Costo:{" "}
                <span className="font-medium text-accent">{fARS(costoNuevoAjuste)}</span>
              </div>
            )}
            <Button size="sm" onClick={agregarAjuste}>
              + Agregar ajuste
            </Button>
          </div>

          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text3">Complementos (receta de otro producto)</div>
          {complementosVariante.length === 0 ? (
            <EmptyState text="Sin complementos." />
          ) : (
            <table className="mb-2 w-full">
              <tbody>
                {complementosVariante.map((c) => (
                  <tr key={c.id}>
                    <Td main>{data.productos.find((p) => p.id === c.producto_id)?.nombre ?? "(producto eliminado)"}</Td>
                    <Td>{fNum(c.cantidad, 3)}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => quitarComplemento(c.id)}>
                        Quitar
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5">
            <Select value={nuevoComplemento.producto_id} onChange={(e) => setNuevoComplemento({ ...nuevoComplemento, producto_id: e.target.value })} className="w-full sm:w-48">
              <option value="">Producto…</option>
              {data.productos
                .filter((p) => p.id !== productoId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </Select>
            <Input
              type="number"
              placeholder="Cantidad"
              className="w-full sm:w-24"
              value={nuevoComplemento.cantidad}
              onChange={(e) => setNuevoComplemento({ ...nuevoComplemento, cantidad: Number(e.target.value) })}
            />
            <Button size="sm" onClick={agregarComplemento}>
              + Agregar complemento
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={varianteModalOpen}
        onClose={() => setVarianteModalOpen(false)}
        title={editandoVariante ? "Editar variante" : "Nueva variante"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVarianteModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarVariante}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Nombre" full>
            <Input value={varianteForm.nombre} onChange={(e) => setVarianteForm({ ...varianteForm, nombre: e.target.value })} />
          </Field>
          <Field label="Canal">
            <Select value={varianteForm.canal ?? ""} onChange={(e) => setVarianteForm({ ...varianteForm, canal: e.target.value as Canal })}>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
            </Select>
          </Field>
          <Field label="Presentación">
            <Input value={varianteForm.presentacion ?? ""} onChange={(e) => setVarianteForm({ ...varianteForm, presentacion: e.target.value })} />
          </Field>
          <Field label="Unidades por paquete">
            <Input
              type="number"
              value={varianteForm.unidades_por_paquete ?? ""}
              onChange={(e) => setVarianteForm({ ...varianteForm, unidades_por_paquete: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          <Field label="Precio de venta">
            <Input type="number" value={varianteForm.precio_venta} onChange={(e) => setVarianteForm({ ...varianteForm, precio_venta: Number(e.target.value) })} />
          </Field>
          <Field label="Incluye salsa">
            <Select
              value={varianteForm.incluye_salsa === undefined ? "" : varianteForm.incluye_salsa ? "si" : "no"}
              onChange={(e) => setVarianteForm({ ...varianteForm, incluye_salsa: e.target.value === "" ? undefined : e.target.value === "si" })}
            >
              <option value="">No aplica</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Activo">
            <Select value={varianteForm.activo ? "si" : "no"} onChange={(e) => setVarianteForm({ ...varianteForm, activo: e.target.value === "si" })}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function ProductosTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");

  const productos = useMemo(
    () => data.productos.filter((p) => !search || p.nombre.toLowerCase().includes(search.toLowerCase())),
    [data.productos, search]
  );
  const actual = seleccionado ?? productos[0]?.id ?? null;
  const alertasCanal = useMemo(() => detectarCanalInconsistente(data), [data]);

  function corregirCanal(varianteId: string, canal: Canal) {
    setData((d) => ({ ...d, producto_variantes: d.producto_variantes.map((v) => (v.id === varianteId ? { ...v, canal } : v)) }));
    toast("Canal corregido");
  }
  function corregirTodosLosCanales() {
    const sugeridos = new Map(alertasCanal.map((a) => [a.variante_id, a.canal_sugerido]));
    setData((d) => ({ ...d, producto_variantes: d.producto_variantes.map((v) => (sugeridos.has(v.id) ? { ...v, canal: sugeridos.get(v.id)! } : v)) }));
    toast(`${alertasCanal.length} canal(es) corregido(s)`);
  }

  function crearProducto() {
    if (!nombreNuevo.trim()) {
      toast("El nombre es obligatorio", "error");
      return;
    }
    const nuevo = { id: uid("PROD"), nombre: nombreNuevo.trim(), activo: true };
    setData((d) => ({ ...d, productos: [...d.productos, nuevo] }));
    setSeleccionado(nuevo.id);
    setNombreNuevo("");
    setModalOpen(false);
    toast("Producto base creado");
  }

  return (
    <div>
      {alertasCanal.length > 0 && (
        <Card
          title="Canal inconsistente con el nombre"
          className="mb-4"
          right={
            <Button size="sm" onClick={corregirTodosLosCanales}>
              Corregir todas ({alertasCanal.length})
            </Button>
          }
        >
          <p className="mb-2 text-[12.5px] text-text3">
            La agrupación real siempre es por id, nunca por texto — esto es solo un aviso de calidad de datos: el
            nombre de la variante sugiere un canal distinto al que tiene cargado (o no tiene ninguno). Revisalo antes
            de confiar en el valor — el selector de Ventas filtra por este campo.
          </p>
          <ul className="flex flex-col gap-2">
            {alertasCanal.map((a) => (
              <li key={a.variante_id} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="text-text2">
                  &ldquo;{a.variante_nombre}&rdquo; — cargado como <Badge color="orange">{a.canal_actual ?? "sin canal"}</Badge>, el
                  nombre sugiere <Badge color="blue">{a.canal_sugerido}</Badge>
                </span>
                <Button size="sm" variant="ghost" onClick={() => corregirCanal(a.variante_id, a.canal_sugerido)}>
                  Corregir a {a.canal_sugerido}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <Card
        title="Productos base"
        right={
          <Button size="sm" onClick={() => setModalOpen(true)}>
            +
          </Button>
        }
      >
        <div className="mb-3">
          <SearchInput placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {productos.length === 0 ? (
          <EmptyState text="No hay productos cargados." />
        ) : (
          <div className="flex flex-col gap-1">
            {productos.map((p) => (
              <div
                key={p.id}
                onClick={() => setSeleccionado(p.id)}
                className={`cursor-pointer rounded-md px-3 py-2 text-[12.5px] transition-colors ${
                  actual === p.id ? "bg-accent-dim font-medium text-accent" : "text-text2 hover:bg-surface2 hover:text-text"
                }`}
              >
                {p.nombre}
                {!p.activo && <span className="ml-1.5 text-text3">(inactivo)</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {actual ? <FichaProducto productoId={actual} /> : <Card><EmptyState text="Elegí o creá un producto base." /></Card>}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo producto base"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={crearProducto}>Crear</Button>
          </>
        }
      >
        <Field label="Nombre" full>
          <Input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function CostosMargenesTab() {
  const { data } = useStoreV2();
  const filas = useMemo(
    () =>
      data.producto_variantes
        .filter((v) => v.activo)
        .map((v) => ({
          variante: v,
          producto: data.productos.find((p) => p.id === v.producto_id),
          costo: costoVariante(data, v.id),
          margen: margenVariante(data, v),
          items: recetaEfectivaVariante(data, v),
        }))
        .sort((a, b) => a.margen - b.margen),
    [data]
  );

  return (
    <Card>
      {filas.length === 0 ? (
        <EmptyState text="No hay variantes activas." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Variante</Th>
                <Th># insumos en receta</Th>
                <Th>Precio venta</Th>
                <Th>Costo</Th>
                <Th>Margen</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ variante, producto, costo, margen, items }) => (
                <TrHover key={variante.id} className={margen < 0 ? "bg-red-dim/30" : ""}>
                  <Td main>{producto?.nombre ?? "—"}</Td>
                  <Td>{variante.presentacion || variante.nombre}</Td>
                  <Td>{items.length}</Td>
                  <Td>{fARS(variante.precio_venta)}</Td>
                  <Td>{fARS(costo)}</Td>
                  <Td className={margen >= 0 ? "text-green" : "text-red"}>{fNum(margen, 1)}%</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function Productos() {
  const [tab, setTab] = useState("productos");
  return (
    <div>
      <PageHeader title="Productos" sub="Productos base, variantes, recetas y costeo" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "productos", label: "Productos" },
          { value: "costos", label: "Costos y márgenes" },
        ]}
      />
      {tab === "productos" ? <ProductosTab /> : <CostosMargenesTab />}
    </div>
  );
}
