import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/server/anthropic";

interface IngredienteRef {
  id: string;
  nombre: string;
  unidad: string;
  precio_actual: number;
}

type Confianza = "alta" | "media" | "baja";

interface Renglon {
  texto_original: string;
  id_ingrediente: string | null;
  cantidad: number;
  unidad_ticket: string;
  precio_unitario: number;
  confianza: Confianza;
}

interface ParseTicketModelOutput {
  proveedor?: string | null;
  fecha?: string | null;
  total_ticket?: number;
  renglones?: Renglon[];
  ilegibles?: string[];
}

function buildSystemPrompt(ingredientes: IngredienteRef[]): string {
  return `Sos un asistente que lee tickets/facturas de compra de insumos de un emprendimiento de pastas artesanales y devuelve los datos estructurados para actualizar precios.

Lista de ingredientes existentes con su precio y unidad actuales — SOLO podés usar estos id_ingrediente, nunca inventes uno que no esté en esta lista:
${JSON.stringify(ingredientes)}

Reglas:
- Devolvé ÚNICAMENTE un objeto JSON. Sin texto adicional, sin markdown, sin backticks.
- Matcheá cada renglón del ticket contra la lista de ingredientes recibida. Si no podés leerlo con confianza, ponelo en "ilegibles" en vez de en "renglones".
- No conviertas unidades — devolvé la unidad tal cual aparece en el ticket en "unidad_ticket", aunque sea distinta a la unidad del ingrediente en el sistema.
- Si el precio en el ticket es por bulto/paquete y no por unidad individual, marcá ese renglón con confianza "baja".
- Nunca inventes números que no puedas leer con claridad en la imagen.
- "proveedor" y "fecha" son null si no aparecen en el ticket.

Schema exacto de la respuesta (JSON):
{
  "proveedor": "nombre detectado o null",
  "fecha": "YYYY-MM-DD o null",
  "total_ticket": 0,
  "renglones": [{ "texto_original": "HARINA ARROZ 1KG", "id_ingrediente": "ING-012 o null", "cantidad": 5, "unidad_ticket": "kg", "precio_unitario": 2400, "confianza": "alta|media|baja" }],
  "ilegibles": ["renglones que no se pudieron leer"]
}`;
}

function extractJson(text: string): ParseTicketModelOutput {
  const withoutFences = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return JSON.parse(withoutFences);
}

const CONFIANZAS: Confianza[] = ["alta", "media", "baja"];
function confianzaValida(c: unknown): c is Confianza {
  return typeof c === "string" && CONFIANZAS.includes(c as Confianza);
}

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
function mediaTypeValido(m: unknown): m is MediaType {
  return typeof m === "string" && (MEDIA_TYPES as readonly string[]).includes(m);
}

export async function POST(req: NextRequest) {
  let body: { imagen_base64?: string; media_type?: string; ingredientes?: IngredienteRef[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  const { imagen_base64, media_type, ingredientes } = body;
  if (!imagen_base64 || !mediaTypeValido(media_type) || !Array.isArray(ingredientes)) {
    return NextResponse.json({ error: "Faltan datos: imagen_base64, media_type e ingredientes son obligatorios" }, { status: 400 });
  }

  let salida: ParseTicketModelOutput;
  let usage: { inputTokens: number; outputTokens: number };
  try {
    const { text, inputTokens, outputTokens } = await callClaude({
      system: buildSystemPrompt(ingredientes),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type, data: imagen_base64 } },
            { type: "text", text: "Leé este ticket de compra y devolveme el JSON con el schema indicado." },
          ],
        },
      ],
    });
    usage = { inputTokens, outputTokens };
    salida = extractJson(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con la IA";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Igual que en parse-pedido: nunca confiamos en un id_ingrediente que el modelo haya
  // inventado. Si no está en la lista que mandamos, el renglón queda con id_ingrediente null
  // y confianza baja en vez de arriesgarnos a actualizar el precio de otro insumo.
  const idsIngredientes = new Set(ingredientes.map((i) => i.id));
  const renglones: Renglon[] = (salida.renglones ?? []).map((r) => {
    const idValido = r.id_ingrediente && idsIngredientes.has(r.id_ingrediente);
    return {
      texto_original: r.texto_original ?? "",
      id_ingrediente: idValido ? r.id_ingrediente : null,
      cantidad: typeof r.cantidad === "number" && r.cantidad > 0 ? r.cantidad : 0,
      unidad_ticket: r.unidad_ticket ?? "",
      precio_unitario: typeof r.precio_unitario === "number" ? r.precio_unitario : 0,
      confianza: idValido && confianzaValida(r.confianza) ? r.confianza : "baja",
    };
  });

  return NextResponse.json({
    proveedor: salida.proveedor ?? null,
    fecha: typeof salida.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(salida.fecha) ? salida.fecha : null,
    total_ticket: typeof salida.total_ticket === "number" ? salida.total_ticket : 0,
    renglones,
    ilegibles: salida.ilegibles ?? [],
    _usage: usage,
  });
}
