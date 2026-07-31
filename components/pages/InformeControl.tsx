"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { informeControl, fARS, fPct } from "@/lib/calc";
import { PageHeader, Card, TableWrap, Th, Td, TrHover, EmptyState, Badge, StatGrid, KpiCard } from "@/components/ui";

/** Compara, para cada producto de venta ya migrado al modelo de producto base, el costo que
 * daba su RecetaLinea vieja (nunca se borra al migrar) contra el que da la receta derivada
 * nueva. El costeo tiene que dar lo mismo salvo que la receta vieja tuviera un error real — acá
 * se ve la diferencia explícita, familia por familia, en vez de aplicarse en silencio. */
export function InformeControl() {
  const { data } = useStore();
  const filas = informeControl(data);
  const conDiferencia = filas.filter((f) => Math.round(f.costoViejo) !== Math.round(f.costoNuevo));

  return (
    <div>
      <PageHeader
        title="Informe de Control"
        sub="Costo viejo (receta por variante) vs. costo nuevo (receta derivada), familia por familia"
      />

      <StatGrid>
        <KpiCard label="Productos migrados" value={filas.length} color="blue" />
        <KpiCard
          label="Con diferencia de costo"
          value={conDiferencia.length}
          color={conDiferencia.length > 0 ? "orange" : "green"}
        />
      </StatGrid>

      <Card>
        {filas.length === 0 ? (
          <EmptyState text="Todavía no hay ningún producto migrado al modelo de producto base. Cargá la receta por unidad en Productos → Base y las unidades por paquete en Productos → Venta para empezar." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Familia</Th>
                  <Th>Producto</Th>
                  <Th>Costo antes</Th>
                  <Th>Costo después</Th>
                  <Th>Diferencia</Th>
                  <Th>Margen antes</Th>
                  <Th>Margen después</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const cambio = Math.round(f.costoViejo) !== Math.round(f.costoNuevo);
                  return (
                    <TrHover key={f.producto.id}>
                      <Td>{f.nombreFamilia}</Td>
                      <Td main>{f.producto.nombre}</Td>
                      <Td>{fARS(f.costoViejo)}</Td>
                      <Td className={cambio ? "font-semibold text-accent" : undefined}>{fARS(f.costoNuevo)}</Td>
                      <Td>
                        {cambio ? (
                          <Badge color={f.diferenciaCosto > 0 ? "red" : "green"}>
                            {f.diferenciaCosto > 0 ? "+" : ""}
                            {fARS(f.diferenciaCosto)}
                            {f.diferenciaPct !== null ? ` (${fPct(f.diferenciaPct)})` : ""}
                          </Badge>
                        ) : (
                          <Badge color="green">Sin cambio</Badge>
                        )}
                      </Td>
                      <Td>{fPct(f.margenViejoPct)}</Td>
                      <Td>{fPct(f.margenNuevoPct)}</Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
