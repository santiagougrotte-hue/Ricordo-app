import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Ricordo Pasta — Sistema de Gestión",
  description: "Gestión artesanal de pasta: ventas, producción, stock y finanzas.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ricordo",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d1a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full min-h-screen bg-bg text-text antialiased">
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
