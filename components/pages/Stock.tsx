"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  calcStockIngrediente,
  cmvAcumulado,
  comprasAcumuladas,
  fARS,
  fNum,
  inPeriod,
  pvr,
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

function ProductosTab() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalProducto, setModalProducto] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(0);

  function registrarConteo() {
    if (!modalProducto) return;
    const fecha = new Date().toISOString().slice(0, 10);
    setData((d) => ({
      ...d,
      conteos_stock: [...d.conteos_stock, { id: uid("CTK"), id_producto: modalProducto, cantidad, fecha }],
      stock_manual: { ...d.stock_manual, [modalProducto]: cantidad },
    }));
    toast("Conteo registrado");
    setModalProducto(null);
    setCantidad(0);
  }

  const prodSel = data.productos.find((p) => p.id === modalProducto);

  return (
    <>
      <Card>
        {data.productos.length === 0 ? (
          <EmptyState text="Sin productos." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Stock manual</Th>
                  <Th>Último conteo</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {data.productos.map((p) => {
                  const conteos = data.conteos_stock
                    .filter((c) => c.id_producto === p.id)
                    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
                  const ultimo = conteos[0];
                  return (
                    <TrHover key={p.id}>
                      <Td main>{p.nombre}</Td>
                      <Td>{fNum(data.stock_manual[p.id] ?? 0, 0)}</Td>
                      <Td>{ultimo ? ultimo.fecha : "—"}</Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setModalProducto(p.id);
                            setCantidad(data.stock_manual[p.id] ?? 0);
                          }}
                        >
                          Registrar conteo
                        </Button>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={!!modalProducto}
        onClose={() => setModalProducto(null)}
        title={`Conteo — ${prodSel?.nombre ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalProducto(null)}>
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
                  return (
                    <TrHover key={i.id}>
                      <Td main>{i.nombre}</Td>
                      <Td>{i.unidad}</Td>
                      <Td>{fNum(stock)}</Td>
                      <Td>{fARS(stock * pvr(i))}</Td>
                      <Td>
                        {stock <= 0 ? (
                          <Badge color="red">Crítico</Badge>
                        ) : stock < 10 ? (
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
