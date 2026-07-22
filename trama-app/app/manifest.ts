import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRAMA Studio — Gestión financiera",
    short_name: "TRAMA",
    description: "Gestión financiera, administrativa y de presupuestos para TRAMA Studio.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#17140f",
    theme_color: "#17140f",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
