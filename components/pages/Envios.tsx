"use client";

import React, { useState } from "react";
import { Gift, Wallet, Calculator } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { fARS } from "@/lib/calc";
import { PageHeader, Card, Field, Input, InfoRow, Button } from "@/components/ui";
import { Row } from "@/components/ds";

export function Envios() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [km, setKm] = useState(0);
  const [cfg, setCfg] = useState(data.config_envios);

  const costoPorKm = (cfg.litro_nafta * cfg.consumo_100km) / 100;
  const costoCombustible = costoPorKm * km * 2; // ida y vuelta

  const opcionExacto = costoCombustible * (1 + cfg.margen_exacto / 100);
  const opcionFijo = cfg.precio_envio_fijo;
  const margenFijoReal = costoCombustible > 0 ? ((opcionFijo - costoCombustible) / costoCombustible) * 100 : 0;
  const compensacionGratis = costoCombustible * (cfg.margen_gratis / 100);

  function guardarConfig() {
    setData((d) => ({ ...d, config_envios: cfg }));
    toast("Configuración de envíos guardada");
  }

  return (
    <div>
      <PageHeader title="Envíos" sub="Calculadora de costo de envío por distancia" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Calculadora" color="blue">
          <Field label="Distancia (km, ida)">
            <Input type="number" value={km} onChange={(e) => setKm(Number(e.target.value))} />
          </Field>
          <div className="mt-4">
            <InfoRow label="Costo combustible (ida y vuelta)" value={fARS(costoCombustible)} color="orange" />
          </div>
          <div className="sep mt-4 border-t border-border pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[1.3px] text-text2">Opciones de cobro</div>
            <Row icon={Gift} iconColor="var(--blue)" title="Envío gratis" subtitle="Compensar con" value={fARS(compensacionGratis)} />
            <Row
              icon={Wallet}
              iconColor="var(--accent)"
              title="Envío fijo"
              subtitle={`Margen real ${margenFijoReal.toFixed(0)}%`}
              value={fARS(opcionFijo)}
            />
            <Row
              icon={Calculator}
              iconColor="var(--green)"
              title="Envío exacto"
              subtitle={`+${cfg.margen_exacto}%`}
              value={fARS(opcionExacto)}
            />
          </div>
        </Card>

        <Card title="Configuración" color="blue">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Precio litro nafta">
              <Input type="number" value={cfg.litro_nafta} onChange={(e) => setCfg({ ...cfg, litro_nafta: Number(e.target.value) })} />
            </Field>
            <Field label="Consumo cada 100km (L)">
              <Input type="number" value={cfg.consumo_100km} onChange={(e) => setCfg({ ...cfg, consumo_100km: Number(e.target.value) })} />
            </Field>
            <Field label="Margen % — Gratis">
              <Input type="number" value={cfg.margen_gratis} onChange={(e) => setCfg({ ...cfg, margen_gratis: Number(e.target.value) })} />
            </Field>
            <Field label="Margen % — Fijo (ref.)">
              <Input type="number" value={cfg.margen_fijo} onChange={(e) => setCfg({ ...cfg, margen_fijo: Number(e.target.value) })} />
            </Field>
            <Field label="Precio envío fijo $">
              <Input
                type="number"
                value={cfg.precio_envio_fijo}
                onChange={(e) => setCfg({ ...cfg, precio_envio_fijo: Number(e.target.value) })}
              />
            </Field>
            <Field label="Margen % — Exacto">
              <Input type="number" value={cfg.margen_exacto} onChange={(e) => setCfg({ ...cfg, margen_exacto: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={guardarConfig}>Guardar Configuración</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
