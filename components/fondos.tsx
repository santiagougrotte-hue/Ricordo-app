"use client";

// Finanzas → Fondos: reinversión de maquinaria (amortizaciones + parte de la ganancia), margen de
// seguridad y los préstamos internos que se sacan de ellos para comprar. Reemplaza las pestañas
// SALDOS y FONDOS de la planilla de Finanzas.

import React, { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleAlert, Undo2, Trash2 } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { usePeriod } from "@/lib/period";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fARS, fNum } from "@/lib/calc-v2";
import { fFechaCorta } from "@/lib/calc";
import { Bar, NUM_BIG } from "@/components/ds";
import { Button, Input, Select } from "@/components/ui";
import { Bloque } from "@/components/tablero";
import {
  NOMBRE_FONDO,
  configFondos,
  estadoFondos,
  sugerenciasPendientes,
  conMovimientosFondo,
  conPrestamoDevuelto,
  sinMovimientoFondo,
  conAjustesFondos,
  type EstadoFondo,
} from "@/lib/fondos";
import type { FondoId, ConfigFondos } from "@/lib/types-v2";

const hoyIso = () => new Date().toLocaleDateString("sv-SE");

function TarjetaFondo({ e, nota }: { e: EstadoFondo; nota: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
      <div className="text-[13px] text-text2">{NOMBRE_FONDO[e.fondo]}</div>
      <div className={`mt-2 text-[34px] leading-none ${NUM_BIG} ${e.saldo >= 0 ? "text-text" : "text-red"}`}>{fARS(e.saldo)}</div>
      <div className="mt-1.5 text-[12px] text-text3">{nota}</div>
      {e.meta > 0 && (
        <div className="mt-5">
          <Bar pct={e.pct_meta} color={e.fondo === "seguridad" ? "green" : "accent"} height={8} />
          <div className="mt-2 flex justify-between text-[12px] text-text3">
            <span>{fNum(Math.max(0, e.pct_meta), 1)}% de la meta</span>
            <span>Meta {fARS(e.meta)}</span>
          </div>
        </div>
      )}
      {e.prestado_sin_devolver > 0 && (
        <div className="mt-4 rounded-2xl bg-orange-dim px-3.5 py-3 text-[12.5px] text-text">
          Sacaste {fARS(e.prestado_sin_devolver)} prestado. Cuando lo devuelvas vas a tener <strong>{fARS(e.saldo_con_devoluciones)}</strong>.
        </div>
      )}
    </div>
  );
}

