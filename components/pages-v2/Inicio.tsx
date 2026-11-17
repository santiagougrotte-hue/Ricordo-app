"use client";

import React, { useMemo, useState } from "react";
import { ShoppingCart, PackagePlus, Factory, Truck } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { useRouter } from "@/lib/nav-context";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { usePeriod, MESES } from "@/lib/period";
import { TableWrap, Td, EmptyState, Badge, Alert, Field, FormGrid, Input, Button } from "@/components/ui";
import { calcularFondoReposicion } from "@/lib/fondo-reposicion";
import { Modal } from "@/components/Modal";
import { Bloque, SeguimientoMes, CompraJueves, PlataPanel, MargenesPanel, Simulador } from "@/components/tablero";
import {
  saldoCaja,
  itemsSinCostoDeterminado,
  fARS,
  fNum,
  primerDiaMes,
  ultimoDiaMes,
  sumarDias,
  variantesSinFactorReceta,
} from "@/lib/calc-v2";
import { fFechaCorta } from "@/lib/calc";
import {
  calcularEquilibrioMes,
  ritmoDelMes,
  semanasDelMes,
  proximoJueves,
  rankingProductos,
} from "@/lib/tablero";
import { planSemanal } from "@/lib/planificacion";
import { estadoFondos, sugerenciasPendientes } from "@/lib/fondos";
import { resultadoMes } from "@/lib/negocio";
import { generarResumenInteligente } from "@/lib/resumen-inteligente";
import { produccionPendientePorSabor, gustosSinVarianteActiva } from "@/lib/rellenos";
import type { Conclusion } from "@/lib/resumen-inteligente";
import type { EstadoPedido } from "@/lib/types-v2";

const ESTADO_COLOR: Record<EstadoPedido, "blue" | "orange" | "green" | "red"> = {
  Confirmado: "blue",
  Produccion: "orange",
  Entregado: "green",
  Cancelado: "red",
};

const CATEGORIA_COLOR: Record<Conclusion["categoria"], "green" | "red" | "blue"> = { positivo: "green", negativo: "red", neutral: "blue" };

