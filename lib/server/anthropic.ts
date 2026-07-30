import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "./retry";

const MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1500;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no está configurada. Definila como variable de entorno server-only en Vercel (nunca en el frontend)."
    );
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export interface CallClaudeParams {
  system?: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
}

export interface CallClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callClaude({ system, messages, maxTokens = DEFAULT_MAX_TOKENS }: CallClaudeParams): Promise<CallClaudeResult> {
  const anthropic = getClient();
  const response = await withRetry(
    () =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: Math.min(maxTokens, DEFAULT_MAX_TOKENS),
        system,
        messages,
      }),
    { maxRetries: 3, baseDelayMs: 1000 }
  );

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
