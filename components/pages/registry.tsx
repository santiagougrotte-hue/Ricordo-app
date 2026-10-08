import React from "react";
import { Inicio } from "@/components/pages-v2/Inicio";
import { Ventas } from "@/components/pages-v2/Ventas";
import { Productos } from "@/components/pages-v2/Productos";
import { Inventario } from "@/components/pages-v2/Inventario";
import { Operaciones } from "@/components/pages-v2/Operaciones";
import { Finanzas } from "@/components/pages-v2/Finanzas";
import { Configuracion } from "@/components/pages-v2/Configuracion";

export const PAGES: Record<string, React.ComponentType> = {
  inicio: Inicio,
  ventas: Ventas,
  productos: Productos,
  inventario: Inventario,
  operaciones: Operaciones,
  finanzas: Finanzas,
  config: Configuracion,
};
