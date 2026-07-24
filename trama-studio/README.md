# TRAMA — Gestión financiera y presupuestaria

Aplicación de administración financiera, contable y presupuestaria para
TRAMA Studio. HTML/CSS/JS puro (sin build, sin backend): se abre
directamente desde `index.html`.

## Cómo usarla

Abrí `trama-studio/index.html` en el navegador (doble clic, o `Abrir con...`).
No requiere instalación, servidor ni conexión a internet: Chart.js, jsPDF y
las tipografías están incluidos localmente en `assets/`.

En el primer uso podés crear una contraseña local (opcional) para proteger
el acceso. Todos los datos (clientes, ingresos, gastos, presupuestos,
servicios, colaboradores, configuración) se guardan en el `localStorage`
del navegador — quedan en ese dispositivo y ese navegador. Hacé backups
periódicos desde **Configuración → Exportar copia de seguridad** (o el botón
"Backup" de la barra superior) y guardá el archivo `.json` resultante, por
ejemplo, en la carpeta `backups/`.

## Estructura

- `index.html` — estructura de la página y las 10 secciones de la app.
- `styles.css` — sistema visual (paleta editorial, responsive, modo oscuro).
- `storage.js` — persistencia en `localStorage`, configuración, backup/restauración y datos de demostración.
- `charts.js` — todos los gráficos (Chart.js) del Dashboard y Reportes.
- `pdf-generator.js` — generación de PDFs (presupuestos para clientes y reportes internos) con jsPDF.
- `app.js` — routing, autenticación local y la lógica de los 10 módulos (Dashboard, Clientes, Ingresos, Gastos, Presupuestos, Servicios, Distribución interna, Rentabilidad, Reportes, Configuración).
- `logos/trama-logo.svg` — logo por defecto (reemplazable desde Configuración o directamente este archivo).
- `assets/vendor/` — Chart.js y jsPDF incluidos localmente.
- `assets/fonts/` — tipografías auto-alojadas (Fraunces + Inter).
- `backups/` — carpeta sugerida para guardar los `.json` exportados.

## Datos de demostración

La app carga clientes, ingresos, gastos, servicios y colaboradores de
ejemplo (ROOT, La Nueva, Müller, Cliente de branding, Cliente de producción
de fotos — todos ficticios) para poder explorar cada sección. Se pueden
borrar en cualquier momento desde **Configuración → Eliminar datos de
demostración**, sin afectar los datos reales que hayas cargado.
