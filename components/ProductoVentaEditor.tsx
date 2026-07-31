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
import type { Producto, ComplementoVenta, Canal, GrupoRecetaDerivada } from "@/lib/types";

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
  };

  const lineas = recetaDerivada(data, draftProducto);
  const costoTotal = costoLineasDerivadas(data, lineas);
  const pesoTotal = pesoTotalDerivado(data, lineas);
  const margenPct = precio > 0 ? ((precio - costoTotal) / precio) * 100 : 0;
  const margenMonto = precio - costoTotal;

  function nombreConcepto(l: LineaRecetaDerivada) {
    if (l.tipo === "Ingrediente") return data.ingredientes.find((i) => i.id === l.concepto)?.nombre ?? l.concepto;
    if (l.tipo === "Packaging") return data.packaging.find((p) => p.id === l.concepto)?.nombre ?? l.concepto;
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

  function guardar() {
    if (!idBase) {
      toast("Elegí el producto base", "error");
      return;
    }
    setData((d) => ({
      ...d,
      productos: d.productos.map((p) =>
        p.id === producto!.id
          ? { ...p, id_base: idBase, unidades_por_paquete: unidades > 0 ? unidades : undefined, canal, precio_venta: precio, complementos }
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
                        <Td>{fNum(l.cantidad, 3)}</Td>
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
