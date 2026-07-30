"use client";

import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  ShoppingCart,
  UtensilsCrossed,
  BarChart3,
  Factory,
  Landmark,
  BookOpen,
  Users,
  ShoppingBag,
  Receipt,
  Store,
  Truck,
  PieChart as PieChartIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { usePeriod } from "@/lib/period";
import { useRouter } from "@/lib/nav-context";
import { Card, EmptyState } from "@/components/ui";
import { Hero, ModuleRail, PulseCard, Row, type ModuleRailItem } from "@/components/ds";
import { calcCosto, fARS, fNum, inPeriod } from "@/lib/calc";
import { CHART_COLORS } from "@/lib/chart-colors";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const MODULOS: ModuleRailItem[] = [
  { key: "pedidos", label: "Ventas", icon: ShoppingCart, color: "var(--mod-ventas)" },
  { key: "productos", label: "Productos", icon: UtensilsCrossed, color: "var(--mod-productos)" },
  { key: "stock", label: "Stock", icon: BarChart3, color: "var(--mod-stock)" },
  { key: "produccion", label: "Producción", icon: Factory, color: "var(--mod-produccion)" },
  { key: "caja", label: "Caja", icon: Landmark, color: "var(--mod-caja)" },
  { key: "recetas", label: "Recetas", icon: BookOpen, color: "var(--mod-recetas)" },
  { key: "clientes", label: "Clientes", icon: Users, color: "var(--mod-clientes)" },
  { key: "compras", label: "Compras", icon: ShoppingBag, color: "var(--mod-compras)" },
  { key: "eerr", label: "Costos", icon: Receipt, color: "var(--mod-costos)" },
  { key: "proveedores", label: "Proveedores", icon: Store, color: "var(--mod-proveedores)" },
  { key: "envios", label: "Envíos", icon: Truck, color: "var(--mod-envios)" },
  { key: "an-rentabilidad", label: "Reportes", icon: PieChartIcon, color: "var(--mod-reportes)" },
];

