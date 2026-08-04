"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import {
  productosBaseDisponibles,
  excepcionesActivas,
  calcCosto,
  unidadesVendidasUltimosMeses,
  fARS,
  fPct,
} from "@/lib/calc";
import { PageHeader, Card, TableWrap, Th, Td, TrHover, EmptyState, Select, Field, Badge } from "@/components/ui";

const NOMBRE_GRUPO: Record<string, string> = {
  masa: "Masa",
  relleno: "Relleno",
  complementos: "Complementos",
  packaging: "Packaging",
};

/** Vista de familia: elegís un producto base y ves todas sus presentaciones lado a lado —
 * unidades por paquete, precio, costo, margen y ventas recientes — para detectar de un vistazo
 * una presentación mal costeada o mal precificada. Arriba, el listado global de excepciones de
 * toda la app, para que nunca se acumulen en silencio. */
export function Familias() {
  const { data } = useStore();
  const bases = productosBaseDisponibles(data);
  const [idBase, setIdBase] = useState(bases[0]?.id ?? "");
  const excepciones = excepcionesActivas(data);

  const presentaciones = data.productos.filter((p) => p.id_base === idBase);

  return (
    <div>
      <PageHeader title="Familias" sub="Comparación de presentaciones por producto base y excepciones activas" />

      <Card title="Excepciones activas en toda la app" className="mb-4" color="orange">
        {excepciones.length === 0 ? (
          <EmptyState text="Sin excepciones cargadas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Grupo</Th>
                  <Th>Concepto</Th>
                  <Th>Cantidad</Th>
                </tr>
              </thead>
              <tbody>
                {excepciones.map(({ producto, excepcion }) => (
                  <TrHover key={excepcion.id}>
                    <Td main>{producto.nombre}</Td>
                    <Td>
                      <Badge color="orange">{NOMBRE_GRUPO[excepcion.grupo] ?? excepcion.grupo}</Badge>
                    </Td>
                    <Td>
                      {excepcion.tipo === "Ingrediente"
                        ? data.ingredientes.find((i) => i.id === excepcion.concepto)?.nombre ?? excepcion.concepto
                        : data.packaging.find((p) => p.id === excepcion.concepto)?.nombre ?? excepcion.concepto}
                    </Td>
                    <Td>{excepcion.cantidad}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card className="mb-4">
        <Field label="Producto base">
          <Select value={idBase} onChange={(e) => setIdBase(e.target.value)} style={{ maxWidth: 340 }}>
            <option value="">Seleccionar…</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {!idBase ? (
        <EmptyState text="Elegí un producto base para comparar sus presentaciones." />
      ) : presentaciones.length === 0 ? (
        <EmptyState text="Esta familia no tiene presentaciones cargadas." />
      ) : (
        <Card>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Presentación</Th>
                  <Th>Unidades/paquete</Th>
                  <Th>Precio</Th>
                  <Th>Costo</Th>
                  <Th>Margen $</Th>
                  <Th>Margen %</Th>
                  <Th>Vendido (3 meses)</Th>
                </tr>
              </thead>
              <tbody>
                {presentaciones.map((p) => {
                  const costo = calcCosto(data, p.id);
                  const margenMonto = p.precio_venta - costo;
                  const margenPct = p.precio_venta > 0 ? (margenMonto / p.precio_venta) * 100 : 0;
                  const vendido = unidadesVendidasUltimosMeses(data, p.id);
                  return (
                    <TrHover key={p.id}>
                      <Td main>{p.nombre}</Td>
                      <Td>{p.unidades_por_paquete ?? "—"}</Td>
                      <Td>{fARS(p.precio_venta)}</Td>
                      <Td>{fARS(costo)}</Td>
                      <Td>{fARS(margenMonto)}</Td>
                      <Td className={margenPct < 30 ? "font-semibold text-red" : undefined}>{fPct(margenPct)}</Td>
                      <Td>{vendido}</Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </div>
  );
}
