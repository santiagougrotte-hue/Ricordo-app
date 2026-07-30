import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/server/anthropic";

type Severidad = "alta" | "media" | "info";

interface Observacion {
  titulo: string;
  texto: string;
  severidad: Severidad;
  modulo: string;
}

interface PulsoModelOutput {
  observaciones?: Observacion[];
}

const MODULOS_VALIDOS = ["stock", "ventas", "caja", "productos", "produccion", "compras"];
const SEVERIDADES_VALIDAS: Severidad[] = ["alta", "media", "info"];

function buildSystemPrompt(resumenJson: string): string {
  return `Sos un asistente que analiza el estado de un emprendimiento de pastas artesanales y señala lo más importante para atender esta semana.

Resumen del negocio (agregado, no son registros individuales):
${resumenJson}

Reglas:
- Devolvé ÚNICAMENTE un objeto JSON. Sin texto adicional, sin markdown, sin backticks.
- Máximo 3 observaciones — las más accionables. Si hay menos de 3 cosas que valga la pena decir, devolvé menos.
- Cada observación tiene que citar un número real del resumen de arriba. Nada de consejos genéricos.
- Prioridad: primero problemas de plata (diferencias de caja, compras vs. consumo), después problemas de stock, después oportunidades de margen.
- Tono directo, en español rioplatense, tuteo. Sin signos de exclamación. Sin frases motivacionales vacías.
- Nunca recomiendes un precio de venta específico.
- "modulo" tiene que ser uno de: ${MODULOS_VALIDOS.join(", ")}.
- "severidad" es "alta" (requiere atención ya), "media" o "info".

Schema exacto de la respuesta (JSON):
{
  "observaciones": [{ "titulo": "Puerro sin stock", "texto": "Es tu producto de mayor margen (82%) y está en cero.", "severidad": "alta", "modulo": "stock" }]
}`;
}

function extractJson(text: string): PulsoModelOutput {
  const withoutFences = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(withoutFences);
}

export async function POST(req: NextRequest) {
  let body: { resumen?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  if (!body.resumen) {
    return NextResponse.json({ error: "Falta el resumen del negocio" }, { status: 400 });
  }

  let salida: PulsoModelOutput;
  let usage: { inputTokens: number; outputTokens: number };
  try {
    const { text, inputTokens, outputTokens } = await callClaude({
      system: buildSystemPrompt(JSON.stringify(body.resumen)),
      messages: [{ role: "user", content: "Analizá el resumen y devolveme las observaciones del pulso semanal." }],
    });
    usage = { inputTokens, outputTokens };
    salida = extractJson(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con la IA";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const observaciones = (salida.observaciones ?? [])
    .filter(
      (o) =>
        o &&
        typeof o.titulo === "string" &&
        typeof o.texto === "string" &&
        SEVERIDADES_VALIDAS.includes(o.severidad) &&
        MODULOS_VALIDOS.includes(o.modulo)
    )
    .slice(0, 3);

  return NextResponse.json({ observaciones, _usage: usage });
}