export function Dashboard() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();
  const { go, page } = useRouter();

  const pedidosPeriodo = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio)),
    [data.pedidos, mes, anio]
  );
  const activos = useMemo(() => pedidosPeriodo.filter((p) => p.estado !== "Cancelado"), [pedidosPeriodo]);

  const ventasMes = activos.reduce((acc, p) => acc + p.precio_neto, 0);
  const cajasVendidas = activos.reduce((acc, p) => acc + p.cantidad, 0);

  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anioMesAnterior = mes === 1 ? anio - 1 : anio;
  const ventasMesAnterior = useMemo(() => {
    return data.pedidos
      .filter((p) => inPeriod(p.fecha, mesAnterior, anioMesAnterior) && p.estado !== "Cancelado")
      .reduce((acc, p) => acc + p.precio_neto, 0);
  }, [data.pedidos, mesAnterior, anioMesAnterior]);
  const variacionVentas = ventasMesAnterior > 0 ? ((ventasMes - ventasMesAnterior) / ventasMesAnterior) * 100 : null;

  const ventasPorMes = useMemo(() => {
    const now = new Date();
    const meses = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const a = d.getFullYear();
      const ventas = data.pedidos
        .filter((p) => inPeriod(p.fecha, m, a) && p.estado !== "Cancelado")
        .reduce((acc, p) => acc + p.precio_neto, 0);
      meses.push({ label: `${MESES_CORTOS[d.getMonth()]} '${String(a).slice(2)}`, ventas });
    }
    return meses;
  }, [data.pedidos]);

  // Stock terminado: productos activos ordenados con los que están en cero primero (misma
  // regla que va a usar la pantalla de Stock en la Fase 4).
  const stockTerminado = useMemo(() => {
    return data.productos
      .filter((p) => p.activo)
      .map((p) => ({ producto: p, stock: data.stock_manual[p.id] ?? 0 }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5);
  }, [data.productos, data.stock_manual]);

  // Rentabilidad: productos con ventas en el período, por margen % descendente.
  const rentabilidad = useMemo(() => {
    const unidades = new Map<string, number>();
    for (const p of activos) unidades.set(p.id_producto, (unidades.get(p.id_producto) ?? 0) + p.cantidad);
    return data.productos
      .filter((p) => unidades.has(p.id))
      .map((p) => {
        const costo = calcCosto(data, p.id);
        const margenPct = p.precio_venta > 0 ? ((p.precio_venta - costo) / p.precio_venta) * 100 : 0;
        return { producto: p, margenPct, unidades: unidades.get(p.id) ?? 0 };
      })
      .sort((a, b) => b.margenPct - a.margenPct)
      .slice(0, 5);
  }, [data, activos]);

  // Pendientes de entregar: los más viejos primero (los que llevan más tiempo esperando).
  const pendientes = useMemo(() => {
    return data.pedidos
      .filter((p) => p.estado === "Confirmado" || p.estado === "Produccion")
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      .slice(0, 5);
  }, [data.pedidos]);
  const totalPendientes = data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").length;

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  return (
    <div>
      <div className="mb-4">
        <Hero
          label="Ventas del mes"
          value={fARS(ventasMes)}
          sub={`${fNum(cajasVendidas, 0)} cajas vendidas`}
          comparacion={variacionVentas !== null ? { pct: variacionVentas, label: "vs. mes anterior" } : undefined}
          linkText="Ver pedidos"
          onLinkClick={() => go("pedidos")}
        />
      </div>

      <div className="mb-4">
        <ModuleRail items={MODULOS} active={page} onSelect={go} />
      </div>

      <div className="mb-4">
        <PulseCard fecha={undefined}>
          Todavía no se generó ningún pulso semanal — esta función se conecta cuando esté lista la Parte B (IA).
        </PulseCard>
      </div>

      <Card title="Ventas — Últimos 12 meses" className="mb-4">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ventasPorMes} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
              axisLine={{ stroke: CHART_COLORS.border }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
              axisLine={false}
              tickLine={false}
              width={72}
              tickFormatter={(v: number) => fARS(v)}
            />
            <Tooltip
              formatter={(v) => fARS(Number(v))}
              contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="ventas"
              name="Ventas"
              stroke={CHART_COLORS.accent}
              strokeWidth={2.5}
              dot={{ r: 3, fill: CHART_COLORS.accent }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Stock terminado" right={<button onClick={() => go("stock")} className="text-[11px] font-medium text-accent">Ver todo</button>}>
          {stockTerminado.length === 0 ? (
            <EmptyState text="Sin productos activos todavía." />
          ) : (
            <div className="flex flex-col">
              {stockTerminado.map(({ producto, stock }) => (
                <Row
                  key={producto.id}
                  icon={UtensilsCrossed}
                  iconColor={stock <= 0 ? "var(--red)" : stock < 10 ? "var(--orange)" : "var(--mod-stock)"}
                  title={producto.nombre}
                  value={fNum(stock, 0)}
                />
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Rentabilidad"
          right={<button onClick={() => go("an-rentabilidad")} className="text-[11px] font-medium text-accent">Ver todo</button>}
        >
          {rentabilidad.length === 0 ? (
            <EmptyState text="Sin ventas en el período." />
          ) : (
            <div className="flex flex-col">
              {rentabilidad.map(({ producto, margenPct }) => (
                <Row
                  key={producto.id}
                  icon={PieChartIcon}
                  iconColor={margenPct >= 60 ? "var(--green)" : margenPct >= 30 ? "var(--orange)" : "var(--red)"}
                  title={producto.nombre}
                  subtitle={`${fNum(margenPct, 1)}% margen`}
                />
              ))}
            </div>
          )}
        </Card>

        <Card
          title={`Pendientes de entregar${totalPendientes > 0 ? ` (${totalPendientes})` : ""}`}
          right={<button onClick={() => go("pedidos")} className="text-[11px] font-medium text-accent">Ver todo</button>}
        >
          {pendientes.length === 0 ? (
            <EmptyState text="No hay pedidos pendientes de entregar." />
          ) : (
            <div className="flex flex-col">
              {pendientes.map((p) => (
                <Row
                  key={p.id_detalle}
                  icon={ShoppingCart}
                  iconColor="var(--mod-ventas)"
                  title={clienteNombre(p.id_cliente)}
                  subtitle={`${p.nombre_producto} · ${p.estado}`}
                  value={p.fecha}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
