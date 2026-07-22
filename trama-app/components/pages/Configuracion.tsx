"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { seedData } from "@/lib/seed";
import {
  Badge,
  Button,
  Card,
  Field,
  FormGrid,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { MODALIDADES_SUELDO_DIRECTORA, type Moneda, type ModalidadSueldoDirectora } from "@/lib/types";

export function Configuracion() {
  const { data, setData, resetToEmpty } = useStore();
  const { toast } = useToast();
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const config = data.config;

  function update(patch: Partial<typeof config>) {
    setData((d) => ({ ...d, config: { ...d.config, ...patch } }));
  }

  function agregarCategoria() {
    const v = nuevaCategoria.trim();
    if (!v || config.categoriasGastos.includes(v)) return;
    update({ categoriasGastos: [...config.categoriasGastos, v] });
    setNuevaCategoria("");
  }

  function quitarCategoria(c: string) {
    update({ categoriasGastos: config.categoriasGastos.filter((x) => x !== c) });
  }

  function cargarDatosDeEjemplo() {
    setData(() => seedData());
    toast("Datos de ejemplo cargados.");
  }

  function borrarTodo() {
    resetToEmpty();
    toast("Todos los datos fueron eliminados.", "info");
  }

  return (
    <div>
      <PageHeader title="Configuración" sub="Parámetros generales de TRAMA Studio" />

      <Card title="Estudio" className="mb-4">
        <FormGrid>
          <Field label="Nombre del estudio">
            <Input value={config.nombreEstudio} onChange={(e) => update({ nombreEstudio: e.target.value })} />
          </Field>
          <Field label="Nombre de la directora">
            <Input value={config.nombreDirectora} onChange={(e) => update({ nombreDirectora: e.target.value })} />
          </Field>
        </FormGrid>
      </Card>

      <Card title="Moneda" className="mb-4">
        <FormGrid>
          <Field label="Moneda principal">
            <Select value={config.monedaPrincipal} onChange={(e) => update({ monedaPrincipal: e.target.value as Moneda })}>
              <option value="ARS">Pesos argentinos (ARS)</option>
              <option value="USD">Dólares estadounidenses (USD)</option>
            </Select>
          </Field>
          <Field label="Tipo de cambio por defecto (para cargar USD)">
            <Input type="number" min={0} value={config.tipoCambioDefault} onChange={(e) => update({ tipoCambioDefault: Number(e.target.value) })} />
          </Field>
        </FormGrid>
        <p className="mt-2 text-[11px] text-text3">
          Podés trabajar en pesos y en dólares al mismo tiempo: cada presupuesto o movimiento en USD permite ingresar manualmente el tipo de cambio usado.
        </p>
      </Card>

      <Card title="Parámetros financieros" className="mb-4">
        <FormGrid>
          <Field label="Porcentaje de impuestos (%)">
            <Input type="number" min={0} max={100} value={config.porcentajeImpuestos} onChange={(e) => update({ porcentajeImpuestos: Number(e.target.value) })} />
          </Field>
          <Field label="Comisiones (%)">
            <Input type="number" min={0} max={100} value={config.comisionesPct} onChange={(e) => update({ comisionesPct: Number(e.target.value) })} />
          </Field>
          <Field label="Margen de ganancia mínimo (%)">
            <Input type="number" min={0} max={95} value={config.margenGananciaMinimo} onChange={(e) => update({ margenGananciaMinimo: Number(e.target.value) })} />
          </Field>
          <Field label="Margen de ganancia sugerido (%)">
            <Input type="number" min={0} max={95} value={config.margenGananciaSugerido} onChange={(e) => update({ margenGananciaSugerido: Number(e.target.value) })} />
          </Field>
          <Field label="Margen de ganancia premium (%)">
            <Input type="number" min={0} max={95} value={config.margenGananciaPremium} onChange={(e) => update({ margenGananciaPremium: Number(e.target.value) })} />
          </Field>
          <Field label="Fondo para imprevistos (%)">
            <Input type="number" min={0} max={100} value={config.fondoImprevistos} onChange={(e) => update({ fondoImprevistos: Number(e.target.value) })} />
          </Field>
          <Field label="Porcentaje de reinversión (%)">
            <Input type="number" min={0} max={100} value={config.porcentajeReinversion} onChange={(e) => update({ porcentajeReinversion: Number(e.target.value) })} />
          </Field>
        </FormGrid>
        <p className="mt-2 text-[11px] text-text3">
          Estos valores se usan como punto de partida en cada presupuesto nuevo — se pueden ajustar individualmente en cada uno.
        </p>
      </Card>

      <Card title="Sueldo de la directora" className="mb-4">
        <FormGrid>
          <Field label="Modalidad">
            <Select value={config.modalidadSueldoDirectora} onChange={(e) => update({ modalidadSueldoDirectora: e.target.value as ModalidadSueldoDirectora })}>
              {MODALIDADES_SUELDO_DIRECTORA.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Sueldo objetivo mensual">
            <Input type="number" min={0} value={config.sueldoObjetivoDirectora} onChange={(e) => update({ sueldoObjetivoDirectora: Number(e.target.value) })} />
          </Field>
          <Field label="Sueldo fijo (si aplica)">
            <Input type="number" min={0} value={config.sueldoFijoDirectora} onChange={(e) => update({ sueldoFijoDirectora: Number(e.target.value) })} />
          </Field>
          <Field label="Porcentaje (si aplica)">
            <Input type="number" min={0} max={100} value={config.porcentajeSueldoDirectora} onChange={(e) => update({ porcentajeSueldoDirectora: Number(e.target.value) })} />
          </Field>
        </FormGrid>
        <p className="mt-2 text-[11px] text-text3">
          Este sueldo es distinto de la ganancia del estudio: para registrar el pago real de cada mes, cargalo en Finanzas
          como un movimiento de tipo &quot;Pago de sueldo&quot; asignado a la persona marcada como directora en el módulo Equipo.
        </p>
      </Card>

      <Card title="Costos fijos y revisión de clientes" className="mb-4">
        <FormGrid>
          <Field label="Horas facturables del estudio por mes">
            <Input type="number" min={0} value={config.horasMensualesEstudio} onChange={(e) => update({ horasMensualesEstudio: Number(e.target.value) })} />
          </Field>
          <Field label="Inflación anual estimada (%)">
            <Input type="number" min={0} value={config.inflacionAnualEstimada} onChange={(e) => update({ inflacionAnualEstimada: Number(e.target.value) })} />
          </Field>
          <Field label="Meses sin aumento para avisar">
            <Input type="number" min={1} value={config.mesesEntreAumentos} onChange={(e) => update({ mesesEntreAumentos: Number(e.target.value) })} />
          </Field>
        </FormGrid>
        <p className="mt-2 text-[11px] text-text3">
          Las horas mensuales se usan para prorratear los Costos Fijos entre los presupuestos según las horas de cada uno.
          La inflación y el umbral de meses alimentan las sugerencias de aumento en Revisión de clientes.
        </p>
      </Card>

      <Card title="Categorías de gastos" className="mb-4">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {config.categoriasGastos.map((c) => (
            <div key={c} className="flex items-center gap-1">
              <Badge color="accent">{c}</Badge>
              <button onClick={() => quitarCategoria(c)} className="text-[11px] text-text3 hover:text-red">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={nuevaCategoria}
            onChange={(e) => setNuevaCategoria(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarCategoria()}
            placeholder="Nueva categoría…"
            style={{ maxWidth: 240 }}
          />
          <Button size="sm" variant="ghost" onClick={agregarCategoria}>+ Agregar</Button>
        </div>
      </Card>

      <Card title="Datos bancarios y fiscales" className="mb-4">
        <div className="flex flex-col gap-3.5">
          <Field label="Datos bancarios">
            <Textarea rows={2} value={config.datosBancarios} onChange={(e) => update({ datosBancarios: e.target.value })} />
          </Field>
          <Field label="Datos fiscales">
            <Textarea rows={2} value={config.datosFiscales} onChange={(e) => update({ datosFiscales: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title="Datos de prueba">
        <p className="mb-3 text-[12px] text-text2">
          Cargá datos de ejemplo (clientes, equipo, servicios, presupuestos y movimientos ficticios) para probar la
          aplicación, o borrá todo para empezar de cero.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={cargarDatosDeEjemplo}>Cargar datos de ejemplo</Button>
          <Button variant="danger" onClick={borrarTodo}>Borrar todos los datos</Button>
        </div>
      </Card>
    </div>
  );
}
