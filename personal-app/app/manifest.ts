import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Panel — Calendario y Finanzas",
    short_name: "Mi Panel",
    description: "App personal: calendario de eventos y finanzas personales.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d0d1a",
    theme_color: "#0d0d1a",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