function SacarPlata({ onGuardar }: { onGuardar: (fondo: FondoId, tipo: "prestamo" | "uso", monto: number, concepto: string, fecha: string) => void }) {
  const [fondo, setFondo] = useState<FondoId>("reinversion");
  const [tipo, setTipo] = useState<"prestamo" | "uso">("prestamo");
  const [monto, setMonto] = useState<number | "">("");
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const valido = typeof monto === "number" && monto > 0 && concepto.trim().length > 0;
  return (
    <Bloque titulo="Sacar plata de un fondo" bajada="Por ejemplo, cuando el fondo de reposición no alcanza para las compras.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-text2">De qué fondo</span>
          <Select value={fondo} onChange={(e) => setFondo(e.target.value as FondoId)}>
            <option value="reinversion">{NOMBRE_FONDO.reinversion}</option>
            <option value="seguridad">{NOMBRE_FONDO.seguridad}</option>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-text2">Monto</span>
          <Input type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value === "" ? "" : Number(e.target.value))} placeholder="40000" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[12.5px] text-text2">Para qué</span>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej.: compras del jueves" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-text2">Fecha</span>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <fieldset className="block">
          <legend className="mb-1.5 block text-[12.5px] text-text2">¿Lo vas a devolver?</legend>
          <div className="flex gap-1.5">
            {(
              [
                ["prestamo", "Sí, es un préstamo"],
                ["uso", "No, es un gasto"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={tipo === v}
                onClick={() => setTipo(v)}
                className={`min-h-[38px] flex-1 rounded-xl border px-3 text-[12.5px] font-medium transition-colors ${
                  tipo === v ? "border-accent bg-accent-dim text-text" : "border-border text-text2 hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="mt-3 text-[12px] text-text3">
        {tipo === "prestamo"
          ? "Queda como plata que el negocio le debe al fondo hasta que marques que la devolviste."
          : "Sale del fondo y no vuelve: por ejemplo, una máquina nueva o cubrir un mes en pérdida."}
      </p>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!valido}
          onClick={() => {
            if (!valido) return;
            onGuardar(fondo, tipo, monto as number, concepto.trim(), fecha);
            setMonto("");
            setConcepto("");
          }}
        >
          {tipo === "prestamo" ? "Registrar préstamo" : "Registrar gasto"}
        </Button>
      </div>
    </Bloque>
  );
}

function Ajustes({ cfg, onCambio }: { cfg: ConfigFondos; onCambio: (c: Partial<ConfigFondos>) => void }) {
  const campo = (label: string, key: keyof Omit<ConfigFondos, "movimientos" | "fecha_inicio">, sufijo?: string) => (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-text2">{label}</span>
      <span className="flex items-center gap-2">
        <Input type="number" value={cfg[key]} onChange={(e) => onCambio({ [key]: Number(e.target.value) })} />
        {sufijo && <span className="text-[12px] text-text3">{sufijo}</span>}
      </span>
    </label>
  );
  return (
    <details className="group rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
      <summary className="cursor-pointer list-none text-[15px] font-semibold text-text">
        Cómo se reparte y con qué saldo arrancaste <span className="ml-1 text-text3 group-open:hidden">(tocá para ver)</span>
      </summary>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campo("Ganancia a reinversión", "pct_reinversion", "%")}
        {campo("Ganancia a seguridad", "pct_seguridad", "%")}
        {campo("Amortizaciones por mes", "amortizacion_mensual")}
        {campo("Meta de seguridad", "meses_meta_seguridad", "meses de costos fijos")}
        {campo("Meta de reinversión", "meta_reinversion")}
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] text-text2">Llevando los fondos desde</span>
          <Input type="date" value={cfg.fecha_inicio} onChange={(e) => onCambio({ fecha_inicio: e.target.value })} />
        </label>
        {campo("Saldo inicial de reinversión", "saldo_inicial_reinversion")}
        {campo("Saldo inicial de seguridad", "saldo_inicial_seguridad")}
      </div>
      {cfg.pct_reinversion + cfg.pct_seguridad !== 100 && (
        <p className="mt-3 text-[12.5px] text-orange">Los porcentajes suman {cfg.pct_reinversion + cfg.pct_seguridad}%: deberían sumar 100%.</p>
      )}
    </details>
  );
}

export function FondosTab() {
  const { data, setData } = useStoreV2();
  const { mes, anio } = usePeriod();
  const { toast } = useToast();
  const hoy = hoyIso();
  const cfg = configFondos(data);
  const estado = useMemo(() => estadoFondos(data, mes, anio), [data, mes, anio]);
  const sugerencias = useMemo(() => sugerenciasPendientes(data, hoy), [data, hoy]);
  const historial = [...cfg.movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TarjetaFondo e={estado.reinversion} nota="Amortizaciones y parte de la ganancia, para reponer y comprar equipos" />
        <TarjetaFondo
          e={estado.seguridad}
          nota={
            estado.meses_cubiertos != null
              ? `Cubre ${fNum(Math.max(0, estado.meses_cubiertos), 1)} meses de costos fijos`
              : "Para cubrir meses malos"
          }
        />
      </div>

      {sugerencias.map((s) => (
        <Bloque
          key={s.mes_origen}
          titulo={s.resultado_neto >= 0 ? `Separá lo de ${s.etiqueta}` : `${s.etiqueta[0].toUpperCase()}${s.etiqueta.slice(1)} cerró en pérdida`}
          bajada={`Resultado neto del mes: ${fARS(s.resultado_neto)}. Cuando muevas la plata a cada cuenta, registralo acá.`}
        >
          <ul className="divide-y divide-border">
            {s.movimientos.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                <span className="flex items-center gap-2.5">
                  {m.tipo === "aporte" ? <ArrowDownLeft className="h-4 w-4 text-green" /> : <ArrowUpRight className="h-4 w-4 text-red" />}
                  <span>
                    <span className="text-text">{m.concepto}</span>
                    <span className="block text-[12px] text-text3">{m.tipo === "aporte" ? "a" : "de"} {NOMBRE_FONDO[m.fondo]}</span>
                  </span>
                </span>
                <span className={`font-semibold [font-variant-numeric:tabular-nums] ${m.tipo === "aporte" ? "text-green" : "text-red"}`}>
                  {m.tipo === "aporte" ? "+" : "−"}
                  {fARS(m.monto)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                setData((d) => conMovimientosFondo(d, s.movimientos.map((m) => ({ ...m, id: uid("FON") }))));
                toast(`Reparto de ${s.etiqueta} registrado`);
              }}
            >
              Ya lo separé
            </Button>
          </div>
        </Bloque>
      ))}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SacarPlata
          onGuardar={(fondo, tipo, monto, concepto, fecha) => {
            setData((d) => conMovimientosFondo(d, [{ id: uid("FON"), fecha, fondo, tipo, monto, concepto }]));
            toast(tipo === "prestamo" ? "Préstamo registrado" : "Gasto registrado");
          }}
        />
        <Bloque titulo="Préstamos sin devolver" bajada="Lo que el negocio le debe a tus fondos.">
          {estado.prestamos_pendientes.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text3">No le debés nada a los fondos.</p>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {estado.prestamos_pendientes.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-text">{p.concepto}</span>
                      <span className="text-[12px] text-text3">
                        {fFechaCorta(p.fecha)}, de {NOMBRE_FONDO[p.fondo]}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[13.5px] font-semibold text-text [font-variant-numeric:tabular-nums]">{fARS(p.monto)}</span>
                      <Button
                        variant="green"
                        size="sm"
                        onClick={() => {
                          setData((d) => conPrestamoDevuelto(d, p.id, hoy));
                          toast("Préstamo devuelto");
                        }}
                      >
                        Lo devolví
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-[13px]">
                <span className="text-text2">Total a devolver</span>
                <span className="font-semibold text-text">{fARS(estado.total_prestado)}</span>
              </div>
            </>
          )}
        </Bloque>
      </div>

      <Bloque titulo="Movimientos de los fondos">
        {historial.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text3">Todavía no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {historial.map((m) => {
              const entra = m.tipo === "aporte";
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {entra ? <ArrowDownLeft className="h-4 w-4 shrink-0 text-green" /> : m.tipo === "prestamo" ? <Undo2 className="h-4 w-4 shrink-0 text-orange" /> : <ArrowUpRight className="h-4 w-4 shrink-0 text-red" />}
                    <span className="min-w-0">
                      <span className="block truncate text-text">{m.concepto}</span>
                      <span className="text-[12px] text-text3">
                        {fFechaCorta(m.fecha)}, {NOMBRE_FONDO[m.fondo]}
                        {m.tipo === "prestamo" && (m.devuelto_el ? `, devuelto el ${fFechaCorta(m.devuelto_el)}` : ", préstamo sin devolver")}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`font-semibold [font-variant-numeric:tabular-nums] ${entra ? "text-green" : m.tipo === "prestamo" && m.devuelto_el ? "text-text3" : "text-red"}`}>
                      {entra ? "+" : "−"}
                      {fARS(m.monto)}
                    </span>
                    {m.tipo === "prestamo" && m.devuelto_el && (
                      <button
                        title="Marcar como no devuelto"
                        aria-label="Marcar como no devuelto"
                        onClick={() => setData((d) => conPrestamoDevuelto(d, m.id, undefined))}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-text3 hover:bg-surface2 hover:text-text"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      title="Borrar movimiento"
                      aria-label={`Borrar ${m.concepto}`}
                      onClick={() => {
                        if (window.confirm(`¿Borrar "${m.concepto}" (${fARS(m.monto)})?`)) setData((d) => sinMovimientoFondo(d, m.id));
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text3 hover:bg-surface2 hover:text-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Bloque>

      <Ajustes cfg={cfg} onCambio={(c) => setData((d) => conAjustesFondos(d, c))} />

      <p className="flex items-start gap-2 text-[12px] text-text3">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Los fondos reparten la plata de tu caja en sectores: registrar un movimiento acá no cambia el saldo de caja.
      </p>
    </div>
  );
}
