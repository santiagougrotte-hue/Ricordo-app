import React from "react";
import { Dashboard } from "./Dashboard";
import { Clientes } from "./Clientes";
import { Presupuestos } from "./Presupuestos";
import { Servicios } from "./Servicios";
import { Equipo } from "./Equipo";
import { CostosFijos } from "./CostosFijos";
import { RevisionClientes } from "./RevisionClientes";
import { Finanzas } from "./Finanzas";
import { Reportes } from "./Reportes";
import { Configuracion } from "./Configuracion";

export const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  clientes: Clientes,
  presupuestos: Presupuestos,
  "revision-clientes": RevisionClientes,
  servicios: Servicios,
  equipo: Equipo,
  "costos-fijos": CostosFijos,
  finanzas: Finanzas,
  reportes: Reportes,
  configuracion: Configuracion,
};
