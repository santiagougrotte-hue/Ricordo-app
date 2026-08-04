"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { calcCosto, fARS, fPct, inPeriod, puntoEquilibrio } from "@/lib/calc";
import { Card, PageHeader, Field, Select, Input, InfoRow } from "@/components/ui";
import type { RicordoData } from "@/lib/types";

export function Simulador() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const [idProducto, setIdProducto] = useState(data.productos[0]?.id ?? "");
  const [idIngrediente, setIdIngrediente] = useState("");
  const [nuevoPrecioIngrediente, setNuevoPrecioIngrediente] = useState<number | null>(null);
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState<number | null>(null);

  const producto = data.productos.find((p) => p.id === idProducto);
  const costoActual = idProducto ? calcCosto(data, idProducto) : 0;
  const precioActual = producto?.precio_venta ?? 0;
  const margenActual = precioActual > 0 ? ((precioActual - costoActual) / precioActual) * 100 : 0;

  const dataSimulada: RicordoData = useMemo(() => {
    if (!idIngrediente || nuevoPrecioIngrediente === null) return data;
    return {
      ...data,
      ingredientes: data.ingredientes.map((i) =>
        i.id === idIngrediente ? { ...i, precio_vigente: nuevoPrecioIngrediente } : i
      ),
    };
  }, [data, idIngrediente, nuevoPrecioIngrediente]);

  const costoSimulado = idProducto ? calcCosto(dataSimulada, idProducto) : 0;
  const precioSimulado = nuevoPrecioVenta ?? precioActual;
  const margenSimulado = precioSimulado > 0 ? ((precioSimulado - costoSimulado) / precioSimulado) * 100 : 0;

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado !== "Cancelado"),
    [data.pedidos, mes, anio]
  );

  const productosSimulados = useMemo(() => {
    return dataSimulada.productos.map((p) =>
      p.id === idProducto && nuevoPrecioVenta !== null ? { ...p, precio_venta: nuevoPrecioVenta } : p
    );
  }, [dataSimulada, idProducto, nuevoPrecioVenta]);

  const peActual = puntoEquilibrio(data, pedidosPeriodo, mes, anio).pe;
  const peSimulado = puntoEquilibrio({ ...dataSimulada, productos: productosSimulados }, pedidosPeriodo, mes, anio).pe;

  return (
    <div>
      <PageHeader title="Simulador" sub="Simulá cambios de precio de venta o costo de insumos" />

      <Card title="Escenario" className="mb-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Producto">
            <Select value={idProducto} onChange={(e) => setIdProducto(e.target.value)}>
              <option value="">Seleccionar…</option>
              {data.productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nuevo precio de venta (opcional)">
            <Input
              type="number"
              value={nuevoPrecioVenta ?? ""}
              placeholder={String(precioActual)}
              onChange={(e) => setNuevoPrecioVenta(e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="Insumo a simular">
            <Select value={idIngrediente} onChange={(e) => setIdIngrediente(e.target.value)}>
              <option value="">Ninguno</option>
              {data.ingredientes.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nuevo precio del insumo">
            <Input
              type="number"
              disabled={!idIngrediente}
              value={nuevoPrecioIngrediente ?? ""}
              onChange={(e) => setNuevoPrecioIngrediente(e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Escenario actual">
          <InfoRow label="Precio de venta" value={fARS(precioActual)} />
          <InfoRow label="Costo" value={fARS(costoActual)} />
          <InfoRow label="Margen" value={fPct(margenActual)} color={margenActual >= 30 ? "green" : "red"} />
          <InfoRow label="Punto de equilibrio ($)" value={fARS(peActual)} color="gold" />
        </Card>
        <Card title="Escenario simulado">
          <InfoRow label="Precio de venta" value={fARS(precioSimulado)} />
          <InfoRow label="Costo" value={fARS(costoSimulado)} />
          <InfoRow
            label="Margen"
            value={fPct(margenSimulado)}
            color={margenSimulado >= margenActual ? "green" : "red"}
          />
          <InfoRow
            label="Punto de equilibrio ($)"
            value={fARS(peSimulado)}
            color={peSimulado <= peActual ? "green" : "red"}
          />
        </Card>
      </div>
    </div>
  );
}
