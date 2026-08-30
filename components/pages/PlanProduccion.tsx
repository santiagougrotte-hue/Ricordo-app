"use client";

import React, { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronRight, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { usePeriod, MESES } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { useRouter } from "@/lib/nav-context";
import { uid } from "@/lib/id";
import { fARS, fNum, fPct, calcCosto, calcStockIngrediente, gustosActivos, pvr, type GustoBase } from "@/lib/calc";
import {
  referenciaVentasPorGusto,
  desvioPlanSemana,
  proponerClasificacionRecetas,
  calcularComposicionGusto,
  reescalarLineasComponente,
  calcularCuadroNecesidadPorGusto,
  calcularCuadroNecesidadCompletoPorGusto,
  redondearArribaPractico,
  type ReferenciaVentasGusto,
  type TendenciaVentas,
} from "@/lib/planificacion";
import {
  PageHeader,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Button,
  Field,
  Input,
  Select,
  Badge,
  Alert,
  InfoRow,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { Producto, PlanProduccionMes, ComponenteReceta, RecetaLinea } from "@/lib/types";

function TendenciaIcono({ tendencia }: { tendencia: TendenciaVentas }) {
  if (tendencia === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-green">
        <TrendingUp className="h-4 w-4" />
      </span>
    );
  }
  if (tendencia === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-red">
        <TrendingDown className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-text3">
      <Minus className="h-4 w-4" />
    </span>
  );
}

/** Bloque 1 — solo lectura, calculado. Muestra siempre todos los gustos activos, aunque
 * estén en cero, y la ventana de cálculo es configurable (no hardcodeada). */
function ReferenciaVentas({ referencia }: { referencia: ReferenciaVentasGusto[] }) {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [ventana, setVentana] = useState(data.config_planificacion.ventana_meses_referencia);

  function guardarVentana() {
    if (ventana < 1) {
      toast("La ventana tiene que ser de al menos 1 mes", "error");
      return;
    }
    setData((d) => ({ ...d, config_planificacion: { ...d.config_planificacion, ventana_meses_referencia: ventana } }));
    toast("Ventana de cálculo guardada");
  }

  return (
    <Card title="Referencia de ventas" className="mb-4">
      <div className="mb-3.5 flex flex-wrap items-end gap-3">
        <Field label="Ventana de cálculo (meses cerrados)">
          <Input type="number" min={1} value={ventana} onChange={(e) => setVentana(Number(e.target.value))} style={{ width: 100 }} />
        </Field>
        <Button size="sm" onClick={guardarVentana}>
          Guardar
        </Button>
      </div>
      {referencia.length === 0 ? (
        <EmptyState text="Sin productos activos todavía." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Gusto</Th>
                <Th>Prom. cajas/mes</Th>
                <Th>Prom. cajas/semana</Th>
                <Th>Último mes cerrado</Th>
                <Th>Tendencia</Th>
              </tr>
            </thead>
            <tbody>
              {referencia.map((r) => (
                <TrHover key={r.id_base}>
                  <Td main>{r.nombre}</Td>
                  <Td>{fNum(r.promedioMes, 1)}</Td>
                  <Td>{fNum(r.promedioSemana, 1)}</Td>
                  <Td>{fNum(r.ultimoMesCerrado, 0)}</Td>
                  <Td>
                    <TendenciaIcono tendencia={r.tendencia} />
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

/** Bloque 2 — editable. Se remonta (vía `key` en el padre) cada vez que cambia mes/año, para
 * cargar limpio lo ya guardado de ese período sin necesitar un efecto de sincronización. */
function PlanEditable({
  mes,
  anio,
  referencia,
  gustos,
  planesGuardados,
}: {
  mes: number;
  anio: number;
  referencia: ReferenciaVentasGusto[];
  gustos: GustoBase[];
  planesGuardados: PlanProduccionMes[];
}) {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [umbral, setUmbral] = useState(data.config_planificacion.umbral_desvio_semana_pct);
  const [filas, setFilas] = useState<Record<string, { cajas_mes: number; cajas_semana: number }>>(() => {
    const inicial: Record<string, { cajas_mes: number; cajas_semana: number }> = {};
    for (const g of gustos) {
      const guardado = planesGuardados.find((pl) => pl.id_base === g.id_base);
      inicial[g.id_base] = { cajas_mes: guardado?.cajas_mes ?? 0, cajas_semana: guardado?.cajas_semana ?? 0 };
    }
    return inicial;
  });

  function actualizarFila(idBase: string, patch: Partial<{ cajas_mes: number; cajas_semana: number }>) {
    setFilas((f) => ({ ...f, [idBase]: { ...f[idBase], ...patch } }));
  }

  function traerPromedio(idBase: string) {
    const ref = referencia.find((r) => r.id_base === idBase);
    if (!ref) return;
    actualizarFila(idBase, {
      cajas_mes: Math.round(ref.promedioMes * 10) / 10,
      cajas_semana: Math.round(ref.promedioSemana * 10) / 10,
    });
  }

  function traerPromedioTodos() {
    setFilas((f) => {
      const nuevo = { ...f };
      for (const r of referencia) {
        nuevo[r.id_base] = { cajas_mes: Math.round(r.promedioMes * 10) / 10, cajas_semana: Math.round(r.promedioSemana * 10) / 10 };
      }
      return nuevo;
    });
  }

  function guardarUmbral() {
    setData((d) => ({ ...d, config_planificacion: { ...d.config_planificacion, umbral_desvio_semana_pct: umbral } }));
    toast("Umbral guardado");
  }

  function guardarPlan() {
    const fecha_guardado = new Date().toISOString();
    setData((d) => {
      const sinEsteMes = d.plan_produccion.filter((p) => !(p.mes === mes && p.anio === anio));
      const nuevas: PlanProduccionMes[] = gustos.map((g) => ({
        id: uid("PLAN"),
        mes,
        anio,
        id_base: g.id_base,
        cajas_mes: filas[g.id_base]?.cajas_mes ?? 0,
        cajas_semana: filas[g.id_base]?.cajas_semana ?? 0,
        fecha_guardado,
      }));
      return { ...d, plan_produccion: [...sinEsteMes, ...nuevas] };
    });
    toast(`Plan de ${MESES[mes - 1]} ${anio} guardado`);
  }

  return (
    <Card title={`Plan de producción — ${MESES[mes - 1]} ${anio}`} className="mb-4">
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Umbral de aviso por desvío (%)">
            <Input type="number" min={0} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} style={{ width: 100 }} />
          </Field>
          <Button size="sm" variant="ghost" onClick={guardarUmbral}>
            Guardar umbral
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={traerPromedioTodos}>
          Traer promedio (todos)
        </Button>
      </div>

      {gustos.length === 0 ? (
        <EmptyState text="Sin productos activos todavía." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Gusto</Th>
                <Th>Cajas/mes</Th>
                <Th>Cajas/semana</Th>
                <Th title="Cajas/semana × 4,33 comparado contra cajas/mes">Aviso</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {gustos.map((g) => {
                const fila = filas[g.id_base] ?? { cajas_mes: 0, cajas_semana: 0 };
                const desvio = desvioPlanSemana(fila.cajas_mes, fila.cajas_semana, umbral);
                return (
                  <TrHover key={g.id_base}>
                    <Td main>{g.nombre}</Td>
                    <Td>
                      <Input
                        type="number"
                        value={fila.cajas_mes}
                        onChange={(e) => actualizarFila(g.id_base, { cajas_mes: Number(e.target.value) })}
                        style={{ width: 90 }}
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={fila.cajas_semana}
                        onChange={(e) => actualizarFila(g.id_base, { cajas_semana: Number(e.target.value) })}
                        style={{ width: 90 }}
                      />
                    </Td>
                    <Td>
                      {desvio.excedeUmbral && (
                        <Badge color="orange">
                          {desvio.desviacionPct !== null ? `${desvio.desviacionPct >= 0 ? "+" : ""}${fPct(desvio.desviacionPct)}` : "revisar"}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => traerPromedio(g.id_base)}>
                        Traer promedio
                      </Button>
                    </Td>
                  </TrHover>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <div className="mt-4 flex justify-end">
        <Button onClick={guardarPlan}>Guardar plan del mes</Button>
      </div>
    </Card>
  );
}

function nombreConcepto(data: ReturnType<typeof useStore>["data"], linea: RecetaLinea): string {
  if (linea.tipo === "Ingrediente") return data.ingredientes.find((i) => i.id === linea.concepto)?.nombre ?? linea.concepto;
  if (linea.tipo === "Packaging") return data.packaging.find((p) => p.id === linea.concepto)?.nombre ?? linea.concepto;
  return data.costos_fijos.find((c) => c.id === linea.concepto)?.descripcion ?? linea.concepto;
}

/** Revisión y corrección de la propuesta de clasificación, gusto por gusto. Se remonta (vía
 * `key` en el padre) cada vez que cambia el gusto elegido, para no arrastrar ediciones a medio
 * hacer de un gusto a otro. Nada se escribe en data.recetas hasta tocar "Confirmar". */
function RevisionClasificacionGusto({
  idProducto,
  lineas,
}: {
  idProducto: string;
  lineas: RecetaLinea[];
}) {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const propuestas = useMemo(() => proponerClasificacionRecetas(data), [data]);
  const [seleccion, setSeleccion] = useState<Record<string, ComponenteReceta | "">>(() => {
    const inicial: Record<string, ComponenteReceta | ""> = {};
    for (const l of lineas) {
      const propuesta = propuestas.find((p) => p.id === l.id)?.componente ?? "";
      inicial[l.id] = l.componente ?? propuesta;
    }
    return inicial;
  });

  const sinClasificar = lineas.filter((l) => !seleccion[l.id]).length;

  function confirmar() {
    if (sinClasificar > 0) {
      toast("Todavía hay líneas sin clasificar en este gusto", "error");
      return;
    }
    setData((d) => ({
      ...d,
      recetas: d.recetas.map((r) =>
        r.id_producto === idProducto && seleccion[r.id] ? { ...r, componente: seleccion[r.id] as ComponenteReceta } : r
      ),
    }));
    toast("Clasificación confirmada");
  }

  if (lineas.length === 0) return <EmptyState text="Este gusto todavía no tiene receta cargada." />;

  return (
    <>
      <TableWrap>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Concepto</Th>
              <Th>Tipo</Th>
              <Th>Cantidad</Th>
              <Th>Componente</Th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <TrHover key={l.id}>
                <Td main>{nombreConcepto(data, l)}</Td>
                <Td>{l.tipo}</Td>
                <Td>{l.cantidad}</Td>
                <Td>
                  <Select
                    value={seleccion[l.id]}
                    onChange={(e) => setSeleccion((s) => ({ ...s, [l.id]: e.target.value as ComponenteReceta }))}
                    style={{ width: 140 }}
                  >
                    <option value="">Elegir…</option>
                    <option value="masa">Masa</option>
                    <option value="relleno">Relleno</option>
                    <option value="packaging">Packaging</option>
                  </Select>
                </Td>
              </TrHover>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] text-text3">
          {sinClasificar > 0 ? `${sinClasificar} línea(s) sin clasificar` : "Todo clasificado"}
        </span>
        <Button size="sm" onClick={confirmar}>
          Confirmar clasificación
        </Button>
      </div>
    </>
  );
}

/** Composición derivada + gramos por caja editables. Editar el gramaje reescala
 * proporcionalmente las líneas de receta de ese componente — como eso cambia costo y margen,
 * siempre pasa por un cartel de confirmación antes de escribir nada. */
function ParametrosGramaje({ producto }: { producto: Producto }) {
  const { data, setData } = useStore();
  const { toast } = useToast();

  const composicionMasa = useMemo(() => calcularComposicionGusto(data, producto.id, "masa"), [data, producto.id]);
  const composicionRelleno = useMemo(() => calcularComposicionGusto(data, producto.id, "relleno"), [data, producto.id]);
  const gramosMasaActual = producto.gramos_masa_por_caja ?? composicionMasa.totalGramosPorCaja;
  const gramosRellenoActual = producto.gramos_relleno_por_caja ?? composicionRelleno.totalGramosPorCaja;

  const [inputMasa, setInputMasa] = useState(gramosMasaActual);
  const [inputRelleno, setInputRelleno] = useState(gramosRellenoActual);
  const [confirmando, setConfirmando] = useState<{
    componente: "masa" | "relleno";
    nuevoValor: number;
    margenAntes: number;
    margenDespues: number;
    costoAntes: number;
    costoDespues: number;
  } | null>(null);

  function pedirConfirmacion(componente: "masa" | "relleno", nuevoValor: number) {
    const actual = componente === "masa" ? gramosMasaActual : gramosRellenoActual;
    if (actual <= 0) {
      toast("Todavía no hay líneas clasificadas de este componente para este gusto — confirmá la clasificación primero", "error");
      return;
    }
    if (nuevoValor === actual) return;
    const factor = nuevoValor / actual;
    const costoAntes = calcCosto(data, producto.id);
    const costoDespues = calcCosto({ ...data, recetas: reescalarLineasComponente(data, producto.id, componente, factor) }, producto.id);
    const margenAntes = producto.precio_venta > 0 ? ((producto.precio_venta - costoAntes) / producto.precio_venta) * 100 : 0;
    const margenDespues = producto.precio_venta > 0 ? ((producto.precio_venta - costoDespues) / producto.precio_venta) * 100 : 0;
    setConfirmando({ componente, nuevoValor, margenAntes, margenDespues, costoAntes, costoDespues });
  }

  function confirmarCambio() {
    if (!confirmando) return;
    const actual = confirmando.componente === "masa" ? gramosMasaActual : gramosRellenoActual;
    const factor = confirmando.nuevoValor / actual;
    setData((d) => ({
      ...d,
      recetas: reescalarLineasComponente(d, producto.id, confirmando.componente, factor),
      productos: d.productos.map((p) =>
        p.id === producto.id
          ? {
              ...p,
              ...(confirmando.componente === "masa"
                ? { gramos_masa_por_caja: confirmando.nuevoValor }
                : { gramos_relleno_por_caja: confirmando.nuevoValor }),
            }
          : p
      ),
    }));
    toast("Gramaje actualizado y receta reescalada");
    setConfirmando(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Field label="Gramos de masa por caja">
            <div className="flex gap-2">
              <Input type="number" value={inputMasa} onChange={(e) => setInputMasa(Number(e.target.value))} />
              <Button size="sm" onClick={() => pedirConfirmacion("masa", inputMasa)}>
                Guardar
              </Button>
            </div>
          </Field>
          <div className="mt-2.5 flex flex-col gap-1">
            {composicionMasa.ingredientes.map((i) => (
              <div key={i.id_ingrediente} className="flex justify-between text-[11.5px] text-text3">
                <span>{i.nombre}</span>
                <span>{fPct(i.pctComposicion)}</span>
              </div>
            ))}
          </div>
          {composicionMasa.ingredientesSinPesoConfigurado.length > 0 && (
            <div className="mt-2">
              <Alert kind="warning">Falta peso unitario: {composicionMasa.ingredientesSinPesoConfigurado.join(", ")}</Alert>
            </div>
          )}
        </div>

        <div>
          <Field label="Gramos de relleno por caja">
            <div className="flex gap-2">
              <Input type="number" value={inputRelleno} onChange={(e) => setInputRelleno(Number(e.target.value))} />
              <Button size="sm" onClick={() => pedirConfirmacion("relleno", inputRelleno)}>
                Guardar
              </Button>
            </div>
          </Field>
          <div className="mt-2.5 flex flex-col gap-1">
            {composicionRelleno.ingredientes.map((i) => (
              <div key={i.id_ingrediente} className="flex justify-between text-[11.5px] text-text3">
                <span>{i.nombre}</span>
                <span>{fPct(i.pctComposicion)}</span>
              </div>
            ))}
          </div>
          {composicionRelleno.ingredientesSinPesoConfigurado.length > 0 && (
            <div className="mt-2">
              <Alert kind="warning">Falta peso unitario: {composicionRelleno.ingredientesSinPesoConfigurado.join(", ")}</Alert>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!confirmando}
        onClose={() => setConfirmando(null)}
        title="Este cambio afecta el costo y el margen"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarCambio}>Confirmar y reescalar receta</Button>
          </>
        }
      >
        {confirmando && (
          <div>
            <p className="mb-3 text-[12.5px] text-text3">
              Cambiar los gramos de {confirmando.componente} por caja de {producto.nombre} reescala proporcionalmente esa parte de
              la receta. Esto es lo que va a pasar con el costo y el margen:
            </p>
            <InfoRow label="Costo actual" value={fARS(confirmando.costoAntes)} />
            <InfoRow label="Costo nuevo" value={fARS(confirmando.costoDespues)} />
            <InfoRow label="Margen actual" value={fPct(confirmando.margenAntes)} color={confirmando.margenAntes >= 30 ? "green" : "red"} />
            <InfoRow
              label="Margen nuevo"
              value={fPct(confirmando.margenDespues)}
              color={confirmando.margenDespues >= 30 ? "green" : "red"}
            />
          </div>
        )}
      </Modal>
    </>
  );
}

/** Bloque 3 — elegí una ficha de producto (cada variante de canal tiene su propia receta,
 * incluso dentro del mismo gusto) y revisá su clasificación y gramaje. El selector agrupa las
 * variantes bajo su gusto para que quede claro cuáles comparten producción física. */
function ParametrosPorGusto() {
  const { data } = useStore();
  const gustos = useMemo(() => gustosActivos(data), [data]);
  const [idProducto, setIdProducto] = useState(gustos[0]?.variantes[0]?.id ?? "");
  const producto = data.productos.find((p) => p.id === idProducto);
  const lineas = useMemo(
    () => data.recetas.filter((r) => r.id_producto === idProducto && r.tipo !== "CostoFijo"),
    [data.recetas, idProducto]
  );

  return (
    <Card title="Parámetros por gusto" className="mb-4">
      <Field label="Producto (cada variante de canal tiene su propia receta)">
        <Select value={idProducto} onChange={(e) => setIdProducto(e.target.value)} style={{ maxWidth: 340 }}>
          <option value="">Seleccionar…</option>
          {gustos.map((g) => (
            <optgroup key={g.id_base} label={g.nombre}>
              {g.variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      {producto && (
        <>
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[1.3px] text-text2">Clasificación de la receta</div>
            <RevisionClasificacionGusto key={idProducto} idProducto={idProducto} lineas={lineas} />
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[1.3px] text-text2">Gramaje por caja</div>
            <ParametrosGramaje key={idProducto} producto={producto} />
          </div>
        </>
      )}
    </Card>
  );
}

/** Bloque 4 — Tabla A (masa/semana) o Tabla B (relleno/mes) según `componente`. El detalle por
 * gusto de cada ingrediente se puede plegar/desplegar tocando la fila. */
function CuadroNecesidadTabla({
  titulo,
  componente,
  cajasPorGusto,
}: {
  titulo: string;
  componente: "masa" | "relleno";
  cajasPorGusto: Map<string, number>; // id_base -> cajas totales del gusto
}) {
  const { data, setData } = useStore();
  const { go } = useRouter();
  const { toast } = useToast();
  const cuadro = useMemo(
    () => calcularCuadroNecesidadPorGusto(data, componente, cajasPorGusto),
    [data, componente, cajasPorGusto]
  );
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [mostrarStock, setMostrarStock] = useState(false);

  function cantidadParaComparar(i: (typeof cuadro.ingredientes)[number]) {
    return i.unidadesConversion !== undefined ? i.unidadesConversion : i.cantidadNativa;
  }

  // Descuenta el stock actual antes de armar el borrador — pedir la necesidad total sin restar
  // lo que ya hay hace comprar de más cada vez que queda stock parcial cubierto.
  function generarOrdenDeCompra() {
    const lineas = cuadro.ingredientes
      .map((i) => {
        const stockActual = calcStockIngrediente(data, i.id_ingrediente);
        const faltaExacta = Math.max(0, cantidadParaComparar(i) - stockActual);
        const cantidad = i.unidadesConversion !== undefined ? Math.ceil(faltaExacta) : redondearArribaPractico(faltaExacta);
        return {
          id_ingrediente: i.id_ingrediente,
          cantidad,
          precio_unitario: pvr(data.ingredientes.find((ing) => ing.id === i.id_ingrediente)),
        };
      })
      .filter((l) => l.cantidad > 0);
    if (lineas.length === 0) {
      toast("El stock actual ya cubre toda la necesidad — no hay nada que comprar", "info");
      return;
    }
    setData((d) => ({
      ...d,
      borrador_compra_pendiente: {
        descripcion: `Orden generada desde Planificación — ${titulo}`,
        lineas,
      },
    }));
    toast("Borrador de compra generado — revisalo y confirmalo en Compras");
    go("compras");
  }

  return (
    <Card title={titulo} className="mb-4">
      {cuadro.gustosSinComposicion.length > 0 && (
        <div className="mb-3">
          <Alert kind="warning">
            Sin clasificar todavía: {cuadro.gustosSinComposicion.join(", ")} — revisalos en &quot;Parámetros por gusto&quot;.
          </Alert>
        </div>
      )}
      {cuadro.ingredientes.length === 0 ? (
        <EmptyState text="Cargá y guardá el plan del mes, y clasificá al menos un gusto, para ver este cuadro." />
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setMostrarStock((v) => !v)}>
              {mostrarStock ? "Ocultar comparación con stock" : "Comparar con stock"}
            </Button>
          </div>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th></Th>
                  <Th>Ingrediente</Th>
                  <Th>Cantidad (3 dec.)</Th>
                  <Th>A comprar</Th>
                  {mostrarStock && <Th>Stock actual</Th>}
                  {mostrarStock && <Th>Falta</Th>}
                  <Th>Costo est.</Th>
                </tr>
              </thead>
              <tbody>
                {cuadro.ingredientes.map((i) => {
                  const stockActual = mostrarStock ? calcStockIngrediente(data, i.id_ingrediente) : 0;
                  const falta = Math.max(0, cantidadParaComparar(i) - stockActual);
                  return (
                    <React.Fragment key={i.id_ingrediente}>
                      <TrHover
                        className="cursor-pointer"
                        onClick={() => setExpandido((e) => ({ ...e, [i.id_ingrediente]: !e[i.id_ingrediente] }))}
                      >
                        <Td>
                          {expandido[i.id_ingrediente] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </Td>
                        <Td main>{i.nombre}</Td>
                        <Td>
                          {fNum(i.cantidadNativa, 3)} {i.unidad}
                          {i.unidadesConversion !== undefined ? ` (${fNum(i.gramosTotales, 0)} g)` : ""}
                        </Td>
                        <Td main>
                          {i.unidadesConversion !== undefined
                            ? `${fNum(i.unidadesConversion, 0)} unidades`
                            : `${fNum(i.cantidadNativaRedondeada, 0)} ${i.unidad}`}
                        </Td>
                        {mostrarStock && (
                          <Td>
                            {fNum(stockActual, 2)} {i.unidadesConversion !== undefined ? "unidades" : i.unidad}
                          </Td>
                        )}
                        {mostrarStock && (
                          <Td>
                            <Badge color={falta > 0 ? "red" : "green"}>
                              {falta > 0 ? fNum(falta, 2) : "Cubierto"}
                            </Badge>
                          </Td>
                        )}
                        <Td>{fARS(i.costoEstimado)}</Td>
                      </TrHover>
                      {expandido[i.id_ingrediente] &&
                        i.detallePorGusto.map((d) => (
                          <tr key={d.id_producto} className="bg-surface2/30 text-[11.5px] text-text3">
                            <Td></Td>
                            <Td colSpan={mostrarStock ? 6 : 4}>
                              {d.nombreProducto}: {fNum(d.gramosNecesarios, 0)} g
                            </Td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[13px] font-semibold text-accent">Costo total estimado: {fARS(cuadro.costoTotal)}</span>
            <Button size="sm" onClick={generarOrdenDeCompra}>
              Generar orden de compra
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/** Bloque 5 — "Producto completo": a diferencia de las tablas de masa/relleno (que solo miran
 * la receta compartida del gusto), esta consolida TODA la receta derivada de cada variante que
 * realmente se produce — masa, relleno, packaging propio e insumos adicionales del tipo de
 * venta (excepciones, subrecetas incluidas) — escalada por las cajas planificadas del mes. */
function CuadroNecesidadCompletoTabla({ cajasPorGusto }: { cajasPorGusto: Map<string, number> }) {
  const { data, setData } = useStore();
  const { go } = useRouter();
  const { toast } = useToast();
  const cuadro = useMemo(() => calcularCuadroNecesidadCompletoPorGusto(data, cajasPorGusto), [data, cajasPorGusto]);

  function generarOrdenDeCompra() {
    const lineas = cuadro.filas
      .filter((f) => f.tipo === "Ingrediente" && (f.faltante ?? 0) > 0)
      .map((f) => ({
        id_ingrediente: f.concepto,
        cantidad: redondearArribaPractico(f.faltante!),
        precio_unitario: pvr(data.ingredientes.find((i) => i.id === f.concepto)),
      }));
    if (lineas.length === 0) {
      toast("El stock actual ya cubre toda la necesidad de ingredientes — no hay nada que comprar", "info");
      return;
    }
    setData((d) => ({
      ...d,
      borrador_compra_pendiente: { descripcion: "Orden generada desde Planificación — Producto completo", lineas },
    }));
    toast("Borrador de compra generado — revisalo y confirmalo en Compras");
    go("compras");
  }

  return (
    <Card title="Producto completo — por mes (masa + relleno + packaging + insumos adicionales)" className="mb-4">
      {cuadro.filas.length === 0 ? (
        <EmptyState text="Cargá el plan del mes para ver este cuadro." />
      ) : (
        <>
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Tipo</Th>
                  <Th>Concepto</Th>
                  <Th>Cantidad</Th>
                  <Th>Stock actual</Th>
                  <Th>Falta</Th>
                  <Th>Costo est.</Th>
                </tr>
              </thead>
              <tbody>
                {cuadro.filas.map((f) => (
                  <TrHover key={`${f.tipo}:${f.concepto}`}>
                    <Td>
                      <Badge color={f.tipo === "Ingrediente" ? "blue" : f.tipo === "Packaging" ? "purple" : "gold"}>{f.tipo}</Badge>
                    </Td>
                    <Td main>{f.nombre}</Td>
                    <Td>
                      {fNum(f.cantidad, 2)} {f.unidad}
                    </Td>
                    <Td>{f.stockActual !== null ? `${fNum(f.stockActual, 2)} ${f.unidad}` : "—"}</Td>
                    <Td>
                      {f.faltante !== null ? (
                        <Badge color={f.faltante > 0 ? "red" : "green"}>{f.faltante > 0 ? fNum(f.faltante, 2) : "Cubierto"}</Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{fARS(f.costoEstimado)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-[13px] font-semibold text-accent">Costo total estimado: {fARS(cuadro.costoTotal)}</span>
            <Button size="sm" onClick={generarOrdenDeCompra}>
              Generar orden de compra (faltantes de ingredientes)
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

export function PlanProduccion() {
  const { data } = useStore();
  const { mes, anio } = usePeriod();

  const referencia = useMemo(() => referenciaVentasPorGusto(data), [data]);
  const gustos = useMemo(() => gustosActivos(data), [data]);
  const planesGuardados = useMemo(
    () => data.plan_produccion.filter((p) => p.mes === mes && p.anio === anio),
    [data.plan_produccion, mes, anio]
  );

  const cajasSemanaPorGusto = useMemo(
    () => new Map(planesGuardados.map((p) => [p.id_base, p.cajas_semana])),
    [planesGuardados]
  );
  const cajasMesPorGusto = useMemo(() => new Map(planesGuardados.map((p) => [p.id_base, p.cajas_mes])), [planesGuardados]);

  return (
    <div>
      <PageHeader title="Planificación" sub="Cuánto ingrediente comprar cada semana o mes, por gusto" />
      <ReferenciaVentas referencia={referencia} />
      <PlanEditable
        key={`${mes}-${anio}`}
        mes={mes}
        anio={anio}
        referencia={referencia}
        gustos={gustos}
        planesGuardados={planesGuardados}
      />
      <ParametrosPorGusto />
      <CuadroNecesidadTabla
        titulo={`Ingredientes de masa — por semana (${MESES[mes - 1]} ${anio})`}
        componente="masa"
        cajasPorGusto={cajasSemanaPorGusto}
      />
      <CuadroNecesidadTabla
        titulo={`Ingredientes de relleno — por mes (${MESES[mes - 1]} ${anio})`}
        componente="relleno"
        cajasPorGusto={cajasMesPorGusto}
      />
      <CuadroNecesidadCompletoTabla cajasPorGusto={cajasMesPorGusto} />
    </div>
  );
}
