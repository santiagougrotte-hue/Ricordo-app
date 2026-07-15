import React from "react";
import { NAV } from "@/lib/nav";
import { Placeholder } from "./Placeholder";
import { Dashboard } from "./Dashboard";
import { Pedidos } from "./Pedidos";
import { Clientes } from "./Clientes";
import { Productos } from "./Productos";
import { Recetas } from "./Recetas";
import { Insumos } from "./Insumos";
import { Compras } from "./Compras";
import { Proveedores } from "./Proveedores";
import { Stock } from "./Stock";
import { Produccion } from "./Produccion";
import { Envios } from "./Envios";

export const PAGES: Record<string, React.ComponentType> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, Placeholder]))
);

PAGES.dashboard = Dashboard;
PAGES.pedidos = Pedidos;
PAGES.clientes = Clientes;
PAGES.productos = Productos;
PAGES.recetas = Recetas;
PAGES.insumos = Insumos;
PAGES.compras = Compras;
PAGES.proveedores = Proveedores;
PAGES.stock = Stock;
PAGES.produccion = Produccion;
PAGES.envios = Envios;
