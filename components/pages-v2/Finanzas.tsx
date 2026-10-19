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
  InfoRow,
} from "@/components/ui";
import { FondoReposicionCard } from "@/components/FondoReposicionCard";
import { Modal } from "@/components/Modal";
import {
  fARS,
  fNum,
  saldoCaja,
  saldoCajaAlFecha,
  ORIGENES_CAJA_REAL,
  calcularEerr,
  calcularFlujoCaja,
  primerDiaMes,
  ultimoDiaMes,
  calcularCuentasPorCobrar,
  calcularCuentasPorPagar,
  calcularDineroLibre,
  pedidosPendientesAntesDe,
  saldarPedidosHistoricos,
  comprasPendientesAntesDe,
  saldarComprasHistoricas,
} from "@/lib/calc-v2";
import type { EerrLinea, CuentaPorCobrar, CuentaPorPagar } from "@/lib/calc-v2";
import { useRouter } from "@/lib/nav-context";
import { ResumenSheetsButton } from "./ResumenSheets";

function nombreCategoria(data: ReturnType<typeof useStoreV2>["data"], id: string | undefined) {
  return data.categorias.find((c) => c.id === id)?.nombre ?? "—";
}

type TipoEspecialMovimiento = "normal" | "ajuste_saldo" | "aporte_dueno" | "retiro_dueno" | "prestamo_recibido" | "devolucion_prestamo";

// Tipo de movimiento -> dirección de caja fija (ingreso/egreso) cuando la dirección no la elige
// el usuario — un aporte del dueño siempre es un ingreso, un retiro siempre un egreso, etc. "normal"
// y "ajuste_saldo" son los únicos que pueden ir en cualquier sentido.
const DIRECCION_FIJA: Partial<Record<TipoEspecialMovimiento, "ingreso" | "egreso">> = {
  aporte_dueno: "ingreso",
  retiro_dueno: "egreso",
  prestamo_recibido: "ingreso",
  devolucion_prestamo: "egreso",
};

const LABEL_TIPO_ESPECIAL: Record<TipoEspecialMovimiento, string> = {
  normal: "Movimiento normal",
  ajuste_saldo: "Ajuste de saldo (corrige un saldo mal cargado)",
  aporte_dueno: "Aporte del dueño",
  retiro_dueno: "Retiro del dueño",
  prestamo_recibido: "Préstamo recibido",
  devolucion_prestamo: "Devolución de préstamo",
};

const AYUDA_TIPO_ESPECIAL: Partial<Record<TipoEspecialMovimiento, string>> = {
  ajuste_saldo: "Corrige el saldo de la cuenta pero nunca es una venta ni un gasto: no entra al Estado de Resultados ni afecta la rentabilidad del negocio. Requiere un motivo.",
  aporte_dueno: "El dueño pone plata en el negocio: aumenta la caja y el patrimonio, pero nunca es una venta ni una ganancia.",
  retiro_dueno: "El dueño saca plata del negocio: disminuye la caja y el patrimonio, pero nunca es un gasto operativo — no reduce el resultado del negocio.",
  prestamo_recibido: "Entra plata prestada: aumenta la caja y la deuda, pero no es una venta ni un ingreso del Estado de Resultados.",
  devolucion_prestamo: "Se devuelve el capital de un préstamo: sale plata de la caja y baja la deuda, pero no es un gasto — solo los intereses, si los hay, se cargan aparte como gasto financiero.",
};

function CajaTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tipo: "ingreso" as "ingreso" | "egreso",
    tipoEspecial: "normal" as TipoEspecialMovimiento,
    concepto: "",
    monto: 0,
    metodo_pago: "",
  });

  const saldo = saldoCaja(data);
  const movimientosCaja = useMemo(
    () =>
      data.movimientos_financieros
        .filter((m) => (m.origen_tipo && ORIGENES_CAJA_REAL.includes(m.origen_tipo)) || m.tipo === "transferencia")
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.movimientos_financieros]
  );

  const esAjuste = form.tipoEspecial === "ajuste_saldo";
  const direccionFija = DIRECCION_FIJA[form.tipoEspecial];
  const tipoEfectivo = direccionFija ?? form.tipo;

  function registrar() {
    if (!form.concepto.trim() || form.monto <= 0) {
      toast(esAjuste ? "Completá el motivo del ajuste y un monto mayor a 0" : "Completá el concepto y un monto mayor a 0", "error");
      return;
    }
    setData((d) => ({
      ...d,
      movimientos_financieros: [
        ...d.movimientos_financieros,
        {
          id: uid("MOVF"),
          fecha: form.fecha,
          tipo: tipoEfectivo,
          concepto: form.concepto,
          monto: form.monto,
          metodo_pago: form.metodo_pago || undefined,
          origen_tipo: form.tipoEspecial === "normal" ? "caja_manual" : form.tipoEspecial,
          estado: "confirmado",
        },
      ],
    }));
    toast(`${LABEL_TIPO_ESPECIAL[form.tipoEspecial]} registrado`);
    setModalOpen(false);
    setForm({ fecha: new Date().toISOString().slice(0, 10), tipo: "ingreso", tipoEspecial: "normal", concepto: "", monto: 0, metodo_pago: "" });
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, movimientos_financieros: d.movimientos_financieros.filter((m) => m.id !== id) }));
    toast("Movimiento eliminado");
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
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {movimientosCaja.slice(0, 200).map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge color={m.tipo === "ingreso" ? "green" : m.tipo === "egreso" ? "red" : "blue"}>{m.tipo}</Badge>
                        {m.origen_tipo && m.origen_tipo !== "caja_manual" && m.origen_tipo in LABEL_TIPO_ESPECIAL && (
                          <Badge color="orange">{LABEL_TIPO_ESPECIAL[m.origen_tipo as TipoEspecialMovimiento]}</Badge>
                        )}
                      </div>
                    </Td>
                    <Td main>{m.concepto}</Td>
                    <Td className={m.tipo === "egreso" ? "text-red" : "text-green"}>{fARS(m.monto)}</Td>
                    <Td>{m.metodo_pago ?? "—"}</Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => eliminar(m.id)}>
                        Eliminar
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
          {!direccionFija && (
            <Field label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as "ingreso" | "egreso" })}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </Select>
            </Field>
          )}
          <Field label="Tipo de movimiento" full={!!direccionFija}>
            <Select value={form.tipoEspecial} onChange={(e) => setForm({ ...form, tipoEspecial: e.target.value as TipoEspecialMovimiento })}>
              {Object.entries(LABEL_TIPO_ESPECIAL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {AYUDA_TIPO_ESPECIAL[form.tipoEspecial] && <p className="mt-1.5 text-[12px] text-text3">{AYUDA_TIPO_ESPECIAL[form.tipoEspecial]}</p>}
          </Field>
          <Field label={esAjuste ? "Motivo del ajuste (obligatorio)" : "Concepto"} full>
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
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [search, setSearch] = useState("");

  const filtrados = useMemo(
    () =>
      data.movimientos_financieros
        .filter((m) => {
          if (tipoFiltro === "todos") return true;
          if (tipoFiltro === "ajustes") return m.origen_tipo === "ajuste_saldo";
          if (tipoFiltro === "pendientes") return m.estado === "pendiente";
          return m.tipo === tipoFiltro;
        })
        .filter((m) => !search || m.concepto.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.movimientos_financieros, tipoFiltro, search]
  );

  function eliminar(id: string) {
    setData((d) => ({ ...d, movimientos_financieros: d.movimientos_financieros.filter((m) => m.id !== id) }));
    toast("Movimiento eliminado");
  }

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
          { value: "ajustes", label: "Ajustes de saldo" },
          { value: "pendientes", label: "Pendientes" },
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
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 300).map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge color={m.tipo === "ingreso" ? "green" : m.tipo === "egreso" ? "red" : "blue"}>{m.tipo}</Badge>
                        {m.origen_tipo === "ajuste_saldo" && <Badge color="orange">Ajuste</Badge>}
                      </div>
                    </Td>
                    <Td>{nombreCategoria(data, m.categoria_id)}</Td>
                    <Td main>{m.concepto}</Td>
                    <Td className={m.tipo === "egreso" ? "text-red" : "text-green"}>{fARS(m.monto)}</Td>
                    <Td>
                      <Badge color={m.estado === "confirmado" ? "green" : "orange"}>{m.estado}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" variant="danger" onClick={() => eliminar(m.id)}>
                        Eliminar
                      </Button>
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
  "Gastos Financieros": (sub) => `Gastos Financieros — ${sub}`,
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
    const prefijos = ["Costo Fijo — ", "Costo Indirecto — ", "Gasto Operativo — ", "Gastos Financieros — "];
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
      <Card title="Costos fijos, indirectos, gastos operativos y financieros">
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
              <option value="Gastos Financieros">Gastos financieros (intereses, comisiones…)</option>
            </Select>
          </Field>
          {(form.grupo === "Costo Fijo" || form.grupo === "Gasto Operativo" || form.grupo === "Gastos Financieros") && (
            <Field label="Subcategoría">
              <Input
                value={form.subcategoria}
                onChange={(e) => setForm({ ...form, subcategoria: e.target.value })}
                placeholder={form.grupo === "Gastos Financieros" ? "Intereses, Comisiones bancarias…" : "Alquiler, Sueldos…"}
              />
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

function fARS2(n: number | null | undefined): string {
  const v = n ?? 0;
  return v.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
type ModoPeriodoInventario = "mes" | "3m" | "6m" | "12m" | "anio" | "rango";

function restarMeses(mes: number, anio: number, n: number): { mes: number; anio: number } {
  const d = new Date(anio, mes - 1 - n, 1);
  return { mes: d.getMonth() + 1, anio: d.getFullYear() };
}

function resolverRangoInventario(modo: ModoPeriodoInventario, mes: number, anio: number, desdeManual: string, hastaManual: string): { desde: string; hasta: string } {
  if (modo === "rango") return { desde: desdeManual, hasta: hastaManual };
  if (modo === "anio") return { desde: primerDiaMes(1, anio), hasta: ultimoDiaMes(12, anio) };
  const nMeses = modo === "mes" ? 0 : modo === "3m" ? 2 : modo === "6m" ? 5 : 11;
  const inicio = restarMeses(mes, anio, nMeses);
  return { desde: primerDiaMes(inicio.mes, inicio.anio), hasta: ultimoDiaMes(mes, anio) };
}

function FilaDetalleVista({
  label,
  monto,
  linea,
  expandido,
  onToggle,
  colorSiNegativo,
}: {
  label: string;
  monto: number;
  linea?: EerrLinea;
  expandido: boolean;
  onToggle: () => void;
  colorSiNegativo?: boolean;
}) {
  const tieneRegistros = (linea?.registros.length ?? 0) > 0;
  return (
    <>
      <tr className={tieneRegistros ? "cursor-pointer" : ""} onClick={tieneRegistros ? onToggle : undefined}>
        <Td main>
          {tieneRegistros && <span className="mr-1.5 text-text3">{expandido ? "▾" : "▸"}</span>}
          {label}
        </Td>
        <Td className={colorSiNegativo && monto < 0 ? "text-red" : ""}>{fARS2(monto)}</Td>
      </tr>
      {expandido && tieneRegistros && (
        <tr>
          <Td colSpan={2}>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface2/40 p-2">
              <table className="w-full text-[12px]">
                <tbody>
                  {linea!.registros.map((r, i) => (
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

function GraficoFlujoMensual({ meses }: { meses: { label: string; entradas: number; salidas: number }[] }) {
  if (meses.length === 0) return null;
  const max = Math.max(1, ...meses.flatMap((m) => [m.entradas, m.salidas]));
  const alto = 110;
  const anchoBarra = 16;
  const gap = 3;
  const anchoGrupo = anchoBarra * 2 + gap + 14;
  const anchoTotal = meses.length * anchoGrupo;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${anchoTotal} ${alto + 30}`} className="text-text2" style={{ height: 150, minWidth: anchoTotal }}>
        {meses.map((m, i) => {
          const x0 = i * anchoGrupo;
          const hEntradas = (m.entradas / max) * alto;
          const hSalidas = (m.salidas / max) * alto;
          return (
            <g key={i}>
              <rect x={x0} y={alto - hEntradas} width={anchoBarra} height={hEntradas} fill="#2dbe6c" rx={2} />
              <rect x={x0 + anchoBarra + gap} y={alto - hSalidas} width={anchoBarra} height={hSalidas} fill="#e5484d" rx={2} />
              <text x={x0 + anchoBarra} y={alto + 14} fontSize="9" textAnchor="middle" fill="currentColor">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-text3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#2dbe6c" }} /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#e5484d" }} /> Salidas
        </span>
      </div>
    </div>
  );
}

function FlujoCajaTab() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();

  const [modo, setModo] = useState<ModoPeriodoInventario>("mes");
  const [desdeManual, setDesdeManual] = useState(primerDiaMes(mes, anio));
  const [hastaManual, setHastaManual] = useState(ultimoDiaMes(mes, anio));
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const { desde, hasta } = useMemo(() => resolverRangoInventario(modo, mes, anio, desdeManual, hastaManual), [modo, mes, anio, desdeManual, hastaManual]);
  const f = useMemo(() => calcularFlujoCaja(data, desde, hasta), [data, desde, hasta]);

  function toggle(id: string) {
    setExpandido((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <Card title="Flujo de caja" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Explica cómo cambió la plata disponible — nunca se confunde con el resultado económico (Estado de
          Resultados). Una venta entregada no cobrada no mueve caja todavía (se cobra desde Cuentas pendientes); una
          compra confirmada no pagada tampoco.
        </p>
        <FilterTabs
          value={modo}
          onChange={(v) => setModo(v as ModoPeriodoInventario)}
          options={[
            { value: "mes", label: `Mes actual (${MESES[mes - 1]})` },
            { value: "3m", label: "Últimos 3 meses" },
            { value: "6m", label: "Últimos 6 meses" },
            { value: "12m", label: "Últimos 12 meses" },
            { value: "anio", label: `Año ${anio}` },
            { value: "rango", label: "Rango personalizado" },
          ]}
        />
        {modo === "rango" && (
          <div className="mt-3 flex flex-wrap gap-3">
            <Field label="Desde">
              <Input type="date" value={desdeManual} onChange={(e) => setDesdeManual(e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={hastaManual} onChange={(e) => setHastaManual(e.target.value)} />
            </Field>
          </div>
        )}
      </Card>

      <StatGrid>
        <KpiCard label="Saldo inicial" value={fARS2(f.saldo_inicial)} color="blue" />
        <KpiCard label="Saldo final" value={fARS2(f.saldo_final)} color={f.saldo_final >= 0 ? "green" : "red"} />
        <KpiCard label="Flujo operativo" value={fARS2(f.flujo_operativo)} color={f.flujo_operativo >= 0 ? "green" : "red"} />
        <KpiCard label="Flujo de inversión" value={fARS2(f.flujo_inversion)} color={f.flujo_inversion >= 0 ? "green" : "orange"} />
        <KpiCard label="Flujo de financiación" value={fARS2(f.flujo_financiacion)} color="blue" />
        <KpiCard label="Variación de caja" value={fARS2(f.variacion_caja)} color={f.variacion_caja >= 0 ? "green" : "red"} />
      </StatGrid>

      <Card title="Cómo cambió la caja en el período">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th>Importe</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td main>Saldo inicial</Td>
                <Td>{fARS2(f.saldo_inicial)}</Td>
              </tr>
              <FilaDetalleVista label="+ Cobros de clientes" monto={f.cobros_clientes.total} linea={f.cobros_clientes} expandido={!!expandido.cobros} onToggle={() => toggle("cobros")} />
              <FilaDetalleVista label="+ Otros ingresos" monto={f.otros_ingresos.total} linea={f.otros_ingresos} expandido={!!expandido.otros} onToggle={() => toggle("otros")} />
              <FilaDetalleVista
                label="− Pagos a proveedores"
                monto={-f.pagos_compras.total}
                linea={f.pagos_compras}
                expandido={!!expandido.pagos}
                onToggle={() => toggle("pagos")}
                colorSiNegativo
              />
              <FilaDetalleVista
                label="− Gastos pagados"
                monto={-f.gastos_pagados.total}
                linea={f.gastos_pagados}
                expandido={!!expandido.gastos}
                onToggle={() => toggle("gastos")}
                colorSiNegativo
              />
              <tr className="bg-surface2/40 font-semibold">
                <Td main>= Flujo operativo</Td>
                <Td className={f.flujo_operativo >= 0 ? "text-green" : "text-red"}>{fARS2(f.flujo_operativo)}</Td>
              </tr>
              <FilaDetalleVista
                label="− Inversiones (compra de activos)"
                monto={-f.inversiones.total}
                linea={f.inversiones}
                expandido={!!expandido.inversiones}
                onToggle={() => toggle("inversiones")}
                colorSiNegativo
              />
              <tr className="bg-surface2/40 font-semibold">
                <Td main>= Flujo de inversión</Td>
                <Td className={f.flujo_inversion >= 0 ? "text-green" : "text-red"}>{fARS2(f.flujo_inversion)}</Td>
              </tr>
              <FilaDetalleVista label="+ Préstamos recibidos" monto={f.prestamos_recibidos.total} linea={f.prestamos_recibidos} expandido={!!expandido.prestamos} onToggle={() => toggle("prestamos")} />
              <FilaDetalleVista
                label="− Devolución de préstamos"
                monto={-f.devolucion_prestamos.total}
                linea={f.devolucion_prestamos}
                expandido={!!expandido.devolucion}
                onToggle={() => toggle("devolucion")}
                colorSiNegativo
              />
              <FilaDetalleVista label="+ Aportes del dueño" monto={f.aportes_dueno.total} linea={f.aportes_dueno} expandido={!!expandido.aportes} onToggle={() => toggle("aportes")} />
              <FilaDetalleVista
                label="− Retiros del dueño"
                monto={-f.retiros_dueno.total}
                linea={f.retiros_dueno}
                expandido={!!expandido.retiros}
                onToggle={() => toggle("retiros")}
                colorSiNegativo
              />
              <tr className="bg-surface2/40 font-semibold">
                <Td main>= Flujo de financiación</Td>
                <Td className={f.flujo_financiacion >= 0 ? "text-green" : "text-red"}>{fARS2(f.flujo_financiacion)}</Td>
              </tr>
              <FilaDetalleVista label="+/− Ajustes de saldo" monto={f.ajustes_saldo.total} linea={f.ajustes_saldo} expandido={!!expandido.ajustes} onToggle={() => toggle("ajustes")} />
              <tr className="bg-surface2/60 font-semibold">
                <Td main>= Variación de caja</Td>
                <Td className={f.variacion_caja >= 0 ? "text-green" : "text-red"}>{fARS2(f.variacion_caja)}</Td>
              </tr>
              <tr className="bg-surface2/60 font-semibold">
                <Td main>= Saldo final</Td>
                <Td className={f.saldo_final >= 0 ? "text-green" : "text-red"}>{fARS2(f.saldo_final)}</Td>
              </tr>
              <FilaDetalleVista
                label="+/− Transferencias entre cuentas propias (no afecta el total)"
                monto={f.transferencias.total}
                linea={f.transferencias}
                expandido={!!expandido.transferencias}
                onToggle={() => toggle("transferencias")}
              />
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Saldo por cuenta / método de pago">
          {f.por_cuenta.length === 0 ? (
            <EmptyState text="Sin movimientos en el período." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Cuenta</Th>
                    <Th>Inicial</Th>
                    <Th>Entradas</Th>
                    <Th>Salidas</Th>
                    <Th>Final</Th>
                  </tr>
                </thead>
                <tbody>
                  {f.por_cuenta.map((c) => (
                    <TrHover key={c.cuenta}>
                      <Td main>{c.cuenta}</Td>
                      <Td>{fARS2(c.saldo_inicial)}</Td>
                      <Td className="text-green">{fARS2(c.entradas)}</Td>
                      <Td className="text-red">{fARS2(c.salidas)}</Td>
                      <Td className={c.saldo_final >= 0 ? "text-green" : "text-red"}>{fARS2(c.saldo_final)}</Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <Card title="Ingresos y egresos por categoría">
          {f.por_categoria.length === 0 ? (
            <EmptyState text="Sin movimientos en el período." />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Categoría</Th>
                    <Th>Neto</Th>
                  </tr>
                </thead>
                <tbody>
                  {f.por_categoria.map((c) => (
                    <TrHover key={c.categoria}>
                      <Td main>{c.categoria}</Td>
                      <Td className={c.monto >= 0 ? "text-green" : "text-red"}>{fARS2(c.monto)}</Td>
                    </TrHover>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card title="Evolución mensual">
        <GraficoFlujoMensual meses={f.evolucion_mensual} />
        <TableWrap>
          <table className="mt-3 w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Entradas</Th>
                <Th>Salidas</Th>
                <Th>Saldo final</Th>
              </tr>
            </thead>
            <tbody>
              {f.evolucion_mensual.map((m, i) => (
                <TrHover key={i}>
                  <Td main>{m.label}</Td>
                  <Td className="text-green">{fARS2(m.entradas)}</Td>
                  <Td className="text-red">{fARS2(m.salidas)}</Td>
                  <Td className={m.saldo_final >= 0 ? "text-green" : "text-red"}>{fARS2(m.saldo_final)}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card title="Evolución diaria (días con movimiento)">
        {f.evolucion_diaria.length === 0 ? (
          <EmptyState text="Sin movimientos en el período." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {f.evolucion_diaria.map((d, i) => (
                  <TrHover key={i}>
                    <Td main>{d.fecha}</Td>
                    <Td className={d.saldo >= 0 ? "text-green" : "text-red"}>{fARS2(d.saldo)}</Td>
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

const ESTADO_CUENTA_COLOR: Record<string, "green" | "orange" | "red" | "blue"> = {
  Pendiente: "orange",
  Parcial: "blue",
  Cobrado: "green",
  Pagado: "green",
  Vencido: "red",
};

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function CuentasPorCobrarTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [cobrando, setCobrando] = useState<CuentaPorCobrar | null>(null);
  const [form, setForm] = useState({ fecha: hoyIso(), monto: 0, metodo_pago: "" });
  const [saldarAbierto, setSaldarAbierto] = useState(false);
  const [corteSaldar, setCorteSaldar] = useState(data.configuracion.fecha_saldo_inicial_caja || "2026-09-01");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const cuentas = useMemo(() => calcularCuentasPorCobrar(data, hoyIso()), [data]);
  const totalPendiente = cuentas.reduce((acc, c) => acc + c.saldo, 0);

  const historicos = useMemo(() => (saldarAbierto ? pedidosPendientesAntesDe(data, corteSaldar) : []), [saldarAbierto, data, corteSaldar]);
  const historicosSeleccionados = historicos.filter((h) => !excluidos.has(h.pedido_id));
  const totalHistoricoSeleccionado = historicosSeleccionados.reduce((acc, h) => acc + h.saldo, 0);

  function abrirSaldarHistoricos() {
    setCorteSaldar(data.configuracion.fecha_saldo_inicial_caja || "2026-09-01");
    setExcluidos(new Set());
    setSaldarAbierto(true);
  }
  function toggleExcluido(pedidoId: string) {
    setExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId);
      else next.add(pedidoId);
      return next;
    });
  }
  function confirmarSaldarHistoricos() {
    const ids = historicosSeleccionados.map((h) => h.pedido_id);
    if (ids.length === 0) return;
    if (!confirm(`¿Saldar ${ids.length} pedido(s) por ${fARS(totalHistoricoSeleccionado)}? No se registra ningún cobro nuevo en caja — se asume que esa plata ya se cobró en su momento, antes de controlar la caja en la app.`))
      return;
    setData((d) => saldarPedidosHistoricos(d, ids, hoyIso()));
    toast(`${ids.length} pedido(s) saldado(s) como histórico — no se tocó la caja`);
    setSaldarAbierto(false);
  }

  function abrirCobro(c: CuentaPorCobrar) {
    setCobrando(c);
    setForm({ fecha: hoyIso(), monto: c.saldo, metodo_pago: "" });
  }

  function registrarCobro() {
    if (!cobrando) return;
    if (form.monto <= 0) {
      toast("El monto tiene que ser mayor a 0", "error");
      return;
    }
    if (form.monto > cobrando.saldo) {
      toast(`Atención: el cobro (${fARS(form.monto)}) supera el saldo pendiente (${fARS(cobrando.saldo)})`, "error");
      return;
    }
    setData((d) => ({
      ...d,
      movimientos_financieros: [
        ...d.movimientos_financieros,
        {
          id: uid("MOVF"),
          fecha: form.fecha,
          tipo: "ingreso",
          concepto: `Cobro pedido ${cobrando.pedido_id}`,
          monto: form.monto,
          metodo_pago: form.metodo_pago || undefined,
          origen_tipo: "venta_pedido",
          origen_id: cobrando.pedido_id,
          estado: "confirmado",
        },
      ],
    }));
    toast("Cobro registrado — aumenta la caja y reduce la cuenta por cobrar");
    setCobrando(null);
  }

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-text3">
        Un pedido entregado es una venta, pero no siempre plata cobrada: acá se ve lo que todavía falta cobrar. Registrar
        un cobro (total o parcial) aumenta la caja y reduce este saldo — la venta ya está reconocida en el Estado de
        Resultados desde que se entregó, así que cobrar no la vuelve a contar.
      </p>
      <StatGrid>
        <KpiCard label="Total por cobrar" value={fARS(totalPendiente)} color={totalPendiente > 0 ? "orange" : "green"} />
        <KpiCard label="Cuentas abiertas" value={fNum(cuentas.length, 0)} color="blue" />
      </StatGrid>
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" onClick={abrirSaldarHistoricos}>
          Saldar históricos…
        </Button>
      </div>
      <Card>
        {cuentas.length === 0 ? (
          <EmptyState text="No hay cuentas por cobrar abiertas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Pedido</Th>
                  <Th>Fecha</Th>
                  <Th>Total</Th>
                  <Th>Cobrado</Th>
                  <Th>Saldo pendiente</Th>
                  <Th>Fecha esperada</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => (
                  <TrHover key={c.pedido_id}>
                    <Td main>{data.clientes.find((cl) => cl.id === c.cliente_id)?.nombre ?? "—"}</Td>
                    <Td>{c.pedido_id}</Td>
                    <Td>{c.fecha}</Td>
                    <Td>{fARS(c.total)}</Td>
                    <Td className="text-green">{fARS(c.cobrado)}</Td>
                    <Td className="text-orange">{fARS(c.saldo)}</Td>
                    <Td>{c.fecha_vencimiento ?? "—"}</Td>
                    <Td>
                      <Badge color={ESTADO_CUENTA_COLOR[c.estado]}>{c.estado}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" onClick={() => abrirCobro(c)}>
                        Registrar cobro
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
        open={!!cobrando}
        onClose={() => setCobrando(null)}
        title={cobrando ? `Registrar cobro — Pedido ${cobrando.pedido_id}` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCobrando(null)}>
              Cancelar
            </Button>
            <Button onClick={registrarCobro}>Registrar cobro</Button>
          </>
        }
      >
        {cobrando && (
          <FormGrid>
            <InfoRow label="Saldo pendiente" value={fARS(cobrando.saldo)} />
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Monto cobrado">
              <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
            </Field>
            <Field label="Método de pago">
              <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
            </Field>
          </FormGrid>
        )}
      </Modal>

      <Modal
        open={saldarAbierto}
        onClose={() => setSaldarAbierto(false)}
        title="Saldar históricos"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaldarAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarSaldarHistoricos} disabled={historicosSeleccionados.length === 0}>
              Saldar {historicosSeleccionados.length} pedido{historicosSeleccionados.length === 1 ? "" : "s"} ({fARS(totalHistoricoSeleccionado)})
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[12.5px] text-text3">
          Ventas anteriores a la fecha de corte que ya cobraste en su momento pero nunca se registró el cobro. Saldarlas
          las saca de esta lista — no genera ningún ingreso de caja (esa plata no entra de nuevo ahora, ya entró hace
          tiempo). Destildá las que de verdad todavía te deban.
        </p>
        <Field label="Fecha de corte" full>
          <Input type="date" value={corteSaldar} onChange={(e) => setCorteSaldar(e.target.value)} className="w-40" />
        </Field>
        {historicos.length === 0 ? (
          <EmptyState text="No hay pedidos con saldo pendiente anteriores a esa fecha." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th></Th>
                  <Th>Cliente</Th>
                  <Th>Pedido</Th>
                  <Th>Fecha</Th>
                  <Th>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {historicos.map((h) => (
                  <TrHover key={h.pedido_id}>
                    <Td>
                      <input type="checkbox" checked={!excluidos.has(h.pedido_id)} onChange={() => toggleExcluido(h.pedido_id)} />
                    </Td>
                    <Td main>{data.clientes.find((cl) => cl.id === h.cliente_id)?.nombre ?? "—"}</Td>
                    <Td>{h.pedido_id}</Td>
                    <Td>{h.fecha}</Td>
                    <Td className="text-orange">{fARS(h.saldo)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Modal>
    </div>
  );
}

function CuentasPorPagarTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [pagando, setPagando] = useState<CuentaPorPagar | null>(null);
  const [form, setForm] = useState({ fecha: hoyIso(), monto: 0, metodo_pago: "" });
  const [saldarAbierto, setSaldarAbierto] = useState(false);
  const [corteSaldar, setCorteSaldar] = useState(data.configuracion.fecha_saldo_inicial_caja || "2026-09-01");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const cuentas = useMemo(() => calcularCuentasPorPagar(data, hoyIso()), [data]);
  const totalPendiente = cuentas.reduce((acc, c) => acc + c.saldo, 0);

  const historicos = useMemo(() => (saldarAbierto ? comprasPendientesAntesDe(data, corteSaldar) : []), [saldarAbierto, data, corteSaldar]);
  const historicosSeleccionados = historicos.filter((h) => !excluidos.has(h.compra_id));
  const totalHistoricoSeleccionado = historicosSeleccionados.reduce((acc, h) => acc + h.saldo, 0);

  function abrirSaldarHistoricos() {
    setCorteSaldar(data.configuracion.fecha_saldo_inicial_caja || "2026-09-01");
    setExcluidos(new Set());
    setSaldarAbierto(true);
  }
  function toggleExcluido(compraId: string) {
    setExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(compraId)) next.delete(compraId);
      else next.add(compraId);
      return next;
    });
  }
  function confirmarSaldarHistoricos() {
    const ids = historicosSeleccionados.map((h) => h.compra_id);
    if (ids.length === 0) return;
    if (!confirm(`¿Saldar ${ids.length} compra(s) por ${fARS(totalHistoricoSeleccionado)}? No se registra ningún pago nuevo en caja — se asume que esa plata ya se pagó en su momento, antes de controlar la caja en la app.`))
      return;
    setData((d) => saldarComprasHistoricas(d, ids, hoyIso()));
    toast(`${ids.length} compra(s) saldada(s) como histórico — no se tocó la caja`);
    setSaldarAbierto(false);
  }

  function abrirPago(c: CuentaPorPagar) {
    setPagando(c);
    setForm({ fecha: hoyIso(), monto: c.saldo, metodo_pago: "" });
  }

  function registrarPago() {
    if (!pagando) return;
    if (form.monto <= 0) {
      toast("El monto tiene que ser mayor a 0", "error");
      return;
    }
    if (form.monto > pagando.saldo) {
      toast(`Atención: el pago (${fARS(form.monto)}) supera el saldo pendiente (${fARS(pagando.saldo)})`, "error");
      return;
    }
    setData((d) => ({
      ...d,
      movimientos_financieros: [
        ...d.movimientos_financieros,
        {
          id: uid("MOVF"),
          fecha: form.fecha,
          tipo: "egreso",
          concepto: `Pago compra ${pagando.compra_id}`,
          monto: form.monto,
          metodo_pago: form.metodo_pago || undefined,
          origen_tipo: "compra_pago",
          origen_id: pagando.compra_id,
          estado: "confirmado",
        },
      ],
    }));
    toast("Pago registrado — disminuye la caja y reduce la cuenta por pagar");
    setPagando(null);
  }

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-text3">
        Confirmar una compra no es lo mismo que pagarla: acá se ve lo que todavía falta pagar a los proveedores.
        Registrar un pago (total o parcial) disminuye la caja y reduce este saldo.
      </p>
      <StatGrid>
        <KpiCard label="Total por pagar" value={fARS(totalPendiente)} color={totalPendiente > 0 ? "orange" : "green"} />
        <KpiCard label="Cuentas abiertas" value={fNum(cuentas.length, 0)} color="blue" />
      </StatGrid>
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" onClick={abrirSaldarHistoricos}>
          Saldar históricos…
        </Button>
      </div>
      <Card>
        {cuentas.length === 0 ? (
          <EmptyState text="No hay cuentas por pagar abiertas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Proveedor</Th>
                  <Th>Compra</Th>
                  <Th>Fecha</Th>
                  <Th>Total</Th>
                  <Th>Pagado</Th>
                  <Th>Saldo pendiente</Th>
                  <Th>Vencimiento</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => (
                  <TrHover key={c.compra_id}>
                    <Td main>{data.proveedores.find((p) => p.id === c.proveedor_id)?.nombre ?? "—"}</Td>
                    <Td>{c.compra_id}</Td>
                    <Td>{c.fecha}</Td>
                    <Td>{fARS(c.total)}</Td>
                    <Td className="text-green">{fARS(c.pagado)}</Td>
                    <Td className="text-orange">{fARS(c.saldo)}</Td>
                    <Td>{c.fecha_vencimiento ?? "—"}</Td>
                    <Td>
                      <Badge color={ESTADO_CUENTA_COLOR[c.estado]}>{c.estado}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" onClick={() => abrirPago(c)}>
                        Registrar pago
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
        open={!!pagando}
        onClose={() => setPagando(null)}
        title={pagando ? `Registrar pago — Compra ${pagando.compra_id}` : ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPagando(null)}>
              Cancelar
            </Button>
            <Button onClick={registrarPago}>Registrar pago</Button>
          </>
        }
      >
        {pagando && (
          <FormGrid>
            <InfoRow label="Saldo pendiente" value={fARS(pagando.saldo)} />
            <Field label="Fecha">
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </Field>
            <Field label="Monto pagado">
              <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} />
            </Field>
            <Field label="Método de pago">
              <Input value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} />
            </Field>
          </FormGrid>
        )}
      </Modal>

      <Modal
        open={saldarAbierto}
        onClose={() => setSaldarAbierto(false)}
        title="Saldar históricos"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaldarAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarSaldarHistoricos} disabled={historicosSeleccionados.length === 0}>
              Saldar {historicosSeleccionados.length} compra{historicosSeleccionados.length === 1 ? "" : "s"} ({fARS(totalHistoricoSeleccionado)})
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[12.5px] text-text3">
          Compras anteriores a la fecha de corte que ya pagaste en su momento pero nunca se registró el pago. Saldarlas
          las saca de esta lista — no genera ningún egreso de caja (esa plata no sale de nuevo ahora, ya salió hace
          tiempo). Destildá las que de verdad todavía debas.
        </p>
        <Field label="Fecha de corte" full>
          <Input type="date" value={corteSaldar} onChange={(e) => setCorteSaldar(e.target.value)} className="w-40" />
        </Field>
        {historicos.length === 0 ? (
          <EmptyState text="No hay compras con saldo pendiente anteriores a esa fecha." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th></Th>
                  <Th>Proveedor</Th>
                  <Th>Compra</Th>
                  <Th>Fecha</Th>
                  <Th>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {historicos.map((h) => (
                  <TrHover key={h.compra_id}>
                    <Td>
                      <input type="checkbox" checked={!excluidos.has(h.compra_id)} onChange={() => toggleExcluido(h.compra_id)} />
                    </Td>
                    <Td main>{data.proveedores.find((p) => p.id === h.proveedor_id)?.nombre ?? "—"}</Td>
                    <Td>{h.compra_id}</Td>
                    <Td>{h.fecha}</Td>
                    <Td className="text-orange">{fARS(h.saldo)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Modal>
    </div>
  );
}

// Máximo ~8 indicadores a propósito (pedido explícito de no llenar la pantalla de entrada con
// indicadores secundarios) — todo lo demás se ve entrando a la pestaña correspondiente.
function ResumenTab() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();

  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const eerr = useMemo(() => calcularEerr(data, desde, hasta), [data, desde, hasta]);
  // "Lo esencial de {mes} {año}": todo el grupo se calcula AL FINAL del período elegido, no al día
  // de hoy — si no, cambiar el selector de mes no cambiaría nada acá y mostraría el estado actual
  // disfrazado de un mes viejo.
  const saldo = useMemo(() => saldoCajaAlFecha(data, hasta), [data, hasta]);
  const libre = useMemo(() => calcularDineroLibre(data, hasta), [data, hasta]);
  const porCobrar = useMemo(() => calcularCuentasPorCobrar(data, hasta).reduce((acc, c) => acc + c.saldo, 0), [data, hasta]);
  const porPagar = useMemo(() => calcularCuentasPorPagar(data, hasta).reduce((acc, c) => acc + c.saldo, 0), [data, hasta]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="text-[12.5px] text-text3">Lo esencial de {MESES[mes - 1]} {anio} — el detalle de cada número está en su propia pestaña.</p>
        <ResumenSheetsButton />
      </div>
      <StatGrid>
        <KpiCard label="Saldo en cuentas" value={fARS(saldo)} color={saldo >= 0 ? "green" : "red"} />
        <KpiCard label="Dinero libre" value={fARS(libre.dinero_libre)} color={libre.dinero_libre >= 0 ? "blue" : "red"} sub="Descontando lo que ya está comprometido" />
        <KpiCard label="Ventas del mes" value={fARS(eerr.ventas_netas)} color="blue" />
        <KpiCard label="Por cobrar" value={fARS(porCobrar)} color={porCobrar > 0 ? "orange" : "green"} />
        <KpiCard label="Por pagar" value={fARS(porPagar)} color={porPagar > 0 ? "orange" : "green"} />
      </StatGrid>
      <FondoReposicionCard />
    </div>
  );
}

function TesoreriaTab() {
  const [subtab, setSubtab] = useState("caja");
  return (
    <div>
      <FilterTabs
        value={subtab}
        onChange={setSubtab}
        options={[
          { value: "caja", label: "Caja" },
          { value: "movimientos", label: "Movimientos" },
          { value: "porcobrar", label: "Por cobrar" },
          { value: "porpagar", label: "Por pagar" },
          { value: "gastos", label: "Gastos" },
          { value: "flujo", label: "Flujo de caja" },
        ]}
      />
      {subtab === "caja" && <CajaTab />}
      {subtab === "movimientos" && <IngresosEgresosTab />}
      {subtab === "porcobrar" && <CuentasPorCobrarTab />}
      {subtab === "porpagar" && <CuentasPorPagarTab />}
      {subtab === "gastos" && <GastosTab />}
      {subtab === "flujo" && <FlujoCajaTab />}
    </div>
  );
}

export function Finanzas() {
  const { tab: tabInicial } = useRouter();
  const [tab, setTab] = useState(tabInicial ?? "resumen");
  return (
    <div>
      <PageHeader title="Finanzas" sub="Resumen, fondo de reposición y tesorería (el análisis está en las planillas)" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "resumen", label: "Resumen" },
          { value: "tesoreria", label: "Tesorería" },
        ]}
      />
      {tab === "resumen" && <ResumenTab />}
      {tab === "tesoreria" && <TesoreriaTab />}
    </div>
  );
}

