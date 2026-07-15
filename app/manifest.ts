import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ricordo Pasta — Sistema de Gestión",
    short_name: "Ricordo",
    description: "Gestión artesanal de pasta: ventas, producción, stock y finanzas.",
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
