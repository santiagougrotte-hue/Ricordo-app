import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/PwaRegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "TRAMA Studio — Gestión financiera",
  description: "Gestión financiera, administrativa y de presupuestos para TRAMA Studio.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TRAMA Studio",
  },
};

export const viewport: Viewport = {
  themeColor: "#17140f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`h-full ${inter.variable} ${grotesk.variable}`}>
      <body className="h-full min-h-screen bg-bg text-text antialiased">
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