function FilaConclusion({ conclusion }: { conclusion: Conclusion }) {
  const [expandido, setExpandido] = useState(false);
  return (
    <li className="rounded-md border border-border bg-surface2/40 p-3 text-[12.5px]">
      <div className="flex items-start gap-2">
        <Badge color={CATEGORIA_COLOR[conclusion.categoria]}>●</Badge>
        <div className="flex-1 text-text2">{conclusion.texto}</div>
      </div>
      <button className="mt-1.5 text-[11px] font-medium text-accent hover:underline" onClick={() => setExpandido((v) => !v)}>
        {expandido ? "Ocultar datos" : "¿Por qué?"}
      </button>
      {expandido && (
        <TableWrap>
          <table className="mt-2 w-full">
            <tbody>
              {Object.entries(conclusion.datos).map(([clave, valor]) => (
                <tr key={clave}>
                  <Td className="text-text3">{clave}</Td>
                  <Td className="font-medium text-text">{valor === null ? "—" : typeof valor === "number" ? fNum(valor, 2) : valor}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </li>
  );
}

const CATEGORIA_VIAJE_DE_COMPRA = "Costo Indirecto — Viajes de compra";

export function Inicio() {
  const { data, setData } = useStoreV2();
  const fondo = useMemo(() => calcularFondoReposicion(data), [data]);
  const { toast } = useToast();
  const router = useRouter();
  const { mes, anio } = usePeriod();
  const [viajeModalOpen, setViajeModalOpen] = useState(false);
  const [viajeForm, setViajeForm] = useState({ monto: 0, fecha: new Date().toISOString().slice(0, 10), nota: "" });

  function guardarViaje() {
    if (viajeForm.monto <= 0) {
      toast("Ingresá un monto mayor a 0", "error");
      return;
    }
    setData((d) => {
      let categorias = d.categorias;
      let categoria = categorias.find((c) => c.ambito === "financiero" && c.nombre === CATEGORIA_VIAJE_DE_COMPRA);
      if (!categoria) {
        categoria = { id: uid("CAT"), nombre: CATEGORIA_VIAJE_DE_COMPRA, ambito: "financiero", activo: true };
        categorias = [...categorias, categoria];
      }
      return {
        ...d,
        categorias,
        movimientos_financieros: [
          ...d.movimientos_financieros,
          {
            id: uid("MOVF"),
            fecha: viajeForm.fecha,
            tipo: "egreso",
            categoria_id: categoria.id,
            concepto: viajeForm.nota.trim() || "Viaje de compra",
            monto: viajeForm.monto,
            estado: "confirmado",
          },
        ],
      };
    });
    toast("Viaje registrado");
    setViajeModalOpen(false);
    setViajeForm({ monto: 0, fecha: new Date().toISOString().slice(0, 10), nota: "" });
  }

  const hoy = useMemo(() => new Date().toLocaleDateString("sv-SE"), []);
  const fechaLarga = useMemo(() => {
    const t = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }, []);
  const desde = primerDiaMes(mes, anio);
  const hasta = ultimoDiaMes(mes, anio);

  const equilibrio = useMemo(() => calcularEquilibrioMes(data, mes, anio, hoy), [data, mes, anio, hoy]);
  const ritmo = useMemo(() => ritmoDelMes(data, mes, anio, hoy, equilibrio.punto_equilibrio), [data, mes, anio, hoy, equilibrio.punto_equilibrio]);
  const semanas = useMemo(() => semanasDelMes(data, mes, anio, hoy, equilibrio.punto_equilibrio), [data, mes, anio, hoy, equilibrio.punto_equilibrio]);
  const resultadoNeto = useMemo(() => resultadoMes(data, mes, anio).resultado_neto, [data, mes, anio]);
  const jueves = proximoJueves(hoy);
  const compra = useMemo(() => planSemanal(data, jueves), [data, jueves]);
  const ranking = useMemo(() => rankingProductos(data, sumarDias(hoy, -90), hoy), [data, hoy]);
  const resumen = useMemo(() => generarResumenInteligente(data, mes, anio), [data, mes, anio]);
  const caja = useMemo(() => saldoCaja(data), [data]);
  const fondos = useMemo(() => estadoFondos(data, mes, anio), [data, mes, anio]);
  const porSeparar = useMemo(() => sugerenciasPendientes(data, hoy), [data, hoy]);

  const pedidosPendientes = useMemo(
    () => data.pedidos.filter((p) => p.estado === "Confirmado" || p.estado === "Produccion").sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [data.pedidos]
  );
  // Agrupado por sabor (producto), no por presentación/canal — el freezer por gusto ya es un solo
  // pool compartido entre todas las variantes del mismo producto (ver conSalidaFreezerPedido).
  const itemsEnProduccion = useMemo(
    () => produccionPendientePorSabor(data, pedidosPendientes.filter((p) => p.estado === "Produccion")),
    [data, pedidosPendientes]
  );

  // Avisos de datos que dejan un número incompleto o un descuento de stock sin hacer — se juntan en
  // un solo recuadro corto en vez de un aviso largo por cada uno.
  const variantesSinUnidades = useMemo(() => variantesSinFactorReceta(data), [data]);
  const gustosSinPresentacion = useMemo(() => gustosSinVarianteActiva(data), [data]);
  const itemsSinCosto = useMemo(() => itemsSinCostoDeterminado(data, desde, hasta), [data, desde, hasta]);
  const pedidosMananaSinEntregar = useMemo(() => {
    const manana = sumarDias(hoy, 1);
    return data.pedidos.filter((p) => p.fecha === manana && (p.estado === "Confirmado" || p.estado === "Produccion"));
  }, [data.pedidos, hoy]);
  const irProductos = { label: "Ir a Productos", accion: () => router.go("productos") };
  const avisos: { texto: string; ir?: { label: string; accion: () => void } }[] = [];
  if (pedidosMananaSinEntregar.length > 0)
    avisos.push({ texto: `${pedidosMananaSinEntregar.length} pedido(s) para mañana todavía sin entregar.`, ir: { label: "Ver pedidos", accion: () => router.go("ventas", "pedidos") } });
  if (variantesSinUnidades.length > 0)
    avisos.push({ texto: `${variantesSinUnidades.map((v) => v.variante_nombre).join(", ")}: sin “unidades por paquete”, su costo sale en $0.`, ir: irProductos });
  if (gustosSinPresentacion.length > 0)
    avisos.push({ texto: `${gustosSinPresentacion.map((g) => g.producto_nombre).join(", ")}: sin presentación activa, la producción no descuenta insumos.`, ir: irProductos });
  if (itemsSinCosto.length > 0)
    avisos.push({ texto: `${Array.from(new Set(itemsSinCosto.map((i) => i.nombre_historico))).join(", ")}: vendidos sin costo cargado, el margen del mes está incompleto.`, ir: irProductos });

  const clienteNombre = (id: string) => data.clientes.find((c) => c.id === id)?.nombre ?? "—";

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-text">
            {MESES[mes - 1]} {anio}
          </h1>
          <p className="mt-1 text-[13px] text-text3">{fechaLarga}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => router.go("ventas", "pedidos")}>
            <ShoppingCart className="h-4 w-4" /> Nuevo pedido
          </Button>
          <Button variant="ghost" onClick={() => router.go("operaciones", "compras")}>
            <PackagePlus className="h-4 w-4" /> Cargar compra
          </Button>
          <Button variant="ghost" onClick={() => router.go("operaciones", "produccion")}>
            <Factory className="h-4 w-4" /> Producción
          </Button>
          <Button variant="ghost" onClick={() => setViajeModalOpen(true)}>
            <Truck className="h-4 w-4" /> Viaje de compra
          </Button>
        </div>
      </div>

      <Modal
        open={viajeModalOpen}
        onClose={() => setViajeModalOpen(false)}
        title="Viaje de compra"
        footer={
          <>
            <Button variant="ghost" onClick={() => setViajeModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarViaje}>Guardar viaje</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Monto">
            <Input type="number" value={viajeForm.monto} onChange={(e) => setViajeForm({ ...viajeForm, monto: Number(e.target.value) })} />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={viajeForm.fecha} onChange={(e) => setViajeForm({ ...viajeForm, fecha: e.target.value })} />
          </Field>
          <Field label="Nota" full>
            <Input value={viajeForm.nota} onChange={(e) => setViajeForm({ ...viajeForm, nota: e.target.value })} placeholder="Ej.: Compra de insumos en Berazategui" />
          </Field>
        </FormGrid>
      </Modal>

      {avisos.length > 0 && (
        <Alert kind="warning">
          <div className="space-y-1">
            {avisos.map((a) => (
              <div key={a.texto}>
                {a.texto}{" "}
                {a.ir && (
                  <button className="font-medium underline" onClick={a.ir.accion}>
                    {a.ir.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Alert>
      )}

      <SeguimientoMes eq={equilibrio} ritmo={ritmo} semanas={semanas} resultadoNeto={resultadoNeto} nombreMes={MESES[mes - 1]} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <CompraJueves plan={compra} onAjustar={() => router.go("operaciones", "planificacion")} />
        <PlataPanel
          caja={caja}
          disponibleReposicion={fondo.disponible_total}
          reinversion={fondos.reinversion.saldo}
          seguridad={fondos.seguridad.saldo}
          prestado={fondos.total_prestado + fondos.te_debe}
          mesesPorSeparar={porSeparar.map((s) => s.etiqueta)}
          onVerFondos={() => router.go("finanzas", "fondos")}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <MargenesPanel ranking={ranking} />
        <Simulador data={data} mes={mes} anio={anio} hoy={hoy} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Bloque titulo="Para atender" bajada="Pedidos confirmados o en producción.">
          {pedidosPendientes.length === 0 ? (
            <EmptyState text="No hay pedidos pendientes. Cuando cargues uno, aparece acá." />
          ) : (
            <ul className="divide-y divide-border">
              {pedidosPendientes.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => router.go("ventas", "pedidos")}
                    className="flex w-full min-h-[48px] items-center justify-between gap-3 py-2.5 text-left hover:bg-surface2/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-text">{clienteNombre(p.cliente_id)}</span>
                      <span className="text-[12px] text-text3">{fFechaCorta(p.fecha)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[13px] font-semibold text-text [font-variant-numeric:tabular-nums]">{fARS(p.total)}</span>
                      <Badge color={ESTADO_COLOR[p.estado]}>{p.estado === "Produccion" ? "En producción" : p.estado}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {itemsEnProduccion.length > 0 && (
            <div className="mt-4 rounded-2xl bg-surface2 p-4">
              <div className="mb-2 text-[12.5px] text-text2">Falta producir para esos pedidos</div>
              <ul className="space-y-1.5 text-[13px]">
                {itemsEnProduccion.map((it) => (
                  <li key={it.nombre} className="flex justify-between gap-3">
                    <span className="text-text">{it.nombre}</span>
                    <span className="font-medium text-text [font-variant-numeric:tabular-nums]">{fNum(it.cantidad, 1)} cajas</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Bloque>

        <Bloque titulo="Lo que dicen tus números" bajada="Conclusiones calculadas con tus datos del mes.">
          {resumen.length === 0 ? (
            <EmptyState text="Todavía no hay movimientos suficientes este mes para sacar conclusiones." />
          ) : (
            <ul className="flex flex-col gap-2">
              {resumen.slice(0, 4).map((c) => (
                <FilaConclusion key={c.id} conclusion={c} />
              ))}
            </ul>
          )}
        </Bloque>
      </div>
    </div>
  );
}
