"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { costoUnidadBase, gramosUnidadBase, impactoCambioBase, fARS, fNum, fPct } from "@/lib/calc";
import { Modal } from "@/components/Modal";
import { Button, Select, Input, TableWrap, Th, Td, TrHover, EmptyState, InfoRow } from "@/components/ui";
import type { Producto, RecetaUnidadLinea } from "@/lib/types";

interface Props {
  producto: Producto | null;
  onClose: () => void;
}

function draftDe(lineas: RecetaUnidadLinea[] | undefined): RecetaUnidadLinea[] {
  return (lineas ?? []).map((l) => ({ ...l }));
}

function EditorComponente({
  titulo,
  lineas,
  onChange,
  ingredientesDisponibles,
  nombreIngrediente,
}: {
  titulo: string;
  lineas: RecetaUnidadLinea[];
  onChange: (lineas: RecetaUnidadLinea[]) => void;
  ingredientesDisponibles: { id: string; nombre: string }[];
  nombreIngrediente: (id: string) => string;
}) {
  const [draftIng, setDraftIng] = useState("");
  const [draftCant, setDraftCant] = useState(0);

  function agregar() {
    if (!draftIng || draftCant <= 0) return;
    onChange([...lineas, { id: uid("RU"), id_ingrediente: draftIng, cantidad: draftCant }]);
    setDraftIng("");
    setDraftCant(0);
  }
  function quitar(id: string) {
    onChange(lineas.filter((l) => l.id !== id));
  }
  function editarCantidad(id: string, cantidad: number) {
    onChange(lineas.map((l) => (l.id === id ? { ...l, cantidad } : l)));
  }

  return (
    <div className="mb-4">
      <div className="mb-2 text-[13px] font-semibold text-text2">{titulo}</div>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_90px]">
        <Select value={draftIng} onChange={(e) => setDraftIng(e.target.value)}>
          <option value="">Seleccionar ingrediente…</option>
          {ingredientesDisponibles.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </Select>
        <Input type="number" value={draftCant} onChange={(e) => setDraftCant(Number(e.target.value))} placeholder="Cantidad" />
        <Button size="sm" onClick={agregar} className="justify-center">
          + Agregar
        </Button>
      </div>
      {lineas.length === 0 ? (
        <EmptyState text="Sin líneas todavía." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Ingrediente</Th>
                <Th>Cantidad por unidad</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <TrHover key={l.id}>
                  <Td main>{nombreIngrediente(l.id_ingrediente)}</Td>
                  <Td>
                    <Input
                      type="number"
                      value={l.cantidad}
                      onChange={(e) => editarCantidad(l.id, Number(e.target.value))}
                      className="w-24"
                    />
                  </Td>
                  <Td>
                    <Button size="sm" variant="danger" onClick={() => quitar(l.id)}>
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
  );
}

/** Pantalla de producto base: carga la receta de masa y relleno por unidad de producción, con
 * costo y gramaje por unidad en vivo. Al guardar, si hay productos de venta migrados que
 * dependan de esta receta, se muestra su impacto en costo/margen (antes vs. después) y hay que
 * confirmar explícitamente — un cambio acá puede afectar varias presentaciones a la vez. */
export function ProductoBaseEditor({ producto, onClose }: Props) {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [masa, setMasa] = useState<RecetaUnidadLinea[]>([]);
  const [relleno, setRelleno] = useState<RecetaUnidadLinea[]>([]);
  const [paso, setPaso] = useState<"editar" | "confirmar">("editar");
  const [impacto, setImpacto] = useState<ReturnType<typeof impactoCambioBase>>([]);
  const [idCargado, setIdCargado] = useState<string | null>(null);

  // Sincroniza el draft cuando se abre el editor para un producto distinto — ajuste de estado
  // durante el render (patrón recomendado por React para esto), no un efecto.
  if (producto && producto.id !== idCargado) {
    setIdCargado(producto.id);
    setMasa(draftDe(producto.receta_masa_unidad));
    setRelleno(draftDe(producto.receta_relleno_unidad));
    setPaso("editar");
    setImpacto([]);
  }

  if (!producto) return null;

  const draftProducto: Producto = { ...producto, receta_masa_unidad: masa, receta_relleno_unidad: relleno };
  const costo = costoUnidadBase(data, draftProducto);
  const gramos = gramosUnidadBase(data, draftProducto);
  const ingredientesDisponibles = data.ingredientes.map((i) => ({ id: i.id, nombre: i.nombre }));
  const nombreIngrediente = (id: string) => data.ingredientes.find((i) => i.id === id)?.nombre ?? id;

  function pedirGuardar() {
    const nuevoImpacto = impactoCambioBase(data, producto!.id, draftProducto);
    if (nuevoImpacto.length === 0) {
      aplicar();
      return;
    }
    setImpacto(nuevoImpacto);
    setPaso("confirmar");
  }

  function aplicar() {
    setData((d) => ({
      ...d,
      productos: d.productos.map((p) =>
        p.id === producto!.id ? { ...p, receta_masa_unidad: masa, receta_relleno_unidad: relleno } : p
      ),
    }));
    toast("Receta base guardada");
    onClose();
  }

  return (
    <Modal
      open={!!producto}
      onClose={onClose}
      title={`Producto base — ${producto.nombre}`}
      wide
      footer={
        paso === "editar" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={pedirGuardar}>Guardar</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setPaso("editar")}>
              Volver
            </Button>
            <Button onClick={aplicar}>Confirmar y aplicar</Button>
          </>
        )
      }
    >
      {paso === "editar" ? (
        <div>
          <EditorComponente
            titulo="Receta de masa (por unidad)"
            lineas={masa}
            onChange={setMasa}
            ingredientesDisponibles={ingredientesDisponibles}
            nombreIngrediente={nombreIngrediente}
          />
          <EditorComponente
            titulo="Receta de relleno (por unidad)"
            lineas={relleno}
            onChange={setRelleno}
            ingredientesDisponibles={ingredientesDisponibles}
            nombreIngrediente={nombreIngrediente}
          />
          <div className="mt-4 rounded-lg border border-border bg-surface2/40 p-4">
            <InfoRow label="Costo por unidad" value={fARS(costo)} color="gold" />
            <InfoRow label="Gramos de masa por unidad" value={fNum(gramos.masa, 1)} />
            <InfoRow label="Gramos de relleno por unidad" value={fNum(gramos.relleno, 1)} />
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-[13px] text-text2">
            Este cambio afecta a {impacto.length} {impacto.length === 1 ? "producto de venta" : "productos de venta"} que ya usan
            esta receta base. Revisá antes de aplicar:
          </p>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Costo antes</Th>
                  <Th>Costo después</Th>
                  <Th>Margen antes</Th>
                  <Th>Margen después</Th>
                </tr>
              </thead>
              <tbody>
                {impacto.map((i) => (
                  <TrHover key={i.producto.id}>
                    <Td main>{i.producto.nombre}</Td>
                    <Td>{fARS(i.costoAntes)}</Td>
                    <Td className={i.costoDespues !== i.costoAntes ? "font-semibold text-accent" : undefined}>{fARS(i.costoDespues)}</Td>
                    <Td>{fPct(i.margenAntes)}</Td>
                    <Td className={i.margenDespues !== i.margenAntes ? "font-semibold text-accent" : undefined}>{fPct(i.margenDespues)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
    </Modal>
  );
}
