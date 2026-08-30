"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useIaClient } from "@/lib/ia-client";
import { Card, EmptyState, StatGrid, KpiCard, Alert } from "@/components/ui";
import { Hero, ModuleRail, PulseCard, Row, type ModuleRailItem } from "@/components/ds";
import {
  calcCosto,
  cmvPeriodo,
  construirResumenPulso,
  fARS,
  fFechaCorta,
  fNum,
  fPct,
  gustosActivos,
  inPeriod,
  rentabilidadPorGustoTotal,
  rentabilidadPorGustoYCanal,
  saldoCaja,
  stockRealGusto,
} from "@/lib/calc";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { ObservacionPulso, SeveridadPulso } from "@/lib/types";

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

const MODULO_A_PAGINA: Record<string, string> = {
  ventas: "pedidos",
  stock: "stock",
  caja: "caja",
  productos: "productos",
  produccion: "produccion",
  compras: "compras",
};

function peorSeveridad(observaciones: ObservacionPulso[]): SeveridadPulso {
  if (observaciones.some((o) => o.severidad === "alta")) return "alta";
  if (observaciones.some((o) => o.severidad === "media")) return "media";
  return "info";
}

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
  const { data, setData } = useStore();
  const { mes, anio } = usePeriod();
  const { go, page } = useRouter();
  const { call: llamarIa } = useIaClient();
  const [pulsoLoading, setPulsoLoading] = useState(false);
  const autoActualizadoRef = useRef(false);

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

  const pedidosMesAnterior = useMemo(
    () => data.pedidos.filter((p) => inPeriod(p.fecha, mesAnterior, anioMesAnterior) && p.estado !== "Cancelado"),
    [data.pedidos, mesAnterior, anioMesAnterior]
  );

  // KPIs ejecutivos: ganancia y margen bruto del mes, caja disponible ahora mismo, pedidos que
  // todavía no se entregaron.
  const gananciaMes = ventasMes - cmvPeriodo(data, activos);
  const margenBrutoPct = ventasMes > 0 ? (gananciaMes / ventasMes) * 100 : 0;
  const cajaDisponible = saldoCaja(data);
  const pedidosPendientesCount = useMemo(
    () => data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").length,
    [data.pedidos]
  );

  // Rankings del mes: top gusto, top por canal, y el gusto que más creció vs. el mes anterior
  // (solo entre los que ya vendían algo el mes pasado, para no marcar "infinito %" a un gusto
  // nuevo).
  const gustoTotalMes = useMemo(() => rentabilidadPorGustoTotal(data, activos), [data, activos]);
  const gustoTotalMesAnterior = useMemo(() => rentabilidadPorGustoTotal(data, pedidosMesAnterior), [data, pedidosMesAnterior]);
  const topGusto = gustoTotalMes[0] ?? null;
  const porCanalMes = useMemo(() => rentabilidadPorGustoYCanal(data, activos), [data, activos]);
  const topMinorista = [...porCanalMes].sort((a, b) => b.minorista.venta - a.minorista.venta)[0] ?? null;
  const topMayorista = [...porCanalMes].sort((a, b) => b.mayorista.venta - a.mayorista.venta)[0] ?? null;
  const gustoMayorCrecimiento = useMemo(() => {
    let mejor: { nombreGusto: string; crecimientoPct: number } | null = null;
    for (const g of gustoTotalMes) {
      const anterior = gustoTotalMesAnterior.find((a) => a.id_base === g.id_base);
      if (!anterior || anterior.venta <= 0) continue;
      const crecimientoPct = ((g.venta - anterior.venta) / anterior.venta) * 100;
      if (!mejor || crecimientoPct > mejor.crecimientoPct) mejor = { nombreGusto: g.nombreGusto, crecimientoPct };
    }
    return mejor;
  }, [gustoTotalMes, gustoTotalMesAnterior]);

  // Alertas: solo señalan, no inventan datos que no existen — insumos con aumento de precio
  // se mira en los últimos 30 días de historial_precios, producción necesaria compara lo
  // comprometido en pedidos activos contra el stock terminado real de cada gusto.
  const insumosConAumento = useMemo(() => {
    const haceUnMes = new Date().getTime() - 30 * 24 * 60 * 60 * 1000;
    const vistos = new Set<string>();
    return data.historial_precios
      .filter((h) => h.precio_nuevo > h.precio_anterior && new Date(h.fecha).getTime() >= haceUnMes)
      .filter((h) => (vistos.has(h.id_insumo) ? false : (vistos.add(h.id_insumo), true)))
      .slice(0, 5);
  }, [data.historial_precios]);

  const gustosStockBajo = useMemo(
    () => gustosActivos(data).filter((g) => stockRealGusto(data, g) < data.umbral_stock_bajo_producto),
    [data]
  );

  const gustosNecesitanProduccion = useMemo(() => {
    const pendientesPorProducto = new Map<string, number>();
    for (const p of data.pedidos) {
      if (p.estado !== "Confirmado" && p.estado !== "Produccion") continue;
      pendientesPorProducto.set(p.id_producto, (pendientesPorProducto.get(p.id_producto) ?? 0) + p.cantidad);
    }
    return gustosActivos(data).filter((g) => {
      const comprometido = g.variantes.reduce((acc, v) => acc + (pendientesPorProducto.get(v.id) ?? 0), 0);
      return comprometido > 0 && comprometido > stockRealGusto(data, g);
    });
  }, [data]);

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

  // Stock terminado: por gusto (producto base), con los que están en cero primero — mismo
  // agrupamiento que usa la pantalla de Stock (una variante de canal no tiene stock propio).
  const stockTerminado = useMemo(() => {
    return gustosActivos(data)
      .map((g) => ({ gusto: g, stock: stockRealGusto(data, g) }))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5);
  }, [data]);

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

  async function actualizarPulso() {
    setPulsoLoading(true);
    const resumen = construirResumenPulso(data);
    const resultado = await llamarIa<{ observaciones: ObservacionPulso[]; error?: string }>(
      "pulso",
      { resumen },
      "pulso"
    );
    setPulsoLoading(false);
    if (resultado) {
      setData((d) => ({ ...d, pulso: { fecha: new Date().toISOString(), observaciones: resultado.observaciones } }));
    }
  }

  // Se actualiza solo si el último pulso guardado tiene más de 7 días (o no existe todavía).
  // Si la llamada falla, se sigue mostrando el último pulso guardado con su fecha, no un error.
  useEffect(() => {
    if (autoActualizadoRef.current) return;
    const vencido = !data.pulso || Date.now() - new Date(data.pulso.fecha).getTime() > SIETE_DIAS_MS;
    if (vencido) {
      autoActualizadoRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refresco único al montar si el pulso está vencido
      actualizarPulso();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe dispararse una vez al montar
  }, []);

  const compraPendiente = data.borrador_compra_pendiente !== null;

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

      <StatGrid>
        <KpiCard label="Ganancia estimada" value={fARS(gananciaMes)} color={gananciaMes >= 0 ? "green" : "red"} />
        <KpiCard label="Margen bruto" value={fPct(margenBrutoPct)} color={margenBrutoPct >= 0 ? "green" : "red"} />
        <KpiCard label="Caja disponible" value={fARS(cajaDisponible)} color="gold" />
        <KpiCard label="Pedidos pendientes" value={fNum(pedidosPendientesCount, 0)} color={pedidosPendientesCount > 0 ? "orange" : "none"} />
        <KpiCard label="Unidades vendidas" value={fNum(cajasVendidas, 0)} />
      </StatGrid>

      <div className="mb-4">
        <ModuleRail items={MODULOS} active={page} onSelect={go} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Rankings del mes">
          <div className="flex flex-col">
            <Row
              icon={UtensilsCrossed}
              iconColor="var(--mod-productos)"
              title={topGusto ? topGusto.nombreGusto : "Sin ventas todavía"}
              subtitle="Top gusto del mes"
              value={topGusto ? fARS(topGusto.venta) : undefined}
            />
            <Row
              icon={Store}
              iconColor="var(--mod-ventas)"
              title={topMinorista && topMinorista.minorista.venta > 0 ? topMinorista.nombreGusto : "Sin ventas minoristas"}
              subtitle="Top producto minorista"
              value={topMinorista && topMinorista.minorista.venta > 0 ? fARS(topMinorista.minorista.venta) : undefined}
            />
            <Row
              icon={ShoppingBag}
              iconColor="var(--mod-compras)"
              title={topMayorista && topMayorista.mayorista.venta > 0 ? topMayorista.nombreGusto : "Sin ventas mayoristas"}
              subtitle="Top producto mayorista"
              value={topMayorista && topMayorista.mayorista.venta > 0 ? fARS(topMayorista.mayorista.venta) : undefined}
            />
            <Row
              icon={BarChart3}
              iconColor="var(--green)"
              title={gustoMayorCrecimiento ? gustoMayorCrecimiento.nombreGusto : "Sin datos comparables"}
              subtitle="Gusto con mayor crecimiento"
              value={gustoMayorCrecimiento ? `+${fNum(gustoMayorCrecimiento.crecimientoPct, 1)}%` : undefined}
            />
            <Row
              icon={PieChartIcon}
              iconColor={rentabilidad[0] && rentabilidad[0].margenPct >= 0 ? "var(--green)" : "var(--red)"}
              title={rentabilidad[0] ? rentabilidad[0].producto.nombre : "Sin ventas todavía"}
              subtitle="Producto con mayor margen"
              value={rentabilidad[0] ? `${fNum(rentabilidad[0].margenPct, 1)}%` : undefined}
            />
          </div>
        </Card>

        <Card title="Alertas">
          {gustosStockBajo.length === 0 &&
          pedidosPendientesCount === 0 &&
          insumosConAumento.length === 0 &&
          gustosNecesitanProduccion.length === 0 &&
          !compraPendiente ? (
            <EmptyState text="Sin alertas activas." />
          ) : (
            <>
              {gustosStockBajo.length > 0 && (
                <Alert kind="danger">
                  Stock bajo en {gustosStockBajo.length} gusto{gustosStockBajo.length > 1 ? "s" : ""}: {gustosStockBajo.map((g) => g.nombre).slice(0, 3).join(", ")}
                  {gustosStockBajo.length > 3 ? "…" : ""}
                </Alert>
              )}
              {pedidosPendientesCount > 0 && (
                <Alert kind="info">
                  {pedidosPendientesCount} pedido{pedidosPendientesCount > 1 ? "s" : ""} pendiente{pedidosPendientesCount > 1 ? "s" : ""} de entrega
                </Alert>
              )}
              {compraPendiente && <Alert kind="warning">Hay una orden de compra generada esperando revisión en Compras.</Alert>}
              {insumosConAumento.length > 0 && (
                <Alert kind="warning">
                  {insumosConAumento.length} insumo{insumosConAumento.length > 1 ? "s" : ""} subieron de precio en los últimos 30 días
                </Alert>
              )}
              {gustosNecesitanProduccion.length > 0 && (
                <Alert kind="warning">
                  {gustosNecesitanProduccion.length} gusto{gustosNecesitanProduccion.length > 1 ? "s" : ""} necesitan producción: {gustosNecesitanProduccion.map((g) => g.nombre).slice(0, 3).join(", ")}
                  {gustosNecesitanProduccion.length > 3 ? "…" : ""}
                </Alert>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="mb-4">
        {!data.pulso ? (
          <PulseCard onRefresh={actualizarPulso}>
            {pulsoLoading ? "Generando el pulso semanal…" : "Todavía no se generó ningún pulso semanal."}
          </PulseCard>
        ) : (
          <PulseCard
            severidad={peorSeveridad(data.pulso.observaciones)}
            fecha={fFechaCorta(data.pulso.fecha)}
            onRefresh={actualizarPulso}
          >
            {pulsoLoading ? (
              "Actualizando…"
            ) : data.pulso.observaciones.length === 0 ? (
              "Sin observaciones destacadas esta semana."
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.pulso.observaciones.map((o, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const pagina = MODULO_A_PAGINA[o.modulo];
                      if (pagina) go(pagina);
                    }}
                    className="text-left hover:opacity-90"
                  >
                    <div className="font-semibold">{o.titulo}</div>
                    <div className="text-white/85">{o.texto}</div>
                  </button>
                ))}
              </div>
            )}
          </PulseCard>
        )}
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
              {stockTerminado.map(({ gusto, stock }) => (
                <Row
                  key={gusto.id_base}
                  icon={UtensilsCrossed}
                  iconColor={stock <= 0 ? "var(--red)" : stock < 10 ? "var(--orange)" : "var(--mod-stock)"}
                  title={gusto.nombre}
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
