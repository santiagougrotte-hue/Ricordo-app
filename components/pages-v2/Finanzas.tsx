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
  Sep,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import {
  fARS,
  fNum,
  saldoCaja,
  ORIGENES_CAJA_REAL,
  calcularEerr,
  calcularComprasCmvInventario,
  calcularFlujoCaja,
  mesesEnRango,
  primerDiaMes,
  ultimoDiaMes,
  mesAnterior,
  sumarDias,
  calcularCuentasPorCobrar,
  calcularCuentasPorPagar,
  calcularDineroLibre,
  calcularBalanceGeneral,
  calcularEerrEstructurado,
} from "@/lib/calc-v2";
import type { EerrLinea, CuentaPorCobrar, CuentaPorPagar } from "@/lib/calc-v2";
import { useRouter } from "@/lib/nav-context";

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
function fPct2(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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

function EstadoResultadosVista() {
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
      id: "mod",
      label: "− Mano de obra directa",
      linea: eerr.mano_de_obra_directa,
      actual: -eerr.mano_de_obra_directa.total,
      anterior: eerrAnt ? -eerrAnt.mano_de_obra_directa.total : undefined,
      favorable: "menorMejor",
    },
    {
      id: "rdmo",
      label: "= Resultado después de mano de obra",
      actual: eerr.resultado_despues_mano_obra,
      anterior: eerrAnt?.resultado_despues_mano_obra,
      esSubtotal: true,
      margenActual: eerr.margen_despues_mano_obra_pct,
      margenAnterior: eerrAnt?.margen_despues_mano_obra_pct,
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
          la receta de cada producto (solo materia prima y packaging, no de las compras del período), la mano de obra
          directa tiene su propia línea (minutos de cada variante × costo por hora), y los costos fijos/amortización se
          prorratean por mes. Otros ingresos/gastos e impuestos quedan en $0 — todavía no hay una fuente de datos para
          esas dos líneas.
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

      <Card title="Tu sueldo del período" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Misma ganancia del período, mirada como reparto entre tu trabajo y el negocio en sí — no es una línea contable
          nueva, es la mano de obra directa y el resultado neto de arriba, sumados.
        </p>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div>
            <div className="text-[11px] text-text3">Pago por tu trabajo</div>
            <div className="text-xl font-semibold text-text">{fARS2(eerr.sueldo_periodo.pago_por_tu_trabajo)}</div>
          </div>
          <div>
            <div className="text-[11px] text-text3">Ganancia del negocio</div>
            <div className={`text-xl font-semibold ${eerr.sueldo_periodo.ganancia_del_negocio >= 0 ? "text-green" : "text-red"}`}>
              {fARS2(eerr.sueldo_periodo.ganancia_del_negocio)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-text3">Total disponible para vos</div>
            <div className="text-xl font-semibold text-accent">{fARS2(eerr.sueldo_periodo.total_disponible)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
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

const SERIE_COLOR = { compras: "#f5a623", cmv: "#e5484d", inventario: "#3b82f6" };

function GraficoComprasCmvInventario({ meses }: { meses: { label: string; compras: number; cmv: number; invFinal: number }[] }) {
  if (meses.length === 0) return null;
  const max = Math.max(1, ...meses.flatMap((m) => [m.compras, m.cmv, Math.abs(m.invFinal)]));
  const altoBarras = 120;
  const anchoBarra = 14;
  const gapBarra = 3;
  const anchoGrupo = anchoBarra * 3 + gapBarra * 2 + 14;
  const anchoTotal = meses.length * anchoGrupo;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${anchoTotal} ${altoBarras + 40}`} className="text-text2" style={{ height: 170, minWidth: anchoTotal }}>
        {meses.map((m, i) => {
          const x0 = i * anchoGrupo;
          const barras = [
            { v: m.compras, color: SERIE_COLOR.compras },
            { v: m.cmv, color: SERIE_COLOR.cmv },
            { v: Math.max(0, m.invFinal), color: SERIE_COLOR.inventario },
          ];
          return (
            <g key={i}>
              {barras.map((b, bi) => {
                const h = (Math.abs(b.v) / max) * altoBarras;
                return <rect key={bi} x={x0 + bi * (anchoBarra + gapBarra)} y={altoBarras - h} width={anchoBarra} height={h} fill={b.color} rx={2} />;
              })}
              <text x={x0 + anchoBarra + gapBarra} y={altoBarras + 14} fontSize="9" textAnchor="middle" fill="currentColor">
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-text3">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIE_COLOR.compras }} /> Compras
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIE_COLOR.cmv }} /> CMV
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIE_COLOR.inventario }} /> Inventario final (insumos)
        </span>
      </div>
    </div>
  );
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

function ComprasCmvInventarioVista() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();

  const [modo, setModo] = useState<ModoPeriodoInventario>("mes");
  const [desdeManual, setDesdeManual] = useState(primerDiaMes(mes, anio));
  const [hastaManual, setHastaManual] = useState(ultimoDiaMes(mes, anio));
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const { desde, hasta } = useMemo(() => resolverRangoInventario(modo, mes, anio, desdeManual, hastaManual), [modo, mes, anio, desdeManual, hastaManual]);
  const r = useMemo(() => calcularComprasCmvInventario(data, desde, hasta), [data, desde, hasta]);

  const meses = useMemo(() => mesesEnRango(desde, hasta), [desde, hasta]);
  const filasComparacion = useMemo(
    () =>
      meses.map((m) => {
        const d0 = primerDiaMes(m.mes, m.anio);
        const d1 = ultimoDiaMes(m.mes, m.anio);
        const rm = calcularComprasCmvInventario(data, d0, d1);
        return { label: `${MESES[m.mes - 1].slice(0, 3)} ${m.anio}`, ...rm };
      }),
    [data, meses]
  );

  function toggle(id: string) {
    setExpandido((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <Card title="Compras, CMV e Inventario" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Compras y CMV son conceptos distintos: una compra alimenta el stock de insumos, el CMV sale solo de lo
          efectivamente vendido en el período. El inventario de productos terminados se valoriza a costo de receta
          vigente (estimado — el esquema no guarda un costo histórico congelado al momento de producir).
        </p>
        <div className="flex flex-wrap items-end gap-3">
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
            <>
              <Field label="Desde">
                <Input type="date" value={desdeManual} onChange={(e) => setDesdeManual(e.target.value)} />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={hastaManual} onChange={(e) => setHastaManual(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </Card>

      <StatGrid>
        <KpiCard label="Compras del período" value={fARS2(r.compras.total)} color="orange" />
        <KpiCard label="Consumo de insumos" value={fARS2(r.consumo.total)} color="orange" />
        <KpiCard label="CMV del período" value={fARS2(r.cmv.total)} color="red" />
        <KpiCard label="Inventario inicial (insumos)" value={fARS2(r.inventario_insumos_inicial)} color="blue" />
        <KpiCard label="Inventario final (insumos)" value={fARS2(r.inventario_insumos_final)} color="blue" />
        <KpiCard label="Variación del inventario" value={fARS2(r.variacion_inventario_insumos)} color={r.variacion_inventario_insumos >= 0 ? "green" : "red"} />
        <KpiCard label="Ajustes por conteo" value={fARS2(r.ajustes_conteo.total)} color={r.ajustes_conteo.total === 0 ? "gold" : r.ajustes_conteo.total > 0 ? "green" : "red"} />
        <KpiCard label="Mermas" value={fARS2(r.mermas.total)} color="red" />
        <KpiCard
          label="Diferencia no explicada"
          value={fARS2(r.diferencia_no_explicada)}
          color={Math.abs(r.diferencia_no_explicada) < 1 ? "gold" : "orange"}
        />
      </StatGrid>

      {r.alertas.length > 0 && (
        <Card title="Alertas">
          <ul className="flex flex-col gap-2">
            {r.alertas.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px]">
                <Badge color={a.severidad === "alta" ? "red" : "orange"}>{a.severidad}</Badge>
                <span className="text-text2">{a.mensaje}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Detalle del período (por concepto)">
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Concepto</Th>
                <Th>Importe</Th>
              </tr>
            </thead>
            <tbody>
              <FilaDetalleVista label="Compras" monto={r.compras.total} linea={r.compras} expandido={!!expandido.compras} onToggle={() => toggle("compras")} />
              <FilaDetalleVista label="Consumo de insumos" monto={r.consumo.total} linea={r.consumo} expandido={!!expandido.consumo} onToggle={() => toggle("consumo")} />
              <FilaDetalleVista label="CMV" monto={r.cmv.total} linea={r.cmv} expandido={!!expandido.cmv} onToggle={() => toggle("cmv")} />
              <FilaDetalleVista label="Producción (costo estimado)" monto={r.produccion.total} linea={r.produccion} expandido={!!expandido.produccion} onToggle={() => toggle("produccion")} />
              <FilaDetalleVista
                label="Ajustes por conteo"
                monto={r.ajustes_conteo.total}
                linea={r.ajustes_conteo}
                expandido={!!expandido.ajustes}
                onToggle={() => toggle("ajustes")}
                colorSiNegativo
              />
              <FilaDetalleVista label="Mermas" monto={-r.mermas.total} linea={r.mermas} expandido={!!expandido.mermas} onToggle={() => toggle("mermas")} colorSiNegativo />
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Conciliación de insumos">
          <InfoRow label="Inventario inicial de insumos" value={fARS2(r.inventario_insumos_inicial)} />
          <InfoRow label="+ Compras" value={fARS2(r.compras.total)} />
          <InfoRow label="− Inventario final de insumos" value={fARS2(-r.inventario_insumos_final)} />
          <InfoRow label="= Consumo teórico del período" value={fARS2(r.consumo_teorico)} />
          <Sep />
          <InfoRow label="Consumo en productos vendidos (≈ CMV)" value={fARS2(r.cmv.total)} />
          <InfoRow label="Consumo incorporado en stock (variación productos)" value={fARS2(r.variacion_inventario_productos)} />
          <InfoRow label="Mermas" value={fARS2(r.mermas.total)} />
          <InfoRow label="Ajustes de conteo" value={fARS2(r.ajustes_conteo.total)} />
          <InfoRow label="= Diferencia no explicada" value={fARS2(r.diferencia_no_explicada)} />
        </Card>

        <Card title="Conciliación del CMV (estimado)">
          <InfoRow label="Inventario inicial de productos terminados" value={fARS2(r.inventario_productos_inicial)} />
          <InfoRow label="+ Costo de producción del período" value={fARS2(r.produccion.total)} />
          <InfoRow label="− Inventario final de productos terminados" value={fARS2(-r.inventario_productos_final)} />
          <InfoRow label="= CMV conciliado (estimado)" value={fARS2(r.cmv_conciliado_estimado)} />
          <Sep />
          <InfoRow label="CMV real del período (receta × ventas)" value={fARS2(r.cmv.total)} />
          <InfoRow
            label="Diferencia entre ambos cálculos"
            value={fARS2(r.cmv_conciliado_estimado - r.cmv.total)}
          />
          <p className="mt-2 text-[11px] text-text3">
            Estimado: el inventario de productos terminados se valoriza con el costo de receta vigente, no con el costo
            histórico real de cada producción (el esquema no lo guarda por movimiento).
          </p>
        </Card>
      </div>

      <Card title="Comparación mensual">
        <GraficoComprasCmvInventario meses={filasComparacion.map((f) => ({ label: f.label, compras: f.compras.total, cmv: f.cmv.total, invFinal: f.inventario_insumos_final }))} />
        <TableWrap>
          <table className="mt-3 w-full">
            <thead>
              <tr>
                <Th>Mes</Th>
                <Th>Compras</Th>
                <Th>Consumo</Th>
                <Th>CMV</Th>
                <Th>Inventario inicial</Th>
                <Th>Inventario final</Th>
                <Th>Ajustes</Th>
                <Th>Diferencia</Th>
              </tr>
            </thead>
            <tbody>
              {filasComparacion.map((f, i) => (
                <TrHover key={i}>
                  <Td main>{f.label}</Td>
                  <Td>{fARS2(f.compras.total)}</Td>
                  <Td>{fARS2(f.consumo.total)}</Td>
                  <Td>{fARS2(f.cmv.total)}</Td>
                  <Td>{fARS2(f.inventario_insumos_inicial)}</Td>
                  <Td>{fARS2(f.inventario_insumos_final)}</Td>
                  <Td>{fARS2(f.ajustes_conteo.total)}</Td>
                  <Td className={Math.abs(f.diferencia_no_explicada) < 1 ? "" : "text-orange"}>{fARS2(f.diferencia_no_explicada)}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

function BalanceGeneralVista() {
  const { data } = useStoreV2();
  const [hasta, setHasta] = useState(hoyIso());
  const inicioPeriodoActual = useMemo(() => `${hasta.slice(0, 7)}-01`, [hasta]);
  const b = useMemo(() => calcularBalanceGeneral(data, hasta, inicioPeriodoActual), [data, hasta, inicioPeriodoActual]);

  return (
    <div>
      <Card className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Qué tiene, qué debe y cuál es el patrimonio del negocio a una fecha — distinto del Estado de Resultados (que
          muestra si ganó o perdió) y del Flujo de Caja (cuánta plata entró y salió).
        </p>
        <Field label="A fecha">
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </Field>
      </Card>

      {!b.cuadra && (
        <Card className="mb-4 border-red/30">
          <Badge color="red">Balance descuadrado</Badge>
          <p className="mt-2 text-[12.5px] text-text2">
            ACTIVO ({fARS(b.total_activo)}) no coincide con PASIVO + PATRIMONIO ({fARS(b.total_pasivo_mas_patrimonio)}). Diferencia: {fARS(b.diferencia)}.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Activo">
          <TableWrap>
            <table className="w-full">
              <tbody>
                <tr className="bg-surface2/40 font-semibold">
                  <Td main colSpan={2}>Activo corriente</Td>
                </tr>
                <TrHover>
                  <Td>Caja y bancos</Td>
                  <Td>{fARS(b.activo_corriente.caja_bancos)}</Td>
                </TrHover>
                <TrHover>
                  <Td>Cuentas por cobrar</Td>
                  <Td>{fARS(b.activo_corriente.cuentas_por_cobrar)}</Td>
                </TrHover>
                <TrHover>
                  <Td>Inventario</Td>
                  <Td>{fARS(b.activo_corriente.inventario)}</Td>
                </TrHover>
                <tr className="bg-surface2/60 font-semibold">
                  <Td>= Total activo corriente</Td>
                  <Td>{fARS(b.activo_corriente.total)}</Td>
                </tr>
                <tr className="bg-surface2/40 font-semibold">
                  <Td main colSpan={2}>Activo no corriente</Td>
                </tr>
                <TrHover>
                  <Td>Activos (a costo)</Td>
                  <Td>{fARS(b.activo_no_corriente.valor_activos_costo)}</Td>
                </TrHover>
                <TrHover>
                  <Td>− Amortización acumulada</Td>
                  <Td className="text-red">{fARS(-b.activo_no_corriente.amortizacion_acumulada)}</Td>
                </TrHover>
                <tr className="bg-surface2/60 font-semibold">
                  <Td>= Total activo no corriente</Td>
                  <Td>{fARS(b.activo_no_corriente.total)}</Td>
                </tr>
                <tr className="bg-accent/10 font-semibold">
                  <Td>TOTAL ACTIVO</Td>
                  <Td>{fARS(b.total_activo)}</Td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <Card title="Pasivo">
          <TableWrap>
            <table className="w-full">
              <tbody>
                <tr className="bg-surface2/40 font-semibold">
                  <Td main colSpan={2}>Pasivo corriente</Td>
                </tr>
                <TrHover>
                  <Td>Proveedores por pagar</Td>
                  <Td>{fARS(b.pasivo_corriente.proveedores_por_pagar)}</Td>
                </TrHover>
                <tr className="bg-surface2/60 font-semibold">
                  <Td>= Total pasivo corriente</Td>
                  <Td>{fARS(b.pasivo_corriente.total)}</Td>
                </tr>
                <tr className="bg-surface2/40 font-semibold">
                  <Td main colSpan={2}>Pasivo no corriente</Td>
                </tr>
                <TrHover>
                  <Td>Préstamos</Td>
                  <Td>{fARS(b.pasivo_no_corriente.prestamos)}</Td>
                </TrHover>
                <tr className="bg-surface2/60 font-semibold">
                  <Td>= Total pasivo no corriente</Td>
                  <Td>{fARS(b.pasivo_no_corriente.total)}</Td>
                </tr>
                <tr className="bg-accent/10 font-semibold">
                  <Td>TOTAL PASIVO</Td>
                  <Td>{fARS(b.total_pasivo)}</Td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <Card title="Patrimonio neto">
          <TableWrap>
            <table className="w-full">
              <tbody>
                <TrHover>
                  <Td>Aportes del dueño</Td>
                  <Td>{fARS(b.patrimonio_neto.aportes_dueno)}</Td>
                </TrHover>
                <TrHover>
                  <Td>Resultados acumulados</Td>
                  <Td>{fARS(b.patrimonio_neto.resultados_acumulados)}</Td>
                </TrHover>
                <TrHover>
                  <Td>Resultado del período</Td>
                  <Td>{fARS(b.patrimonio_neto.resultado_periodo)}</Td>
                </TrHover>
                <TrHover>
                  <Td>− Retiros del dueño</Td>
                  <Td className="text-red">{fARS(-b.patrimonio_neto.retiros_dueno)}</Td>
                </TrHover>
                <tr className="bg-accent/10 font-semibold">
                  <Td>TOTAL PATRIMONIO NETO</Td>
                  <Td>{fARS(b.patrimonio_neto.total)}</Td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>
    </div>
  );
}

interface FilaEerrClasico {
  label: string;
  valor: number;
  subtotal?: boolean;
}

function EerrClasicoVista() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();
  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const r = useMemo(() => calcularEerrEstructurado(data, desde, hasta), [data, desde, hasta]);

  const filas: FilaEerrClasico[] = [
    { label: "VENTAS", valor: r.ventas },
    { label: "(CMV)", valor: r.cmv.total },
    { label: "R. bruto", valor: r.resultado_bruto, subtotal: true },
    { label: "(Mano de obra directa)", valor: r.mano_de_obra_directa.total },
    { label: "R. después de mano de obra", valor: r.resultado_despues_mano_obra, subtotal: true },
    { label: "(Gastos adm. y comerc.)", valor: r.gastos_adm_comerc.total },
    { label: "Resultado antes de Intereses e Impuestos", valor: r.resultado_antes_intereses_impuestos, subtotal: true },
    { label: "(Intereses)", valor: r.intereses.total },
    { label: "Resultado antes de Impuestos", valor: r.resultado_antes_impuestos, subtotal: true },
    { label: `(IIGG) ${fNum(r.alicuota_iigg_pct, 0)}%`, valor: r.iigg },
    { label: "Resultado Neto", valor: r.resultado_neto, subtotal: true },
  ];

  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text3">
        Formato clásico: Ventas / CMV / Resultado bruto / Mano de obra directa / Gastos adm. y comerciales / Intereses /
        IIGG / Resultado neto, en ese orden — es una presentación alternativa sobre los mismos datos del Estado de
        Resultados detallado (esa vista desglosa &ldquo;Gastos adm. y comerc.&rdquo; en costos fijos, indirectos y
        operativos por separado; acá van consolidados en una sola línea). La alícuota de IIGG se ajusta en
        Configuración → General.
      </p>
      <Card>
        <TableWrap>
          <table className="w-full">
            <tbody>
              {filas.map((f) => (
                <tr key={f.label} className={f.subtotal ? "bg-surface2/60" : ""}>
                  <Td main={f.subtotal}>{f.label}</Td>
                  <Td className={f.subtotal ? "font-semibold text-text" : "text-text2"}>{fARS(f.valor)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}

function ResultadosTab() {
  const [subtab, setSubtab] = useState("eerr");
  return (
    <div>
      <FilterTabs
        value={subtab}
        onChange={setSubtab}
        options={[
          { value: "eerr", label: "Estado de Resultados" },
          { value: "eerr-clasico", label: "Estado de Resultados (formato clásico)" },
          { value: "balance", label: "Balance General" },
        ]}
      />
      {subtab === "eerr" && <EstadoResultadosVista />}
      {subtab === "eerr-clasico" && <EerrClasicoVista />}
      {subtab === "balance" && <BalanceGeneralVista />}
    </div>
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

  const cuentas = useMemo(() => calcularCuentasPorCobrar(data, hoyIso()), [data]);
  const totalPendiente = cuentas.reduce((acc, c) => acc + c.saldo, 0);

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
    </div>
  );
}

function CuentasPorPagarTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [pagando, setPagando] = useState<CuentaPorPagar | null>(null);
  const [form, setForm] = useState({ fecha: hoyIso(), monto: 0, metodo_pago: "" });

  const cuentas = useMemo(() => calcularCuentasPorPagar(data, hoyIso()), [data]);
  const totalPendiente = cuentas.reduce((acc, c) => acc + c.saldo, 0);

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
    </div>
  );
}

// Máximo ~8 indicadores a propósito (pedido explícito de no llenar la pantalla de entrada con
// indicadores secundarios) — todo lo demás se ve entrando a la pestaña correspondiente.
function ResumenTab() {
  const { data } = useStoreV2();
  const { mes, anio } = usePeriod();
  const hoy = hoyIso();

  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);
  const eerr = useMemo(() => calcularEerr(data, desde, hasta), [data, desde, hasta]);
  const saldo = saldoCaja(data);
  const libre = useMemo(() => calcularDineroLibre(data, hoy), [data, hoy]);
  const porCobrar = useMemo(() => calcularCuentasPorCobrar(data, hoy).reduce((acc, c) => acc + c.saldo, 0), [data, hoy]);
  const porPagar = useMemo(() => calcularCuentasPorPagar(data, hoy).reduce((acc, c) => acc + c.saldo, 0), [data, hoy]);

  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text3">Lo esencial de {MESES[mes - 1]} {anio} — el detalle de cada número está en su propia pestaña.</p>
      <StatGrid>
        <KpiCard label="Saldo en cuentas" value={fARS(saldo)} color={saldo >= 0 ? "green" : "red"} />
        <KpiCard label="Dinero libre" value={fARS(libre.dinero_libre)} color={libre.dinero_libre >= 0 ? "blue" : "red"} sub="Descontando lo que ya está comprometido" />
        <KpiCard label="Ventas del mes" value={fARS(eerr.ventas_netas)} color="blue" />
        <KpiCard label="Resultado neto" value={fARS(eerr.resultado_neto)} color={eerr.resultado_neto >= 0 ? "green" : "red"} />
        <KpiCard label="Margen neto" value={eerr.margen_neto_pct === null ? "—" : `${fNum(eerr.margen_neto_pct, 1)}%`} color="purple" />
        <KpiCard label="Por cobrar" value={fARS(porCobrar)} color={porCobrar > 0 ? "orange" : "green"} />
        <KpiCard label="Por pagar" value={fARS(porPagar)} color={porPagar > 0 ? "orange" : "green"} />
      </StatGrid>
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

const TIPOS_APORTES_FINANCIACION = ["aporte_dueno", "retiro_dueno", "prestamo_recibido", "devolucion_prestamo"] as const;

function AportesFinanciacionTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();

  const movs = useMemo(
    () =>
      data.movimientos_financieros
        .filter((m) => m.origen_tipo && (TIPOS_APORTES_FINANCIACION as readonly string[]).includes(m.origen_tipo))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.movimientos_financieros]
  );

  const totalAportes = movs.filter((m) => m.origen_tipo === "aporte_dueno").reduce((acc, m) => acc + m.monto, 0);
  const totalRetiros = movs.filter((m) => m.origen_tipo === "retiro_dueno").reduce((acc, m) => acc + m.monto, 0);
  const deudaPrestamos =
    movs.filter((m) => m.origen_tipo === "prestamo_recibido").reduce((acc, m) => acc + m.monto, 0) -
    movs.filter((m) => m.origen_tipo === "devolucion_prestamo").reduce((acc, m) => acc + m.monto, 0);

  function eliminar(id: string) {
    setData((d) => ({ ...d, movimientos_financieros: d.movimientos_financieros.filter((m) => m.id !== id) }));
    toast("Movimiento eliminado");
  }

  return (
    <div>
      <p className="mb-3 text-[12.5px] text-text3">
        Plata que el dueño puso o sacó del negocio, y préstamos recibidos o devueltos — nunca afectan el resultado del
        negocio (no son venta ni gasto operativo). Para registrar uno nuevo: Tesorería → Caja → &ldquo;+ Movimiento de
        caja&rdquo; y elegí el tipo.
      </p>
      <StatGrid>
        <KpiCard label="Aportes del dueño (histórico)" value={fARS(totalAportes)} color="green" />
        <KpiCard label="Retiros del dueño (histórico)" value={fARS(totalRetiros)} color="orange" />
        <KpiCard label="Deuda por préstamos" value={fARS(deudaPrestamos)} color={deudaPrestamos > 0 ? "orange" : "green"} />
      </StatGrid>
      <Card>
        {movs.length === 0 ? (
          <EmptyState text="Todavía no hay aportes, retiros ni préstamos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Concepto</Th>
                  <Th>Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>
                      <Badge color={m.tipo === "ingreso" ? "green" : "red"}>{LABEL_TIPO_ESPECIAL[m.origen_tipo as TipoEspecialMovimiento]}</Badge>
                    </Td>
                    <Td main>{m.concepto}</Td>
                    <Td className={m.tipo === "egreso" ? "text-red" : "text-green"}>{fARS(m.monto)}</Td>
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

export function Finanzas() {
  const { tab: tabInicial } = useRouter();
  const [tab, setTab] = useState(tabInicial ?? "resumen");
  return (
    <div>
      <PageHeader title="Finanzas" sub="Resumen, tesorería, resultados, compras e inventario, y capital" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "resumen", label: "Resumen" },
          { value: "tesoreria", label: "Tesorería" },
          { value: "resultados", label: "Resultados" },
          { value: "compras-inventario", label: "Compras e inventario" },
          { value: "capital", label: "Capital" },
        ]}
      />
      {tab === "resumen" && <ResumenTab />}
      {tab === "tesoreria" && <TesoreriaTab />}
      {tab === "resultados" && <ResultadosTab />}
      {tab === "compras-inventario" && <ComprasCmvInventarioVista />}
      {tab === "capital" && <AportesFinanciacionTab />}
    </div>
  );
}

