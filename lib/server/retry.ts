// Reintentos con backoff progresivo, específicamente para el error 429 (rate limit)
// de la API de Anthropic. Separado del cliente para poder testearlo sin red real.

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
  sleep?: (ms: number) => Promise<void>;
}

function isRateLimitError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status?: number }).status === 429;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      const delayMs = baseDelayMs * 2 ** attempt;
      opts.onRetry?.(attempt + 1, delayMs, err);
      await sleep(delayMs);
      attempt++;
    }
  }
}
