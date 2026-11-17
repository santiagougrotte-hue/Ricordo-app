import "server-only";
import { createSign } from "node:crypto";

// Cliente mínimo de Google Sheets con una cuenta de servicio (sin dependencias extra): firma un JWT
// RS256, lo cambia por un access token y usa la API REST v4. Las credenciales viven en la variable
// de entorno server-only GOOGLE_SERVICE_ACCOUNT_JSON (el JSON completo que descarga Google Cloud).

interface CuentaServicio {
  client_email: string;
  private_key: string;
}

function leerCuentaServicio(): CuentaServicio {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON en las variables de entorno.");
  let parsed: Partial<CuentaServicio>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido (pegá el archivo .json completo).");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no tiene client_email / private_key.");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<string> {
  const cuenta = leerCuentaServicio();
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: cuenta.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    })
  );
  const firma = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(cuenta.private_key);
  const jwt = `${header}.${claims}.${b64url(firma)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Google no dio el token (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function sheetsFetch(token: string, path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const detalle = (await res.text()).slice(0, 300);
    if (res.status === 403) {
      throw new Error(`Sin permiso sobre la planilla: compartila como Editor con ${leerCuentaServicio().client_email}. (${detalle})`);
    }
    throw new Error(`Google Sheets respondió ${res.status}: ${detalle}`);
  }
  return res.json();
}

/** Reemplaza el bloque de datos de una pestaña: limpia `rangoALimpiar` y escribe `filas` desde
 * `celdaInicio`. USER_ENTERED para que "2026-09-02" quede como fecha y los números como números,
 * igual que al pegar el CSV a mano. */
export async function reemplazarBloque(
  spreadsheetId: string,
  rangoALimpiar: string,
  celdaInicio: string,
  filas: (string | number)[][]
): Promise<{ celdasActualizadas: number }> {
  const token = await accessToken();
  await sheetsFetch(token, `${spreadsheetId}/values:batchClear`, {
    method: "POST",
    body: JSON.stringify({ ranges: [rangoALimpiar] }),
  });
  const r = (await sheetsFetch(
    token,
    `${spreadsheetId}/values/${encodeURIComponent(celdaInicio)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ range: celdaInicio, majorDimension: "ROWS", values: filas }) }
  )) as { updatedCells?: number };
  return { celdasActualizadas: r.updatedCells ?? 0 };
}
