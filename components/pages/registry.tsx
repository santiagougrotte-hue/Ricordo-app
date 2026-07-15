import React from "react";
import { NAV } from "@/lib/nav";
import { Placeholder } from "./Placeholder";
import { Dashboard } from "./Dashboard";
import { Pedidos } from "./Pedidos";
import { Clientes } from "./Clientes";

export const PAGES: Record<string, React.ComponentType> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, Placeholder]))
);

PAGES.dashboard = Dashboard;
PAGES.pedidos = Pedidos;
PAGES.clientes = Clientes;
