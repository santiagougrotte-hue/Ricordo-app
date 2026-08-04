"use client";

import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  calcStockIngrediente,
  cmvAcumulado,
  comprasAcumuladas,
  fARS,
  fFechaCorta,
  fNum,
  gustosActivos,
  inPeriod,
  movimientosStockGusto,
  pvr,
  stockCalculadoGusto,
  stockRealGusto,
} from "@/lib/calc";
import { usePeriod } from "@/lib/period";
import {
  PageHeader,
  FilterTabs,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Button,
  Input,
  Field,
  StatGrid,
  KpiCard,
  Badge,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { CHART_COLORS } from "@/lib/chart-colors";

function ProductosTab() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalConteo, setModalConteo] = useState<string | null>(null); // id_base
  const [cantidad, setCantidad] = useState(0);
  const [modalHistorial, setModalHistorial] = useState<string | null>(null); // id_base
  const [umbralBajo, setUmbralBajo] = useState(data.umbral_stock_bajo_producto);

  const gustos = useMemo(() => gustosActivos(data), [data]);

  // Cada gusto agrupa: producción y ventas Entregado de todas sus variantes de canal (misma
  // masa/relleno física), stock calculado por la app (todo el historial), y el conteo manual
  // como fuente de verdad — igual que el criterio que ya usaba la app antes de este módulo.
  const filas = useMemo(() => {
    return gustos.map((g) => {
      const idsVariantes = g.variantes.map((v) => v.id);
      const movimientos = movimientosStockGusto(data, idsVariantes);
      const stockApp = stockCalculadoGusto(movimientos);
      const ultimoConteo = data.conteos_stock
        .filter((c) => c.id_producto === g.id_base)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
      const stockReal = stockRealGusto(data, g);
      const diferencia = ultimoConteo ? stockReal - stockApp : null;
      return { gusto: g, movimientos, stockApp, ultimoConteo, stockReal, diferencia };
    });
  }, [gustos, data]);

  // Orden: en cero primero, después bajos, después normales.
  const filasOrdenadas = useMemo(() => [...filas].sort((a, b) => a.stockReal - b.stockReal), [filas]);

  function guardarUmbral() {
    setData((d) => ({ ...d, umbral_stock_bajo_producto: umbralBajo }));
    toast("Umbral guardado");
  }

  function registrarConteo() {
    if (!modalConteo) return;
    const fecha = new Date().toISOString().slice(0, 10);
    setData((d) => ({
      ...d,
      conteos_stock: [...d.conteos_stock, { id: uid("CTK"), id_producto: modalConteo, cantidad, fecha }],
      stock_manual: { ...d.stock_manual, [modalConteo]: cantidad },
    }));
    toast("Conteo registrado");
    setModalConteo(null);
    setCantidad(0);
  }

  const gustoConteo = gustos.find((g) => g.id_base === modalConteo);
  const filaHistorial = filas.find((f) => f.gusto.id_base === modalHistorial);

  return (
    <>
      <Card title="Umbral de stock bajo" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Unidades">
            <Input type="number" value={umbralBajo} onChange={(e) => setUmbralBajo(Number(e.target.value))} />
          </Field>
          <Button size="sm" onClick={guardarUmbral}>
            Guardar
          </Button>
        </div>
      </Card>

      <Card>
        {filasOrdenadas.length === 0 ? (
          <EmptyState text="Sin productos." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Gusto</Th>
                  <Th title="Producción + ventas Entregado de todas las variantes de canal, desde siempre">Stock app</Th>
                  <Th>Conteo manual</Th>
                  <Th title="Conteo manual − ventas Entregado desde la fecha del conteo">Stock real</Th>
                  <Th>Diferencia</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map(({ gusto: g, ultimoConteo, stockApp, stockReal, diferencia }) => (
                  <TrHover key={g.id_base}>
                    <Td main>
                      {g.nombre}
                      {g.variantes.length > 1 && (
                        <div className="mt-0.5 text-[11px] font-normal text-text3">
                          {g.variantes
                            .filter((v) => v.id !== g.id_base)
                            .map((v) => v.nombre)
                            .join(" · ")}
                        </div>
                      )}
                    </Td>
                    <Td>{fNum(stockApp, 0)}</Td>
                    <Td>
                      {ultimoConteo ? fNum(ultimoConteo.cantidad, 0) : "—"}
                      {ultimoConteo && <div className="text-[11px] text-text3">{fFechaCorta(ultimoConteo.fecha)}</div>}
                    </Td>
                    <Td main>{fNum(stockReal, 0)}</Td>
                    <Td>
                      {diferencia === null ? (
                        "—"
                      ) : (
                        <Badge color={diferencia === 0 ? "green" : Math.abs(diferencia) <= 2 ? "orange" : "red"}>
                          {diferencia > 0 ? `+${fNum(diferencia, 0)}` : fNum(diferencia, 0)}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {stockReal <= 0 ? (
                        <Badge color="red">En cero</Badge>
                      ) : stockReal < umbralBajo ? (
                        <Badge color="orange">Bajo</Badge>
                      ) : (
                        <Badge color="green">Normal</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setModalHistorial(g.id_base)}>
                          Historial
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setModalConteo(g.id_base);
                            setCantidad(data.stock_manual[g.id_base] ?? 0);
                          }}
                        >
                          Registrar conteo
                        </Button>
                      </div>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!modalConteo}
        onClose={() => setModalConteo(null)}
        title={`Conteo — ${gustoConteo?.nombre ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalConteo(null)}>
              Cancelar
            </Button>
            <Button onClick={registrarConteo}>Guardar</Button>
          </>
        }
      >
        <Field label="Cantidad contada">
          <Input type="number" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
        </Field>
      </Modal>

      <Modal open={!!modalHistorial} onClose={() => setModalHistorial(null)} title={`Historial — ${filaHistorial?.gusto.nombre ?? ""}`} wide>
        {!filaHistorial || filaHistorial.movimientos.length === 0 ? (
          <EmptyState text="Sin movimientos de producción o ventas todavía." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Detalle</Th>
                  <Th>Cantidad</Th>
                  <Th>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let saldo = 0;
                  return filaHistorial.movimientos.map((m, idx) => {
                    saldo += m.cantidad;
                    return (
                      <TrHover key={idx}>
                        <Td>{fFechaCorta(m.fecha)}</Td>
                        <Td>
                          <Badge color={m.tipo === "produccion" ? "green" : "blue"}>
                            {m.tipo === "produccion" ? "Producción" : "Venta"}
                          </Badge>
                        </Td>
                        <Td>{m.detalle}</Td>
                        <Td main className={m.cantidad >= 0 ? "text-green" : "text-red"}>
                          {m.cantidad >= 0 ? `+${fNum(m.cantidad, 0)}` : fNum(m.cantidad, 0)}
                        </Td>
                        <Td>{fNum(saldo, 0)}</Td>
                      </TrHover>
                    );
                  });
                })()}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Modal>
    </>
  );
}

function MateriasPrimasTab() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const { mes, anio } = usePeriod();

  const [cmvInicial, setCmvInicial] = useState(data.saldo_cmv_anterior);
  const [comprasInicial, setComprasInicial] = useState(data.saldo_compras_anterior);
  const [fechaCorte, setFechaCorte] = useState(data.fecha_corte_cmv ?? "");

  const seguidos = data.ingredientes.filter((i) => i.seguimiento_stock);
  const noSeguidos = data.ingredientes.filter((i) => !i.seguimiento_stock);

  const stockChartData = useMemo(
    () =>
      seguidos.map((i) => ({
        nombre: i.nombre,
        actual: calcStockIngrediente(data, i.id),
        minimo: i.stock_minimo ?? 0,
      })),
    [data, seguidos]
  );

  const cmvAcum = cmvAcumulado(data);
  const comprasAcum = comprasAcumuladas(data);
  const diferencia = comprasAcum - cmvAcum;

  const cmvMes = data.pedidos
    .filter((p) => p.estado === "Entregado" && inPeriod(p.fecha, mes, anio))
    .reduce((acc, p) => {
      const prod = data.productos.find((pr) => pr.id === p.id_producto);
      if (!prod) return acc;
      const lineasReceta = data.recetas.filter((r) => r.id_producto === prod.id);
      const costoUnit = lineasReceta.reduce((a, l) => {
        if (l.tipo === "Ingrediente") return a + l.cantidad * pvr(data.ingredientes.find((i) => i.id === l.concepto));
        if (l.tipo === "Packaging") return a + l.cantidad * (data.packaging.find((pk) => pk.id === l.concepto)?.precio ?? 0);
        return a + l.cantidad * (data.costos_fijos.find((c) => c.id === l.concepto)?.monto ?? 0);
      }, 0);
      return acc + costoUnit * p.cantidad;
    }, 0);

  const comprasMes = data.compras.filter((c) => inPeriod(c.fecha, mes, anio)).reduce((acc, c) => acc + c.total, 0);

  function guardarSaldos() {
    setData((d) => ({
      ...d,
      saldo_cmv_anterior: cmvInicial,
      saldo_compras_anterior: comprasInicial,
      fecha_corte_cmv: fechaCorte || null,
      fecha_corte_compras: fechaCorte || null,
    }));
    toast("Saldos de arrastre guardados");
  }

  function activar(id: string) {
    setData((d) => ({
      ...d,
      ingredientes: d.ingredientes.map((i) => (i.id === id ? { ...i, seguimiento_stock: true } : i)),
    }));
    toast("Seguimiento de stock activado");
  }

  function quitarDeRecetas(id: string) {
    setData((d) => ({
      ...d,
      recetas: d.recetas.filter((r) => !(r.tipo === "Ingrediente" && r.concepto === id)),
    }));
    toast("Ingrediente quitado de todas las recetas", "info");
  }

  return (
    <>
      <StatGrid>
        <KpiCard label="CMV acumulado" value={fARS(cmvAcum)} color="red" />
        <KpiCard label="Compras acumuladas" value={fARS(comprasAcum)} color="blue" />
        <KpiCard label="Diferencia (Compras − CMV)" value={fARS(diferencia)} color={diferencia >= 0 ? "green" : "red"} />
        <KpiCard label="CMV del mes" value={fARS(cmvMes)} color="orange" />
        <KpiCard label="Compras del mes" value={fARS(comprasMes)} color="purple" />
      </StatGrid>

      <Card title="Saldos de arrastre" className="mb-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Field label="CMV inicial">
            <Input type="number" value={cmvInicial} onChange={(e) => setCmvInicial(Number(e.target.value))} />
          </Field>
          <Field label="Compras iniciales">
            <Input type="number" value={comprasInicial} onChange={(e) => setComprasInicial(Number(e.target.value))} />
          </Field>
          <Field label="Fecha de corte">
            <Input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardarSaldos}>Guardar Saldos</Button>
        </div>
      </Card>

      {seguidos.length > 0 && (
        <Card title="Stock actual vs. mínimo" className="mb-4">
          <ResponsiveContainer width="100%" height={Math.max(180, stockChartData.length * 34)}>
            <BarChart data={stockChartData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: CHART_COLORS.text3 }}
                axisLine={{ stroke: CHART_COLORS.border }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                width={150}
                tick={{ fontSize: 11, fill: CHART_COLORS.text2 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => fNum(Number(v))}
                contentStyle={{ borderRadius: 8, border: `1px solid ${CHART_COLORS.border}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="actual" name="Stock actual" radius={[0, 4, 4, 0]}>
                {stockChartData.map((s) => (
                  <Cell key={s.nombre} fill={s.actual <= 0 ? CHART_COLORS.red : s.actual < s.minimo ? CHART_COLORS.orange : CHART_COLORS.green} />
                ))}
              </Bar>
              <Bar dataKey="minimo" name="Stock mínimo" fill={CHART_COLORS.border} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card title="Ingredientes con seguimiento de stock" className="mb-4">
        {seguidos.length === 0 ? (
          <EmptyState text="Ningún ingrediente tiene seguimiento de stock activo." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Ingrediente</Th>
                  <Th>Unidad</Th>
                  <Th>Stock estimado</Th>
                  <Th>Valorizado</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {seguidos.map((i) => {
                  const stock = calcStockIngrediente(data, i.id);
                  const minimo = i.stock_minimo ?? 10;
                  return (
                    <TrHover key={i.id}>
                      <Td main>{i.nombre}</Td>
                      <Td>{i.unidad}</Td>
                      <Td>{fNum(stock)}</Td>
                      <Td>{fARS(stock * pvr(i))}</Td>
                      <Td>
                        {stock <= 0 ? (
                          <Badge color="red">Crítico</Badge>
                        ) : stock < minimo ? (
                          <Badge color="orange">Bajo</Badge>
                        ) : (
                          <Badge color="green">OK</Badge>
                        )}
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card title="Ingredientes sin seguimiento">
        {noSeguidos.length === 0 ? (
          <EmptyState text="Todos los ingredientes tienen seguimiento activo." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Ingrediente</Th>
                  <Th>Unidad</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {noSeguidos.map((i) => (
                  <TrHover key={i.id}>
                    <Td main>{i.nombre}</Td>
                    <Td>{i.unidad}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="green" onClick={() => activar(i.id)}>
                          Activar seguimiento
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => quitarDeRecetas(i.id)}>
                          Quitar de recetas
                        </Button>
                      </div>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

export function Stock() {
  const [tab, setTab] = useState("productos");
  return (
    <div>
      <PageHeader title="Stock" sub="Control de stock de productos y materias primas" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "productos", label: "Productos" },
          { value: "materias-primas", label: "Materias Primas" },
        ]}
      />
      {tab === "productos" ? <ProductosTab /> : <MateriasPrimasTab />}
    </div>
  );
}
