"use client";

import React, { useState } from "react";
import {
  ShoppingCart,
  UtensilsCrossed,
  BarChart3,
  Factory,
  Landmark,
  BookOpen,
  Users,
  ShoppingBag,
  Receipt,
  Store,
  Truck,
  PieChart,
} from "lucide-react";
import { Card } from "@/components/ui";
import {
  Hero,
  StatRow,
  Pill,
  Row,
  Bar,
  ModuleRail,
  Segmented,
  PulseCard,
  ActionBar,
  type ModuleRailItem,
} from "@/components/ds";

const MODULOS: ModuleRailItem[] = [
  { key: "ventas", label: "Ventas", icon: ShoppingCart, color: "var(--mod-ventas)" },
  { key: "productos", label: "Productos", icon: UtensilsCrossed, color: "var(--mod-productos)" },
  { key: "stock", label: "Stock", icon: BarChart3, color: "var(--mod-stock)" },
  { key: "produccion", label: "Producción", icon: Factory, color: "var(--mod-produccion)" },
  { key: "caja", label: "Caja", icon: Landmark, color: "var(--mod-caja)" },
  { key: "recetas", label: "Recetas", icon: BookOpen, color: "var(--mod-recetas)" },
  { key: "clientes", label: "Clientes", icon: Users, color: "var(--mod-clientes)" },
  { key: "compras", label: "Compras", icon: ShoppingBag, color: "var(--mod-compras)" },
  { key: "costos", label: "Costos", icon: Receipt, color: "var(--mod-costos)" },
  { key: "proveedores", label: "Proveedores", icon: Store, color: "var(--mod-proveedores)" },
  { key: "envios", label: "Envíos", icon: Truck, color: "var(--mod-envios)" },
  { key: "reportes", label: "Reportes", icon: PieChart, color: "var(--mod-reportes)" },
];

export default function UiShowcasePage() {
  const [moduloActivo, setModuloActivo] = useState("ventas");
  const [segment, setSegment] = useState("mes");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <h1 className="mb-1 text-2xl font-bold text-text">Vista previa de componentes</h1>
      <p className="mb-8 text-[13px] text-text3">
        Parte A, Fase 2 — datos de ejemplo, no reales. Ruta oculta (no está en el nav) solo para revisar el sistema de
        diseño antes de aplicarlo a pantallas reales.
      </p>

      <Section title="Hero">
        <Hero
          label="Ventas del mes"
          value="$ 720.500,00"
          sub="38 cajas vendidas"
          comparacion={{ pct: 12.4, label: "vs. mes anterior" }}
          linkText="Ver detalle"
        />
      </Section>

      <Section title="Card (existente, con radio y label actualizados)">
        <Card title="Título de card" right={<Pill>Acción</Pill>}>
          <p className="text-[13px] text-text2">Contenido de ejemplo dentro de una card.</p>
        </Card>
      </Section>

      <Section title="StatRow">
        <Card>
          <StatRow
            value="$ 1.071.500,00"
            pills={
              <>
                <Pill variant="neutral">64,4%</Pill>
                <Pill variant="warn">Atención</Pill>
              </>
            }
          />
        </Card>
      </Section>

      <Section title="Pill">
        <div className="flex flex-wrap gap-2">
          <Pill variant="neutral">Neutral</Pill>
          <Pill variant="warn">Warn</Pill>
          <Pill variant="bad">Bad</Pill>
        </div>
      </Section>

      <Section title="Row">
        <Card>
          <Row
            icon={UtensilsCrossed}
            iconColor="var(--mod-productos)"
            title="Ravioles de ricotta"
            subtitle="38 cajas · margen 64,4%"
            value="$ 129.298,00"
            onClick={() => {}}
          />
          <div className="my-1 h-px bg-border" />
          <Row icon={BarChart3} iconColor="var(--mod-stock)" title="Puerro" subtitle="Stock terminado" value="0" />
        </Card>
      </Section>

      <Section title="Bar">
        <Card>
          <div className="mb-2 flex justify-between text-[12px] text-text2">
            <span>Margen</span>
            <span>74,7%</span>
          </div>
          <Bar pct={74.7} color="green" />
          <div className="mb-2 mt-4 flex justify-between text-[12px] text-text2">
            <span>Margen bajo umbral</span>
            <span>58,2%</span>
          </div>
          <Bar pct={58.2} color="orange" />
        </Card>
      </Section>

      <Section title="ModuleRail">
        <ModuleRail items={MODULOS} active={moduloActivo} onSelect={setModuloActivo} />
      </Section>

      <Section title="Segmented">
        <Segmented
          value={segment}
          onChange={setSegment}
          options={[
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mes" },
            { value: "anio", label: "Año" },
          ]}
        />
      </Section>

      <Section title="PulseCard">
        <div className="flex flex-col gap-3">
          <PulseCard fecha="hoy, 09:14" onRefresh={() => {}}>
            Puerro es tu producto de mayor margen (82%) y está en cero. Reponer antes del fin de semana.
          </PulseCard>
          <PulseCard severidad="alta" fecha="hoy, 09:14" onRefresh={() => {}}>
            Julio tiene $490.500 en ventas sin ingreso de caja cargado — revisá la conciliación.
          </PulseCard>
        </div>
      </Section>

      <Section title="ActionBar (fijo abajo de esta página)">
        <p className="text-[13px] text-text3">Mirá el pie de la pantalla.</p>
      </Section>

      <ActionBar primaryLabel="Acción principal" onPrimary={() => {}} secondaryLabel="Cancelar" onSecondary={() => {}} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px] text-text3">{title}</div>
      {children}
    </div>
  );
}
