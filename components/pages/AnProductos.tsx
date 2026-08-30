"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { fARS, fNum, fPct, inPeriod, rentabilidadPorGustoTotal, rentabilidadPorGustoYCanal } from "@/lib/calc";
import { Card, PageHeader, TableWrap, Th, Td, TrHover, EmptyState, FilterTabs } from "@/components/ui";
import type { EstadoPedido } from "@/lib/types";

const ACTIVOS: EstadoPedido[] = ["Confirmado", "Produccion", "Entregado"];

type Orden = "venta" | "unidades" | "ganancia" | "margen";

function usePedidosActivos() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  return useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && ACTIVOS.includes(p.estado)),
    [data.pedidos, mes, anio]
  );
}

/** "¿Cuánto vendí de Calabaza en total?" — suma Minorista + Mayorista + Vacío sin salsa + Vacío
 * con salsa de cada gusto en una sola fila, con el mix de ventas (% de participación) al lado. */
function GustoTotalTab() {
  const { data } = useStore();
  const pedidos = usePedidosActivos();
  const [orden, setOrden] = useState<Orden>("venta");
  const filas = useMemo(() => {
    const base = rentabilidadPorGustoTotal(data, pedidos);
    return [...base].sort((a, b) => b[orden] - a[orden]);
  }, [data, pedidos, orden]);

  return (
    <Card>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-text3">Ordenar por:</span>
        <FilterTabs
          value={orden}
          onChange={(v) => setOrden(v as Orden)}
          options={[
            { value: "venta", label: "Más facturación" },
            { value: "unidades", label: "Más vendido" },
            { value: "ganancia", label: "Más ganancia" },
            { value: "margen", label: "Mejor margen" },
          ]}
        />
      </div>
      {filas.length === 0 ? (
        <EmptyState text="Sin ventas en el período." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Gusto</Th>
                <Th>Unidades</Th>
                <Th>Pedidos</Th>
                <Th>Facturación</Th>
                <Th>Ganancia</Th>
                <Th>Margen %</Th>
                <Th title="Participación de este gusto sobre la facturación total del período">Mix de ventas</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <TrHover key={f.id_base}>
                  <Td main>{f.nombreGusto}</Td>
                  <Td>{fNum(f.unidades, 0)}</Td>
                  <Td>{f.cantidadPedidos}</Td>
                  <Td>{fARS(f.venta)}</Td>
                  <Td className={f.ganancia >= 0 ? "text-green" : "text-red"}>{fARS(f.ganancia)}</Td>
                  <Td>{fPct(f.margen)}</Td>
                  <Td className="min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="h-[7px] flex-1 overflow-hidden rounded bg-surface3">
                        <div className="h-full rounded bg-accent" style={{ width: `${Math.min(100, f.participacionPct)}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right text-[11.5px] text-text2">{fPct(f.participacionPct)}</span>
                    </div>
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

/** "¿Este gusto lo compran más los minoristas o los mayoristas?" — cada gusto con sus dos
 * canales lado a lado, en vez de tener que filtrar por canal y comparar dos pantallas. */
function MinoristaMayoristaTab() {
  const { data } = useStore();
  const pedidos = usePedidosActivos();
  const filas = useMemo(() => rentabilidadPorGustoYCanal(data, pedidos), [data, pedidos]);

  return (
    <Card>
      {filas.length === 0 ? (
        <EmptyState text="Sin ventas en el período." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Gusto</Th>
                <Th title="Minorista — unidades">Unid. (Min.)</Th>
                <Th title="Minorista — facturación">Facturación (Min.)</Th>
                <Th title="Minorista — margen">Margen % (Min.)</Th>
                <Th title="Mayorista — unidades">Unid. (May.)</Th>
                <Th title="Mayorista — facturación">Facturación (May.)</Th>
                <Th title="Mayorista — margen">Margen % (May.)</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <TrHover key={f.id_base}>
                  <Td main>{f.nombreGusto}</Td>
                  <Td>{fNum(f.minorista.unidades, 0)}</Td>
                  <Td>{fARS(f.minorista.venta)}</Td>
                  <Td>{f.minorista.venta > 0 ? fPct(f.minorista.margen) : "—"}</Td>
                  <Td>{fNum(f.mayorista.unidades, 0)}</Td>
                  <Td>{fARS(f.mayorista.venta)}</Td>
                  <Td>{f.mayorista.venta > 0 ? fPct(f.mayorista.margen) : "—"}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

export function AnProductos() {
  const [tab, setTab] = useState("total");

  return (
    <div>
      <PageHeader title="Análisis de Productos" sub="Rentabilidad por gusto — total y comparado entre canales" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "total", label: "Gusto total" },
          { value: "canal", label: "Minorista vs Mayorista" },
        ]}
      />
      {tab === "total" ? <GustoTotalTab /> : <MinoristaMayoristaTab />}
    </div>
  );
}
