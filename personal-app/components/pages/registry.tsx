import React from "react";
import { Dashboard } from "./Dashboard";
import { Calendario } from "./Calendario";
import { Finanzas } from "./Finanzas";
import { Ingresos } from "./Ingresos";
import { Egresos } from "./Egresos";
import { Historial } from "./Historial";

export const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  calendario: Calendario,
  finanzas: Finanzas,
  ingresos: Ingresos,
  egresos: Egresos,
  historial: Historial,
};
