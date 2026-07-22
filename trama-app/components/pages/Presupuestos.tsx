"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { imprimirPresupuesto } from "@/lib/print";
import {
  Alert,
  Badge,
  BarRow,
  Button,
  Card,
  EmptyState,
  Field,
  FilterTabs,
  FormGrid,
  Input,
  KpiCard,
  PageHeader,
  Select,
  Steps,
  StatGrid,
  Tabs,
  Td,
  Textarea,
  Th,
  TableWrap,
  TrHover,
  YesNo,
} from "@/components/ui";
import {
  calcularPresupuesto,
  costoFijoPorHora,
  costoManoDeObra,
  fMoney,
  fPct,
  indicadorRentabilidad,
  montoDistribucion,
  pctDe,
  resumenDistribucion,
  siguienteNumeroPresupuesto,
  sumaParticipacion,
  todayISO,
} from "@/lib/calc";
import {
  CATEGORIAS_COSTO_ADICIONAL,
  CATEGORIAS_DISTRIBUCION_SUGERIDAS,
  ESTADOS_PRESUPUESTO,
  emptyWizardRespuestas,
  type Complejidad,
  type Config,
  type CostoAdicional,
  type DistribucionItem,
  type EstadoPresupuesto,
  type Moneda,
  type Persona,
  type Presupuesto,
  type PresupuestoItem,
  type PrecioElegido,
  type Servicio,
  type WizardRespuestas,
} from "@/lib/types";

const WIZARD_STEPS = ["Cliente", "Necesidades", "Servicios", "Costos", "Parámetros", "Resultado"];

const ESTADO_BADGE: Record<EstadoPresupuesto, "accent" | "green" | "orange" | "blue" | "red" | "purple"> = {
  borrador: "blue",
  revision: "purple",
  enviado: "blue",
  visto: "purple",
  negociacion: "orange",
  aprobado: "green",
  rechazado: "red",
  vencido: "red",
};

function nuevoDraft(numero: number, config: Config): Presupuesto {
  return {
    id: uid("pre"),
    numero,
    clienteId: null,
    nombreCliente: "",
    contacto: "",
    fecha: todayISO(),
    validezDias: 15,
    estado: "borrador",
    moneda: config.monedaPrincipal,
    tipoCambio: config.tipoCambioDefault,
    respuestas: emptyWizardRespuestas(),
    items: [],
    costosAdicionales: [],
    impuestosPct: config.porcentajeImpuestos,
    comisionesPct: config.comisionesPct,
    margenMinimoPct: config.margenGananciaMinimo,
    margenSugeridoPct: config.margenGananciaSugerido,
    margenPremiumPct: config.margenGananciaPremium,
    fondoImprevistosPct: config.fondoImprevistos,
    precioElegido: "sugerido",
    precioManual: 0,
    distribucion: [],
    introduccion: "",
    objetivos: "",
    entregables: "",
    cronograma: "",
    formaPago: "",
    condiciones: "",
    serviciosNoIncluidos: "",
    observaciones: "",
  };
}

function buscarServicio(servicios: Servicio[], nombre: string): Servicio | undefined {
  return servicios.find((s) => s.nombre === nombre);
}

function itemDeServicio(s: Servicio, cantidad: number): PresupuestoItem {
  return {
    id: uid("item"),
    servicioId: s.id,
    nombre: s.nombre,
    cantidad,
    unidad: s.unidad,
    precioUnitario: s.costoInterno,
    costoUnitario: s.costoInterno,
    participacionPct: s.participacionPct,
    personaId: s.personaId,
    horasEstimadas: s.horasEstimadas,
  };
}

function sugerirItems(r: WizardRespuestas, servicios: Servicio[]): PresupuestoItem[] {
  const out: PresupuestoItem[] = [];
  const add = (nombre: string, cantidad: number) => {
    if (cantidad <= 0) return;
    const s = buscarServicio(servicios, nombre);
    if (s) out.push(itemDeServicio(s, cantidad));
  };
  add("Estrategia de redes sociales", r.estrategiaComunicacion ? 1 : 0);
  add("Community management", r.communityManagement ? 1 : 0);
  add("Planificación mensual de contenido", r.modalidadTrabajo === "mensual" ? 1 : 0);
  add("Posts estáticos", r.publicacionesMensuales);
  add("Historias de Instagram", r.historiasMensuales);
  add("Reels", r.reels ? r.reelsCantidad : 0);
  add("Edición de reels", r.reels && r.edicion ? r.reelsCantidad : 0);
  add("Fotografía de producto", r.produccionPresencial && r.fotografia ? r.jornadas : 0);
  add("Filmación de contenido", r.produccionPresencial && r.video ? r.jornadas : 0);
  add("Estilismo", r.produccionPresencial && r.estilismo ? r.jornadas : 0);
  add("Dirección creativa", r.direccionCreativa ? 1 : 0);
  add("Diseño gráfico", r.disenoGrafico ? Math.max(2, Math.round(r.publicacionesMensuales / 2)) : 0);
  add("Cobertura de eventos", r.coberturaEventos ? 1 : 0);
  return out;
}

function sugerirCostos(r: WizardRespuestas): CostoAdicional[] {
  const out: CostoAdicional[] = [];
  const add = (categoria: string, descripcion: string) => {
    out.push({ id: uid("cad"), categoria, descripcion, monto: 0 });
  };
  if (r.traslados) add("Traslados", "Traslados del equipo");
  if (r.locacion) add("Alquiler de locación", "Locación para producción");
  if (r.utileria) add("Utilería", "Utilería para producción");
  if (r.modelos) add("Modelos", "Casting / cachet de modelos");
  if (r.maquillaje) add("Maquillaje y peinado", "Maquillaje y peinado");
  return out;
}

