import React from "react";
import { Dashboard } from "./Dashboard";
import { Clientes } from "./Clientes";
import { Presupuestos } from "./Presupuestos";
import { Servicios } from "./Servicios";
import { Equipo } from "./Equipo";
import { Finanzas } from "./Finanzas";
import { Reportes } from "./Reportes";
import { Configuracion } from "./Configuracion";

export const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  clientes: Clientes,
  presupuestos: Presupuestos,
  servicios: Servicios,
  equipo: Equipo,
  finanzas: Finanzas,
  reportes: Reportes,
  configuracion: Configuracion,
};
