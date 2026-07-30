import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "./retry";

function rateLimitError() {
  return Object.assign(new Error("rate limited"), { status: 429 });
}

test("withRetry: reintenta en 429 y devuelve el resultado cuando finalmente tiene éxito", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw rateLimitError();
      return "ok";
    },
    { baseDelayMs: 1, sleep: async (ms) => { delays.push(ms); } }
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1, 2]);
});

test("withRetry: no reintenta errores que no son 429", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new Error("otro error");
      },
      { sleep: async () => {} }
    )
  );
  assert.equal(calls, 1);
});

test("withRetry: agota los reintentos y propaga el último error 429", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw rateLimitError();
      },
      { maxRetries: 2, baseDelayMs: 1, sleep: async () => {} }
    ),
    (err: unknown) => (err as { status?: number }).status === 429
  );
  assert.equal(calls, 3); // intento inicial + 2 reintentos
});

test("withRetry: sin errores llama la función una sola vez", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(calls, 1);
});
