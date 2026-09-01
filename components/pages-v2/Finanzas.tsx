"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod, MESES } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Card,
  Button,
  FilterTabs,
  StatGrid,
  KpiCard,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Badge,
  FormGrid,
  Field,
  Input,
  Select,
  SearchInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  fARS,
  fNum,
  inPeriod,
  saldoCaja,
  ORIGENES_CAJA_REAL,
  ventasNetas,
  cmvPeriodo,
  costosFijosTotales,
  totalGastosOperativos,
  totalCostoEnvio,
  puntoEquilibrio,
  totalAmortizacionesPeriodo,
} from "@/lib/calc-v2";
import type { Activo } from "@/lib/types-v2";

function nombreCategoria(data: ReturnType<typeof useStoreV2>["data"], id: string | undefined) {
  return data.categorias.find((c) => c.id === id)?.nombre ?? "—";
}

function CajaTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ fecha: new Date().toISOString().slice(0, 10), tipo: "ingreso" as "ingreso" | "egreso", concepto: "", monto: 0, metodo_pago: "" });

  const saldo = saldoCaja(data);
  const movimientosCaja = useMemo(
    () =>
      data.movimientos_financieros
        .filter((m) => (m.origen_tipo && ORIGENES_CAJA_REAL.includes(m.origen_tipo)) || m.tipo === "transferencia")
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.movimientos_financieros]
  );

  function registrar() {
    if (!form.concepto.trim() || form.monto <= 0) {
      toast("Completá el concepto y un monto mayor a 0", "error");
      return;
    }
    setData((d) => ({
      ...d,
      movimientos_financieros: [
        ...d.movimientos_financieros,
        { id: uid("MOVF"), fecha: form.fecha, tipo: form.tipo, concepto: form.concepto, monto: form.monto, metodo_pago: form.metodo_pago || undefined, origen_tipo: "caja_manual", estado: "confirmado" },
      ],
    }));
    toast("Movimiento de caja registrado");
    setModalOpen(false);
    setForm({ fecha: new Date().toISOString().slice(0, 10), tipo: "ingreso", concepto: "", monto: 0, metodo_pago: "" });
  }

  return (
    <div>
      <StatGrid>
        <KpiCard label="Saldo de caja actual" value={fARS(saldo)} color={saldo >= 0 ? "green" : "red"} />
      </StatGrid>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Movimiento de caja</Button>
      </div>
      <Card>
        {movimientosCaja.length === 0 ? (
          <EmptyState text="No hay movimientos de caja." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Concepto</Th>
                  <Th>Monto</Th>
                  <Th>Método</Th>
                </tr>
              </thead>
              <tbody>
                {movimientosCaja.slice(0, 200).map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>
                      <Badge color={m.tipo === "ingreso" ? "green" : m.tipo === "egreso" ? "red" : "blue"}>{m.tipo}</Badge>
                    </Td>
                    <Td main>{m.concepto}</Td>
                    <Td className={m.tipo === "egreso" ? "text-red" : "text-green"}>{fARS(m.monto)}</Td>
                    <Td>{m.metodo_pago ?? "—"}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo movimiento de caja"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={registrar}>Registrar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as "ingreso" | "egreso" })}>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </Select>
          </Field>
          <Field label="Concepto" full>
            <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </Field>
          <Field label="Monto">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Método de pago">
            <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function IngresosEgresosTab() {
  const { data } = useStoreV2();
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [search, setSearch] = useState("");

  const filtrados = useMemo(
    () =>
      data.movimientos_financieros
        .filter((m) => tipoFiltro === "todos" || m.tipo === tipoFiltro)
        .filter((m) => !search || m.concepto.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.movimientos_financieros, tipoFiltro, search]
  );

  return (
    <div>
      <div className="mb-4 max-w-[300px]">
        <SearchInput placeholder="Buscar por concepto…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <FilterTabs
        value={tipoFiltro}
        onChange={setTipoFiltro}
        options={[
          { value: "todos", label: "Todos" },
          { value: "ingreso", label: "Ingresos" },
          { value: "egreso", label: "Egresos" },
          { value: "transferencia", label: "Transferencias" },
        ]}
      />
      <Card>
        {filtrados.length === 0 ? (
          <EmptyState text="Sin resultados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Categoría</Th>
                  <Th>Concepto</Th>
                  <Th>Monto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 300).map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>
                      <Badge color={m.tipo === "ingreso" ? "green" : m.tipo === "egreso" ? "red" : "blue"}>{m.tipo}</Badge>
                    </Td>
                    <Td>{nombreCategoria(data, m.categoria_id)}</Td>
                    <Td main>{m.concepto}</Td>
                    <Td className={m.tipo === "egreso" ? "text-red" : "text-green"}>{fARS(m.monto)}</Td>
                    <Td>
                      <Badge color={m.estado === "confirmado" ? "green" : "orange"}>{m.estado}</Badge>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

const PREFIJOS_GASTO: Record<string, (sub: string) => string> = {
  "Costo Fijo": (sub) => `Costo Fijo — ${sub}`,
  "Costo Indirecto — Fijo": () => "Costo Indirecto — Fijo",
  "Costo Indirecto — Variable": () => "Costo Indirecto — Variable",
  "Gasto Operativo": (sub) => `Gasto Operativo — ${sub}`,
};

function GastosTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    grupo: "Costo Fijo" as keyof typeof PREFIJOS_GASTO,
    subcategoria: "",
    concepto: "",
    monto: 0,
    fecha: new Date().toISOString().slice(0, 10),
  });

  const gastos = useMemo(() => {
    const prefijos = ["Costo Fijo — ", "Costo Indirecto — ", "Gasto Operativo — "];
    return data.movimientos_financieros
      .filter((m) => prefijos.some((p) => nombreCategoria(data, m.categoria_id).startsWith(p)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [data]);

  function guardar() {
    if (!form.concepto.trim() || form.monto <= 0) {
      toast("Completá el concepto y un monto mayor a 0", "error");
      return;
    }
    const nombreCat = PREFIJOS_GASTO[form.grupo](form.subcategoria || "General");
    setData((d) => {
      let categorias = d.categorias;
      let categoria = categorias.find((c) => c.ambito === "financiero" && c.nombre.toLowerCase() === nombreCat.toLowerCase());
      if (!categoria) {
        categoria = { id: uid("CAT"), nombre: nombreCat, ambito: "financiero", activo: true };
        categorias = [...categorias, categoria];
      }
      return {
        ...d,
        categorias,
        movimientos_financieros: [
          ...d.movimientos_financieros,
          { id: uid("MOVF"), fecha: form.fecha, tipo: "egreso", categoria_id: categoria.id, concepto: form.concepto, monto: form.monto, estado: "confirmado" },
        ],
      };
    });
    toast("Gasto registrado");
    setModalOpen(false);
    setForm({ grupo: "Costo Fijo", subcategoria: "", concepto: "", monto: 0, fecha: new Date().toISOString().slice(0, 10) });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Nuevo gasto</Button>
      </div>
      <Card title="Costos fijos, indirectos y gastos operativos">
        {gastos.length === 0 ? (
          <EmptyState text="No hay gastos cargados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Categoría</Th>
                  <Th>Concepto</Th>
                  <Th>Monto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>{nombreCategoria(data, m.categoria_id)}</Td>
                    <Td main>{m.concepto}</Td>
                    <Td className="text-red">{fARS(m.monto)}</Td>
                    <Td>
                      <Badge color={m.estado === "confirmado" ? "green" : "orange"}>{m.estado}</Badge>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo gasto"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Tipo">
            <Select value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value as keyof typeof PREFIJOS_GASTO })}>
              <option value="Costo Fijo">Costo fijo (recurrente)</option>
              <option value="Costo Indirecto — Fijo">Costo indirecto — fijo (del mes)</option>
              <option value="Costo Indirecto — Variable">Costo indirecto — variable (del mes)</option>
              <option value="Gasto Operativo">Gasto operativo</option>
            </Select>
          </Field>
          {(form.grupo === "Costo Fijo" || form.grupo === "Gasto Operativo") && (
            <Field label="Subcategoría">
              <Input value={form.subcategoria} onChange={(e) => setForm({ ...form, subcategoria: e.target.value })} placeholder="Alquiler, Sueldos…" />
            </Field>
          )}
          <Field label="Concepto" full>
            <Input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          </Field>
          <Field label="Monto">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function activoVacio(): Omit<Activo, "id"> {
  return { nombre: "", fecha_compra: new Date().toISOString().slice(0, 10), costo: 0, vida_util_meses: 12, amortizacion_mensual: 0, activo: true };
}

function ActivosTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const { mes, anio } = usePeriod();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(activoVacio());

  const amortizacionMes = totalAmortizacionesPeriodo(data, mes, anio);

  function abrirNuevo() {
    setEditando(null);
    setForm(activoVacio());
    setModalOpen(true);
  }
  function abrirEdicion(a: Activo) {
    setEditando(a.id);
    setForm({ nombre: a.nombre, fecha_compra: a.fecha_compra, costo: a.costo, vida_util_meses: a.vida_util_meses, amortizacion_mensual: a.amortizacion_mensual, activo: a.activo });
    setModalOpen(true);
  }
  function guardar() {
    if (!form.nombre.trim() || form.vida_util_meses <= 0) {
      toast("Completá el nombre y una vida útil mayor a 0", "error");
      return;
    }
    const cuota = Math.round(form.costo / form.vida_util_meses);
    const registro = { ...form, amortizacion_mensual: cuota };
    if (editando) {
      setData((d) => ({ ...d, activos: d.activos.map((a) => (a.id === editando ? { ...a, ...registro } : a)) }));
      toast("Activo actualizado");
    } else {
      setData((d) => ({ ...d, activos: [...d.activos, { id: uid("ACT"), ...registro }] }));
      toast("Activo creado");
    }
    setModalOpen(false);
  }

  return (
    <div>
      <StatGrid>
        <KpiCard label={`Amortización de ${MESES[mes - 1]}`} value={fARS(amortizacionMes)} color="orange" />
      </StatGrid>
      <div className="mb-4 flex justify-end">
        <Button onClick={abrirNuevo}>+ Nuevo activo</Button>
      </div>
      <Card>
        {data.activos.length === 0 ? (
          <EmptyState text="No hay activos cargados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Fecha compra</Th>
                  <Th>Costo</Th>
                  <Th>Vida útil (meses)</Th>
                  <Th>Cuota mensual</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {data.activos.map((a) => (
                  <TrHover key={a.id}>
                    <Td main>{a.nombre}</Td>
                    <Td>{a.fecha_compra}</Td>
                    <Td>{fARS(a.costo)}</Td>
                    <Td>{a.vida_util_meses}</Td>
                    <Td>{fARS(a.amortizacion_mensual)}</Td>
                    <Td>
                      <Badge color={a.activo ? "green" : "red"}>{a.activo ? "Activo" : "Inactivo"}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => abrirEdicion(a)}>
                        Editar
                      </Button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? "Editar activo" : "Nuevo activo"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Nombre" full>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Fecha de compra">
            <Input type="date" value={form.fecha_compra} onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })} />
          </Field>
          <Field label="Costo">
            <Input type="number" value={form.costo} onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })} />
          </Field>
          <Field label="Vida útil (meses)">
            <Input type="number" value={form.vida_util_meses} onChange={(e) => setForm({ ...form, vida_util_meses: Number(e.target.value) })} />
          </Field>
          <Field label="Cuota mensual (calculada)">
            <Input readOnly value={fARS(form.vida_util_meses > 0 ? form.costo / form.vida_util_meses : 0)} />
          </Field>
          <Field label="Activo">
            <Select value={form.activo ? "si" : "no"} onChange={(e) => setForm({ ...form, activo: e.target.value === "si" })}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function RentabilidadTab() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();

  const pedidosPeriodo = useMemo(() => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado === "Entregado"), [data.pedidos, mes, anio]);
  const ventas = ventasNetas(pedidosPeriodo);
  const cmv = cmvPeriodo(data, pedidosPeriodo);
  const envio = totalCostoEnvio(pedidosPeriodo);
  const cf = costosFijosTotales(data, mes, anio);
  const gop = totalGastosOperativos(data, mes, anio);
  const resultado = ventas - cmv - envio - cf - gop;
  const pe = puntoEquilibrio(data, pedidosPeriodo, mes, anio);

  return (
    <div>
      <StatGrid>
        <KpiCard label="Ventas netas" value={fARS(ventas)} color="gold" />
        <KpiCard label="CMV" value={fARS(cmv)} color="orange" />
        <KpiCard label="Costos fijos + amortiz." value={fARS(cf)} color="orange" />
        <KpiCard label="Gastos operativos" value={fARS(gop)} color="orange" />
        <KpiCard label="Resultado del mes" value={fARS(resultado)} color={resultado >= 0 ? "green" : "red"} />
      </StatGrid>

      <Card title={`Punto de equilibrio — ${MESES[mes - 1]} ${anio}`}>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div>
            <div className="text-[11px] text-text3">Unidades para cubrir costos fijos</div>
            <div className="text-xl font-semibold text-text">{fNum(pe.pe, 0)}</div>
          </div>
          <div>
            <div className="text-[11px] text-text3">Margen de contribución promedio</div>
            <div className="text-xl font-semibold text-text">{fARS(pe.margenPromedioPonderado)}</div>
          </div>
          <div>
            <div className="text-[11px] text-text3">Unidades vendidas en el período</div>
            <div className="text-xl font-semibold text-text">{fNum(pe.unidadesTotales, 0)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Finanzas() {
  const [tab, setTab] = useState("caja");
  return (
    <div>
      <PageHeader title="Finanzas" sub="Caja, ingresos y egresos, gastos, activos y rentabilidad" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "caja", label: "Caja y bancos" },
          { value: "movimientos", label: "Ingresos y egresos" },
          { value: "gastos", label: "Gastos" },
          { value: "activos", label: "Activos e inversiones" },
          { value: "rentabilidad", label: "Rentabilidad" },
        ]}
      />
      {tab === "caja" && <CajaTab />}
      {tab === "movimientos" && <IngresosEgresosTab />}
      {tab === "gastos" && <GastosTab />}
      {tab === "activos" && <ActivosTab />}
      {tab === "rentabilidad" && <RentabilidadTab />}
    </div>
  );
}
