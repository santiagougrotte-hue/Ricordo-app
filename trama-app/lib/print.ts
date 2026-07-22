import type { Config, Presupuesto } from "./types";
import { calcularPresupuesto, fMoney } from "./calc";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nl2p(s: string): string {
  return esc(s)
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
}

/** Abre una vista imprimible del presupuesto en una pestaña nueva y dispara
 * el diálogo de impresión (el usuario puede "Guardar como PDF"). No incluye
 * costos internos, pagos del equipo ni márgenes de ganancia — solo lo que
 * corresponde mostrarle al cliente. */
export function imprimirPresupuesto(p: Presupuesto, config: Config, costoFijoPorHoraValue = 0) {
  const t = calcularPresupuesto(p, costoFijoPorHoraValue);
  const fecha = new Date(`${p.fecha}T00:00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const filasServicios = p.items
    .map(
      (it) =>
        `<tr><td>${esc(it.nombre)}</td><td style="text-align:center">${it.cantidad}</td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Presupuesto #${p.numero} — ${esc(p.nombreCliente)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #211d17;
    max-width: 720px;
    margin: 48px auto;
    padding: 0 24px;
    line-height: 1.55;
  }
  .brand { font-size: 13px; letter-spacing: 3px; text-transform: uppercase; color: #a3603d; margin-bottom: 4px; }
  h1 { font-size: 26px; font-weight: 600; margin: 0 0 4px; }
  .meta { font-size: 12.5px; color: #6b6155; margin-bottom: 32px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; color: #a3603d; margin: 32px 0 10px; border-bottom: 1px solid #e3dbcb; padding-bottom: 6px; }
  p { font-size: 13.5px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin-top: 6px; }
  th, td { text-align: left; padding: 7px 4px; border-bottom: 1px solid #eee; }
  .total-box { margin-top: 10px; padding: 18px; background: #f7f4ee; border-radius: 8px; display: flex; justify-content: space-between; align-items: baseline; }
  .total-label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6b6155; }
  .total-value { font-size: 26px; font-weight: 600; color: #211d17; }
  .footer { margin-top: 48px; font-size: 11px; color: #a2977f; text-align: center; }
  @media print {
    body { margin: 0; padding: 24px; }
  }
</style>
</head>
<body>
  <div class="brand">${esc(config.nombreEstudio || "TRAMA Studio")}</div>
  <h1>Presupuesto #${p.numero}</h1>
  <div class="meta">
    Para ${esc(p.nombreCliente)}${p.contacto ? " · " + esc(p.contacto) : ""}<br/>
    ${fecha} · Válido por ${p.validezDias} días
  </div>

  ${p.introduccion ? `<h2>Introducción</h2>${nl2p(p.introduccion)}` : ""}
  ${p.objetivos ? `<h2>Objetivos</h2>${nl2p(p.objetivos)}` : ""}

  <h2>Servicios incluidos</h2>
  <table>
    <thead><tr><th>Servicio</th><th style="text-align:center">Cantidad</th></tr></thead>
    <tbody>${filasServicios || "<tr><td colspan=2>—</td></tr>"}</tbody>
  </table>

  ${p.entregables ? `<h2>Entregables</h2>${nl2p(p.entregables)}` : ""}
  ${p.cronograma ? `<h2>Cronograma / modalidad de trabajo</h2>${nl2p(p.cronograma)}` : ""}

  <h2>Inversión</h2>
  <div class="total-box">
    <span class="total-label">Total</span>
    <span class="total-value">${fMoney(t.precioFinal, p.moneda)}</span>
  </div>

  ${p.formaPago ? `<h2>Forma de pago</h2>${nl2p(p.formaPago)}` : ""}
  ${p.condiciones ? `<h2>Condiciones</h2>${nl2p(p.condiciones)}` : ""}
  ${p.serviciosNoIncluidos ? `<h2>Servicios no incluidos</h2>${nl2p(p.serviciosNoIncluidos)}` : ""}
  ${p.observaciones ? `<h2>Observaciones</h2>${nl2p(p.observaciones)}` : ""}

  <div class="footer">${esc(config.nombreEstudio || "TRAMA Studio")}${config.datosFiscales ? " · " + esc(config.datosFiscales) : ""}</div>

  <script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
