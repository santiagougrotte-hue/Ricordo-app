"use client";

import { useCallback } from "react";
import { useStore } from "./store";
import { useToast } from "./toast";

const MENSAJE_FALLA = "No se pudo conectar con la IA. Podés seguir cargando todo a mano.";

// Toda respuesta de una ruta /api/ia/* trae, además de su schema propio,
// este campo con el consumo de tokens de esa llamada — lo usa el log de uso.
export interface IaUsage {
  inputTokens: number;
  outputTokens: number;
}

interface IaResponse {
  _usage?: IaUsage;
  error?: string;
}

/** Cliente compartido para llamar a las rutas /api/ia/*. Nunca escribe en los datos del
 * negocio directamente — cada feature de IA recibe la propuesta y decide qué hacer con ella
 * (el usuario siempre confirma antes de guardar). Si la llamada falla, la carga manual sigue
 * funcionando igual: esta función solo devuelve null y avisa por toast. */
export function useIaClient() {
  const { setData } = useStore();
  const { toast } = useToast();

  const call = useCallback(
    async <T extends IaResponse>(endpoint: string, body: unknown, funcion: string): Promise<T | null> => {
      let json: T;
      try {
        const res = await fetch(`/api/ia/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        json = await res.json();
        if (!res.ok) {
          toast(json.error ?? MENSAJE_FALLA, "error");
          return null;
        }
      } catch {
        toast(MENSAJE_FALLA, "error");
        return null;
      }

      if (json._usage) {
        const entrada = { fecha: new Date().toISOString(), funcion, tokens_entrada: json._usage.inputTokens, tokens_salida: json._usage.outputTokens };
        setData((d) => ({ ...d, ia_log: [...d.ia_log, entrada].slice(-200) }));
      }
      return json;
    },
    [setData, toast]
  );

  return { call };
}
