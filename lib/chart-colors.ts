// Literal hex values mirroring the dark-theme CSS custom properties in
// globals.css. Recharts needs literal color strings (SVG fill/stroke props
// don't reliably resolve CSS vars across browsers), so this file is the
// single place to update if the palette changes.
export const CHART_COLORS = {
  accent: "#8b5cf6",
  green: "#2dd4a7",
  red: "#f5566e",
  blue: "#3b82f6",
  orange: "#f5a524",
  purple: "#8b5cf6",
  text: "#f2f5fa",
  text2: "#9aa6bc",
  text3: "#5f6b82",
  border: "rgba(255, 255, 255, 0.08)",
  grid: "rgba(255, 255, 255, 0.08)",
  surface: "#141924",
};

export const CHART_FONT = "var(--font-inter), system-ui, sans-serif";
