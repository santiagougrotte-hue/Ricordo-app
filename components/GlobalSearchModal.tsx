"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useStoreV2 } from "@/lib/store-v2";
import { useRouter } from "@/lib/nav-context";
import { buscarGlobal, labelTipoResultado } from "@/lib/busqueda-global";
import type { ResultadoBusqueda, TipoResultadoBusqueda } from "@/lib/busqueda-global";
import { Modal } from "./Modal";
import { SearchInput, EmptyState } from "./ui";

export function GlobalSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStoreV2();
  const { go } = useRouter();
  const [query, setQuery] = useState("");

  const resultados = useMemo(() => buscarGlobal(data, query), [data, query]);
  const grupos = useMemo(() => {
    const mapa = new Map<TipoResultadoBusqueda, ResultadoBusqueda[]>();
    for (const r of resultados) mapa.set(r.tipo, [...(mapa.get(r.tipo) ?? []), r]);
    return [...mapa.entries()];
  }, [resultados]);

  function irA(r: ResultadoBusqueda) {
    go(r.pagina);
    onClose();
    setQuery("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Buscar en toda la app" wide>
      <SearchInput
        autoFocus
        placeholder="Cliente, insumo, producto, proveedor, número de pedido…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mt-4 max-h-[50vh] overflow-y-auto">
        {query.trim().length < 2 ? (
          <EmptyState icon={Search} text="Escribí al menos 2 caracteres para buscar." />
        ) : resultados.length === 0 ? (
          <EmptyState text="Sin coincidencias." />
        ) : (
          <div className="flex flex-col gap-4">
            {grupos.map(([tipo, items]) => (
              <div key={tipo}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">
                  {labelTipoResultado(tipo)} ({items.length})
                </div>
                <ul className="flex flex-col gap-1">
                  {items.map((r) => (
                    <li key={`${r.tipo}-${r.id}`}>
                      <button
                        onClick={() => irA(r)}
                        className="w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface2"
                      >
                        <div className="font-medium text-text">{r.titulo}</div>
                        <div className="text-[11px] text-text3">{r.subtitulo}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
