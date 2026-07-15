// Literal hex values mirroring the light-theme CSS custom properties in
// globals.css. Recharts needs literal color strings (SVG fill/stroke props
// don't reliably resolve CSS vars across browsers), so this file is the
// single place to update if the palette changes.
export const CHART_COLORS = {
  accent: "#c8933e",
  green: "#16a34a",
  red: "#dc2626",
  blue: "#2563eb",
  orange: "#ea580c",
  purple: "#7c3aed",
  text: "#191c22",
  text2: "#5b6472",
  text3: "#8b93a0",
  border: "#e3e5ea",
  grid: "#eceef2",
  surface: "#ffffff",
};

export const CHART_FONT = "var(--font-inter), system-ui, sans-serif";
