"use client";

import React, { useMemo } from "react";
import { Modal } from "./Modal";
import { useStoreV2 } from "@/lib/store-v2";
import { diferenciasPorSeccion } from "@/lib/sync-engine";
import { Button, Badge } from "./ui";

/** Se muestra cuando el guardado detecta que otro dispositivo (u otra pestaña) ya guardó una
 * versión más nueva mientras había una edición local sin confirmar. Nunca fusiona los dos
 * documentos solo — siempre pregunta, mostrando qué secciones cambiaron en cada lado. */
export function SyncConflictModal() {
  const { conflicto, resolverConflicto } = useStoreV2();

  const diffs = useMemo(() => (conflicto ? diferenciasPorSeccion(conflicto.local, conflicto.remoto).filter((d) => d.distinto) : []), [conflicto]);

  if (!conflicto) return null;

  return (
    <Modal open title="Se detectó un cambio guardado desde otro lado" onClose={() => {}} wide>
      <p className="mb-3 text-[13px] text-text2">
        Mientras editabas, ya se guardó una versión distinta de estos datos — puede ser vos mismo desde otro dispositivo o
        pestaña, o alguien más con acceso. Para no mezclar datos por error, nunca se combinan las dos versiones solas:
        elegí cuál conservar.
      </p>

      {diffs.length === 0 ? (
        <p className="mb-4 text-[13px] text-text3">No se detectaron diferencias de contenido reales entre las dos versiones.</p>
      ) : (
        <div className="mb-4 rounded-md border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-text3">
                <th className="px-3 py-2 text-left font-medium">Sección con cambios</th>
                <th className="px-3 py-2 text-right font-medium">Tu pantalla</th>
                <th className="px-3 py-2 text-right font-medium">Versión guardada</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.clave} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-text">{d.nombre}</td>
                  <td className="px-3 py-2 text-right text-text2">{d.cantidad_local === null ? "—" : `${d.cantidad_local} registros`}</td>
                  <td className="px-3 py-2 text-right text-text2">{d.cantidad_remoto === null ? "—" : `${d.cantidad_remoto} registros`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button className="flex-1" onClick={() => resolverConflicto("local")}>
          Conservar lo que tengo en pantalla
        </Button>
        <Button className="flex-1" variant="ghost" onClick={() => resolverConflicto("remoto")}>
          Usar la versión ya guardada
        </Button>
      </div>
      <p className="mt-3 text-[11.5px] text-text3">
        <Badge color="orange">Atención</Badge> la opción que no elijas se descarta — si no estás seguro, mirá la tabla de
        arriba antes de decidir.
      </p>
    </Modal>
  );
}
