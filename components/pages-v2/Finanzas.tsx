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
  puntoEquilibrio,
  totalAmortizacionesPeriodo,
  calcularEerr,
} from "@/lib/calc-v2";
import type { EerrLinea } from "@/lib/calc-v2";
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

function fARS2(n: number | null | undefined): string {
  const v = n ?? 0;
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fPct2(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function primerDiaMes(mes: number, anio: number): string {
  return `${anio}-${pad2(mes)}-01`;
}
function ultimoDiaMes(mes: number, anio: number): string {
  return `${anio}-${pad2(mes)}-${pad2(new Date(anio, mes, 0).getDate())}`;
}
function mesAnterior(mes: number, anio: number): { mes: number; anio: number } {
  return mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio };
}
function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

interface FilaEerr {
  id: string;
  label: string;
  linea?: EerrLinea;
  actual: number;
  anterior?: number;
  esSubtotal?: boolean;
  margenActual?: number | null;
  margenAnterior?: number | null;
  favorable: "mayorMejor" | "menorMejor";
}

function colorVariacion(favorable: "mayorMejor" | "menorMejor", variacion: number): string {
  if (variacion === 0) return "text-text2";
  const esBueno = favorable === "mayorMejor" ? variacion > 0 : variacion < 0;
  return esBueno ? "text-green" : "text-red";
}

function FilaEerrVista({ fila, comparar, expandido, onToggle }: { fila: FilaEerr; comparar: boolean; expandido: boolean; onToggle: () => void }) {
  const variacion = fila.anterior != null ? fila.actual - fila.anterior : 0;
  const variacionPct = fila.anterior ? (variacion / Math.abs(fila.anterior)) * 100 : null;
  const tieneRegistros = (fila.linea?.registros.length ?? 0) > 0;
  return (
    <>
      <tr
        className={`${fila.esSubtotal ? "bg-surface2/60 font-semibold" : ""} ${tieneRegistros ? "cursor-pointer" : ""}`}
        onClick={tieneRegistros ? onToggle : undefined}
      >
        <Td main={fila.esSubtotal}>
          {tieneRegistros && <span className="mr-1.5 text-text3">{expandido ? "▾" : "▸"}</span>}
          {fila.label}
        </Td>
        <Td>{fARS2(fila.actual)}</Td>
        {comparar && (
          <>
            <Td>{fARS2(fila.anterior ?? 0)}</Td>
            <Td className={colorVariacion(fila.favorable, variacion)}>{fARS2(variacion)}</Td>
            <Td className={colorVariacion(fila.favorable, variacion)}>{variacionPct == null ? "—" : fPct2(variacionPct)}</Td>
          </>
        )}
      </tr>
      {fila.margenActual !== undefined && (
        <tr className="text-[11.5px] text-text3">
          <Td>Margen {fila.label.toLowerCase().startsWith("resultado ") ? fila.label.slice(10) : ""}</Td>
          <Td>{fPct2(fila.margenActual)}</Td>
          {comparar && (
            <>
              <Td>{fPct2(fila.margenAnterior ?? null)}</Td>
              <Td colSpan={2}>
                {fila.margenActual != null && fila.margenAnterior != null
                  ? `${(fila.margenActual - fila.margenAnterior) >= 0 ? "+" : ""}${fNum(fila.margenActual - fila.margenAnterior, 2)} pp`
                  : "—"}
              </Td>
            </>
          )}
        </tr>
      )}
      {expandido && tieneRegistros && (
        <tr>
          <Td colSpan={comparar ? 5 : 2}>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface2/40 p-2">
              <table className="w-full text-[12px]">
                <tbody>
                  {fila.linea!.registros.map((r, i) => (
                    <tr key={i}>
                      <td className="py-0.5 pr-3 text-text3">{r.fecha}</td>
                      <td className="py-0.5 pr-3 text-text2">{r.concepto}</td>
                      <td className="py-0.5 text-right text-text">{fARS2(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}

function RentabilidadTab() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();

  const [modo, setModo] = useState<"mes" | "rango">("mes");
  const [desdeManual, setDesdeManual] = useState(primerDiaMes(mes, anio));
  const [hastaManual, setHastaManual] = useState(ultimoDiaMes(mes, anio));
  const [canal, setCanal] = useState<"todos" | "Minorista" | "Mayorista">("todos");
  const [comparar, setComparar] = useState(true);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const { desde, hasta } = modo === "mes" ? { desde: primerDiaMes(mes, anio), hasta: ultimoDiaMes(mes, anio) } : { desde: desdeManual, hasta: hastaManual };
  const canalFiltro = canal === "todos" ? undefined : canal;

  const { desdeAnt, hastaAnt } = useMemo(() => {
    if (modo === "mes") {
      const ant = mesAnterior(mes, anio);
      return { desdeAnt: primerDiaMes(ant.mes, ant.anio), hastaAnt: ultimoDiaMes(ant.mes, ant.anio) };
    }
    const dias = (new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86400000 + 1;
    return { desdeAnt: sumarDias(desde, -dias), hastaAnt: sumarDias(desde, -1) };
  }, [modo, mes, anio, desde, hasta]);

  const eerr = useMemo(() => calcularEerr(data, desde, hasta, canalFiltro), [data, desde, hasta, canalFiltro]);
  const eerrAnt = useMemo(() => (comparar ? calcularEerr(data, desdeAnt, hastaAnt, canalFiltro) : null), [comparar, data, desdeAnt, hastaAnt, canalFiltro]);

  const pedidosPeriodoPE = useMemo(() => data.pedidos.filter((p) => inPeriod(p.fecha, mes, anio) && p.estado === "Entregado"), [data.pedidos, mes, anio]);
  const pe = puntoEquilibrio(data, pedidosPeriodoPE, mes, anio);

  function toggle(id: string) {
    setExpandido((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const filas: FilaEerr[] = [
    { id: "vb", label: "Ventas brutas", linea: eerr.ventas_brutas, actual: eerr.ventas_brutas.total, anterior: eerrAnt?.ventas_brutas.total, favorable: "mayorMejor" },
    { id: "desc", label: "− Descuentos y devoluciones", linea: eerr.descuentos, actual: -eerr.descuentos.total, anterior: eerrAnt ? -eerrAnt.descuentos.total : undefined, favorable: "menorMejor" },
    { id: "env", label: "+ Envíos cobrados al cliente", linea: eerr.envios_cobrados, actual: eerr.envios_cobrados.total, anterior: eerrAnt?.envios_cobrados.total, favorable: "mayorMejor" },
    { id: "vn", label: "= Ventas netas", actual: eerr.ventas_netas, anterior: eerrAnt?.ventas_netas, esSubtotal: true, favorable: "mayorMejor" },
    { id: "cmv", label: "− CMV", linea: eerr.cmv, actual: -eerr.cmv.total, anterior: eerrAnt ? -eerrAnt.cmv.total : undefined, favorable: "menorMejor" },
    {
      id: "rb",
      label: "= Resultado bruto",
      actual: eerr.resultado_bruto,
      anterior: eerrAnt?.resultado_bruto,
      esSubtotal: true,
      margenActual: eerr.margen_bruto_pct,
      margenAnterior: eerrAnt?.margen_bruto_pct,
      favorable: "mayorMejor",
    },
    {
      id: "civ",
      label: "− Costos indirectos variables (incl. envío real)",
      linea: eerr.costos_indirectos_variables,
      actual: -eerr.costos_indirectos_variables.total,
      anterior: eerrAnt ? -eerrAnt.costos_indirectos_variables.total : undefined,
      favorable: "menorMejor",
    },
    {
      id: "gop",
      label: "− Gastos operativos",
      linea: eerr.gastos_operativos,
      actual: -eerr.gastos_operativos.total,
      anterior: eerrAnt ? -eerrAnt.gastos_operativos.total : undefined,
      favorable: "menorMejor",
    },
    { id: "cf", label: "− Costos fijos", linea: eerr.costos_fijos, actual: -eerr.costos_fijos.total, anterior: eerrAnt ? -eerrAnt.costos_fijos.total : undefined, favorable: "menorMejor" },
    {
      id: "am",
      label: "− Amortizaciones",
      linea: eerr.amortizaciones,
      actual: -eerr.amortizaciones.total,
      anterior: eerrAnt ? -eerrAnt.amortizaciones.total : undefined,
      favorable: "menorMejor",
    },
    {
      id: "ro",
      label: "= Resultado operativo",
      actual: eerr.resultado_operativo,
      anterior: eerrAnt?.resultado_operativo,
      esSubtotal: true,
      margenActual: eerr.margen_operativo_pct,
      margenAnterior: eerrAnt?.margen_operativo_pct,
      favorable: "mayorMejor",
    },
    {
      id: "oig",
      label: "+/− Otros ingresos y gastos",
      linea: eerr.otros_ingresos_gastos,
      actual: eerr.otros_ingresos_gastos.total,
      anterior: eerrAnt?.otros_ingresos_gastos.total,
      favorable: "mayorMejor",
    },
    { id: "imp", label: "− Impuestos", linea: eerr.impuestos, actual: -eerr.impuestos.total, anterior: eerrAnt ? -eerrAnt.impuestos.total : undefined, favorable: "menorMejor" },
    {
      id: "rn",
      label: "= Resultado neto",
      actual: eerr.resultado_neto,
      anterior: eerrAnt?.resultado_neto,
      esSubtotal: true,
      margenActual: eerr.margen_neto_pct,
      margenAnterior: eerrAnt?.margen_neto_pct,
      favorable: "mayorMejor",
    },
  ];

  return (
    <div>
      <Card title="Estado de Resultados (EERR)" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Resultado económico devengado, no de caja: las ventas salen de pedidos Entregados (no de cobros), el CMV sale de
          la receta de cada producto (no de las compras del período), y los costos fijos/amortización se prorratean por
          mes. Otros ingresos/gastos e impuestos quedan en $0 — todavía no hay una fuente de datos para esas dos líneas.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <FilterTabs
            value={modo}
            onChange={(v) => setModo(v as "mes" | "rango")}
            options={[
              { value: "mes", label: `Mes: ${MESES[mes - 1]} ${anio}` },
              { value: "rango", label: "Rango personalizado" },
            ]}
          />
          {modo === "rango" && (
            <>
              <Field label="Desde">
                <Input type="date" value={desdeManual} onChange={(e) => setDesdeManual(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={hastaManual} onChange={(e) => setHastaManual(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Canal">
            <Select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)} style={{ width: 140 }}>
              <option value="todos">Todos</option>
              <option value="Minorista">Minorista</option>
              <option value="Mayorista">Mayorista</option>
            </Select>
          </Field>
          <label className="flex items-center gap-1.5 pb-2 text-[12.5px] text-text2">
            <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
            Comparar con período anterior
          </label>
        </div>
      </Card>

      <StatGrid>
        <KpiCard label="Ventas netas" value={fARS2(eerr.ventas_netas)} color="gold" />
        <KpiCard label="Resultado bruto" value={fARS2(eerr.resultado_bruto)} color={eerr.resultado_bruto >= 0 ? "green" : "red"} />
        <KpiCard label="Margen bruto" value={fPct2(eerr.margen_bruto_pct)} color="blue" />
        <KpiCard label="Resultado operativo" value={fARS2(eerr.resultado_operativo)} color={eerr.resultado_operativo >= 0 ? "green" : "red"} />
        <KpiCard label="Resultado neto" value={fARS2(eerr.resultado_neto)} color={eerr.resultado_neto >= 0 ? "green" : "red"} />
        <KpiCard label="Margen neto" value={fPct2(eerr.margen_neto_pct)} color="blue" />
      </StatGrid>

      <Card>
        {eerr.ventas_netas === 0 && eerr.cmv.total === 0 ? (
          <EmptyState text="No hay pedidos Entregados en este período — todo el EERR queda en cero." />
        ) : null}
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th>Período actual</Th>
                {comparar && (
                  <>
                    <Th>Período anterior</Th>
                    <Th>Variación $</Th>
                    <Th>Variación %</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <FilaEerrVista key={f.id} fila={f} comparar={comparar} expandido={!!expandido[f.id]} onToggle={() => toggle(f.id)} />
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

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

function ReinversionTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const ci = data.configuracion.caja_inteligente;

  const [pctReinversion, setPctReinversion] = useState(ci.porcentaje_reinversion);
  const [pctSeguridad, setPctSeguridad] = useState(ci.porcentaje_seguridad);
  const [form, setForm] = useState({ fecha: new Date().toISOString().slice(0, 10), monto: 0 });

  const totalAportado = ci.asignaciones.reduce((acc, a) => acc + a.monto, 0);
  const totalReinversion = Math.round((totalAportado * ci.porcentaje_reinversion) / 100);
  const totalSeguridad = totalAportado - totalReinversion;

  const aportesOrdenados = useMemo(() => [...ci.asignaciones].sort((a, b) => b.fecha.localeCompare(a.fecha)), [ci.asignaciones]);

  function guardarPorcentajes() {
    if (pctReinversion + pctSeguridad !== 100) {
      toast("Los porcentajes tienen que sumar 100", "error");
      return;
    }
    setData((d) => ({
      ...d,
      configuracion: { ...d.configuracion, caja_inteligente: { ...d.configuracion.caja_inteligente, porcentaje_reinversion: pctReinversion, porcentaje_seguridad: pctSeguridad } },
    }));
    toast("Reparto actualizado");
  }

  function agregarAporte() {
    if (form.monto <= 0) {
      toast("Ingresá un monto mayor a 0", "error");
      return;
    }
    setData((d) => ({
      ...d,
      configuracion: {
        ...d.configuracion,
        caja_inteligente: {
          ...d.configuracion.caja_inteligente,
          asignaciones: [...d.configuracion.caja_inteligente.asignaciones, { id: uid("CI"), fecha: form.fecha, monto: form.monto }],
        },
      },
    }));
    toast("Aporte registrado");
    setForm({ fecha: new Date().toISOString().slice(0, 10), monto: 0 });
  }

  function eliminarAporte(id: string) {
    setData((d) => ({
      ...d,
      configuracion: {
        ...d.configuracion,
        caja_inteligente: { ...d.configuracion.caja_inteligente, asignaciones: d.configuracion.caja_inteligente.asignaciones.filter((a) => a.id !== id) },
      },
    }));
  }

  const previewReinversion = Math.round((form.monto * ci.porcentaje_reinversion) / 100);
  const previewSeguridad = form.monto - previewReinversion;

  return (
    <div>
      <StatGrid>
        <KpiCard label="Total aportado" value={fARS(totalAportado)} color="gold" />
        <KpiCard label="Destinado a reinversión" value={fARS(totalReinversion)} color="green" />
        <KpiCard label="Destinado a margen de seguridad" value={fARS(totalSeguridad)} color="blue" />
      </StatGrid>

      <Card title="Cómo se reparte cada aporte">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="% Reinversión (maquinaria)">
            <Input
              type="number"
              value={pctReinversion}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPctReinversion(v);
                setPctSeguridad(100 - v);
              }}
            />
          </Field>
          <Field label="% Margen de seguridad">
            <Input
              type="number"
              value={pctSeguridad}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPctSeguridad(v);
                setPctReinversion(100 - v);
              }}
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardarPorcentajes}>Guardar reparto</Button>
        </div>
      </Card>

      <Card title="Registrar aporte mensual">
        <p className="mb-3 text-[12.5px] text-text3">
          Elegí el mes al que corresponde el monto — podés cargar meses anteriores, no hace falta que sea el mes actual.
        </p>
        <FormGrid>
          <Field label="Mes (fecha de referencia)">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Monto total del mes">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
          </Field>
        </FormGrid>
        {form.monto > 0 && (
          <p className="mt-2 text-[12.5px] text-text2">
            Se reparte: <span className="font-medium text-green">{fARS(previewReinversion)}</span> a reinversión y{" "}
            <span className="font-medium text-blue">{fARS(previewSeguridad)}</span> a margen de seguridad.
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button onClick={agregarAporte}>+ Agregar aporte</Button>
        </div>
      </Card>

      <Card title="Historial de aportes">
        {aportesOrdenados.length === 0 ? (
          <EmptyState text="Todavía no cargaste ningún aporte." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Mes</Th>
                  <Th>Monto total</Th>
                  <Th>Reinversión</Th>
                  <Th>Margen de seguridad</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {aportesOrdenados.map((a) => {
                  const reinv = Math.round((a.monto * ci.porcentaje_reinversion) / 100);
                  const seg = a.monto - reinv;
                  return (
                    <TrHover key={a.id}>
                      <Td main>{a.fecha}</Td>
                      <Td>{fARS(a.monto)}</Td>
                      <Td className="text-green">{fARS(reinv)}</Td>
                      <Td className="text-blue">{fARS(seg)}</Td>
                      <Td>
                        <Button size="sm" variant="danger" onClick={() => eliminarAporte(a.id)}>
                          Eliminar
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
    </div>
  );
}

export function Finanzas() {
  const [tab, setTab] = useState("caja");
  return (
    <div>
      <PageHeader title="Finanzas" sub="Caja, ingresos y egresos, gastos, activos, reinversión y rentabilidad" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "caja", label: "Caja y bancos" },
          { value: "movimientos", label: "Ingresos y egresos" },
          { value: "gastos", label: "Gastos" },
          { value: "activos", label: "Activos e inversiones" },
          { value: "reinversion", label: "Reinversión" },
          { value: "rentabilidad", label: "Rentabilidad" },
        ]}
      />
      {tab === "caja" && <CajaTab />}
      {tab === "movimientos" && <IngresosEgresosTab />}
      {tab === "gastos" && <GastosTab />}
      {tab === "activos" && <ActivosTab />}
      {tab === "reinversion" && <ReinversionTab />}
      {tab === "rentabilidad" && <RentabilidadTab />}
    </div>
  );
}
