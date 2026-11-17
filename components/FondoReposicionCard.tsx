"use client";

import React, { useMemo } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { fARS } from "@/lib/calc-v2";
import { calcularFondoReposicion } from "@/lib/fondo-reposicion";
import { Card, InfoRow } from "@/components/ui";

/** Cuánta plata de la mercadería vendida (CMV: masa, relleno y packaging juntos) hay disponible
 * para recomprar insumos. */
export function FondoReposicionCard({ className = "mb-4" }: { className?: string }) {
  const { data } = useStoreV2();
  const f = useMemo(() => calcularFondoReposicion(data), [data]);
  const color = (n: number) => (n >= 0 ? "green" : "red") as "green" | "red";
  return (
    <Card title="Fondo de reposición (CMV)" className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[12px] text-text3">Disponible para recomprar insumos</div>
          <div className={`text-[26px] font-bold ${f.disponible_total >= 0 ? "text-green" : "text-red"}`}>{fARS(f.disponible_total)}</div>
        </div>
        <div className="text-right text-[12px] text-text3">
          CMV acumulado {fARS(f.cmv_total)}
          <br />
          Compras acumuladas {fARS(f.compras_total)}
        </div>
      </div>
      <div>
        <InfoRow label="CMV vendido (masa, relleno y packaging)" value={fARS(f.cmv_vendido)} />
        <InfoRow label="− Compras de insumos" value={fARS(f.compras)} />
        <InfoRow label="= Disponible" value={fARS(f.cmv_vendido - f.compras)} color={color(f.cmv_vendido - f.compras)} />
      </div>
      <p className="mt-3 text-[11.5px] text-text3">
        Es lo que las ventas entregadas te devolvieron para reponer mercadería, menos lo que ya compraste. Si da negativo,
        compraste más de lo vendido (está en stock o en el freezer).
        {f.saldo_inicial_cmv !== 0 && ` Incluye el saldo inicial de CMV de Configuración (${fARS(f.saldo_inicial_cmv)}).`}
      </p>
    </Card>
  );
}
