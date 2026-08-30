"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  recetaDerivada,
  costoLineasDerivadas,
  costoLineaDerivada,
  pesoTotalDerivado,
  productosBaseDisponibles,
  fARS,
  fPct,
  fNum,
} from "@/lib/calc";
import type { LineaRecetaDerivada } from "@/lib/calc";
import { Modal } from "@/components/Modal";
import { Button, Field, FormGrid, Select, Input, TableWrap, Th, Td, TrHover, EmptyState, InfoRow } from "@/components/ui";
import type { Producto, ComplementoVenta, Canal, GrupoRecetaDerivada, ExcepcionLinea } from "@/lib/types";

interface Props {
  producto: Producto | null;
  onClose: () => void;
}

const NOMBRE_GRUPO: Record<GrupoRecetaDerivada, string> = {
  masa: "Masa",
  relleno: "Relleno",
  complementos: "Complementos",
  packaging: "Packaging",
};

/** Pantalla de producto de venta: elige el producto base, cuántas unidades entran en el
 * paquete, sus complementos (ej. salsa) y canal/precio. La receta y el costo no se cargan acá —
 * se calculan solos a partir de la receta base y se muestran de solo lectura, agrupados. El
 * packaging propio se sigue cargando en Recetas (líneas de tipo Packaging del producto). */
