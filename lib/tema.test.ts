import { test } from "node:test";
import assert from "node:assert/strict";
import { hexValido, aclararHex, hexARgba, luminanciaRelativa, derivarVariantesAcento, PRESETS_ACENTO } from "./tema";

test("hexValido: acepta #RRGGBB, rechaza formatos inválidos", () => {
  assert.equal(hexValido("#8b5cf6"), true);
  assert.equal(hexValido("#FFFFFF"), true);
  assert.equal(hexValido("8b5cf6"), false);
  assert.equal(hexValido("#fff"), false);
  assert.equal(hexValido("no es un color"), false);
});

test("aclararHex: cantidad 0 devuelve el mismo color, cantidad 1 da blanco puro", () => {
  assert.equal(aclararHex("#123456", 0).toLowerCase(), "#123456");
  assert.equal(aclararHex("#123456", 1).toLowerCase(), "#ffffff");
});

test("hexARgba: arma un rgba() con el alpha pedido", () => {
  assert.equal(hexARgba("#8b5cf6", 0.14), "rgba(139, 92, 246, 0.14)");
});

test("luminanciaRelativa: blanco es más luminoso que negro", () => {
  assert.ok(luminanciaRelativa("#ffffff") > luminanciaRelativa("#000000"));
});

test("derivarVariantesAcento: nunca toca los colores semánticos (verde/rojo/naranja), solo deriva accent2/accentDim del hex dado", () => {
  const variantes = derivarVariantesAcento("#2563eb");
  assert.equal(variantes.accent, "#2563eb");
  assert.match(variantes.accentDim, /^rgba\(37, 99, 235,/);
  assert.notEqual(variantes.accent2, variantes.accent);
});

test("PRESETS_ACENTO: todos son hex válidos y ninguno coincide con los colores semánticos de globals.css", () => {
  const semanticos = new Set(["#2dd4a7", "#f5566e", "#f5a524"]); // green/red/orange del tema oscuro
  for (const preset of PRESETS_ACENTO) {
    assert.equal(hexValido(preset.hex), true, `${preset.id} no es un hex válido`);
    assert.equal(semanticos.has(preset.hex.toLowerCase()), false, `${preset.id} coincide con un color semántico`);
  }
});
