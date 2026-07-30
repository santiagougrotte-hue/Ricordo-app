import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/server/anthropic";

interface CatalogoItem {
  id: string;
  nombre: string;
}
interface ClienteItem {
  id: string;
  nombre: string;
}

type Confianza = "alta" | "media" | "baja";

interface ItemParseado {
  id_producto: string | null;
  nombre: string;
  cantidad: number;
  confianza: Confianza;
}

interface ParsePedidoModelOutput {
  cliente?: { id: string | null; nombre_detectado: string | null; confianza: Confianza };
  canal?: "Minorista" | "Mayorista" | null;
  fecha_entrega?: string | null;
  items?: ItemParseado[];
  no_identificado?: string[];
  notas?: string;
}

function buildSystemPrompt(catalogo: CatalogoItem[], clientes: ClienteItem[], hoy: string): string {
  return `Sos un asistente que convierte mensajes de WhatsApp de clientes de un emprendimiento de pastas artesanales en un pedido estructurado.

Fecha de hoy en Argentina (America/Argentina/Buenos_Aires): ${hoy}.

Catálogo de productos disponibles — SOLO podés usar estos id_producto, nunca inventes uno que no esté en esta lista:
${JSON.stringify(catalogo)}

Clientes existentes — SOLO podés usar estos id, nunca inventes uno que no esté en esta lista:
${JSON.stringify(clientes)}

Reglas:
- Devolvé ÚNICAMENTE un objeto JSON. Sin texto adicional, sin markdown, sin backticks, sin explicación.
- Interpretá nombres coloquiales de productos contra el catálogo recibido. Si no estás seguro de cuál producto es, marcá confianza "media" o "baja"; si directamente no lo podés matchear contra el catálogo, no lo pongas en "items" y agregá el texto original a "no_identificado".
- Si no se menciona la cantidad de un producto, asumí 1 con confianza "media".
- Resolvé fechas relativas ("para el viernes", "mañana", "el 15") contra la fecha de hoy de arriba. Si no hay ninguna fecha mencionada, "fecha_entrega" es null.
- Nunca calcules precios, descuentos ni totales — eso lo hace la app con sus propios datos.
- Si no podés identificar al cliente por nombre o teléfono contra la lista de clientes, "cliente.id" es null y completá "nombre_detectado" con lo que hayas visto en el texto (o null si no hay ninguna pista).
- "canal" es "Minorista", "Mayorista" o null si no se puede inferir.
- "notas" son aclaraciones del cliente que no son productos (por ejemplo pedidos especiales, horarios, direcciones).

Schema exacto de la respuesta (JSON):
{
  "cliente": { "id": "CLI-007 o null", "nombre_detectado": "texto o null", "confianza": "alta|media|baja" },
  "canal": "Minorista|Mayorista|null",
  "fecha_entrega": "YYYY-MM-DD o null",
  "items": [{ "id_producto": "PROD-04", "nombre": "nombre del producto", "cantidad": 2, "confianza": "alta|media|baja" }],
  "no_identificado": ["texto de lo que pidió y no se pudo matchear"],
  "notas": "aclaraciones del cliente que no son productos"
}`;
}

function extractJson(text: string): ParsePedidoModelOutput {
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

export async function POST(req: NextRequest) {
  let body: { texto?: string; catalogo?: CatalogoItem[]; clientes?: ClienteItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  const { texto, catalogo, clientes } = body;
  if (!texto || !texto.trim() || !Array.isArray(catalogo) || !Array.isArray(clientes)) {
    return NextResponse.json({ error: "Faltan datos: texto, catalogo y clientes son obligatorios" }, { status: 400 });
  }

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  let salida: ParsePedidoModelOutput;
  let usage: { inputTokens: number; outputTokens: number };
  try {
    const { text, inputTokens, outputTokens } = await callClaude({
      system: buildSystemPrompt(catalogo, clientes, hoy),
      messages: [{ role: "user", content: texto }],
    });
    usage = { inputTokens, outputTokens };
    salida = extractJson(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar con la IA";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Nunca confiamos ciegamente en los ids que devuelve el modelo: si "inventó" un id_producto
  // o un id de cliente que no le mandamos, lo tratamos como no identificado en vez de dejar
  // que el frontend arme una línea de pedido con un producto que no existe.
  const idsCatalogo = new Set(catalogo.map((c) => c.id));
  const idsClientes = new Set(clientes.map((c) => c.id));

  const items: ItemParseado[] = [];
  const noIdentificado = [...(salida.no_identificado ?? [])];
  for (const item of salida.items ?? []) {
    if (item?.id_producto && idsCatalogo.has(item.id_producto) && confianzaValida(item.confianza)) {
      items.push({
        id_producto: item.id_producto,
        nombre: item.nombre ?? "",
        cantidad: typeof item.cantidad === "number" && item.cantidad > 0 ? item.cantidad : 1,
        confianza: item.confianza,
      });
    } else {
      noIdentificado.push(item?.nombre || item?.id_producto || "producto no identificado");
    }
  }

  const clienteId = salida.cliente?.id && idsClientes.has(salida.cliente.id) ? salida.cliente.id : null;
  const cliente = {
    id: clienteId,
    nombre_detectado: salida.cliente?.nombre_detectado ?? null,
    confianza: confianzaValida(salida.cliente?.confianza) ? salida.cliente!.confianza : ("baja" as Confianza),
  };

  const canal = salida.canal === "Minorista" || salida.canal === "Mayorista" ? salida.canal : null;
  const fecha_entrega = typeof salida.fecha_entrega === "string" && /^\d{4}-\d{2}-\d{2}$/.test(salida.fecha_entrega) ? salida.fecha_entrega : null;

  return NextResponse.json({
    cliente,
    canal,
    fecha_entrega,
    items,
    no_identificado: noIdentificado,
    notas: salida.notas ?? "",
    _usage: usage,
  });
}