function desgloseCostosPorResponsable(p: Presupuesto, servicios: Servicio[]): { responsable: string; monto: number }[] {
  const map = new Map<string, number>();
  for (const it of p.items) {
    const s = it.servicioId ? servicios.find((sv) => sv.id === it.servicioId) : null;
    const key = s?.profesionalResponsable || "Sin asignar";
    map.set(key, (map.get(key) ?? 0) + it.costoUnitario * it.cantidad);
  }
  return Array.from(map.entries())
    .map(([responsable, monto]) => ({ responsable, monto }))
    .sort((a, b) => b.monto - a.monto);
}

// ---------- Sub-editores reutilizados en el wizard y en el detalle ----------

function ItemsEditor({
  p,
  servicios,
  equipo,
  onChange,
}: {
  p: Presupuesto;
  servicios: Servicio[];
  equipo: Persona[];
  onChange: (items: PresupuestoItem[]) => void;
}) {
  const [pickId, setPickId] = useState("");

  function addFromCatalog() {
    const s = servicios.find((sv) => sv.id === pickId);
    if (!s) return;
    onChange([...p.items, itemDeServicio(s, 1)]);
    setPickId("");
  }

  function addManual() {
    onChange([
      ...p.items,
      { id: uid("item"), servicioId: null, nombre: "Servicio a medida", cantidad: 1, unidad: "proyecto", precioUnitario: 0, costoUnitario: 0, participacionPct: 0, personaId: null, horasEstimadas: 0 },
    ]);
  }

  function update(id: string, patch: Partial<PresupuestoItem>) {
    onChange(p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  // Al cambiar horas o profesional, recalcula el costo automáticamente si hay un profesional vinculado.
  function updateConCostoAuto(id: string, patch: Partial<PresupuestoItem>) {
    onChange(
      p.items.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        const costo = costoManoDeObra(next.horasEstimadas, next.personaId, equipo);
        return costo != null ? { ...next, costoUnitario: costo } : next;
      })
    );
  }
  function remove(id: string) {
    onChange(p.items.filter((it) => it.id !== id));
  }

  const totalCosto = p.items.reduce((a, it) => a + it.costoUnitario * it.cantidad, 0);
  const totalPrecio = p.items.reduce((a, it) => a + it.precioUnitario * it.cantidad, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Agregar servicio del catálogo">
          <Select value={pickId} onChange={(e) => setPickId(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Elegir servicio…</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </Select>
        </Field>
        <Button size="sm" variant="ghost" onClick={addFromCatalog} disabled={!pickId}>+ Agregar</Button>
        <Button size="sm" variant="ghost" onClick={addManual}>+ Ítem a medida</Button>
      </div>

      {p.items.length === 0 ? (
        <EmptyState text="Sin ítems todavía. Agregá servicios del catálogo o uno a medida." />
      ) : (
        <TableWrap>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <Th>Servicio</Th>
                <Th>Cant.</Th>
                <Th title="Horas por unidad — se usan para calcular el costo automático y prorratear costos fijos">Horas</Th>
                <Th title="Si elegís un profesional, el costo se calcula solo (horas × valor hora)">Profesional</Th>
                <Th title="Precio que se le cobra al cliente por unidad">Precio unit.</Th>
                <Th title="Costo interno por unidad">Costo unit.</Th>
                <Th>Subtotal</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((it) => (
                <TrHover key={it.id}>
                  <Td main>
                    <Input value={it.nombre} onChange={(e) => update(it.id, { nombre: e.target.value })} />
                  </Td>
                  <Td>
                    <Input type="number" min={0} step={0.5} value={it.cantidad} onChange={(e) => update(it.id, { cantidad: Number(e.target.value) })} style={{ width: 65 }} />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={it.horasEstimadas || ""}
                      onChange={(e) => updateConCostoAuto(it.id, { horasEstimadas: Number(e.target.value) })}
                      style={{ width: 65 }}
                    />
                  </Td>
                  <Td>
                    <Select
                      value={it.personaId ?? ""}
                      onChange={(e) => updateConCostoAuto(it.id, { personaId: e.target.value || null })}
                      style={{ minWidth: 140 }}
                    >
                      <option value="">— Manual —</option>
                      {equipo.map((per) => (
                        <option key={per.id} value={per.id}>{per.nombre}</option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Input type="number" min={0} value={it.precioUnitario} onChange={(e) => update(it.id, { precioUnitario: Number(e.target.value) })} style={{ width: 100 }} />
                  </Td>
                  <Td>
                    <Input
                      type="number"
                      min={0}
                      value={it.costoUnitario}
                      disabled={Boolean(it.personaId)}
                      className={it.personaId ? "opacity-70" : ""}
                      onChange={(e) => update(it.id, { costoUnitario: Number(e.target.value) })}
                      style={{ width: 100 }}
                    />
                  </Td>
                  <Td>{fMoney(it.precioUnitario * it.cantidad, p.moneda)}</Td>
                  <Td>
                    <button onClick={() => remove(it.id)} className="text-text3 hover:text-red">✕</button>
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <div className="mt-3 flex justify-end gap-6 text-[12.5px]">
        <span className="text-text3">Costo interno: <span className="font-medium text-text2">{fMoney(totalCosto, p.moneda)}</span></span>
        <span className="text-text3">Precio al cliente: <span className="font-medium text-text2">{fMoney(totalPrecio, p.moneda)}</span></span>
      </div>
    </div>
  );
}

function CostosEditor({ p, onChange }: { p: Presupuesto; onChange: (c: CostoAdicional[]) => void }) {
  function add() {
    onChange([...p.costosAdicionales, { id: uid("cad"), categoria: CATEGORIAS_COSTO_ADICIONAL[0], descripcion: "", monto: 0 }]);
  }
  function update(id: string, patch: Partial<CostoAdicional>) {
    onChange(p.costosAdicionales.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(id: string) {
    onChange(p.costosAdicionales.filter((c) => c.id !== id));
  }
  const total = p.costosAdicionales.reduce((a, c) => a + c.monto, 0);

  return (
    <div>
      <div className="mb-3">
        <Button size="sm" variant="ghost" onClick={add}>+ Agregar costo</Button>
      </div>
      {p.costosAdicionales.length === 0 ? (
        <EmptyState text="Sin costos adicionales (traslados, viáticos, equipamiento, locación, utilería…)." />
      ) : (
        <TableWrap>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <Th>Categoría</Th>
                <Th>Descripción</Th>
                <Th>Monto</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {p.costosAdicionales.map((c) => (
                <TrHover key={c.id}>
                  <Td>
                    <Select value={c.categoria} onChange={(e) => update(c.id, { categoria: e.target.value })}>
                      {CATEGORIAS_COSTO_ADICIONAL.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Input value={c.descripcion} onChange={(e) => update(c.id, { descripcion: e.target.value })} />
                  </Td>
                  <Td>
                    <Input type="number" min={0} value={c.monto} onChange={(e) => update(c.id, { monto: Number(e.target.value) })} style={{ width: 110 }} />
                  </Td>
                  <Td>
                    <button onClick={() => remove(c.id)} className="text-text3 hover:text-red">✕</button>
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <div className="mt-3 flex justify-end text-[12.5px]">
        <span className="text-text3">Total costos adicionales: <span className="font-medium text-text2">{fMoney(total, p.moneda)}</span></span>
      </div>
    </div>
  );
}

function ParametrosEditor({ p, onChange }: { p: Presupuesto; onChange: (patch: Partial<Presupuesto>) => void }) {
  return (
    <FormGrid>
      <Field label="Impuestos (%)">
        <Input type="number" min={0} max={100} value={p.impuestosPct} onChange={(e) => onChange({ impuestosPct: Number(e.target.value) })} />
      </Field>
      <Field label="Comisiones (%)">
        <Input type="number" min={0} max={100} value={p.comisionesPct} onChange={(e) => onChange({ comisionesPct: Number(e.target.value) })} />
      </Field>
      <Field label="Fondo para imprevistos (%)">
        <Input type="number" min={0} max={100} value={p.fondoImprevistosPct} onChange={(e) => onChange({ fondoImprevistosPct: Number(e.target.value) })} />
      </Field>
      <Field label="Margen mínimo (%)">
        <Input type="number" min={0} max={95} value={p.margenMinimoPct} onChange={(e) => onChange({ margenMinimoPct: Number(e.target.value) })} />
      </Field>
      <Field label="Margen sugerido (%)">
        <Input type="number" min={0} max={95} value={p.margenSugeridoPct} onChange={(e) => onChange({ margenSugeridoPct: Number(e.target.value) })} />
      </Field>
      <Field label="Margen premium (%)">
        <Input type="number" min={0} max={95} value={p.margenPremiumPct} onChange={(e) => onChange({ margenPremiumPct: Number(e.target.value) })} />
      </Field>
      <Field label="Moneda">
        <Select value={p.moneda} onChange={(e) => onChange({ moneda: e.target.value as Moneda })}>
          <option value="ARS">Pesos (ARS)</option>
          <option value="USD">Dólares (USD)</option>
        </Select>
      </Field>
      {p.moneda === "USD" && (
        <Field label="Tipo de cambio usado">
          <Input type="number" min={0} value={p.tipoCambio} onChange={(e) => onChange({ tipoCambio: Number(e.target.value) })} />
        </Field>
      )}
      <Field label="Validez (días)">
        <Input type="number" min={1} value={p.validezDias} onChange={(e) => onChange({ validezDias: Number(e.target.value) })} />
      </Field>
    </FormGrid>
  );
}

function ResultadoView({
  p,
  servicios,
  config,
  costoFijoPorHoraValue,
  onChange,
}: {
  p: Presupuesto;
  servicios: Servicio[];
  config: Config;
  costoFijoPorHoraValue: number;
  onChange: (patch: Partial<Presupuesto>) => void;
}) {
  const t = calcularPresupuesto(p, costoFijoPorHoraValue);
  const desglose = desgloseCostosPorResponsable(p, servicios);
  const indicador = indicadorRentabilidad(t.margenReal, config);

  const tiers: { key: PrecioElegido; label: string; precio: number; margenPct: number }[] = [
    { key: "minimo", label: "Precio mínimo", precio: t.precioMinimo, margenPct: p.margenMinimoPct },
    { key: "sugerido", label: "Precio sugerido", precio: t.precioSugerido, margenPct: p.margenSugeridoPct },
    { key: "premium", label: "Precio premium", precio: t.precioPremium, margenPct: p.margenPremiumPct },
  ];

  const breakdown = [
    { label: "Costo de servicios", monto: t.costoItems },
    { label: "Costos adicionales", monto: t.costoAdicionales },
    { label: "Costos fijos prorrateados", monto: t.costosFijosProrrateados },
    { label: "Fondo para imprevistos", monto: t.fondoImprevistosMonto },
    { label: "Impuestos", monto: t.impuestosMonto },
    { label: "Comisiones", monto: t.comisionesMonto },
    { label: "Ganancia TRAMA", monto: t.gananciaTrama },
  ];
  const maxBreak = Math.max(1, ...breakdown.map((b) => Math.abs(b.monto)));

  return (
    <div>
      <div
        className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-[13px] font-medium ${
          indicador.nivel === "excelente"
            ? "border-green/20 bg-green-dim text-green"
            : indicador.nivel === "aceptable"
            ? "border-orange/20 bg-orange-dim text-orange"
            : "border-red/20 bg-red-dim text-red"
        }`}
      >
        <span className="text-lg leading-none">{indicador.icono}</span> {indicador.texto} — margen real {fPct(t.margenReal, 1)}
      </div>

      <StatGrid>
        <KpiCard label="Costo interno del proyecto" value={fMoney(t.costoInterno, p.moneda)} />
        <KpiCard label="Precio final elegido" value={fMoney(t.precioFinal, p.moneda)} color="accent" />
        <KpiCard label="Ganancia estimada TRAMA" value={fMoney(t.gananciaTrama, p.moneda)} color={t.gananciaTrama >= 0 ? "green" : "red"} />
        <KpiCard label="Margen real" value={fPct(t.margenReal, 1)} color={t.margenReal >= 0 ? "green" : "red"} />
      </StatGrid>

      <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">Opción 2 — precio calculado automáticamente</div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.key}
            onClick={() => onChange({ precioElegido: tier.key })}
            className={`cursor-pointer rounded-[10px] border p-4 transition-colors ${
              p.precioElegido === tier.key ? "border-accent bg-accent-dim" : "border-border bg-surface"
            }`}
          >
            <div className="text-[10px] uppercase tracking-[1.2px] text-text3">{tier.label}</div>
            <div className="font-display my-1.5 text-xl font-semibold text-text">{fMoney(tier.precio, p.moneda)}</div>
            <div className="text-[11px] text-text3">Margen configurado: {fPct(tier.margenPct, 0)}</div>
          </div>
        ))}
      </div>

      <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">Opción 1 — ingresar el precio total del proyecto</div>
      <Field label="Precio total del proyecto">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={p.precioManual || ""}
            onChange={(e) => onChange({ precioManual: Number(e.target.value), precioElegido: "manual" })}
            placeholder="0"
            style={{ maxWidth: 200 }}
          />
          {p.precioElegido === "manual" && <Badge color="accent">En uso</Badge>}
        </div>
      </Field>
      <p className="mt-1.5 text-[11px] text-text3">
        Al usar esta opción, el total se distribuye automáticamente entre los servicios según su participación (ver
        abajo).
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Composición del presupuesto (% del precio final)">
          <div className="flex flex-col gap-2">
            {breakdown.map((b) => (
              <BarRow key={b.label} label={b.label} value={fPct(pctDe(b.monto, t.precioFinal), 1)} pct={(Math.abs(b.monto) / maxBreak) * 100} />
            ))}
          </div>
        </Card>
        <Card title="Pagos que corresponden a cada responsable">
          {desglose.length === 0 ? (
            <EmptyState text="Agregá ítems para ver el desglose por responsable." />
          ) : (
            <div className="flex flex-col gap-2">
              {desglose.map((d) => (
                <div key={d.responsable} className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-none">
                  <span className="text-[12px] text-text2">{d.responsable}</span>
                  <span className="text-[12px] font-medium text-text">{fMoney(d.monto, p.moneda)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {p.items.length > 0 && (
        <Card title="Participación de servicios sobre el total" className="mt-4">
          {Math.abs(sumaParticipacion(p) - 100) > 0.5 && (
            <Alert kind="warning">
              La suma de las participaciones de los servicios es {fPct(sumaParticipacion(p), 1)}, no 100%.
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            {p.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-none">
                <span className="text-[12px] text-text2">{it.nombre}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-text3">{fPct(it.participacionPct, 1)}</span>
                  <span className="text-[12px] font-medium text-text">{fMoney(t.precioFinal * (it.participacionPct / 100), p.moneda)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function DistribucionEditor({
  p,
  equipo,
  costoFijoPorHoraValue,
  onChange,
}: {
  p: Presupuesto;
  equipo: { id: string; nombre: string }[];
  costoFijoPorHoraValue: number;
  onChange: (d: DistribucionItem[]) => void;
}) {
  const t = calcularPresupuesto(p, costoFijoPorHoraValue);
  const resumen = resumenDistribucion(p, t.precioFinal);

  function add() {
    onChange([...p.distribucion, { id: uid("dist"), categoria: CATEGORIAS_DISTRIBUCION_SUGERIDAS[0], personaId: null, tipo: "porcentaje", valor: 0 }]);
  }
  function update(id: string, patch: Partial<DistribucionItem>) {
    onChange(p.distribucion.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function remove(id: string) {
    onChange(p.distribucion.filter((d) => d.id !== id));
  }

  return (
    <div>
      {resumen.excede && <Alert kind="danger">La distribución supera el presupuesto total por {fMoney(-resumen.diferencia, p.moneda)}.</Alert>}
      {resumen.incompleto && <Alert kind="warning">Quedan {fMoney(resumen.diferencia, p.moneda)} sin asignar.</Alert>}
      {!resumen.excede && !resumen.incompleto && p.distribucion.length > 0 && (
        <Alert kind="success">La distribución cubre el 100% del presupuesto.</Alert>
      )}

      <div className="mb-3">
        <Button size="sm" variant="ghost" onClick={add}>+ Agregar categoría</Button>
      </div>

      {p.distribucion.length === 0 ? (
        <EmptyState text="Sin distribución cargada todavía." />
      ) : (
        <TableWrap>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <Th>Categoría</Th>
                <Th>Persona</Th>
                <Th>Tipo</Th>
                <Th>Valor</Th>
                <Th>Monto</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {p.distribucion.map((d) => (
                <TrHover key={d.id}>
                  <Td>
                    <Input list="categorias-distribucion" value={d.categoria} onChange={(e) => update(d.id, { categoria: e.target.value })} />
                  </Td>
                  <Td>
                    <Select value={d.personaId ?? ""} onChange={(e) => update(d.id, { personaId: e.target.value || null })}>
                      <option value="">—</option>
                      {equipo.map((per) => (
                        <option key={per.id} value={per.id}>{per.nombre}</option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Select value={d.tipo} onChange={(e) => update(d.id, { tipo: e.target.value as "fijo" | "porcentaje" })}>
                      <option value="porcentaje">% del total</option>
                      <option value="fijo">Monto fijo</option>
                    </Select>
                  </Td>
                  <Td>
                    <Input type="number" min={0} value={d.valor} onChange={(e) => update(d.id, { valor: Number(e.target.value) })} style={{ width: 90 }} />
                  </Td>
                  <Td>{fMoney(montoDistribucion(d, t.precioFinal), p.moneda)}</Td>
                  <Td>
                    <button onClick={() => remove(d.id)} className="text-text3 hover:text-red">✕</button>
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <datalist id="categorias-distribucion">
        {CATEGORIAS_DISTRIBUCION_SUGERIDAS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="mt-3 flex flex-wrap justify-end gap-6 text-[12.5px]">
        <span className="text-text3">Total presupuesto: <span className="font-medium text-text2">{fMoney(resumen.totalPresupuesto, p.moneda)}</span></span>
        <span className="text-text3">Distribuido: <span className="font-medium text-text2">{fMoney(resumen.totalDistribuido, p.moneda)}</span></span>
      </div>
    </div>
  );
}

function DocumentoEditor({ p, onChange }: { p: Presupuesto; onChange: (patch: Partial<Presupuesto>) => void }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Field label="Introducción">
        <Textarea rows={2} value={p.introduccion} onChange={(e) => onChange({ introduccion: e.target.value })} />
      </Field>
      <Field label="Objetivos">
        <Textarea rows={2} value={p.objetivos} onChange={(e) => onChange({ objetivos: e.target.value })} />
      </Field>
      <Field label="Entregables">
        <Textarea rows={2} value={p.entregables} onChange={(e) => onChange({ entregables: e.target.value })} />
      </Field>
      <Field label="Cronograma / modalidad de trabajo">
        <Textarea rows={2} value={p.cronograma} onChange={(e) => onChange({ cronograma: e.target.value })} />
      </Field>
      <Field label="Forma de pago">
        <Textarea rows={2} value={p.formaPago} onChange={(e) => onChange({ formaPago: e.target.value })} />
      </Field>
      <Field label="Condiciones">
        <Textarea rows={2} value={p.condiciones} onChange={(e) => onChange({ condiciones: e.target.value })} />
      </Field>
      <Field label="Servicios no incluidos">
        <Textarea rows={2} value={p.serviciosNoIncluidos} onChange={(e) => onChange({ serviciosNoIncluidos: e.target.value })} />
      </Field>
      <Field label="Observaciones (uso interno)">
        <Textarea rows={2} value={p.observaciones} onChange={(e) => onChange({ observaciones: e.target.value })} />
      </Field>
    </div>
  );
}

// ---------- Componente principal ----------

type View = "list" | "wizard" | "detail";

export function Presupuestos() {
  const { data, setData } = useStore();
  const { toast } = useToast();

  const [view, setView] = useState<View>("list");
  const [filtro, setFiltro] = useState("todos");
  const [draft, setDraft] = useState<Presupuesto | null>(null);
  const [step, setStep] = useState(0);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [tab, setTab] = useState("resumen");

  const cfph = costoFijoPorHora(data);
  const detalle = data.presupuestos.find((pp) => pp.id === detalleId) ?? null;

  const lista = useMemo(
    () =>
      data.presupuestos
        .filter((p) => filtro === "todos" || p.estado === filtro)
        .sort((a, b) => b.numero - a.numero),
    [data.presupuestos, filtro]
  );

  function iniciarNuevo() {
    setDraft(nuevoDraft(siguienteNumeroPresupuesto(data), data.config));
    setStep(0);
    setView("wizard");
  }

  function elegirClienteExistente(clienteId: string) {
    if (!draft) return;
    const c = data.clientes.find((cl) => cl.id === clienteId);
    setDraft({ ...draft, clienteId: clienteId || null, nombreCliente: c?.marca ?? draft.nombreCliente, contacto: c?.contacto ?? draft.contacto });
  }

  function avanzar() {
    if (!draft) return;
    if (step === 1 && draft.items.length === 0) {
      setDraft({ ...draft, items: sugerirItems(draft.respuestas, data.servicios) });
    }
    if (step === 2 && draft.costosAdicionales.length === 0) {
      setDraft((d) => (d ? { ...d, costosAdicionales: sugerirCostos(d.respuestas) } : d));
    }
    setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1));
  }
  /** Modo rápido: salta el cuestionario de necesidades y va directo a elegir
   * servicios del catálogo a mano (cliente + servicios + cantidad/horas). */
  function saltarNecesidades() {
    setStep(2);
  }
  function retroceder() {
    setStep((s) => Math.max(0, s - 1));
  }

  function crearPresupuesto() {
    if (!draft) return;
    if (!draft.nombreCliente.trim()) {
      toast("Ingresá el nombre del cliente o marca.", "error");
      setStep(0);
      return;
    }
    setData((d) => ({ ...d, presupuestos: [...d.presupuestos, draft] }));
    toast("Presupuesto creado.");
    setDetalleId(draft.id);
    setTab("resumen");
    setView("detail");
    setDraft(null);
  }

  function abrirDetalle(id: string) {
    setDetalleId(id);
    setTab("resumen");
    setView("detail");
  }

  function updatePresupuesto(patch: Partial<Presupuesto>) {
    if (!detalleId) return;
    setData((d) => ({
      ...d,
      presupuestos: d.presupuestos.map((p) => (p.id === detalleId ? { ...p, ...patch } : p)),
    }));
  }

  function duplicar(p: Presupuesto) {
    const copia: Presupuesto = { ...p, id: uid("pre"), numero: siguienteNumeroPresupuesto(data), estado: "borrador", fecha: todayISO() };
    setData((d) => ({ ...d, presupuestos: [...d.presupuestos, copia] }));
    toast("Presupuesto duplicado.");
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, presupuestos: d.presupuestos.filter((p) => p.id !== id) }));
    toast("Presupuesto eliminado.", "info");
    if (detalleId === id) setView("list");
  }

  function convertirEnCliente() {
    if (!detalle) return;
    const t = calcularPresupuesto(detalle, cfph);
    if (detalle.clienteId) {
      setData((d) => ({
        ...d,
        clientes: d.clientes.map((c) =>
          c.id === detalle.clienteId
            ? { ...c, estado: "activo", abonoMensual: detalle.respuestas.modalidadTrabajo === "mensual" ? t.precioFinal : c.abonoMensual }
            : c
        ),
      }));
    } else {
      const nuevoId = uid("cli");
      setData((d) => ({
        ...d,
        clientes: [
          ...d.clientes,
          {
            id: nuevoId,
            marca: detalle.nombreCliente,
            contacto: detalle.contacto,
            telefono: "",
            email: "",
            instagram: "",
            rubro: detalle.respuestas.tipoMarca || "",
            fechaInicio: todayISO(),
            estado: "activo",
            serviciosContratados: detalle.items.map((it) => it.servicioId).filter((x): x is string => !!x),
            abonoMensual: detalle.respuestas.modalidadTrabajo === "mensual" ? t.precioFinal : 0,
            moneda: detalle.moneda,
            fechaPago: "",
            modalidadPago: "",
            observaciones: `Convertido automáticamente desde el presupuesto #${detalle.numero}.`,
            equipoAsignado: [],
            fechaUltimoAumento: "",
          },
        ],
        presupuestos: d.presupuestos.map((p) => (p.id === detalle.id ? { ...p, clienteId: nuevoId } : p)),
      }));
    }
    toast("Cliente activo creado/actualizado a partir del presupuesto.");
  }

  // ---------- Vista: lista ----------
  if (view === "list") {
    return (
      <div>
        <PageHeader
          title="Presupuestos"
          sub="Creador paso a paso y seguimiento de presupuestos"
          right={<Button onClick={iniciarNuevo}>+ Nuevo presupuesto</Button>}
        />

        <FilterTabs
          value={filtro}
          onChange={setFiltro}
          options={[{ value: "todos", label: "Todos" }, ...ESTADOS_PRESUPUESTO.map((e) => ({ value: e.value, label: e.label }))]}
        />

        <Card>
          {lista.length === 0 ? (
            <EmptyState icon="▤" text="No hay presupuestos con este filtro." />
          ) : (
            <TableWrap>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <Th>N°</Th>
                    <Th>Cliente</Th>
                    <Th>Fecha</Th>
                    <Th>Estado</Th>
                    <Th>Precio final</Th>
                    <Th>Margen</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => {
                    const t = calcularPresupuesto(p, cfph);
                    return (
                      <TrHover key={p.id}>
                        <Td main onClick={() => abrirDetalle(p.id)}>#{p.numero}</Td>
                        <Td onClick={() => abrirDetalle(p.id)}>{p.nombreCliente}</Td>
                        <Td>{p.fecha}</Td>
                        <Td>
                          <Badge color={ESTADO_BADGE[p.estado]}>{ESTADOS_PRESUPUESTO.find((e) => e.value === p.estado)?.label}</Badge>
                        </Td>
                        <Td>{fMoney(t.precioFinal, p.moneda)}</Td>
                        <Td className={t.margenReal < p.margenMinimoPct ? "text-red" : "text-green"}>{fPct(t.margenReal, 0)}</Td>
                        <Td>
                          <div className="flex gap-2">
                            <button onClick={() => abrirDetalle(p.id)} className="text-text3 hover:text-accent">Ver</button>
                            <button onClick={() => duplicar(p)} className="text-text3 hover:text-accent">Duplicar</button>
                            <button onClick={() => eliminar(p.id)} className="text-text3 hover:text-red">Eliminar</button>
                          </div>
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

  // ---------- Vista: wizard ----------
  if (view === "wizard" && draft) {
    const r = draft.respuestas;
    const setR = (patch: Partial<WizardRespuestas>) => setDraft({ ...draft, respuestas: { ...r, ...patch } });

    return (
      <div>
        <PageHeader title={`Nuevo presupuesto #${draft.numero}`} right={<Button variant="ghost" onClick={() => setView("list")}>Cancelar</Button>} />
        <Steps labels={WIZARD_STEPS} current={step} />

        <Card>
          {step === 0 && (
            <FormGrid>
              <Field label="Cliente existente (opcional)">
                <Select value={draft.clienteId ?? ""} onChange={(e) => elegirClienteExistente(e.target.value)}>
                  <option value="">— Cliente nuevo / potencial —</option>
                  {data.clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.marca}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Nombre de la marca" full>
                <Input value={draft.nombreCliente} onChange={(e) => setDraft({ ...draft, nombreCliente: e.target.value })} autoFocus />
              </Field>
              <Field label="Persona de contacto">
                <Input value={draft.contacto} onChange={(e) => setDraft({ ...draft, contacto: e.target.value })} />
              </Field>
              <Field label="¿Qué tipo de marca es?">
                <Input value={r.tipoMarca} onChange={(e) => setR({ tipoMarca: e.target.value })} placeholder="Indumentaria, gastronomía…" />
              </Field>
              <Field label="Fecha">
                <Input type="date" value={draft.fecha} onChange={(e) => setDraft({ ...draft, fecha: e.target.value })} />
              </Field>
              <Field label="Validez (días)">
                <Input type="number" min={1} value={draft.validezDias} onChange={(e) => setDraft({ ...draft, validezDias: Number(e.target.value) })} />
              </Field>
            </FormGrid>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5">
              <Alert kind="info">
                <span>
                  ¿Ya sabés qué servicios necesitás? Podés saltar este cuestionario y elegirlos directamente.
                </span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={saltarNecesidades}>
                  Saltar → elegir servicios directamente
                </Button>
              </Alert>
              <FormGrid>
                <Field label="¿Cuántas redes sociales se gestionan?">
                  <Input type="number" min={0} value={r.redesCantidad} onChange={(e) => setR({ redesCantidad: Number(e.target.value) })} />
                </Field>
                <Field label="Publicaciones mensuales">
                  <Input type="number" min={0} value={r.publicacionesMensuales} onChange={(e) => setR({ publicacionesMensuales: Number(e.target.value) })} />
                </Field>
                <Field label="Historias mensuales">
                  <Input type="number" min={0} value={r.historiasMensuales} onChange={(e) => setR({ historiasMensuales: Number(e.target.value) })} />
                </Field>
                <Field label="Integrantes del equipo">
                  <Input type="number" min={0} value={r.integrantesEquipo} onChange={(e) => setR({ integrantesEquipo: Number(e.target.value) })} />
                </Field>
              </FormGrid>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">¿Necesita reels?</div>
                <div className="flex items-center gap-3">
                  <YesNo value={r.reels} onChange={(v) => setR({ reels: v })} />
                  {r.reels && (
                    <Input type="number" min={0} value={r.reelsCantidad} onChange={(e) => setR({ reelsCantidad: Number(e.target.value) })} placeholder="Cantidad por mes" style={{ maxWidth: 160 }} />
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">¿Necesita producción presencial?</div>
                <div className="flex flex-wrap items-center gap-3">
                  <YesNo value={r.produccionPresencial} onChange={(v) => setR({ produccionPresencial: v })} />
                  {r.produccionPresencial && (
                    <>
                      <Input type="number" min={0} value={r.jornadas} onChange={(e) => setR({ jornadas: Number(e.target.value) })} placeholder="Jornadas" style={{ maxWidth: 140 }} />
                      <Input type="number" min={0} value={r.horasPorJornada} onChange={(e) => setR({ horasPorJornada: Number(e.target.value) })} placeholder="Horas por jornada" style={{ maxWidth: 160 }} />
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">Servicios creativos</div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {([
                    ["fotografia", "Fotografía"],
                    ["video", "Video"],
                    ["edicion", "Edición"],
                    ["disenoGrafico", "Diseño gráfico"],
                    ["direccionCreativa", "Dirección creativa"],
                    ["estilismo", "Estilismo"],
                  ] as [keyof WizardRespuestas, string][]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between rounded-md border border-border bg-surface2 px-3 py-2">
                      <span className="text-[12px] text-text2">{label}</span>
                      <YesNo value={Boolean(r[key])} onChange={(v) => setR({ [key]: v } as Partial<WizardRespuestas>)} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">Producción — recursos</div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {([
                    ["modelos", "Modelos"],
                    ["locacion", "Locación"],
                    ["maquillaje", "Maquillaje"],
                    ["utileria", "Utilería"],
                    ["traslados", "Traslados"],
                  ] as [keyof WizardRespuestas, string][]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between rounded-md border border-border bg-surface2 px-3 py-2">
                      <span className="text-[12px] text-text2">{label}</span>
                      <YesNo value={Boolean(r[key])} onChange={(v) => setR({ [key]: v } as Partial<WizardRespuestas>)} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-text3">Gestión y comunicación</div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {([
                    ["communityManagement", "Community management"],
                    ["respuestaMensajes", "Respuesta de mensajes"],
                    ["estrategiaComunicacion", "Estrategia de comunicación"],
                    ["pautaPublicitaria", "Pauta publicitaria"],
                    ["coberturaEventos", "Cobertura de eventos"],
                  ] as [keyof WizardRespuestas, string][]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between rounded-md border border-border bg-surface2 px-3 py-2">
                      <span className="text-[12px] text-text2">{label}</span>
                      <YesNo value={Boolean(r[key])} onChange={(v) => setR({ [key]: v } as Partial<WizardRespuestas>)} />
                    </div>
                  ))}
                </div>
              </div>

              <FormGrid>
                <Field label="Frecuencia de trabajo">
                  <Input value={r.frecuencia} onChange={(e) => setR({ frecuencia: e.target.value })} placeholder="Semanal, mensual…" />
                </Field>
                <Field label="¿Trabajo mensual o puntual?">
                  <Select value={r.modalidadTrabajo} onChange={(e) => setR({ modalidadTrabajo: e.target.value as "mensual" | "puntual" })}>
                    <option value="mensual">Mensual</option>
                    <option value="puntual">Puntual</option>
                  </Select>
                </Field>
                <Field label="Nivel de complejidad">
                  <Select value={r.complejidad} onChange={(e) => setR({ complejidad: e.target.value as Complejidad })}>
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </Select>
                </Field>
                <Field label="Nivel de urgencia">
                  <Select value={r.urgencia} onChange={(e) => setR({ urgencia: e.target.value as Complejidad })}>
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </Select>
                </Field>
              </FormGrid>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="mb-3 text-[11.5px] text-text3">
                Generamos ítems sugeridos a partir de las respuestas anteriores. Podés editar cantidades y precios, o agregar/quitar servicios.
              </p>
              <ItemsEditor p={draft} servicios={data.servicios} equipo={data.equipo} onChange={(items) => setDraft({ ...draft, items })} />
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="mb-3 text-[11.5px] text-text3">Cargá los costos de producción que correspondan (montos reales o estimados).</p>
              <CostosEditor p={draft} onChange={(costosAdicionales) => setDraft({ ...draft, costosAdicionales })} />
            </div>
          )}

          {step === 4 && <ParametrosEditor p={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />}

          {step === 5 && (
            <ResultadoView
              p={draft}
              servicios={data.servicios}
              config={data.config}
              costoFijoPorHoraValue={cfph}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
          )}
        </Card>

        <div className="mt-4 flex justify-between">
          <Button variant="ghost" onClick={retroceder} disabled={step === 0}>← Atrás</Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button onClick={avanzar}>Siguiente →</Button>
          ) : (
            <Button onClick={crearPresupuesto}>Crear presupuesto</Button>
          )}
        </div>
      </div>
    );
  }

  // ---------- Vista: detalle ----------
  if (view === "detail" && detalle) {
    const t = calcularPresupuesto(detalle, cfph);
    return (
      <div>
        <PageHeader
          title={`Presupuesto #${detalle.numero} — ${detalle.nombreCliente}`}
          sub={`${detalle.fecha} · Válido ${detalle.validezDias} días`}
          right={
            <>
              <Select value={detalle.estado} onChange={(e) => updatePresupuesto({ estado: e.target.value as EstadoPresupuesto })} style={{ width: 170 }}>
                {ESTADOS_PRESUPUESTO.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </Select>
              <Button variant="ghost" onClick={() => imprimirPresupuesto(detalle, data.config, cfph)}>Exportar PDF</Button>
              <Button variant="ghost" onClick={() => setView("list")}>Volver</Button>
            </>
          }
        />

        {detalle.estado === "aprobado" && (
          <Alert kind="success">
            Presupuesto aprobado — {fMoney(t.precioFinal, detalle.moneda)}.{" "}
            <button onClick={convertirEnCliente} className="ml-1 font-medium underline">
              Convertir en cliente activo
            </button>
          </Alert>
        )}

        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "resumen", label: "Resumen" },
            { value: "items", label: "Servicios" },
            { value: "costos", label: "Costos" },
            { value: "parametros", label: "Parámetros" },
            { value: "distribucion", label: "Distribución" },
            { value: "documento", label: "Documento" },
          ]}
        />

        {tab === "resumen" && (
          <ResultadoView p={detalle} servicios={data.servicios} config={data.config} costoFijoPorHoraValue={cfph} onChange={updatePresupuesto} />
        )}
        {tab === "items" && <ItemsEditor p={detalle} servicios={data.servicios} equipo={data.equipo} onChange={(items) => updatePresupuesto({ items })} />}
        {tab === "costos" && <CostosEditor p={detalle} onChange={(costosAdicionales) => updatePresupuesto({ costosAdicionales })} />}
        {tab === "parametros" && <ParametrosEditor p={detalle} onChange={updatePresupuesto} />}
        {tab === "distribucion" && (
          <DistribucionEditor
            p={detalle}
            equipo={data.equipo.map((per) => ({ id: per.id, nombre: per.nombre }))}
            costoFijoPorHoraValue={cfph}
            onChange={(distribucion) => updatePresupuesto({ distribucion })}
          />
        )}
        {tab === "documento" && <DocumentoEditor p={detalle} onChange={updatePresupuesto} />}

        <div className="mt-5 flex justify-end">
          <Button variant="danger" onClick={() => eliminar(detalle.id)}>Eliminar presupuesto</Button>
        </div>
      </div>
    );
  }

  return null;
}