export function ProductoVentaEditor({ producto, onClose }: Props) {
  const { data, setData } = useStore();
  const { toast } = useToast();

  const [idBase, setIdBase] = useState("");
  const [unidades, setUnidades] = useState<number>(0);
  const [canal, setCanal] = useState<Canal>("Minorista");
  const [precio, setPrecio] = useState(0);
  const [complementos, setComplementos] = useState<ComplementoVenta[]>([]);
  const [draftComplementoBase, setDraftComplementoBase] = useState("");
  const [draftComplementoCant, setDraftComplementoCant] = useState(0);
  const [excepciones, setExcepciones] = useState<ExcepcionLinea[]>([]);
  const [draftExcGrupo, setDraftExcGrupo] = useState<GrupoRecetaDerivada>("masa");
  const [draftExcTipo, setDraftExcTipo] = useState<"Ingrediente" | "Packaging" | "Subreceta">("Ingrediente");
  const [draftExcConcepto, setDraftExcConcepto] = useState("");
  const [draftExcCantidad, setDraftExcCantidad] = useState(0);
  const [idCargado, setIdCargado] = useState<string | null>(null);

  // Ajuste de estado durante el render cuando se abre para un producto distinto (patrón
  // recomendado por React), igual que en ProductoBaseEditor.
  if (producto && producto.id !== idCargado) {
    setIdCargado(producto.id);
    setIdBase(producto.id_base);
    setUnidades(producto.unidades_por_paquete ?? 0);
    setCanal(producto.canal ?? "Minorista");
    setPrecio(producto.precio_venta);
    setComplementos((producto.complementos ?? []).map((c) => ({ ...c })));
    setExcepciones((producto.excepciones ?? []).map((e) => ({ ...e })));
  }

  if (!producto) return null;

  const basesDisponibles = productosBaseDisponibles(data);
  const draftProducto: Producto = {
    ...producto,
    id_base: idBase || producto.id,
    unidades_por_paquete: unidades > 0 ? unidades : undefined,
    canal,
    precio_venta: precio,
    complementos,
    excepciones,
  };

  const lineas = recetaDerivada(data, draftProducto);
  const costoTotal = costoLineasDerivadas(data, lineas);
  const pesoTotal = pesoTotalDerivado(data, lineas);
  const margenPct = precio > 0 ? ((precio - costoTotal) / precio) * 100 : 0;
  const margenMonto = precio - costoTotal;

  function nombreConcepto(l: LineaRecetaDerivada) {
    if (l.tipo === "Ingrediente") return data.ingredientes.find((i) => i.id === l.concepto)?.nombre ?? l.concepto;
    if (l.tipo === "Packaging") return data.packaging.find((p) => p.id === l.concepto)?.nombre ?? l.concepto;
    if (l.tipo === "Subreceta") return data.subrecetas.find((s) => s.id === l.concepto)?.nombre ?? l.concepto;
    return data.costos_fijos.find((c) => c.id === l.concepto)?.descripcion ?? l.concepto;
  }

  function agregarComplemento() {
    if (!draftComplementoBase || draftComplementoCant <= 0) {
      toast("Elegí un producto base y una cantidad", "error");
      return;
    }
    setComplementos((cs) => [...cs, { id: uid("COMP"), id_base: draftComplementoBase, cantidad: draftComplementoCant }]);
    setDraftComplementoBase("");
    setDraftComplementoCant(0);
  }
  function quitarComplemento(id: string) {
    setComplementos((cs) => cs.filter((c) => c.id !== id));
  }

  function agregarExcepcion() {
    if (!draftExcConcepto || draftExcCantidad <= 0) {
      toast("Elegí un concepto y una cantidad", "error");
      return;
    }
    setExcepciones((es) => [
      ...es,
      { id: uid("EXC"), grupo: draftExcGrupo, tipo: draftExcTipo, concepto: draftExcConcepto, cantidad: draftExcCantidad },
    ]);
    setDraftExcConcepto("");
    setDraftExcCantidad(0);
  }
  function quitarExcepcion(id: string) {
    setExcepciones((es) => es.filter((e) => e.id !== id));
  }

  /** Edita la cantidad directo desde la tabla de receta calculada (masa/relleno/packaging),
   * sin pasar por el formulario de abajo — usa el mismo mecanismo de excepción: crea o
   * actualiza la que coincide en (grupo, tipo, concepto). */
  function actualizarCantidadLinea(l: LineaRecetaDerivada, cantidad: number) {
    setExcepciones((es) => {
      const idx = es.findIndex((e) => e.grupo === l.grupo && e.tipo === l.tipo && e.concepto === l.concepto);
      if (idx >= 0) {
        const next = [...es];
        next[idx] = { ...next[idx], cantidad };
        return next;
      }
      return [
        ...es,
        {
          id: uid("EXC"),
          grupo: l.grupo as GrupoRecetaDerivada,
          tipo: l.tipo as "Ingrediente" | "Packaging" | "Subreceta",
          concepto: l.concepto,
          cantidad,
        },
      ];
    });
  }

  function guardar() {
    if (!idBase) {
      toast("Elegí el producto base", "error");
      return;
    }
    setData((d) => ({
      ...d,
      productos: d.productos.map((p) =>
        p.id === producto!.id
          ? {
              ...p,
              id_base: idBase,
              unidades_por_paquete: unidades > 0 ? unidades : undefined,
              canal,
              precio_venta: precio,
              complementos,
              excepciones,
            }
          : p
      ),
    }));
    toast("Producto de venta guardado");
    onClose();
  }

  return (
    <Modal
      open={!!producto}
      onClose={onClose}
      title={`Producto de venta — ${producto.nombre}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar</Button>
        </>
      }
    >
      <FormGrid>
        <Field label="Producto base">
          <Select value={idBase} onChange={(e) => setIdBase(e.target.value)}>
            <option value="">Seleccionar…</option>
            {basesDisponibles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unidades por paquete">
          <Input type="number" value={unidades} onChange={(e) => setUnidades(Number(e.target.value))} />
        </Field>
        <Field label="Canal">
          <Select value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            <option value="Minorista">Minorista</option>
            <option value="Mayorista">Mayorista</option>
          </Select>
        </Field>
        <Field label="Precio de venta">
          <Input type="number" value={precio} onChange={(e) => setPrecio(Number(e.target.value))} />
        </Field>
      </FormGrid>

      <div className="mt-4">
        <div className="mb-2 text-[13px] font-semibold text-text2">
          Complementos (se suman con su propia cantidad, no escalan con unidades por paquete)
        </div>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_90px]">
          <Select value={draftComplementoBase} onChange={(e) => setDraftComplementoBase(e.target.value)}>
            <option value="">Seleccionar producto base…</option>
            {basesDisponibles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            value={draftComplementoCant}
            onChange={(e) => setDraftComplementoCant(Number(e.target.value))}
            placeholder="Cantidad"
          />
          <Button size="sm" onClick={agregarComplemento} className="justify-center">
            + Agregar
          </Button>
        </div>
        {complementos.length === 0 ? (
          <EmptyState text="Sin complementos." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto base</Th>
                  <Th>Cantidad</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {complementos.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{data.productos.find((p) => p.id === c.id_base)?.nombre ?? c.id_base}</Td>
                    <Td>{c.cantidad}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => quitarComplemento(c.id)}>
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

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 text-[13px] font-semibold text-text2">
          Excepciones (reemplazan la cantidad calculada de esa línea — quedan marcadas y listadas en Familias)
        </div>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[110px_120px_1fr_90px_90px]">
          <Select value={draftExcGrupo} onChange={(e) => setDraftExcGrupo(e.target.value as GrupoRecetaDerivada)}>
            <option value="masa">Masa</option>
            <option value="relleno">Relleno</option>
            <option value="complementos">Complementos</option>
            <option value="packaging">Packaging</option>
          </Select>
          <Select
            value={draftExcTipo}
            onChange={(e) => {
              setDraftExcTipo(e.target.value as "Ingrediente" | "Packaging" | "Subreceta");
              setDraftExcConcepto("");
            }}
          >
            <option value="Ingrediente">Ingrediente</option>
            <option value="Packaging">Packaging</option>
            <option value="Subreceta">Subreceta</option>
          </Select>
          <Select value={draftExcConcepto} onChange={(e) => setDraftExcConcepto(e.target.value)}>
            <option value="">Seleccionar…</option>
            {(draftExcTipo === "Ingrediente"
              ? data.ingredientes
              : draftExcTipo === "Packaging"
              ? data.packaging
              : data.subrecetas.filter((s) => s.activo !== false)
            ).map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Select>
          <Input type="number" value={draftExcCantidad} onChange={(e) => setDraftExcCantidad(Number(e.target.value))} placeholder="Cantidad" />
          <Button size="sm" onClick={agregarExcepcion} className="justify-center">
            + Agregar
          </Button>
        </div>
        {excepciones.length === 0 ? (
          <EmptyState text="Sin excepciones." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Grupo</Th>
                  <Th>Concepto</Th>
                  <Th>Cantidad</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {excepciones.map((e) => (
                  <TrHover key={e.id}>
                    <Td>{NOMBRE_GRUPO[e.grupo]}</Td>
                    <Td main>
                      {e.tipo === "Ingrediente"
                        ? data.ingredientes.find((i) => i.id === e.concepto)?.nombre ?? e.concepto
                        : e.tipo === "Packaging"
                        ? data.packaging.find((p) => p.id === e.concepto)?.nombre ?? e.concepto
                        : data.subrecetas.find((s) => s.id === e.concepto)?.nombre ?? e.concepto}
                    </Td>
                    <Td>{e.cantidad}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => quitarExcepcion(e.id)}>
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

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 text-[13px] font-semibold text-text2">Receta calculada</div>
        {lineas.length === 0 ? (
          <EmptyState text="Sin líneas — cargá el producto base con su receta por unidad, o packaging en Recetas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Grupo</Th>
                  <Th>Concepto</Th>
                  <Th>Cantidad</Th>
                  <Th>Costo</Th>
                </tr>
              </thead>
              <tbody>
                {(["masa", "relleno", "complementos", "packaging"] as GrupoRecetaDerivada[]).flatMap((grupo) =>
                  lineas
                    .filter((l) => l.grupo === grupo)
                    .map((l, idx) => (
                      <TrHover key={`${grupo}-${idx}`}>
                        <Td>{idx === 0 ? NOMBRE_GRUPO[grupo] : ""}</Td>
                        <Td main>
                          {nombreConcepto(l)}
                          {l.esExcepcion && <span className="ml-1.5 text-[10px] font-semibold uppercase text-orange">excepción</span>}
                        </Td>
                        <Td>
                          {grupo === "complementos" ? (
                            fNum(l.cantidad, 3)
                          ) : (
                            <Input
                              type="number"
                              value={l.cantidad}
                              onChange={(e) => actualizarCantidadLinea(l, Number(e.target.value))}
                              className="w-24"
                            />
                          )}
                        </Td>
                        <Td>{fARS(costoLineaDerivada(data, l))}</Td>
                      </TrHover>
                    ))
                )}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="mt-4 rounded-lg border border-border bg-surface2/40 p-4">
          <InfoRow label="Costo total" value={fARS(costoTotal)} color="gold" />
          <InfoRow label="Peso total del paquete" value={`${fNum(pesoTotal, 1)} g`} />
          <InfoRow label="Precio de venta" value={fARS(precio)} />
          <InfoRow label="Margen" value={`${fARS(margenMonto)} · ${fPct(margenPct)}`} color={margenPct >= 30 ? "green" : "red"} />
        </div>
      </div>
    </Modal>
  );
}
