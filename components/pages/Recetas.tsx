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
  Field,
  Select,
  Input,
  InfoRow,
} from "@/components/ui";
import type { RecetaLinea, TipoRecetaLinea, Ingrediente, Packaging, CostoFijo } from "@/lib/types";

export function Recetas() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [idProducto, setIdProducto] = useState(data.productos[0]?.id ?? "");
  const [tipo, setTipo] = useState<TipoRecetaLinea>("Ingrediente");
  const [concepto, setConcepto] = useState("");
  const [cantidad, setCantidad] = useState(0);

  const lineas = useMemo(
    () => data.recetas.filter((r) => r.id_producto === idProducto),
    [data.recetas, idProducto]
  );
  const producto = data.productos.find((p) => p.id === idProducto);
  const costo = idProducto ? calcCosto(data, idProducto) : 0;
  const margen = producto && producto.precio_venta > 0 ? ((producto.precio_venta - costo) / producto.precio_venta) * 100 : 0;

  const opcionesConcepto =
    tipo === "Ingrediente" ? data.ingredientes : tipo === "Packaging" ? data.packaging : data.costos_fijos;

  function nombreConcepto(r: RecetaLinea) {
    if (r.tipo === "Ingrediente") return data.ingredientes.find((i) => i.id === r.concepto)?.nombre ?? r.concepto;
    if (r.tipo === "Packaging") return data.packaging.find((p) => p.id === r.concepto)?.nombre ?? r.concepto;
    return data.costos_fijos.find((c) => c.id === r.concepto)?.descripcion ?? r.concepto;
  }

  function costoLinea(r: RecetaLinea) {
    if (r.tipo === "Ingrediente") return r.cantidad * pvr(data.ingredientes.find((i) => i.id === r.concepto));
    if (r.tipo === "Packaging") return r.cantidad * (data.packaging.find((p) => p.id === r.concepto)?.precio ?? 0);
    return r.cantidad * (data.costos_fijos.find((c) => c.id === r.concepto)?.monto ?? 0);
  }

  function agregar() {
    if (!idProducto || !concepto || cantidad <= 0) {
      toast("Completá concepto y cantidad", "error");
      return;
    }
    const nueva: RecetaLinea = { id: uid("REC"), id_producto: idProducto, tipo, concepto, cantidad };
    setData((d) => ({ ...d, recetas: [...d.recetas, nueva] }));
    setConcepto("");
    setCantidad(0);
    toast("Línea agregada");
  }

  function quitar(id: string) {
    setData((d) => ({ ...d, recetas: d.recetas.filter((r) => r.id !== id) }));
  }

  return (
    <div>
      <PageHeader title="Recetas" sub="Composición de cada producto y su costo" />

      <Card className="mb-4">
        <Field label="Producto">
          <Select value={idProducto} onChange={(e) => setIdProducto(e.target.value)} style={{ maxWidth: 340 }}>
            <option value="">Seleccionar…</option>
            {data.productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {!idProducto ? (
        <EmptyState text="Elegí un producto para ver y editar su receta." />
      ) : (
        <>
          <Card title="Agregar línea" className="mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_120px_100px]">
              <Field label="Tipo">
                <Select
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value as TipoRecetaLinea);
                    setConcepto("");
                  }}
                >
                  <option value="Ingrediente">Ingrediente</option>
                  <option value="Packaging">Packaging</option>
                  <option value="CostoFijo">Costo Fijo</option>
                </Select>
              </Field>
              <Field label="Concepto">
                <Select value={concepto} onChange={(e) => setConcepto(e.target.value)}>
                  <option value="">Seleccionar…</option>
                  {opcionesConcepto.map((o: Ingrediente | Packaging | CostoFijo) => (
                    <option key={o.id} value={o.id}>
                      {"nombre" in o ? o.nombre : o.descripcion}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cantidad">
                <Input type="number" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
              </Field>
              <div className="flex items-end">
                <Button onClick={agregar} className="w-full justify-center">
                  + Agregar
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            {lineas.length === 0 ? (
              <EmptyState text="Sin líneas de receta." />
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
                    {lineas.map((r) => (
                      <TrHover key={r.id}>
                        <Td>{r.tipo}</Td>
                        <Td main>{nombreConcepto(r)}</Td>
                        <Td>{r.cantidad}</Td>
                        <Td>{fARS(costoLinea(r))}</Td>
                        <Td>
                          <Button size="sm" variant="danger" onClick={() => quitar(r.id)}>
                            Quitar
                          </Button>
                        </Td>
                      </TrHover>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <div className="mt-4 border-t border-border pt-3">
              <InfoRow label="Costo total de receta" value={fARS(costo)} color="gold" />
              <InfoRow label="Precio de venta" value={fARS(producto?.precio_venta ?? 0)} />
              <InfoRow label="Margen" value={fPct(margen)} color={margen >= 30 ? "green" : "red"} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
