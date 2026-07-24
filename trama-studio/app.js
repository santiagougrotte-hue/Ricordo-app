/* ==========================================================================
   TRAMA Studio — app.js
   Lógica principal: autenticación local, routing, utilidades de UI
   (toasts, modales, confirmaciones), y todos los módulos de la aplicación
   (Dashboard, Clientes, Ingresos, Gastos, Servicios, Presupuestos,
   Distribución interna, Rentabilidad, Reportes, Configuración).

   Patrón: cada módulo expone una función render_X() que reconstruye el
   HTML de su contenedor a partir del estado + Storage. Las interacciones
   se manejan por delegación de eventos (click/submit/input/change) sobre
   document, leyendo atributos data-action / data-id / data-module.
   ========================================================================== */

// Tablas de despacho globales, completadas por cada módulo más abajo en este
// mismo archivo (Object.assign). Se resuelven en tiempo de ejecución, después
// de que todo el script ya se haya evaluado una vez.
const Actions = {};
const Forms = {};
const Filters = {};
const Live = {};

const App = (() => {

  // ------------------------------------------------------------------------
  // Estado global de UI (no persistente; lo persistente vive en Storage)
  // ------------------------------------------------------------------------
  const state = {
    route: "dashboard",
    clients: { search: "", status: "all", sortKey: "name", sortDir: "asc", detailId: null, detailTab: "overview" },
    incomes: { search: "", month: "", client: "all", service: "all", status: "all", method: "all", sortKey: "workMonth", sortDir: "desc" },
    expenses: { search: "", month: "", category: "all", scope: "all", status: "all", sortKey: "date", sortDir: "desc" },
    services: { search: "", onlyActive: false },
    collaborators: { search: "" },
    budgets: { mode: "list", search: "", status: "all", wizardStep: 1, draft: null, editingId: null },
    profitability: { dimension: "client", from: "", to: "" },
    reports: { periodType: "month", period: "", dimension: "client" },
    dashboard: { month: "" }
  };

  // ------------------------------------------------------------------------
  // Utilidades generales
  // ------------------------------------------------------------------------
  function fmtMoney(n) {
    const cfg = Storage.getConfig();
    const num = Number(n) || 0;
    const formatted = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(num));
    return `${cfg.currencySymbol || "$"} ${formatted}`;
  }

  function fmtDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function monthLabel(ym) {
    if (!ym) return "-";
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  }

  function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function toast(msg, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast" + (type === "error" ? " error" : type === "success" ? " success" : "");
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 3500);
  }

  // ---- Modal ---------------------------------------------------------------
  function openModal({ title, bodyHtml, size = "" }) {
    const host = document.getElementById("modal-host");
    host.innerHTML = `
      <div class="modal-overlay" id="active-modal-overlay">
        <div class="modal ${size === "lg" ? "modal-lg" : ""}">
          <div class="modal-header">
            <h3>${escapeHtml(title)}</h3>
            <button class="modal-close" data-action="close-modal" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
        </div>
      </div>`;
  }

  function closeModal() {
    const host = document.getElementById("modal-host");
    host.innerHTML = "";
  }

  function confirmAction(message, confirmLabel = "Eliminar") {
    return new Promise(resolve => {
      openModal({
        title: "Confirmar acción",
        bodyHtml: `
          <p style="margin-bottom:20px; color:var(--ink-soft);">${escapeHtml(message)}</p>
          <div class="form-actions">
            <button class="btn" data-action="close-modal">Cancelar</button>
            <button class="btn btn-danger" id="confirm-yes-btn">${escapeHtml(confirmLabel)}</button>
          </div>`
      });
      document.getElementById("confirm-yes-btn").onclick = () => { closeModal(); resolve(true); };
      const overlay = document.getElementById("active-modal-overlay");
      overlay.addEventListener("click", (e) => { if (e.target === overlay) resolve(false); }, { once: true });
    });
  }

  // ---- Ayudantes de tabla ----------------------------------------------------
  function sortArrow(state_, key) {
    if (state_.sortKey !== key) return "";
    return state_.sortDir === "asc" ? "▲" : "▼";
  }

  function applySort(arr, key, dir) {
    return [...arr].sort((a, b) => {
      let va = a[key], vb = b[key];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va === undefined || va === null) va = "";
      if (vb === undefined || vb === null) vb = "";
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function statusBadge(status, map) {
    const conf = map[status] || { label: status, cls: "badge-neutral" };
    return `<span class="badge ${conf.cls}"><span class="badge-dot"></span>${escapeHtml(conf.label)}</span>`;
  }

  const CLIENT_STATUS_MAP = {
    potencial: { label: "Potencial", cls: "badge-neutral" },
    activo: { label: "Activo", cls: "badge-success" },
    pausado: { label: "Pausado", cls: "badge-warning" },
    finalizado: { label: "Finalizado", cls: "badge-danger" }
  };
  const INCOME_STATUS_MAP = {
    pendiente: { label: "Pendiente", cls: "badge-danger" },
    parcial: { label: "Cobrado parcial", cls: "badge-warning" },
    cobrado: { label: "Cobrado", cls: "badge-success" }
  };
  const EXPENSE_STATUS_MAP = {
    pendiente: { label: "Pendiente", cls: "badge-warning" },
    pagado: { label: "Pagado", cls: "badge-success" }
  };
  const BUDGET_STATUS_MAP = {
    borrador: { label: "Borrador", cls: "badge-neutral" },
    enviado: { label: "Enviado", cls: "badge-warning" },
    aprobado: { label: "Aprobado", cls: "badge-success" },
    rechazado: { label: "Rechazado", cls: "badge-danger" }
  };

  // ------------------------------------------------------------------------
  // Navegación
  // ------------------------------------------------------------------------
  const NAV_ITEMS = [
    { id: "dashboard", label: "Inicio", icon: "home" },
    { id: "clients", label: "Clientes", icon: "users" },
    { id: "incomes", label: "Ingresos", icon: "arrow-down" },
    { id: "expenses", label: "Gastos", icon: "arrow-up" },
    { id: "budgets", label: "Presupuestos", icon: "file" },
    { id: "services", label: "Servicios", icon: "grid" },
    { id: "distribution", label: "Distribución interna", icon: "share" },
    { id: "profitability", label: "Rentabilidad", icon: "trend" },
    { id: "reports", label: "Reportes", icon: "chart" },
    { id: "settings", label: "Configuración", icon: "gear" }
  ];

  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    users: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 14.3c2.8.4 4.9 2.6 4.9 5.7" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    "arrow-down": '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v9M8 12l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    "arrow-up": '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 17V8M8 12l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    file: '<path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v4h4M8 12h8M8 16h8M8 9h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    share: '<circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.3 10.8L15.7 7M8.3 13.2L15.7 17" stroke="currentColor" stroke-width="1.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 6h6v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    chart: '<path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 13a7.6 7.6 0 000-2l2-1.5-2-3.4-2.3.9a7.7 7.7 0 00-1.7-1L15 3h-4l-.4 2.5a7.7 7.7 0 00-1.7 1l-2.3-.9-2 3.4L6.6 11a7.6 7.6 0 000 2l-2 1.6 2 3.4 2.3-.9c.5.4 1.1.8 1.7 1L11 21h4l.4-2.5a7.7 7.7 0 001.7-1l2.3.9 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'
  };

  function renderNav() {
    const nav = document.getElementById("nav-list");
    nav.innerHTML = NAV_ITEMS.map(item => `
      <li>
        <button class="nav-item ${state.route === item.id ? "active" : ""}" data-action="go" data-view="${item.id}">
          <svg viewBox="0 0 24 24">${ICONS[item.icon]}</svg>
          <span>${item.label}</span>
        </button>
      </li>`).join("");
  }

  const VIEW_TITLES = Object.fromEntries(NAV_ITEMS.map(i => [i.id, i.label]));

  function goTo(viewId) {
    state.route = viewId;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + viewId).classList.add("active");
    document.getElementById("topbar-title").textContent = VIEW_TITLES[viewId] || "TRAMA";
    renderNav();
    closeMobileSidebar();
    renderCurrentView();
    window.scrollTo(0, 0);
  }

  function renderCurrentView() {
    switch (state.route) {
      case "dashboard": return viewDashboard();
      case "clients": return viewClients();
      case "incomes": return viewIncomes();
      case "expenses": return viewExpenses();
      case "budgets": return viewBudgets();
      case "services": return viewServices();
      case "distribution": return viewDistribution();
      case "profitability": return viewProfitability();
      case "reports": return viewReports();
      case "settings": return viewSettings();
    }
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-backdrop").classList.remove("show");
  }

  // ------------------------------------------------------------------------
  // Autenticación local
  // ------------------------------------------------------------------------
  function isLoggedIn() { return sessionStorage.getItem("trama_session") === "1"; }
  function setLoggedIn() { sessionStorage.setItem("trama_session", "1"); }
  function logout() { sessionStorage.removeItem("trama_session"); location.reload(); }

  async function handleLoginSubmit(e) {
    e.preventDefault();
    const pass = document.getElementById("login-password").value;
    const auth = Storage.getAuth();
    if (!auth || !auth.passwordHash) {
      // No hay contraseña configurada todavía: esta pantalla actúa como alta inicial.
      if (!pass) { toast("Ingresá una contraseña o continuá sin ella.", "error"); return; }
      const hash = await Storage.sha256(pass);
      Storage.setAuth({ passwordHash: hash });
      setLoggedIn();
      boot();
      return;
    }
    const hash = await Storage.sha256(pass);
    if (hash === auth.passwordHash) {
      setLoggedIn();
      boot();
    } else {
      toast("Contraseña incorrecta.", "error");
    }
  }

  function setupLoginScreen() {
    const auth = Storage.getAuth();
    const note = document.getElementById("login-note");
    const skipBtn = document.getElementById("login-skip");
    if (!auth || !auth.passwordHash) {
      note.textContent = "Todavía no configuraste una contraseña local. Podés crear una ahora (recomendado) o continuar sin protección.";
      skipBtn.classList.remove("hidden");
      skipBtn.onclick = () => { setLoggedIn(); boot(); };
    }
    document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
  }

  // ------------------------------------------------------------------------
  // Tema claro/oscuro
  // ------------------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("theme-toggle").textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
  }
  function toggleTheme() {
    const cfg = Storage.getConfig();
    const next = cfg.theme === "dark" ? "light" : "dark";
    Storage.setConfig({ theme: next });
    applyTheme(next);
    // Los gráficos se dibujan en <canvas> y no heredan el cambio de tema
    // automáticamente: hay que volver a renderizar la vista actual.
    renderCurrentView();
  }

  // ------------------------------------------------------------------------
  // Logo (sidebar + login) desde configuración
  // ------------------------------------------------------------------------
  function applyLogo() {
    const cfg = Storage.getConfig();
    if (cfg.logoDataUrl) {
      document.getElementById("sidebar-logo-img").src = cfg.logoDataUrl;
      document.getElementById("login-logo-img").src = cfg.logoDataUrl;
    }
    document.querySelectorAll(".sidebar-brand .name").forEach(el => el.textContent = (cfg.agencyName || "TRAMA").split(" ")[0]);
  }

  // ------------------------------------------------------------------------
  // Delegación global de eventos
  // ------------------------------------------------------------------------
  function bindGlobalEvents() {
    document.addEventListener("click", (e) => {
      const actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === "close-modal") { closeModal(); return; }
      if (action === "go") { goTo(actionEl.dataset.view); return; }
      if (typeof Actions[action] === "function") {
        Actions[action](actionEl, e);
      }
    });

    document.addEventListener("submit", (e) => {
      const form = e.target.closest("form[data-form]");
      if (!form) return;
      e.preventDefault();
      const formName = form.dataset.form;
      if (typeof Forms[formName] === "function") {
        Forms[formName](form, e);
      }
    });

    document.addEventListener("input", (e) => {
      const el = e.target.closest("[data-live]");
      if (!el) return;
      if (typeof Live[el.dataset.live] === "function") {
        Live[el.dataset.live](el, e);
      }
    });

    document.addEventListener("change", (e) => {
      const el = e.target.closest("[data-filter]");
      if (el && typeof Filters[el.dataset.filter] === "function") {
        Filters[el.dataset.filter](el, e);
      }
      const live = e.target.closest("[data-live]");
      if (live && typeof Live[live.dataset.live] === "function") {
        Live[live.dataset.live](live, e);
      }
    });

    document.getElementById("menu-toggle").addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("open");
      document.getElementById("sidebar-backdrop").classList.add("show");
    });
    document.getElementById("sidebar-backdrop").addEventListener("click", closeMobileSidebar);
    document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
    document.getElementById("logout-btn").addEventListener("click", async () => {
      if (await confirmAction("¿Cerrar la sesión actual?", "Cerrar sesión")) logout();
    });
    document.getElementById("backup-btn").addEventListener("click", () => {
      Storage.exportBackupFile();
      toast("Copia de seguridad descargada.", "success");
    });
  }

  // ------------------------------------------------------------------------
  // Arranque de la aplicación (una vez autenticado)
  // ------------------------------------------------------------------------
  function boot() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");
    Storage.seedIfEmpty();
    applyTheme(Storage.getConfig().theme || "light");
    applyLogo();
    renderNav();
    goTo("dashboard");
  }

  function init() {
    bindGlobalEvents();
    setupLoginScreen();
    if (isLoggedIn()) boot();
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    state, fmtMoney, fmtDate, monthLabel, currentMonth, escapeHtml, toast,
    openModal, closeModal, confirmAction, sortArrow, applySort, statusBadge,
    CLIENT_STATUS_MAP, INCOME_STATUS_MAP, EXPENSE_STATUS_MAP, BUDGET_STATUS_MAP,
    goTo, renderCurrentView, applyLogo, applyTheme
  };
})();

/* ==========================================================================
   CÁLCULOS DE RENTABILIDAD (compartidos entre Dashboard, Clientes,
   Rentabilidad y Reportes)

   Fórmula:
   gananciaNeta = ingresosCobrados - gastosDirectos - pagosColaboradores
                  - impuestosEstimados - gastosGeneralesAsignados
   margenPct = gananciaNeta / ingresosCobrados * 100
   ========================================================================== */

function inPeriodYM(ym, period) {
  if (!ym) return false;
  if (period && period.from && ym < period.from) return false;
  if (period && period.to && ym > period.to) return false;
  return true;
}
function inPeriodDate(dateStr, period) { return inPeriodYM((dateStr || "").slice(0, 7), period); }

function totalGeneralExpenses(period) {
  return Storage.list("expenses").filter(e => e.scope === "general" && inPeriodDate(e.date, period))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}
function totalPaidIncomes(period) {
  return Storage.list("incomes").filter(i => inPeriodYM(i.workMonth, period))
    .reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
}

function buildProfitabilityRow({ ingresos, gastosDirectos, pagosColaboradores, gastosGeneralesAsignados }) {
  const cfg = Storage.getConfig();
  const impuestos = ingresos * (Number(cfg.taxRatePct) || 0) / 100;
  const gananciaNeta = ingresos - gastosDirectos - pagosColaboradores - impuestos - gastosGeneralesAsignados;
  const margenPct = ingresos > 0 ? (gananciaNeta / ingresos) * 100 : 0;
  return { ingresos, gastosDirectos, pagosColaboradores, impuestos, gastosGeneralesAsignados, gananciaNeta, margenPct };
}

function generalExpenseShare(ingresosDimension, period) {
  const totalGeneral = totalGeneralExpenses(period);
  const totalIngresos = totalPaidIncomes(period);
  if (!totalGeneral || !totalIngresos) return 0;
  return totalGeneral * (ingresosDimension / totalIngresos);
}

function profitabilityForClient(clientId, period) {
  const incomes = Storage.list("incomes").filter(i => i.clientId === clientId && inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => e.clientId === clientId && inPeriodDate(e.date, period));
  const collabCats = Storage.COLLABORATOR_CATEGORIES;
  const ingresos = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const gastosDirectos = expenses.filter(e => !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagosColaboradores = expenses.filter(e => collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gastosGeneralesAsignados = generalExpenseShare(ingresos, period);
  return buildProfitabilityRow({ ingresos, gastosDirectos, pagosColaboradores, gastosGeneralesAsignados });
}

function profitabilityForService(serviceId, period) {
  const incomes = Storage.list("incomes").filter(i => i.serviceId === serviceId && inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => e.serviceId === serviceId && inPeriodDate(e.date, period));
  const collabCats = Storage.COLLABORATOR_CATEGORIES;
  const ingresos = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const gastosDirectos = expenses.filter(e => !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagosColaboradores = expenses.filter(e => collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gastosGeneralesAsignados = generalExpenseShare(ingresos, period);
  return buildProfitabilityRow({ ingresos, gastosDirectos, pagosColaboradores, gastosGeneralesAsignados });
}

function profitabilityForProject(project, period) {
  const incomes = Storage.list("incomes").filter(i => (i.project || "") === project && inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => (e.project || "") === project && inPeriodDate(e.date, period));
  const collabCats = Storage.COLLABORATOR_CATEGORIES;
  const ingresos = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const gastosDirectos = expenses.filter(e => !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagosColaboradores = expenses.filter(e => collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gastosGeneralesAsignados = generalExpenseShare(ingresos, period);
  return buildProfitabilityRow({ ingresos, gastosDirectos, pagosColaboradores, gastosGeneralesAsignados });
}

function profitabilityForMonth(ym) {
  const period = { from: ym, to: ym };
  const incomes = Storage.list("incomes").filter(i => i.workMonth === ym);
  const expenses = Storage.list("expenses").filter(e => (e.date || "").slice(0, 7) === ym);
  const collabCats = Storage.COLLABORATOR_CATEGORIES;
  const ingresos = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const gastosDirectos = expenses.filter(e => e.scope !== "general" && !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagosColaboradores = expenses.filter(e => collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gastosGeneralesAsignados = expenses.filter(e => e.scope === "general" && !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return buildProfitabilityRow({ ingresos, gastosDirectos, pagosColaboradores, gastosGeneralesAsignados });
}

function profitabilityForYear(year) {
  const period = { from: `${year}-01`, to: `${year}-12` };
  const incomes = Storage.list("incomes").filter(i => inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => inPeriodDate(e.date, period));
  const collabCats = Storage.COLLABORATOR_CATEGORIES;
  const ingresos = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const gastosDirectos = expenses.filter(e => e.scope !== "general" && !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagosColaboradores = expenses.filter(e => collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gastosGeneralesAsignados = expenses.filter(e => e.scope === "general" && !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return buildProfitabilityRow({ ingresos, gastosDirectos, pagosColaboradores, gastosGeneralesAsignados });
}

// Aproximación: ingresos atribuidos = ingresos de los servicios en los que
// participa el colaborador; pagos = gastos vinculados directamente a esa persona.
function profitabilityForCollaborator(collaboratorId, period) {
  const collab = Storage.find("collaborators", collaboratorId);
  const serviceIds = (collab && collab.servicesInvolved) || [];
  const incomes = Storage.list("incomes").filter(i => serviceIds.includes(i.serviceId) && inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => e.collaboratorId === collaboratorId && inPeriodDate(e.date, period));
  const ingresos = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const pagosColaboradores = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gastosGeneralesAsignados = generalExpenseShare(ingresos, period);
  return buildProfitabilityRow({ ingresos, gastosDirectos: 0, pagosColaboradores, gastosGeneralesAsignados });
}

// Los buscadores re-renderizan todo su contenedor en cada tecla; esta ayuda
// evita que el cursor salte al principio del input después de cada letra.
function rerenderPreservingFocus(selector, renderFn) {
  const active = document.querySelector(selector);
  const pos = active ? active.selectionStart : null;
  renderFn();
  const next = document.querySelector(selector);
  if (next) {
    next.focus();
    if (pos !== null) { try { next.setSelectionRange(pos, pos); } catch (e) { /* input type sin soporte de selección */ } }
  }
}

function profitabilityAlert(margenPct) {
  const ranges = Storage.getConfig().profitabilityRanges || { alta: 40, saludable: 15, baja: 0 };
  if (margenPct < ranges.baja) return { label: "Pérdida", cls: "badge-danger" };
  if (margenPct < ranges.saludable) return { label: "Rentabilidad baja", cls: "badge-warning" };
  if (margenPct < ranges.alta) return { label: "Saludable", cls: "badge-success" };
  return { label: "Rentabilidad alta", cls: "badge-success" };
}

/* ==========================================================================
   MÓDULO: DASHBOARD
   ========================================================================== */

function computeIncomeAggregates(month) {
  const incomes = Storage.list("incomes");
  const monthIncomes = month ? incomes.filter(i => i.workMonth === month) : incomes;
  const totalFacturado = monthIncomes.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
  const totalCobrado = monthIncomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  const pendiente = monthIncomes.reduce((s, i) => {
    const saldo = (Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0);
    return s + Math.max(saldo, 0);
  }, 0);
  return { totalFacturado, totalCobrado, pendiente };
}

function computeExpenseTotal(month) {
  const expenses = Storage.list("expenses");
  const monthExpenses = month ? expenses.filter(e => (e.date || "").slice(0, 7) === month) : expenses;
  return monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function computeCollaboratorSpend(month) {
  const expenses = Storage.list("expenses");
  const cats = Storage.COLLABORATOR_CATEGORIES;
  const monthExpenses = month ? expenses.filter(e => (e.date || "").slice(0, 7) === month) : expenses;
  return monthExpenses.filter(e => cats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function populateMonthFilter(selectEl, selected) {
  const incomes = Storage.list("incomes");
  const expenses = Storage.list("expenses");
  const months = new Set([App.currentMonth()]);
  incomes.forEach(i => i.workMonth && months.add(i.workMonth));
  expenses.forEach(e => e.date && months.add(e.date.slice(0, 7)));
  const sorted = Array.from(months).sort().reverse();
  selectEl.innerHTML = `<option value="">Todos los meses</option>` +
    sorted.map(m => `<option value="${m}" ${m === selected ? "selected" : ""}>${App.monthLabel(m)}</option>`).join("");
}

function viewDashboard() {
  const month = App.state.dashboard.month || App.currentMonth();
  const monthSel = document.getElementById("dash-month-filter");
  populateMonthFilter(monthSel, month);

  const cfg = Storage.getConfig();
  const clients = Storage.list("clients");
  const budgets = Storage.list("budgets");
  const incomeAgg = computeIncomeAggregates(month);
  const expenseTotal = computeExpenseTotal(month);
  const ganancia = incomeAgg.totalCobrado - expenseTotal;
  const colaboradores = computeCollaboratorSpend(month);
  const paraTrama = Math.max(incomeAgg.totalCobrado - expenseTotal, 0);
  const clientesActivos = clients.filter(c => c.status === "activo").length;
  const enviados = budgets.filter(b => b.status === "enviado" || b.status === "aprobado" || b.status === "rechazado").length;
  const aprobados = budgets.filter(b => b.status === "aprobado").length;

  // Rentabilidad promedio (sobre clientes con ingresos cobrados en el período)
  const profRows = clients.map(c => profitabilityForClient(c.id, { from: month, to: month }));
  const withRevenue = profRows.filter(r => r.ingresos > 0);
  const margenProm = withRevenue.length ? withRevenue.reduce((s, r) => s + r.margenPct, 0) / withRevenue.length : 0;

  const kpis = [
    { label: "Ingresos del mes", value: App.fmtMoney(incomeAgg.totalCobrado) },
    { label: "Gastos del mes", value: App.fmtMoney(expenseTotal) },
    { label: "Ganancia estimada", value: App.fmtMoney(ganancia), cls: ganancia >= 0 ? "up" : "down" },
    { label: "Pendiente de cobro", value: App.fmtMoney(incomeAgg.pendiente) },
    { label: "Clientes activos", value: clientesActivos },
    { label: "Presupuestos enviados", value: enviados },
    { label: "Presupuestos aprobados", value: aprobados },
    { label: "Rentabilidad promedio", value: margenProm.toFixed(1) + "%" },
    { label: "Destinado a colaboradores", value: App.fmtMoney(colaboradores) },
    { label: "Queda para TRAMA", value: App.fmtMoney(paraTrama) }
  ];

  document.getElementById("dash-kpis").innerHTML = kpis.map(k => `
    <div class="card kpi-card">
      <div class="card-title">${k.label}</div>
      <div class="value">${k.value}</div>
    </div>`).join("");

  Charts.renderMonthlyFlow("chart-monthly-flow");
  Charts.renderYearlyEvolution("chart-yearly", new Date().getFullYear());
  Charts.renderIncomeByClient("chart-by-client", month);
  Charts.renderIncomeByService("chart-by-service");
  Charts.renderMoneyDistribution("chart-distribution", month);

  const months6 = Charts.lastMonths(6);
  const prevMonth = months6[months6.length - 2];
  Charts.renderMonthComparison("chart-comparison", prevMonth, month);
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "dash-month-filter") {
    App.state.dashboard.month = e.target.value;
    viewDashboard();
  }
});

/* ==========================================================================
   MÓDULO: CLIENTES
   ========================================================================== */

function clientTotals(clientId) {
  const incomes = Storage.list("incomes").filter(i => i.clientId === clientId);
  const facturado = incomes.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
  const cobrado = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  return { facturado, cobrado, pendiente: Math.max(facturado - cobrado, 0) };
}

function viewClients() {
  const root = document.getElementById("clients-root");
  const s = App.state.clients;
  if (s.detailId) { root.innerHTML = clientProfileHtml(s.detailId); return; }

  let clients = Storage.list("clients");
  if (s.search) {
    const q = s.search.toLowerCase();
    clients = clients.filter(c => (c.name + " " + c.brand).toLowerCase().includes(q));
  }
  if (s.status !== "all") clients = clients.filter(c => c.status === s.status);
  clients = App.applySort(clients, s.sortKey, s.sortDir);

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Cartera</div><h2>Clientes</h2></div>
      <div class="view-actions">
        <button class="btn btn-primary" data-action="clientNew">+ Nuevo cliente</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar cliente o marca..." value="${App.escapeHtml(s.search)}" data-live="clientSearch">
      </div>
      <select class="filter-select" data-filter="clientStatus">
        <option value="all" ${s.status === "all" ? "selected" : ""}>Todos los estados</option>
        ${Object.keys(App.CLIENT_STATUS_MAP).map(k => `<option value="${k}" ${s.status === k ? "selected" : ""}>${App.CLIENT_STATUS_MAP[k].label}</option>`).join("")}
      </select>
    </div>
    <div class="table-wrap scroll-x">
      <table>
        <thead><tr>
          <th class="sortable" data-sort="name">Cliente <span class="sort-arrow">${App.sortArrow(s, "name")}</span></th>
          <th>Estado</th>
          <th>Modalidad</th>
          <th class="sortable" data-sort="agreedAmount">Monto acordado <span class="sort-arrow">${App.sortArrow(s, "agreedAmount")}</span></th>
          <th>Facturado</th>
          <th>Pendiente</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${clients.length === 0 ? `<tr class="empty-row"><td colspan="7">No hay clientes que coincidan con la búsqueda.</td></tr>` : clients.map(c => {
            const t = clientTotals(c.id);
            return `<tr>
              <td data-label="Cliente"><span class="cell-strong">${App.escapeHtml(c.name)}</span><br><span class="cell-muted">${App.escapeHtml(c.brand || "")}</span></td>
              <td data-label="Estado">${App.statusBadge(c.status, App.CLIENT_STATUS_MAP)}</td>
              <td data-label="Modalidad">${App.escapeHtml(c.modality || "-")}</td>
              <td data-label="Monto acordado">${App.fmtMoney(c.agreedAmount)}</td>
              <td data-label="Facturado">${App.fmtMoney(t.facturado)}</td>
              <td data-label="Pendiente">${App.fmtMoney(t.pendiente)}</td>
              <td data-label="Acciones"><div class="table-actions">
                <button class="btn btn-sm" data-action="clientView" data-id="${c.id}">Ver</button>
                <button class="btn btn-sm" data-action="clientEdit" data-id="${c.id}">Editar</button>
                <button class="btn btn-sm btn-danger" data-action="clientDelete" data-id="${c.id}">Eliminar</button>
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (s.sortKey === key) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
      else { s.sortKey = key; s.sortDir = "asc"; }
      viewClients();
    });
  });
}

Live.clientSearch = function (el) { App.state.clients.search = el.value; rerenderPreservingFocus('[data-live="clientSearch"]', viewClients); };
Filters.clientStatus = function (el) { App.state.clients.status = el.value; viewClients(); };

function clientFormHtml(client) {
  const c = client || {
    name: "", brand: "", contactPerson: "", email: "", phone: "", social: "",
    startDate: new Date().toISOString().slice(0, 10), status: "potencial",
    modality: "mensual", agreedAmount: 0, paymentDay: 10, notes: ""
  };
  const services = Storage.list("services").filter(sv => sv.active !== false);
  const selectedServices = new Set(c.servicesContracted || []);
  return `
    <form data-form="clientSave" data-id="${c.id || ""}">
      <div class="form-grid">
        <div class="form-field"><label>Nombre del cliente / marca *</label><input required name="name" value="${App.escapeHtml(c.name)}"></div>
        <div class="form-field"><label>Marca o empresa</label><input name="brand" value="${App.escapeHtml(c.brand)}"></div>
        <div class="form-field"><label>Persona de contacto</label><input name="contactPerson" value="${App.escapeHtml(c.contactPerson)}"></div>
        <div class="form-field"><label>Correo electrónico</label><input type="email" name="email" value="${App.escapeHtml(c.email)}"></div>
        <div class="form-field"><label>Teléfono</label><input name="phone" value="${App.escapeHtml(c.phone)}"></div>
        <div class="form-field"><label>Instagram / sitio web</label><input name="social" value="${App.escapeHtml(c.social)}"></div>
        <div class="form-field"><label>Fecha de inicio</label><input type="date" name="startDate" value="${c.startDate || ""}"></div>
        <div class="form-field"><label>Estado</label>
          <select name="status">${Object.keys(App.CLIENT_STATUS_MAP).map(k => `<option value="${k}" ${c.status === k ? "selected" : ""}>${App.CLIENT_STATUS_MAP[k].label}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Modalidad</label>
          <select name="modality">
            <option value="mensual" ${c.modality === "mensual" ? "selected" : ""}>Mensual</option>
            <option value="proyecto único" ${c.modality === "proyecto único" ? "selected" : ""}>Proyecto único</option>
            <option value="producción puntual" ${c.modality === "producción puntual" ? "selected" : ""}>Producción puntual</option>
          </select>
        </div>
        <div class="form-field"><label>Monto acordado</label><input type="number" step="0.01" name="agreedAmount" value="${c.agreedAmount ?? 0}"></div>
        <div class="form-field"><label>Día estimado de pago</label><input type="number" min="1" max="31" name="paymentDay" value="${c.paymentDay ?? 10}"></div>
        <div class="form-field full"><label>Servicios contratados</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${services.map(sv => `
              <label class="checkbox-row" style="background:var(--surface-2); padding:6px 10px; border-radius:8px;">
                <input type="checkbox" name="servicesContracted" value="${sv.id}" ${selectedServices.has(sv.id) ? "checked" : ""}> ${App.escapeHtml(sv.name)}
              </label>`).join("") || "<span class='form-hint'>Cargá servicios en el catálogo primero.</span>"}
          </div>
        </div>
        <div class="form-field full"><label>Observaciones</label><textarea name="notes">${App.escapeHtml(c.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar cliente</button>
      </div>
    </form>`;
}

Actions.clientNew = function () {
  App.openModal({ title: "Nuevo cliente", bodyHtml: clientFormHtml(null), size: "lg" });
};
Actions.clientEdit = function (el) {
  const c = Storage.find("clients", el.dataset.id);
  App.openModal({ title: "Editar cliente", bodyHtml: clientFormHtml(c), size: "lg" });
};
Actions.clientView = function (el) {
  App.state.clients.detailId = el.dataset.id;
  App.state.clients.detailTab = "overview";
  viewClients();
};
Actions.clientBack = function () { App.state.clients.detailId = null; viewClients(); };
Actions.clientDelete = async function (el) {
  const c = Storage.find("clients", el.dataset.id);
  if (!c) return;
  const ok = await App.confirmAction(`¿Eliminar al cliente "${c.name}"? Esta acción no se puede deshacer.`);
  if (!ok) return;
  Storage.remove("clients", c.id);
  App.toast("Cliente eliminado.", "success");
  viewClients();
};
Actions.clientTab = function (el) {
  App.state.clients.detailTab = el.dataset.tab;
  viewClients();
};

Forms.clientSave = function (form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const servicesContracted = fd.getAll("servicesContracted");
  const record = {
    name: fd.get("name")?.trim(),
    brand: fd.get("brand")?.trim(),
    contactPerson: fd.get("contactPerson")?.trim(),
    email: fd.get("email")?.trim(),
    phone: fd.get("phone")?.trim(),
    social: fd.get("social")?.trim(),
    startDate: fd.get("startDate"),
    status: fd.get("status"),
    modality: fd.get("modality"),
    agreedAmount: Number(fd.get("agreedAmount")) || 0,
    paymentDay: Number(fd.get("paymentDay")) || 1,
    notes: fd.get("notes"),
    servicesContracted
  };
  if (!record.name) { App.toast("El nombre del cliente es obligatorio.", "error"); return; }
  if (id) Storage.update("clients", id, record);
  else Storage.insert("clients", record);
  App.closeModal();
  App.toast("Cliente guardado.", "success");
  viewClients();
};

function clientProfileHtml(clientId) {
  const c = Storage.find("clients", clientId);
  if (!c) { App.state.clients.detailId = null; return `<p>Cliente no encontrado.</p>`; }
  const tab = App.state.clients.detailTab || "overview";
  const incomes = Storage.list("incomes").filter(i => i.clientId === clientId);
  const expenses = Storage.list("expenses").filter(e => e.clientId === clientId);
  const budgets = Storage.list("budgets").filter(b => b.linkedClientId === clientId);
  const services = Storage.list("services");
  const prof = profitabilityForClient(clientId, { from: "", to: "" });
  const t = clientTotals(clientId);
  const collabCats = Storage.COLLABORATOR_CATEGORIES;
  const costosInternos = expenses.filter(e => !collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagosColaboradores = expenses.filter(e => collabCats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const tabs = [
    ["overview", "Resumen"], ["incomes", "Ingresos"], ["expenses", "Gastos"], ["budgets", "Presupuestos"]
  ];

  let body = "";
  if (tab === "overview") {
    const serviceNames = (c.servicesContracted || []).map(id => services.find(sv => sv.id === id)?.name).filter(Boolean);
    const alert = profitabilityAlert(prof.margenPct);
    body = `
      <div class="grid grid-4">
        <div class="card kpi-card"><div class="card-title">Total facturado</div><div class="value">${App.fmtMoney(t.facturado)}</div></div>
        <div class="card kpi-card"><div class="card-title">Total cobrado</div><div class="value">${App.fmtMoney(t.cobrado)}</div></div>
        <div class="card kpi-card"><div class="card-title">Pendiente</div><div class="value">${App.fmtMoney(t.pendiente)}</div></div>
        <div class="card kpi-card"><div class="card-title">Margen de rentabilidad</div><div class="value">${prof.margenPct.toFixed(1)}%</div><span class="badge ${alert.cls}">${alert.label}</span></div>
      </div>
      <div class="section-block">
        <div class="section-block-title">Detalle</div>
        <div class="grid grid-2">
          <div class="card">
            <div class="card-title">Servicios contratados</div>
            <p>${serviceNames.length ? serviceNames.join(", ") : "Sin servicios asignados."}</p>
            <div class="card-title" style="margin-top:14px;">Observaciones</div>
            <p style="color:var(--ink-soft);">${App.escapeHtml(c.notes) || "-"}</p>
          </div>
          <div class="card">
            <div class="summary-line"><span class="label">Costos internos</span><span>${App.fmtMoney(costosInternos)}</span></div>
            <div class="summary-line"><span class="label">Dinero destinado a colaboradores</span><span>${App.fmtMoney(pagosColaboradores)}</span></div>
            <div class="summary-line"><span class="label">Impuestos estimados</span><span>${App.fmtMoney(prof.impuestos)}</span></div>
            <div class="summary-line"><span class="label">Gastos generales asignados</span><span>${App.fmtMoney(prof.gastosGeneralesAsignados)}</span></div>
            <div class="summary-line total"><span class="label">Ganancia neta de TRAMA</span><span>${App.fmtMoney(prof.gananciaNeta)}</span></div>
          </div>
        </div>
      </div>`;
  } else if (tab === "incomes") {
    body = `<div class="table-wrap scroll-x"><table>
      <thead><tr><th>Mes</th><th>Concepto</th><th>Total</th><th>Cobrado</th><th>Estado</th></tr></thead>
      <tbody>${incomes.length ? incomes.map(i => `
        <tr><td data-label="Mes">${App.monthLabel(i.workMonth)}</td><td data-label="Concepto">${App.escapeHtml(i.concept)}</td>
        <td data-label="Total">${App.fmtMoney(i.totalAmount)}</td><td data-label="Cobrado">${App.fmtMoney(i.paidAmount)}</td>
        <td data-label="Estado">${App.statusBadge(i.status, App.INCOME_STATUS_MAP)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="5">Sin ingresos registrados.</td></tr>`}</tbody>
    </table></div>`;
  } else if (tab === "expenses") {
    body = `<div class="table-wrap scroll-x"><table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead>
      <tbody>${expenses.length ? expenses.map(e => `
        <tr><td data-label="Fecha">${App.fmtDate(e.date)}</td><td data-label="Categoría">${App.escapeHtml(e.category)}</td>
        <td data-label="Descripción">${App.escapeHtml(e.description)}</td><td data-label="Monto">${App.fmtMoney(e.amount)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="4">Sin gastos registrados.</td></tr>`}</tbody>
    </table></div>`;
  } else if (tab === "budgets") {
    body = `<div class="table-wrap scroll-x"><table>
      <thead><tr><th>Proyecto</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead>
      <tbody>${budgets.length ? budgets.map(b => `
        <tr><td data-label="Proyecto">${App.escapeHtml(b.projectName)}</td><td data-label="Fecha">${App.fmtDate(b.date)}</td>
        <td data-label="Total">${App.fmtMoney(budgetTotals(b).total)}</td><td data-label="Estado">${App.statusBadge(b.status, App.BUDGET_STATUS_MAP)}</td></tr>`).join("") : `<tr class="empty-row"><td colspan="4">Sin presupuestos vinculados.</td></tr>`}</tbody>
    </table></div>`;
  }

  return `
    <button class="btn btn-sm" data-action="clientBack" style="margin-bottom:16px;">&larr; Volver a clientes</button>
    <div class="profile-header">
      <div class="profile-avatar">${(c.name || "?").slice(0, 1).toUpperCase()}</div>
      <div style="flex:1;">
        <h2>${App.escapeHtml(c.name)}</h2>
        <div class="cell-muted">${App.escapeHtml(c.brand || "")}</div>
      </div>
      ${App.statusBadge(c.status, App.CLIENT_STATUS_MAP)}
      <button class="btn btn-sm" data-action="clientEdit" data-id="${c.id}">Editar</button>
    </div>
    <div class="tabs">${tabs.map(([id, label]) => `<button class="tab-btn ${tab === id ? "active" : ""}" data-action="clientTab" data-tab="${id}">${label}</button>`).join("")}</div>
    ${body}`;
}

/* ==========================================================================
   MÓDULO: INGRESOS
   ========================================================================== */

function incomeStatusFor(total, paid) {
  if (paid <= 0) return "pendiente";
  if (paid >= total) return "cobrado";
  return "parcial";
}

function viewIncomes() {
  const root = document.getElementById("incomes-root");
  const s = App.state.incomes;
  const clients = Storage.list("clients");
  const services = Storage.list("services");
  let incomes = Storage.list("incomes");

  if (s.search) {
    const q = s.search.toLowerCase();
    incomes = incomes.filter(i => (i.concept || "").toLowerCase().includes(q) || (i.invoiceNumber || "").toLowerCase().includes(q));
  }
  if (s.month) incomes = incomes.filter(i => i.workMonth === s.month);
  if (s.client !== "all") incomes = incomes.filter(i => i.clientId === s.client);
  if (s.service !== "all") incomes = incomes.filter(i => i.serviceId === s.service);
  if (s.status !== "all") incomes = incomes.filter(i => i.status === s.status);
  if (s.method !== "all") incomes = incomes.filter(i => i.paymentMethod === s.method);
  incomes = App.applySort(incomes, s.sortKey, s.sortDir);

  const months = Array.from(new Set(Storage.list("incomes").map(i => i.workMonth).filter(Boolean))).sort().reverse();
  const totalCobrado = incomes.reduce((a, i) => a + (Number(i.paidAmount) || 0), 0);
  const totalPendiente = incomes.reduce((a, i) => a + Math.max((Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0), 0), 0);
  const paymentMethods = Storage.getConfig().paymentMethods || [];

  const clientName = (id) => clients.find(c => c.id === id)?.name || "—";
  const serviceName = (id) => services.find(sv => sv.id === id)?.name || "—";

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Contabilidad</div><h2>Ingresos</h2></div>
      <div class="view-actions"><button class="btn btn-primary" data-action="incomeNew">+ Nuevo ingreso</button></div>
    </div>

    <div class="grid grid-2" style="margin-bottom:18px;">
      <div class="card kpi-card"><div class="card-title">Total cobrado (filtro actual)</div><div class="value">${App.fmtMoney(totalCobrado)}</div></div>
      <div class="card kpi-card"><div class="card-title">Total pendiente (filtro actual)</div><div class="value">${App.fmtMoney(totalPendiente)}</div></div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar concepto o comprobante..." value="${App.escapeHtml(s.search)}" data-live="incomeSearch">
      </div>
      <select class="filter-select" data-filter="incomeMonth">
        <option value="">Todos los meses</option>
        ${months.map(m => `<option value="${m}" ${s.month === m ? "selected" : ""}>${App.monthLabel(m)}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="incomeClient">
        <option value="all">Todos los clientes</option>
        ${clients.map(c => `<option value="${c.id}" ${s.client === c.id ? "selected" : ""}>${App.escapeHtml(c.name)}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="incomeService">
        <option value="all">Todos los servicios</option>
        ${services.map(sv => `<option value="${sv.id}" ${s.service === sv.id ? "selected" : ""}>${App.escapeHtml(sv.name)}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="incomeStatus">
        <option value="all">Todos los estados</option>
        ${Object.keys(App.INCOME_STATUS_MAP).map(k => `<option value="${k}" ${s.status === k ? "selected" : ""}>${App.INCOME_STATUS_MAP[k].label}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="incomeMethod">
        <option value="all">Todos los medios</option>
        ${paymentMethods.map(m => `<option value="${m}" ${s.method === m ? "selected" : ""}>${m}</option>`).join("")}
      </select>
    </div>

    <div class="table-wrap scroll-x">
      <table>
        <thead><tr>
          <th class="sortable" data-sort="workMonth">Mes <span class="sort-arrow">${App.sortArrow(s, "workMonth")}</span></th>
          <th>Cliente</th><th>Concepto</th><th>Servicio</th>
          <th class="sortable" data-sort="totalAmount">Total <span class="sort-arrow">${App.sortArrow(s, "totalAmount")}</span></th>
          <th>Cobrado</th><th>Saldo</th><th>Medio</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${incomes.length === 0 ? `<tr class="empty-row"><td colspan="10">No hay ingresos que coincidan con los filtros.</td></tr>` : incomes.map(i => {
            const saldo = (Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0);
            return `<tr>
              <td data-label="Mes">${App.monthLabel(i.workMonth)}</td>
              <td data-label="Cliente">${App.escapeHtml(clientName(i.clientId))}</td>
              <td data-label="Concepto">${App.escapeHtml(i.concept)}</td>
              <td data-label="Servicio">${App.escapeHtml(serviceName(i.serviceId))}</td>
              <td data-label="Total">${App.fmtMoney(i.totalAmount)}</td>
              <td data-label="Cobrado">${App.fmtMoney(i.paidAmount)}</td>
              <td data-label="Saldo">${App.fmtMoney(Math.max(saldo, 0))}</td>
              <td data-label="Medio">${App.escapeHtml(i.paymentMethod || "-")}</td>
              <td data-label="Estado">${App.statusBadge(i.status, App.INCOME_STATUS_MAP)}</td>
              <td data-label="Acciones"><div class="table-actions">
                <button class="btn btn-sm" data-action="incomeDuplicate" data-id="${i.id}" title="Duplicar para el próximo mes">Duplicar</button>
                <button class="btn btn-sm" data-action="incomeEdit" data-id="${i.id}">Editar</button>
                <button class="btn btn-sm btn-danger" data-action="incomeDelete" data-id="${i.id}">Eliminar</button>
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (s.sortKey === key) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
      else { s.sortKey = key; s.sortDir = "desc"; }
      viewIncomes();
    });
  });
}

Live.incomeSearch = function (el) { App.state.incomes.search = el.value; rerenderPreservingFocus('[data-live="incomeSearch"]', viewIncomes); };
Filters.incomeMonth = function (el) { App.state.incomes.month = el.value; viewIncomes(); };
Filters.incomeClient = function (el) { App.state.incomes.client = el.value; viewIncomes(); };
Filters.incomeService = function (el) { App.state.incomes.service = el.value; viewIncomes(); };
Filters.incomeStatus = function (el) { App.state.incomes.status = el.value; viewIncomes(); };
Filters.incomeMethod = function (el) { App.state.incomes.method = el.value; viewIncomes(); };

function incomeFormHtml(income) {
  const i = income || {
    clientId: "", concept: "", serviceId: "", workMonth: App.currentMonth(),
    issueDate: new Date().toISOString().slice(0, 10), collectDate: "", totalAmount: 0,
    currency: "ARS", paymentMethod: "", status: "pendiente", paidAmount: 0,
    invoiceNumber: "", notes: "", attachmentName: "", recurring: false, nextPaymentDate: "", project: ""
  };
  const clients = Storage.list("clients");
  const services = Storage.list("services");
  const cfg = Storage.getConfig();
  return `
    <form data-form="incomeSave" data-id="${i.id || ""}">
      <div class="form-grid">
        <div class="form-field"><label>Cliente *</label>
          <select required name="clientId">
            <option value="">Seleccionar...</option>
            ${clients.map(c => `<option value="${c.id}" ${i.clientId === c.id ? "selected" : ""}>${App.escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field"><label>Servicio relacionado</label>
          <select name="serviceId"><option value="">-</option>${services.map(sv => `<option value="${sv.id}" ${i.serviceId === sv.id ? "selected" : ""}>${App.escapeHtml(sv.name)}</option>`).join("")}</select>
        </div>
        <div class="form-field full"><label>Concepto *</label><input required name="concept" value="${App.escapeHtml(i.concept)}"></div>
        <div class="form-field"><label>Mes correspondiente al trabajo</label><input type="month" name="workMonth" value="${i.workMonth}"></div>
        <div class="form-field"><label>Proyecto (opcional)</label><input name="project" value="${App.escapeHtml(i.project || "")}"></div>
        <div class="form-field"><label>Fecha de emisión</label><input type="date" name="issueDate" value="${i.issueDate || ""}"></div>
        <div class="form-field"><label>Fecha de cobro</label><input type="date" name="collectDate" value="${i.collectDate || ""}"></div>
        <div class="form-field"><label>Monto total *</label><input required type="number" step="0.01" name="totalAmount" value="${i.totalAmount ?? 0}" data-live="incomeCalc"></div>
        <div class="form-field"><label>Monto abonado</label><input type="number" step="0.01" name="paidAmount" value="${i.paidAmount ?? 0}" data-live="incomeCalc"></div>
        <div class="form-field"><label>Saldo pendiente</label><input type="text" id="income-saldo-display" value="${App.fmtMoney((i.totalAmount || 0) - (i.paidAmount || 0))}" disabled></div>
        <div class="form-field"><label>Moneda</label>
          <select name="currency"><option ${i.currency === "ARS" ? "selected" : ""}>ARS</option><option ${i.currency === "USD" ? "selected" : ""}>USD</option><option ${i.currency === "EUR" ? "selected" : ""}>EUR</option></select>
        </div>
        <div class="form-field"><label>Medio de pago</label>
          <select name="paymentMethod">${(cfg.paymentMethods || []).map(m => `<option ${i.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Próxima fecha de pago (si queda saldo)</label><input type="date" name="nextPaymentDate" value="${i.nextPaymentDate || ""}"></div>
        <div class="form-field"><label>Número de factura / comprobante</label><input name="invoiceNumber" value="${App.escapeHtml(i.invoiceNumber)}"></div>
        <div class="form-field full"><label class="checkbox-row"><input type="checkbox" name="recurring" ${i.recurring ? "checked" : ""}> Ingreso mensual recurrente (habilita duplicar rápido)</label></div>
        <div class="form-field full"><label>Observaciones</label><textarea name="notes">${App.escapeHtml(i.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar ingreso</button>
      </div>
    </form>`;
}

Live.incomeCalc = function (el, e) {
  const form = el.closest("form");
  const total = Number(form.querySelector("[name=totalAmount]").value) || 0;
  const paid = Number(form.querySelector("[name=paidAmount]").value) || 0;
  const display = document.getElementById("income-saldo-display");
  if (display) display.value = App.fmtMoney(Math.max(total - paid, 0));
};

Actions.incomeNew = function () { App.openModal({ title: "Nuevo ingreso", bodyHtml: incomeFormHtml(null), size: "lg" }); };
Actions.incomeEdit = function (el) {
  const i = Storage.find("incomes", el.dataset.id);
  App.openModal({ title: "Editar ingreso", bodyHtml: incomeFormHtml(i), size: "lg" });
};
Actions.incomeDelete = async function (el) {
  if (!(await App.confirmAction("¿Eliminar este ingreso?"))) return;
  Storage.remove("incomes", el.dataset.id);
  App.toast("Ingreso eliminado.", "success");
  viewIncomes();
};
Actions.incomeDuplicate = function (el) {
  const i = Storage.find("incomes", el.dataset.id);
  if (!i) return;
  const [y, m] = i.workMonth.split("-").map(Number);
  const nextDate = new Date(y, m, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  const clone = {
    ...i, id: undefined, createdAt: undefined, _demo: false,
    workMonth: nextMonth, issueDate: nextMonth + "-01", collectDate: "",
    paidAmount: 0, status: "pendiente"
  };
  Storage.insert("incomes", clone);
  App.toast(`Ingreso duplicado para ${App.monthLabel(nextMonth)}.`, "success");
  viewIncomes();
};

Forms.incomeSave = function (form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const total = Number(fd.get("totalAmount")) || 0;
  const paid = Number(fd.get("paidAmount")) || 0;
  if (!fd.get("clientId")) { App.toast("Seleccioná un cliente.", "error"); return; }
  const record = {
    clientId: fd.get("clientId"), concept: fd.get("concept")?.trim(), serviceId: fd.get("serviceId") || "",
    workMonth: fd.get("workMonth") || App.currentMonth(), project: fd.get("project")?.trim() || "",
    issueDate: fd.get("issueDate"), collectDate: fd.get("collectDate"),
    totalAmount: total, currency: fd.get("currency"), paymentMethod: fd.get("paymentMethod"),
    status: incomeStatusFor(total, paid), paidAmount: paid,
    invoiceNumber: fd.get("invoiceNumber")?.trim(), notes: fd.get("notes"),
    recurring: fd.get("recurring") === "on", nextPaymentDate: fd.get("nextPaymentDate")
  };
  if (id) Storage.update("incomes", id, record);
  else Storage.insert("incomes", record);
  App.closeModal();
  App.toast("Ingreso guardado.", "success");
  viewIncomes();
};

/* ==========================================================================
   MÓDULO: GASTOS
   ========================================================================== */

const SCOPE_LABELS = { general: "General de agencia", cliente: "Específico de cliente", produccion: "Específico de producción" };

function viewExpenses() {
  const root = document.getElementById("expenses-root");
  const s = App.state.expenses;
  const clients = Storage.list("clients");
  const categories = Storage.list("categories");
  let expenses = Storage.list("expenses");

  if (s.search) {
    const q = s.search.toLowerCase();
    expenses = expenses.filter(e => (e.description || "").toLowerCase().includes(q) || (e.provider || "").toLowerCase().includes(q));
  }
  if (s.month) expenses = expenses.filter(e => (e.date || "").slice(0, 7) === s.month);
  if (s.category !== "all") expenses = expenses.filter(e => e.category === s.category);
  if (s.scope !== "all") expenses = expenses.filter(e => e.scope === s.scope);
  if (s.status !== "all") expenses = expenses.filter(e => e.status === s.status);
  expenses = App.applySort(expenses, s.sortKey, s.sortDir);

  const months = Array.from(new Set(Storage.list("expenses").map(e => (e.date || "").slice(0, 7)).filter(Boolean))).sort().reverse();
  const total = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const clientName = (id) => clients.find(c => c.id === id)?.name || "—";

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Contabilidad</div><h2>Gastos</h2></div>
      <div class="view-actions">
        <button class="btn" data-action="categoriesManage">Gestionar categorías</button>
        <button class="btn btn-primary" data-action="expenseNew">+ Nuevo gasto</button>
      </div>
    </div>

    <div class="card kpi-card" style="margin-bottom:18px; max-width:280px;">
      <div class="card-title">Total (filtro actual)</div><div class="value">${App.fmtMoney(total)}</div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar descripción o proveedor..." value="${App.escapeHtml(s.search)}" data-live="expenseSearch">
      </div>
      <select class="filter-select" data-filter="expenseMonth">
        <option value="">Todos los meses</option>
        ${months.map(m => `<option value="${m}" ${s.month === m ? "selected" : ""}>${App.monthLabel(m)}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="expenseCategory">
        <option value="all">Todas las categorías</option>
        ${categories.map(c => `<option value="${c}" ${s.category === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="expenseScope">
        <option value="all">Todos los alcances</option>
        ${Object.keys(SCOPE_LABELS).map(k => `<option value="${k}" ${s.scope === k ? "selected" : ""}>${SCOPE_LABELS[k]}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="expenseStatus">
        <option value="all">Todos los estados</option>
        ${Object.keys(App.EXPENSE_STATUS_MAP).map(k => `<option value="${k}" ${s.status === k ? "selected" : ""}>${App.EXPENSE_STATUS_MAP[k].label}</option>`).join("")}
      </select>
    </div>

    <div class="table-wrap scroll-x">
      <table>
        <thead><tr>
          <th class="sortable" data-sort="date">Fecha <span class="sort-arrow">${App.sortArrow(s, "date")}</span></th>
          <th>Categoría</th><th>Descripción</th><th>Cliente</th><th>Alcance</th>
          <th class="sortable" data-sort="amount">Monto <span class="sort-arrow">${App.sortArrow(s, "amount")}</span></th>
          <th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${expenses.length === 0 ? `<tr class="empty-row"><td colspan="8">No hay gastos que coincidan con los filtros.</td></tr>` : expenses.map(e => `
            <tr>
              <td data-label="Fecha">${App.fmtDate(e.date)}</td>
              <td data-label="Categoría">${App.escapeHtml(e.category)}</td>
              <td data-label="Descripción">${App.escapeHtml(e.description)}</td>
              <td data-label="Cliente">${e.clientId ? App.escapeHtml(clientName(e.clientId)) : "-"}</td>
              <td data-label="Alcance"><span class="badge badge-neutral">${SCOPE_LABELS[e.scope] || e.scope}</span></td>
              <td data-label="Monto">${App.fmtMoney(e.amount)}</td>
              <td data-label="Estado">${App.statusBadge(e.status, App.EXPENSE_STATUS_MAP)}</td>
              <td data-label="Acciones"><div class="table-actions">
                <button class="btn btn-sm" data-action="expenseEdit" data-id="${e.id}">Editar</button>
                <button class="btn btn-sm btn-danger" data-action="expenseDelete" data-id="${e.id}">Eliminar</button>
              </div></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  root.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (s.sortKey === key) s.sortDir = s.sortDir === "asc" ? "desc" : "asc";
      else { s.sortKey = key; s.sortDir = "desc"; }
      viewExpenses();
    });
  });
}

Live.expenseSearch = function (el) { App.state.expenses.search = el.value; rerenderPreservingFocus('[data-live="expenseSearch"]', viewExpenses); };
Filters.expenseMonth = function (el) { App.state.expenses.month = el.value; viewExpenses(); };
Filters.expenseCategory = function (el) { App.state.expenses.category = el.value; viewExpenses(); };
Filters.expenseScope = function (el) { App.state.expenses.scope = el.value; viewExpenses(); };
Filters.expenseStatus = function (el) { App.state.expenses.status = el.value; viewExpenses(); };

function expenseFormHtml(expense) {
  const e = expense || {
    date: new Date().toISOString().slice(0, 10), category: "", description: "", clientId: "",
    project: "", serviceId: "", provider: "", collaboratorId: "", amount: 0, currency: "ARS",
    paymentMethod: "", status: "pendiente", receipt: "", notes: "", scope: "general"
  };
  const clients = Storage.list("clients");
  const services = Storage.list("services");
  const categories = Storage.list("categories");
  const collaborators = Storage.list("collaborators");
  const cfg = Storage.getConfig();
  return `
    <form data-form="expenseSave" data-id="${e.id || ""}">
      <div class="form-grid">
        <div class="form-field"><label>Fecha *</label><input required type="date" name="date" value="${e.date}"></div>
        <div class="form-field"><label>Categoría *</label>
          <select required name="category">${categories.map(c => `<option value="${c}" ${e.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
        </div>
        <div class="form-field full"><label>Descripción *</label><input required name="description" value="${App.escapeHtml(e.description)}"></div>
        <div class="form-field"><label>Alcance</label>
          <select name="scope">
            <option value="general" ${e.scope === "general" ? "selected" : ""}>General de agencia</option>
            <option value="cliente" ${e.scope === "cliente" ? "selected" : ""}>Específico de cliente</option>
            <option value="produccion" ${e.scope === "produccion" ? "selected" : ""}>Específico de producción</option>
          </select>
        </div>
        <div class="form-field"><label>Cliente relacionado</label>
          <select name="clientId"><option value="">-</option>${clients.map(c => `<option value="${c.id}" ${e.clientId === c.id ? "selected" : ""}>${App.escapeHtml(c.name)}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Proyecto relacionado</label><input name="project" value="${App.escapeHtml(e.project || "")}"></div>
        <div class="form-field"><label>Servicio relacionado</label>
          <select name="serviceId"><option value="">-</option>${services.map(sv => `<option value="${sv.id}" ${e.serviceId === sv.id ? "selected" : ""}>${App.escapeHtml(sv.name)}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Colaborador (si aplica)</label>
          <select name="collaboratorId"><option value="">-</option>${collaborators.map(c => `<option value="${c.id}" ${e.collaboratorId === c.id ? "selected" : ""}>${App.escapeHtml(c.name)}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Proveedor / colaborador (texto libre)</label><input name="provider" value="${App.escapeHtml(e.provider)}"></div>
        <div class="form-field"><label>Monto *</label><input required type="number" step="0.01" name="amount" value="${e.amount ?? 0}"></div>
        <div class="form-field"><label>Moneda</label>
          <select name="currency"><option ${e.currency === "ARS" ? "selected" : ""}>ARS</option><option ${e.currency === "USD" ? "selected" : ""}>USD</option><option ${e.currency === "EUR" ? "selected" : ""}>EUR</option></select>
        </div>
        <div class="form-field"><label>Medio de pago</label>
          <select name="paymentMethod">${(cfg.paymentMethods || []).map(m => `<option ${e.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Estado</label>
          <select name="status"><option value="pendiente" ${e.status === "pendiente" ? "selected" : ""}>Pendiente</option><option value="pagado" ${e.status === "pagado" ? "selected" : ""}>Pagado</option></select>
        </div>
        <div class="form-field"><label>Comprobante (referencia)</label><input name="receipt" value="${App.escapeHtml(e.receipt)}"></div>
        <div class="form-field full"><label>Observaciones</label><textarea name="notes">${App.escapeHtml(e.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar gasto</button>
      </div>
    </form>`;
}

Actions.expenseNew = function () { App.openModal({ title: "Nuevo gasto", bodyHtml: expenseFormHtml(null), size: "lg" }); };
Actions.expenseEdit = function (el) {
  const e = Storage.find("expenses", el.dataset.id);
  App.openModal({ title: "Editar gasto", bodyHtml: expenseFormHtml(e), size: "lg" });
};
Actions.expenseDelete = async function (el) {
  if (!(await App.confirmAction("¿Eliminar este gasto?"))) return;
  Storage.remove("expenses", el.dataset.id);
  App.toast("Gasto eliminado.", "success");
  viewExpenses();
};

Forms.expenseSave = function (form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  if (!fd.get("description")?.trim()) { App.toast("La descripción es obligatoria.", "error"); return; }
  const record = {
    date: fd.get("date"), category: fd.get("category"), description: fd.get("description")?.trim(),
    clientId: fd.get("clientId") || "", project: fd.get("project")?.trim() || "", serviceId: fd.get("serviceId") || "",
    collaboratorId: fd.get("collaboratorId") || "", provider: fd.get("provider")?.trim() || "",
    amount: Number(fd.get("amount")) || 0, currency: fd.get("currency"), paymentMethod: fd.get("paymentMethod"),
    status: fd.get("status"), receipt: fd.get("receipt")?.trim() || "", notes: fd.get("notes"), scope: fd.get("scope")
  };
  if (id) Storage.update("expenses", id, record);
  else Storage.insert("expenses", record);
  App.closeModal();
  App.toast("Gasto guardado.", "success");
  viewExpenses();
};

Actions.categoriesManage = function () {
  renderCategoriesModal();
};
function renderCategoriesModal() {
  const categories = Storage.list("categories");
  App.openModal({
    title: "Categorías de gastos",
    bodyHtml: `
      <div style="display:flex; flex-direction:column; gap:8px; max-height:320px; overflow-y:auto; margin-bottom:16px;">
        ${categories.map(c => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--surface-2); border-radius:8px;">
            <span>${App.escapeHtml(c)}</span>
            <button class="btn btn-sm btn-danger" data-action="categoryDelete" data-name="${App.escapeHtml(c)}">Eliminar</button>
          </div>`).join("")}
      </div>
      <form data-form="categoryAdd" style="display:flex; gap:8px;">
        <input name="newCategory" placeholder="Nueva categoría..." style="flex:1; padding:9px 11px; border-radius:8px; border:1px solid var(--line-strong); background:var(--surface); color:var(--ink);">
        <button type="submit" class="btn btn-primary">Agregar</button>
      </form>`
  });
}
Forms.categoryAdd = function (form) {
  const fd = new FormData(form);
  const name = fd.get("newCategory")?.trim();
  if (!name) return;
  const categories = Storage.list("categories");
  if (!categories.includes(name)) { categories.push(name); Storage.saveList("categories", categories); }
  renderCategoriesModal();
  viewExpenses();
};
Actions.categoryDelete = async function (el) {
  const name = el.dataset.name;
  if (!(await App.confirmAction(`¿Eliminar la categoría "${name}"?`))) return;
  Storage.saveList("categories", Storage.list("categories").filter(c => c !== name));
  renderCategoriesModal();
  viewExpenses();
};

/* ==========================================================================
   MÓDULO: SERVICIOS DE TRAMA
   ========================================================================== */

const BILLING_TYPE_LABELS = { mensual: "Mensual", proyecto: "Por proyecto", jornada: "Por jornada", pieza: "Por pieza", personalizado: "Personalizado" };

function viewServices() {
  const root = document.getElementById("services-root");
  const s = App.state.services;
  let services = Storage.list("services");
  if (s.search) {
    const q = s.search.toLowerCase();
    services = services.filter(sv => sv.name.toLowerCase().includes(q));
  }
  if (s.onlyActive) services = services.filter(sv => sv.active !== false);

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Catálogo</div><h2>Servicios de TRAMA</h2></div>
      <div class="view-actions"><button class="btn btn-primary" data-action="serviceNew">+ Nuevo servicio</button></div>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar servicio..." value="${App.escapeHtml(s.search)}" data-live="serviceSearch">
      </div>
      <label class="checkbox-row"><input type="checkbox" data-filter="serviceActiveOnly" ${s.onlyActive ? "checked" : ""}> Solo activos</label>
    </div>
    <div class="grid grid-3">
      ${services.length === 0 ? `<div class="card">No hay servicios que coincidan.</div>` : services.map(sv => `
        <div class="card" style="${sv.active === false ? "opacity:.55;" : ""}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div class="card-title">${BILLING_TYPE_LABELS[sv.billingType] || sv.billingType}</div>
              <h3 style="font-size:16px;">${App.escapeHtml(sv.name)}</h3>
            </div>
            ${sv.active === false ? '<span class="badge badge-neutral">Inactivo</span>' : '<span class="badge badge-success">Activo</span>'}
          </div>
          <p class="cell-muted" style="min-height:36px;">${App.escapeHtml(sv.description || "")}</p>
          <div class="summary-line"><span class="label">Precio orientativo</span><span>${App.fmtMoney(sv.referencePrice)}</span></div>
          <div class="summary-line"><span class="label">Costo interno estimado</span><span>${App.fmtMoney(sv.internalCost)}</span></div>
          <div class="summary-line"><span class="label">Margen deseado</span><span>${sv.desiredMargin ?? 0}%</span></div>
          <div class="summary-line"><span class="label">% colaboradores / TRAMA</span><span>${sv.collaboratorPct ?? 0}% / ${sv.tramaPct ?? 0}%</span></div>
          <div class="table-actions" style="margin-top:14px;">
            <button class="btn btn-sm" data-action="serviceToggle" data-id="${sv.id}">${sv.active === false ? "Activar" : "Desactivar"}</button>
            <button class="btn btn-sm" data-action="serviceEdit" data-id="${sv.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-action="serviceDelete" data-id="${sv.id}">Eliminar</button>
          </div>
        </div>`).join("")}
    </div>`;
}

Live.serviceSearch = function (el) { App.state.services.search = el.value; rerenderPreservingFocus('[data-live="serviceSearch"]', viewServices); };
Filters.serviceActiveOnly = function (el) { App.state.services.onlyActive = el.checked; viewServices(); };

function serviceFormHtml(service) {
  const sv = service || {
    name: "", description: "", referencePrice: 0, billingType: "mensual", estimatedHours: 10,
    complexity: "media", suggestedPct: 20, internalCost: 0, desiredMargin: 40, collaboratorPct: 25,
    tramaPct: 75, extraCosts: 0, taxes: 0, notes: "", active: true
  };
  return `
    <form data-form="serviceSave" data-id="${sv.id || ""}">
      <div class="form-grid">
        <div class="form-field full"><label>Nombre *</label><input required name="name" value="${App.escapeHtml(sv.name)}"></div>
        <div class="form-field full"><label>Descripción</label><textarea name="description">${App.escapeHtml(sv.description)}</textarea></div>
        <div class="form-field"><label>Precio orientativo</label><input type="number" step="0.01" name="referencePrice" value="${sv.referencePrice ?? 0}"></div>
        <div class="form-field"><label>Tipo de cobro</label>
          <select name="billingType">${Object.keys(BILLING_TYPE_LABELS).map(k => `<option value="${k}" ${sv.billingType === k ? "selected" : ""}>${BILLING_TYPE_LABELS[k]}</option>`).join("")}</select>
        </div>
        <div class="form-field"><label>Horas estimadas</label><input type="number" name="estimatedHours" value="${sv.estimatedHours ?? 0}"></div>
        <div class="form-field"><label>Complejidad</label>
          <select name="complexity"><option value="baja" ${sv.complexity === "baja" ? "selected" : ""}>Baja</option><option value="media" ${sv.complexity === "media" ? "selected" : ""}>Media</option><option value="alta" ${sv.complexity === "alta" ? "selected" : ""}>Alta</option></select>
        </div>
        <div class="form-field"><label>% sugerido en presupuesto</label><input type="number" name="suggestedPct" value="${sv.suggestedPct ?? 0}"></div>
        <div class="form-field"><label>Costo interno estimado</label><input type="number" step="0.01" name="internalCost" value="${sv.internalCost ?? 0}"></div>
        <div class="form-field"><label>Margen de ganancia deseado (%)</label><input type="number" name="desiredMargin" value="${sv.desiredMargin ?? 0}"></div>
        <div class="form-field"><label>% destinado a colaboradores</label><input type="number" name="collaboratorPct" value="${sv.collaboratorPct ?? 0}"></div>
        <div class="form-field"><label>% destinado a TRAMA</label><input type="number" name="tramaPct" value="${sv.tramaPct ?? 0}"></div>
        <div class="form-field"><label>Gastos adicionales</label><input type="number" step="0.01" name="extraCosts" value="${sv.extraCosts ?? 0}"></div>
        <div class="form-field"><label>Impuestos (%)</label><input type="number" name="taxes" value="${sv.taxes ?? 0}"></div>
        <div class="form-field full"><label>Observaciones</label><textarea name="notes">${App.escapeHtml(sv.notes)}</textarea></div>
      </div>
      <p class="form-hint">Estos valores son orientativos: se pueden ajustar libremente al armar cada presupuesto.</p>
      <div class="form-actions">
        <button type="button" class="btn" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar servicio</button>
      </div>
    </form>`;
}

Actions.serviceNew = function () { App.openModal({ title: "Nuevo servicio", bodyHtml: serviceFormHtml(null), size: "lg" }); };
Actions.serviceEdit = function (el) {
  const sv = Storage.find("services", el.dataset.id);
  App.openModal({ title: "Editar servicio", bodyHtml: serviceFormHtml(sv), size: "lg" });
};
Actions.serviceToggle = function (el) {
  const sv = Storage.find("services", el.dataset.id);
  Storage.update("services", sv.id, { active: sv.active === false ? true : false });
  viewServices();
};
Actions.serviceDelete = async function (el) {
  if (!(await App.confirmAction("¿Eliminar este servicio del catálogo?"))) return;
  Storage.remove("services", el.dataset.id);
  App.toast("Servicio eliminado.", "success");
  viewServices();
};

Forms.serviceSave = function (form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  if (!fd.get("name")?.trim()) { App.toast("El nombre del servicio es obligatorio.", "error"); return; }
  const record = {
    name: fd.get("name").trim(), description: fd.get("description"),
    referencePrice: Number(fd.get("referencePrice")) || 0, billingType: fd.get("billingType"),
    estimatedHours: Number(fd.get("estimatedHours")) || 0, complexity: fd.get("complexity"),
    suggestedPct: Number(fd.get("suggestedPct")) || 0, internalCost: Number(fd.get("internalCost")) || 0,
    desiredMargin: Number(fd.get("desiredMargin")) || 0, collaboratorPct: Number(fd.get("collaboratorPct")) || 0,
    tramaPct: Number(fd.get("tramaPct")) || 0, extraCosts: Number(fd.get("extraCosts")) || 0,
    taxes: Number(fd.get("taxes")) || 0, notes: fd.get("notes"), active: true
  };
  if (id) { const existing = Storage.find("services", id); Storage.update("services", id, { ...record, active: existing.active }); }
  else Storage.insert("services", record);
  App.closeModal();
  App.toast("Servicio guardado.", "success");
  viewServices();
};

/* ==========================================================================
   MÓDULO: DISTRIBUCIÓN INTERNA Y COLABORADORES
   ========================================================================== */

const PAYOUT_RANGES_DEFAULT = [
  { id: "puntual", label: "Ejecución puntual bajo dirección de TRAMA", min: 10, max: 25 },
  { id: "operativo", label: "Apoyo operativo recurrente", min: 20, max: 35 },
  { id: "responsable", label: "Responsable completo de un área", min: 30, max: 50 },
  { id: "especialista", label: "Especialista externo (herramientas/equipo/técnica)", min: 40, max: 60 },
  { id: "socio", label: "Socio estratégico con responsabilidad compartida", min: 0, max: 100 }
];

function getPayoutRanges() {
  const stored = Storage.get("payoutRanges", null);
  return stored || PAYOUT_RANGES_DEFAULT;
}

function collaboratorPaymentsSummary(collabId) {
  const expenses = Storage.list("expenses").filter(e => e.collaboratorId === collabId);
  const pendientes = expenses.filter(e => e.status === "pendiente").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pagados = expenses.filter(e => e.status === "pagado").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { pendientes, pagados };
}

function viewDistribution() {
  const root = document.getElementById("distribution-root");
  const s = App.state.collaborators;
  let collaborators = Storage.list("collaborators");
  if (s.search) {
    const q = s.search.toLowerCase();
    collaborators = collaborators.filter(c => c.name.toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q));
  }
  const services = Storage.list("services");
  const ranges = getPayoutRanges();

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Equipo</div><h2>Distribución interna</h2></div>
      <div class="view-actions"><button class="btn btn-primary" data-action="collabNew">+ Nuevo colaborador</button></div>
    </div>

    <div class="alert-box" style="margin-bottom:24px;">
      El porcentaje debe calcularse sobre el servicio en el que participa el colaborador, salvo que se defina
      expresamente otra modalidad. Antes de establecer el pago, deben contemplarse los gastos, impuestos, tiempo
      de dirección, administración, captación del cliente y margen de TRAMA.
    </div>

    <div class="section-block">
      <div class="section-block-title">Rangos orientativos (editables)</div>
      <div class="grid grid-2">
        ${ranges.map(r => `
          <div class="card">
            <div class="card-title">${App.escapeHtml(r.label)}</div>
            <form data-form="rangeUpdate" data-range-id="${r.id}" style="display:flex; gap:10px; align-items:flex-end;">
              <div class="form-field"><label>Mínimo %</label><input type="number" name="min" value="${r.min}" style="width:90px;"></div>
              <div class="form-field"><label>Máximo %</label><input type="number" name="max" value="${r.max}" style="width:90px;"></div>
              <button type="submit" class="btn btn-sm">Guardar</button>
            </form>
          </div>`).join("")}
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Calculadora de pago a colaboradores</div>
      <div class="card" id="payout-calculator">
        ${payoutCalculatorHtml()}
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Colaboradores y equipo</div>
      <div class="toolbar">
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="text" placeholder="Buscar colaborador..." value="${App.escapeHtml(s.search)}" data-live="collabSearch">
        </div>
      </div>
      <div class="table-wrap scroll-x">
        <table>
          <thead><tr><th>Nombre</th><th>Rol</th><th>Modalidad</th><th>% habitual</th><th>Pagos pendientes</th><th>Pagos realizados</th><th></th></tr></thead>
          <tbody>
            ${collaborators.length === 0 ? `<tr class="empty-row"><td colspan="7">Sin colaboradores cargados.</td></tr>` : collaborators.map(c => {
              const pay = collaboratorPaymentsSummary(c.id);
              return `<tr>
                <td data-label="Nombre" class="cell-strong">${App.escapeHtml(c.name)}</td>
                <td data-label="Rol">${App.escapeHtml(c.role || "-")}</td>
                <td data-label="Modalidad">${App.escapeHtml(c.modality || "-")}</td>
                <td data-label="% habitual">${c.usualPct ?? 0}%</td>
                <td data-label="Pagos pendientes">${App.fmtMoney(pay.pendientes)}</td>
                <td data-label="Pagos realizados">${App.fmtMoney(pay.pagados)}</td>
                <td data-label="Acciones"><div class="table-actions">
                  <button class="btn btn-sm" data-action="collabEdit" data-id="${c.id}">Editar</button>
                  <button class="btn btn-sm btn-danger" data-action="collabDelete" data-id="${c.id}">Eliminar</button>
                </div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

Live.collabSearch = function (el) { App.state.collaborators.search = el.value; rerenderPreservingFocus('[data-live="collabSearch"]', viewDistribution); };

function payoutCalculatorHtml() {
  const services = Storage.list("services");
  const ranges = getPayoutRanges();
  return `
    <div class="form-grid">
      <div class="form-field"><label>Servicio</label>
        <select id="calc-service" data-live="payoutCalc">
          <option value="">Personalizado (ingresar valor manual)</option>
          ${services.map(sv => `<option value="${sv.id}">${App.escapeHtml(sv.name)} — ${App.fmtMoney(sv.referencePrice)}</option>`).join("")}
        </select>
      </div>
      <div class="form-field"><label>Valor del servicio</label><input type="number" id="calc-service-value" step="0.01" value="0" data-live="payoutCalc"></div>
      <div class="form-field"><label>Nivel de responsabilidad</label>
        <select id="calc-profile" data-live="payoutCalc">
          ${ranges.map(r => `<option value="${r.id}">${App.escapeHtml(r.label)} (${r.min}%–${r.max}%)</option>`).join("")}
        </select>
      </div>
      <div class="form-field"><label>Base de cálculo</label>
        <select id="calc-basis" data-live="payoutCalc">
          <option value="servicio">% del servicio específico (recomendado)</option>
          <option value="total">% del presupuesto total</option>
          <option value="fijo">Monto fijo</option>
          <option value="hora">Valor por hora</option>
          <option value="jornada">Valor por jornada</option>
          <option value="pieza">Valor por pieza entregada</option>
        </select>
      </div>
      <div class="form-field"><label>Porcentaje / valor</label><input type="number" id="calc-value" step="0.01" value="20" data-live="payoutCalc"></div>
      <div class="form-field"><label>Cantidad (horas / jornadas / piezas)</label><input type="number" id="calc-qty" step="0.01" value="1" data-live="payoutCalc"></div>
      <div class="form-field full">
        <label style="display:flex; flex-wrap:wrap; gap:14px;">
          <span class="checkbox-row"><input type="checkbox" id="calc-tool-1" data-live="payoutCalc"> Aporta equipamiento propio</span>
          <span class="checkbox-row"><input type="checkbox" id="calc-tool-2" data-live="payoutCalc"> Se comunica directamente con el cliente</span>
          <span class="checkbox-row"><input type="checkbox" id="calc-tool-3" data-live="payoutCalc"> Participa en la estrategia</span>
          <span class="checkbox-row"><input type="checkbox" id="calc-tool-4" data-live="payoutCalc"> Trabaja bajo dirección de TRAMA</span>
        </label>
      </div>
    </div>
    <div id="calc-result" class="summary-line total"><span class="label">Pago estimado al colaborador</span><span>${App.fmtMoney(0)}</span></div>
    <p class="form-hint" id="calc-basis-note" style="margin-top:8px;"></p>`;
}

Live.payoutCalc = function () {
  const serviceSel = document.getElementById("calc-service");
  const services = Storage.list("services");
  const service = services.find(sv => sv.id === serviceSel.value);
  const serviceValueInput = document.getElementById("calc-service-value");
  if (service && Number(serviceValueInput.value) === 0) serviceValueInput.value = service.referencePrice;

  const serviceValue = Number(serviceValueInput.value) || 0;
  const basis = document.getElementById("calc-basis").value;
  const value = Number(document.getElementById("calc-value").value) || 0;
  const qty = Number(document.getElementById("calc-qty").value) || 0;

  let payout = 0, note = "";
  if (basis === "servicio") { payout = serviceValue * (value / 100); note = "Calculado sobre el valor del servicio específico (recomendado)."; }
  else if (basis === "total") { payout = serviceValue * (value / 100); note = "Calculado como % del presupuesto total ingresado como \"valor del servicio\"."; }
  else if (basis === "fijo") { payout = value; note = "Monto fijo acordado, independiente del valor del servicio."; }
  else if (basis === "hora") { payout = value * qty; note = "Valor por hora × cantidad de horas."; }
  else if (basis === "jornada") { payout = value * qty; note = "Valor por jornada × cantidad de jornadas."; }
  else if (basis === "pieza") { payout = value * qty; note = "Valor por pieza × cantidad de piezas entregadas."; }

  document.getElementById("calc-result").innerHTML = `<span class="label">Pago estimado al colaborador</span><span>${App.fmtMoney(payout)}</span>`;
  document.getElementById("calc-basis-note").textContent = note;
};

function collabFormHtml(collab) {
  const c = collab || {
    name: "", role: "", email: "", phone: "", modality: "freelance", hourlyRate: 0,
    dayRate: 0, pieceRate: 0, usualPct: 20, servicesInvolved: [], notes: ""
  };
  const services = Storage.list("services");
  const selected = new Set(c.servicesInvolved || []);
  return `
    <form data-form="collabSave" data-id="${c.id || ""}">
      <div class="form-grid">
        <div class="form-field"><label>Nombre *</label><input required name="name" value="${App.escapeHtml(c.name)}"></div>
        <div class="form-field"><label>Rol</label><input name="role" value="${App.escapeHtml(c.role)}"></div>
        <div class="form-field"><label>Correo electrónico</label><input type="email" name="email" value="${App.escapeHtml(c.email)}"></div>
        <div class="form-field"><label>Teléfono</label><input name="phone" value="${App.escapeHtml(c.phone)}"></div>
        <div class="form-field"><label>Modalidad de contratación</label><input name="modality" value="${App.escapeHtml(c.modality)}"></div>
        <div class="form-field"><label>% habitual</label><input type="number" name="usualPct" value="${c.usualPct ?? 0}"></div>
        <div class="form-field"><label>Valor por hora</label><input type="number" step="0.01" name="hourlyRate" value="${c.hourlyRate ?? 0}"></div>
        <div class="form-field"><label>Valor por jornada</label><input type="number" step="0.01" name="dayRate" value="${c.dayRate ?? 0}"></div>
        <div class="form-field"><label>Valor por pieza</label><input type="number" step="0.01" name="pieceRate" value="${c.pieceRate ?? 0}"></div>
        <div class="form-field full"><label>Servicios en los que participa</label>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            ${services.map(sv => `<label class="checkbox-row" style="background:var(--surface-2); padding:6px 10px; border-radius:8px;"><input type="checkbox" name="servicesInvolved" value="${sv.id}" ${selected.has(sv.id) ? "checked" : ""}> ${App.escapeHtml(sv.name)}</label>`).join("")}
          </div>
        </div>
        <div class="form-field full"><label>Observaciones</label><textarea name="notes">${App.escapeHtml(c.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-action="close-modal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar colaborador</button>
      </div>
    </form>`;
}

Actions.collabNew = function () { App.openModal({ title: "Nuevo colaborador", bodyHtml: collabFormHtml(null), size: "lg" }); };
Actions.collabEdit = function (el) {
  const c = Storage.find("collaborators", el.dataset.id);
  App.openModal({ title: "Editar colaborador", bodyHtml: collabFormHtml(c), size: "lg" });
};
Actions.collabDelete = async function (el) {
  if (!(await App.confirmAction("¿Eliminar este colaborador?"))) return;
  Storage.remove("collaborators", el.dataset.id);
  App.toast("Colaborador eliminado.", "success");
  viewDistribution();
};

Forms.collabSave = function (form) {
  const fd = new FormData(form);
  const id = form.dataset.id;
  if (!fd.get("name")?.trim()) { App.toast("El nombre es obligatorio.", "error"); return; }
  const record = {
    name: fd.get("name").trim(), role: fd.get("role"), email: fd.get("email"), phone: fd.get("phone"),
    modality: fd.get("modality"), usualPct: Number(fd.get("usualPct")) || 0,
    hourlyRate: Number(fd.get("hourlyRate")) || 0, dayRate: Number(fd.get("dayRate")) || 0,
    pieceRate: Number(fd.get("pieceRate")) || 0, notes: fd.get("notes"),
    servicesInvolved: fd.getAll("servicesInvolved")
  };
  if (id) Storage.update("collaborators", id, record);
  else Storage.insert("collaborators", record);
  App.closeModal();
  App.toast("Colaborador guardado.", "success");
  viewDistribution();
};

Forms.rangeUpdate = function (form) {
  const fd = new FormData(form);
  const rangeId = form.dataset.rangeId;
  const ranges = getPayoutRanges().map(r => r.id === rangeId ? { ...r, min: Number(fd.get("min")) || 0, max: Number(fd.get("max")) || 0 } : r);
  Storage.set("payoutRanges", ranges);
  App.toast("Rango actualizado.", "success");
  viewDistribution();
};

/* ==========================================================================
   MÓDULO: GENERADOR DE PRESUPUESTOS (5 pasos)
   ========================================================================== */

const STEP_LABELS = { 1: "Cliente", 2: "Servicios", 3: "Distribución", 4: "Revisión", 5: "Exportar" };

function recalcItemTotal(item) { return (Number(item.price) || 0) * (Number(item.qty) || 1); }
function budgetItemsSubtotal(items) { return (items || []).reduce((s, it) => s + recalcItemTotal(it), 0); }

function newDraftBudget() {
  const cfg = Storage.getConfig();
  return {
    status: "borrador",
    client: { name: "", brand: "", email: "", phone: "" },
    date: new Date().toISOString().slice(0, 10),
    validity: 15, projectName: "", objective: "", notes: "",
    items: [],
    discountTotal: 0, extraCostsTotal: 0, taxPct: cfg.taxRatePct || 0, advancePct: cfg.advancePct || 50,
    paymentMethod: (cfg.paymentMethods || [])[0] || "", paymentDates: "", duration: "",
    conditions: cfg.budgetConditions || "", linkedClientId: null, linkedIncomeId: null
  };
}

function budgetTotals(b) {
  const subtotal = budgetItemsSubtotal(b.items);
  const discount = Number(b.discountTotal) || 0;
  const extras = Number(b.extraCostsTotal) || 0;
  const preTax = subtotal - discount + extras;
  const taxPct = Number(b.taxPct) || 0;
  const taxAmount = preTax * taxPct / 100;
  const total = preTax + taxAmount;
  const advancePct = Number(b.advancePct) || 0;
  const advance = total * advancePct / 100;
  const balance = total - advance;
  return { subtotal, discount, extras, preTax, taxAmount, total, advance, balance };
}

function computeCollabPayout(co, item, subtotalAll) {
  const value = Number(co.value) || 0;
  const qty = Number(item.qty) || 1;
  switch (co.basis) {
    case "servicio": return recalcItemTotal(item) * value / 100;
    case "total": return subtotalAll * value / 100;
    case "fijo": return value;
    case "hora": return value * (Number(item.hours) || 0);
    case "jornada": return value * qty;
    case "pieza": return value * qty;
    default: return 0;
  }
}

function computeItemDistribution(item, subtotalAll) {
  const itemTotal = recalcItemTotal(item);
  const collabCost = (item.collaborators || []).reduce((s, co) => s + computeCollabPayout(co, item, subtotalAll), 0);
  const extra = Number(item.extraCosts) || 0;
  const taxPct = Number(item.taxPct) || 0;
  const impuestos = itemTotal * taxPct / 100;
  const gananciaBruta = itemTotal - extra - collabCost;
  const gananciaNeta = gananciaBruta - impuestos;
  const margen = itemTotal > 0 ? (gananciaNeta / itemTotal) * 100 : 0;
  return { itemTotal, collabCost, extra, impuestos, gananciaBruta, gananciaNeta, margen };
}

function viewBudgets() {
  const st = App.state.budgets;
  if (st.mode === "wizard") return renderBudgetWizard();
  return renderBudgetsList();
}

function renderBudgetsList() {
  const root = document.getElementById("budgets-root");
  const s = App.state.budgets;
  const clients = Storage.list("clients");
  let budgets = Storage.list("budgets");
  if (s.search) {
    const q = s.search.toLowerCase();
    budgets = budgets.filter(b => (b.projectName || "").toLowerCase().includes(q) || (b.client?.name || "").toLowerCase().includes(q));
  }
  if (s.status !== "all") budgets = budgets.filter(b => b.status === s.status);
  budgets = [...budgets].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Comercial</div><h2>Presupuestos</h2></div>
      <div class="view-actions"><button class="btn btn-primary" data-action="budgetNew">+ Nuevo presupuesto</button></div>
    </div>
    <div class="toolbar">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" placeholder="Buscar proyecto o cliente..." value="${App.escapeHtml(s.search)}" data-live="budgetSearch">
      </div>
      <select class="filter-select" data-filter="budgetStatus">
        <option value="all">Todos los estados</option>
        ${Object.keys(App.BUDGET_STATUS_MAP).map(k => `<option value="${k}" ${s.status === k ? "selected" : ""}>${App.BUDGET_STATUS_MAP[k].label}</option>`).join("")}
      </select>
    </div>
    <div class="table-wrap scroll-x">
      <table>
        <thead><tr><th>Proyecto</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${budgets.length === 0 ? `<tr class="empty-row"><td colspan="6">Todavía no armaste ningún presupuesto.</td></tr>` : budgets.map(b => {
            const totals = budgetTotals(b);
            return `<tr>
              <td data-label="Proyecto" class="cell-strong">${App.escapeHtml(b.projectName || "Sin nombre")}</td>
              <td data-label="Cliente">${App.escapeHtml(b.client?.name || "-")}</td>
              <td data-label="Fecha">${App.fmtDate(b.date)}</td>
              <td data-label="Total">${App.fmtMoney(totals.total)}</td>
              <td data-label="Estado">
                <select class="filter-select" data-action="budgetQuickStatus" data-id="${b.id}" style="padding:4px 8px;">
                  ${Object.keys(App.BUDGET_STATUS_MAP).map(k => `<option value="${k}" ${b.status === k ? "selected" : ""}>${App.BUDGET_STATUS_MAP[k].label}</option>`).join("")}
                </select>
              </td>
              <td data-label="Acciones"><div class="table-actions">
                <button class="btn btn-sm" data-action="budgetOpenView" data-id="${b.id}">Ver</button>
                <button class="btn btn-sm" data-action="budgetOpenEdit" data-id="${b.id}">Editar</button>
                <button class="btn btn-sm" data-action="budgetDuplicateSaved" data-id="${b.id}">Duplicar</button>
                <button class="btn btn-sm" data-action="budgetDownloadPdfSaved" data-id="${b.id}">PDF</button>
                <button class="btn btn-sm btn-danger" data-action="budgetDeleteSaved" data-id="${b.id}">Eliminar</button>
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

Live.budgetSearch = function (el) { App.state.budgets.search = el.value; rerenderPreservingFocus('[data-live="budgetSearch"]', renderBudgetsList); };
Filters.budgetStatus = function (el) { App.state.budgets.status = el.value; renderBudgetsList(); };

Actions.budgetQuickStatus = function (el) {
  Storage.update("budgets", el.dataset.id, { status: el.value });
  App.toast("Estado actualizado.", "success");
};
Actions.budgetDeleteSaved = async function (el) {
  if (!(await App.confirmAction("¿Eliminar este presupuesto?"))) return;
  Storage.remove("budgets", el.dataset.id);
  App.toast("Presupuesto eliminado.", "success");
  renderBudgetsList();
};
Actions.budgetDuplicateSaved = function (el) {
  const b = Storage.find("budgets", el.dataset.id);
  if (!b) return;
  const clone = JSON.parse(JSON.stringify(b));
  clone.id = undefined; clone.createdAt = undefined;
  clone.projectName = (clone.projectName || "") + " (copia)";
  clone.status = "borrador"; clone.linkedClientId = null; clone.linkedIncomeId = null;
  Storage.insert("budgets", clone);
  App.toast("Presupuesto duplicado.", "success");
  renderBudgetsList();
};
Actions.budgetDownloadPdfSaved = function (el) {
  const b = Storage.find("budgets", el.dataset.id);
  PdfGen.downloadClientBudget(b, Storage.getConfig());
};
Actions.budgetNew = function () {
  App.state.budgets.mode = "wizard";
  App.state.budgets.draft = newDraftBudget();
  App.state.budgets.wizardStep = 1;
  App.state.budgets.editingId = null;
  viewBudgets();
};
Actions.budgetOpenEdit = function (el) {
  const b = Storage.find("budgets", el.dataset.id);
  App.state.budgets.mode = "wizard";
  App.state.budgets.draft = JSON.parse(JSON.stringify(b));
  App.state.budgets.wizardStep = 1;
  App.state.budgets.editingId = b.id;
  viewBudgets();
};
Actions.budgetOpenView = function (el) {
  const b = Storage.find("budgets", el.dataset.id);
  App.state.budgets.mode = "wizard";
  App.state.budgets.draft = JSON.parse(JSON.stringify(b));
  App.state.budgets.wizardStep = 5;
  App.state.budgets.editingId = b.id;
  viewBudgets();
};
Actions.budgetBackToList = function () { App.state.budgets.mode = "list"; viewBudgets(); };

function persistDraft() {
  const st = App.state.budgets;
  if (st.editingId) { Storage.update("budgets", st.editingId, st.draft); }
  else { const saved = Storage.insert("budgets", st.draft); st.editingId = saved.id; st.draft.id = saved.id; }
}

Actions.budgetSaveDraft = function () {
  persistDraft();
  App.toast("Presupuesto guardado.", "success");
  renderBudgetWizard();
};

function renderBudgetWizard() {
  const root = document.getElementById("budgets-root");
  const st = App.state.budgets;
  const step = st.wizardStep;
  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Presupuestos</div><h2>${st.editingId ? "Editar presupuesto" : "Nuevo presupuesto"}</h2></div>
      <div class="view-actions">
        <button class="btn" data-action="budgetBackToList">&larr; Volver al listado</button>
        <button class="btn" data-action="budgetSaveDraft">Guardar borrador</button>
      </div>
    </div>
    <div class="wizard-steps">
      ${[1, 2, 3, 4, 5].map(n => `<div class="wizard-step ${step === n ? "active" : step > n ? "done" : ""}" data-action="wizardGoStep" data-step="${n}" style="cursor:pointer;">${n}. ${STEP_LABELS[n]}</div>`).join("")}
    </div>
    <div id="wizard-step-body"></div>`;
  document.getElementById("wizard-step-body").innerHTML = wizardStepHtml(step);
}

Actions.wizardGoStep = function (el) { App.state.budgets.wizardStep = Number(el.dataset.step); renderBudgetWizard(); };
Actions.wizardNext = function () { if (App.state.budgets.wizardStep < 5) { App.state.budgets.wizardStep++; renderBudgetWizard(); } };
Actions.wizardPrev = function () { if (App.state.budgets.wizardStep > 1) { App.state.budgets.wizardStep--; renderBudgetWizard(); } };

function wizardStepHtml(step) {
  const draft = App.state.budgets.draft;
  if (step === 1) return wizardStep1Html(draft);
  if (step === 2) return wizardStep2Html(draft);
  if (step === 3) return wizardStep3Html(draft);
  if (step === 4) return wizardStep4Html(draft);
  return wizardStep5Html(draft);
}

// ---- Paso 1: información del cliente ------------------------------------
function wizardStep1Html(d) {
  return `
    <div class="card">
      <div class="form-grid">
        <div class="form-field"><label>Nombre del cliente *</label><input id="w1-name" value="${App.escapeHtml(d.client.name)}"></div>
        <div class="form-field"><label>Marca o empresa</label><input id="w1-brand" value="${App.escapeHtml(d.client.brand)}"></div>
        <div class="form-field"><label>Correo electrónico</label><input id="w1-email" value="${App.escapeHtml(d.client.email)}"></div>
        <div class="form-field"><label>Teléfono</label><input id="w1-phone" value="${App.escapeHtml(d.client.phone)}"></div>
        <div class="form-field"><label>Fecha del presupuesto</label><input type="date" id="w1-date" value="${d.date}"></div>
        <div class="form-field"><label>Validez de la propuesta (días)</label><input type="number" id="w1-validity" value="${d.validity}"></div>
        <div class="form-field full"><label>Nombre del proyecto *</label><input id="w1-project" value="${App.escapeHtml(d.projectName)}"></div>
        <div class="form-field full"><label>Objetivo general</label><textarea id="w1-objective">${App.escapeHtml(d.objective)}</textarea></div>
        <div class="form-field full"><label>Observaciones</label><textarea id="w1-notes">${App.escapeHtml(d.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        <span></span>
        <button class="btn btn-primary" data-action="wizardStep1Next">Siguiente &rarr;</button>
      </div>
    </div>`;
}
Actions.wizardStep1Next = function () {
  const d = App.state.budgets.draft;
  const name = document.getElementById("w1-name").value.trim();
  const project = document.getElementById("w1-project").value.trim();
  if (!name) { App.toast("Ingresá el nombre del cliente.", "error"); return; }
  if (!project) { App.toast("Ingresá el nombre del proyecto.", "error"); return; }
  d.client.name = name;
  d.client.brand = document.getElementById("w1-brand").value.trim();
  d.client.email = document.getElementById("w1-email").value.trim();
  d.client.phone = document.getElementById("w1-phone").value.trim();
  d.date = document.getElementById("w1-date").value;
  d.validity = Number(document.getElementById("w1-validity").value) || 15;
  d.projectName = project;
  d.objective = document.getElementById("w1-objective").value;
  d.notes = document.getElementById("w1-notes").value;
  App.state.budgets.wizardStep = 2;
  renderBudgetWizard();
};

// ---- Paso 2: selección de servicios --------------------------------------
function wizardStep2Html(d) {
  const services = Storage.list("services").filter(s => s.active !== false);
  const subtotal = budgetItemsSubtotal(d.items);
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="form-grid">
        <div class="form-field"><label>Agregar servicio del catálogo</label>
          <select id="w2-catalog-select">
            <option value="">Seleccionar servicio...</option>
            ${services.map(sv => `<option value="${sv.id}">${App.escapeHtml(sv.name)} — ${App.fmtMoney(sv.referencePrice)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field" style="justify-content:flex-end;">
          <button class="btn" data-action="wizardAddCatalogItem">+ Agregar servicio</button>
        </div>
      </div>
      <button class="btn btn-sm" data-action="wizardAddCustomItem">+ Agregar línea personalizada</button>
    </div>

    <div id="wizard-items-list">
      ${(d.items || []).length === 0 ? `<p class="form-hint">Todavía no agregaste servicios a este presupuesto.</p>` : d.items.map((item, idx) => budgetItemRowHtml(item, idx, subtotal)).join("")}
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="summary-line total"><span class="label">Subtotal</span><span id="wizard-step2-subtotal">${App.fmtMoney(subtotal)}</span></div>
    </div>

    <div class="form-actions">
      <button class="btn" data-action="wizardPrev">&larr; Anterior</button>
      <button class="btn btn-primary" data-action="wizardNext">Siguiente &rarr;</button>
    </div>`;
}

function budgetItemRowHtml(item, idx, subtotal) {
  const total = recalcItemTotal(item);
  const pct = subtotal > 0 ? (total / subtotal) * 100 : 0;
  return `
    <div class="budget-item-row" data-idx="${idx}">
      <div class="row-top">
        <strong>${App.escapeHtml(item.name || "Servicio")}</strong>
        <button class="btn btn-sm btn-danger" data-action="wizardRemoveItem" data-idx="${idx}">Quitar</button>
      </div>
      <div class="form-grid">
        <div class="form-field full"><label>Descripción personalizada</label><input value="${App.escapeHtml(item.description || "")}" data-live="wizardItemField" data-idx="${idx}" data-field="description"></div>
        <div class="form-field"><label>Cantidad</label><input type="number" step="0.01" value="${item.qty ?? 1}" data-live="wizardItemField" data-idx="${idx}" data-field="qty"></div>
        <div class="form-field"><label>Frecuencia</label><input value="${App.escapeHtml(item.frequency || "")}" data-live="wizardItemField" data-idx="${idx}" data-field="frequency" placeholder="Ej: mensual"></div>
        <div class="form-field"><label>Precio</label><input type="number" step="0.01" value="${item.price ?? 0}" data-live="wizardItemField" data-idx="${idx}" data-field="price"></div>
        <div class="form-field"><label>Horas de trabajo estimadas</label><input type="number" step="0.5" value="${item.hours ?? 0}" data-live="wizardItemField" data-idx="${idx}" data-field="hours"></div>
        <div class="form-field"><label>Gastos adicionales</label><input type="number" step="0.01" value="${item.extraCosts ?? 0}" data-live="wizardItemField" data-idx="${idx}" data-field="extraCosts"></div>
        <div class="form-field"><label>Descuento (%)</label><input type="number" step="0.01" value="${item.discountPct ?? 0}" data-live="wizardItemField" data-idx="${idx}" data-field="discountPct"></div>
        <div class="form-field"><label>Impuestos (%)</label><input type="number" step="0.01" value="${item.taxPct ?? 0}" data-live="wizardItemField" data-idx="${idx}" data-field="taxPct"></div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <span class="cell-muted">Total de la línea: <strong id="item-total-${idx}">${App.fmtMoney(total)}</strong></span>
        <span class="badge badge-neutral" id="item-pct-${idx}">${pct.toFixed(1)}% del presupuesto</span>
      </div>
      <div class="pct-bar"><span id="item-bar-${idx}" style="width:${Math.min(pct, 100)}%;"></span></div>
    </div>`;
}

Actions.wizardAddCatalogItem = function () {
  const sel = document.getElementById("w2-catalog-select");
  const sv = Storage.find("services", sel.value);
  if (!sv) { App.toast("Elegí un servicio del catálogo.", "error"); return; }
  App.state.budgets.draft.items.push({
    serviceId: sv.id, name: sv.name, description: sv.description, qty: 1, frequency: sv.billingType,
    price: sv.referencePrice, hours: sv.estimatedHours || 0, extraCosts: sv.extraCosts || 0,
    discountPct: 0, taxPct: sv.taxes || 0, collaborators: []
  });
  renderBudgetWizard();
};
Actions.wizardAddCustomItem = function () {
  App.state.budgets.draft.items.push({
    serviceId: "", name: "Servicio personalizado", description: "", qty: 1, frequency: "",
    price: 0, hours: 0, extraCosts: 0, discountPct: 0, taxPct: 0, collaborators: []
  });
  renderBudgetWizard();
};
Actions.wizardRemoveItem = function (el) {
  App.state.budgets.draft.items.splice(Number(el.dataset.idx), 1);
  renderBudgetWizard();
};

function refreshStep2Totals() {
  const d = App.state.budgets.draft;
  const subtotal = budgetItemsSubtotal(d.items);
  d.items.forEach((item, idx) => {
    const total = recalcItemTotal(item);
    const pct = subtotal > 0 ? (total / subtotal) * 100 : 0;
    const totalEl = document.getElementById(`item-total-${idx}`);
    const pctEl = document.getElementById(`item-pct-${idx}`);
    const barEl = document.getElementById(`item-bar-${idx}`);
    if (totalEl) totalEl.textContent = App.fmtMoney(total);
    if (pctEl) pctEl.textContent = pct.toFixed(1) + "% del presupuesto";
    if (barEl) barEl.style.width = Math.min(pct, 100) + "%";
  });
  const subtotalEl = document.getElementById("wizard-step2-subtotal");
  if (subtotalEl) subtotalEl.textContent = App.fmtMoney(subtotal);
}

Live.wizardItemField = function (el) {
  const idx = Number(el.dataset.idx);
  const field = el.dataset.field;
  const item = App.state.budgets.draft.items[idx];
  if (!item) return;
  const numericFields = ["qty", "price", "hours", "extraCosts", "discountPct", "taxPct"];
  item[field] = numericFields.includes(field) ? Number(el.value) || 0 : el.value;
  if (numericFields.includes(field)) refreshStep2Totals();
};

// ---- Paso 3: distribución interna ----------------------------------------
function wizardStep3Html(d) {
  const subtotal = budgetItemsSubtotal(d.items);
  const collaborators = Storage.list("collaborators");
  if (!d.items.length) {
    return `<div class="card"><p class="form-hint">Agregá servicios en el paso anterior para definir la distribución interna.</p></div>
      <div class="form-actions"><button class="btn" data-action="wizardPrev">&larr; Anterior</button><button class="btn btn-primary" data-action="wizardNext">Siguiente &rarr;</button></div>`;
  }
  return `
    <p class="form-hint" style="margin-bottom:16px;">Esta tabla es interna: no aparece en el presupuesto que recibe el cliente. Por defecto, el porcentaje del colaborador se calcula sobre el servicio específico en el que participa.</p>
    ${d.items.map((item, idx) => budgetDistributionRowHtml(item, idx, subtotal, collaborators)).join("")}
    <div class="card" id="wizard-grand-summary">${wizardGrandSummaryHtml(d, subtotal)}</div>
    <div class="form-actions">
      <button class="btn" data-action="wizardPrev">&larr; Anterior</button>
      <button class="btn btn-primary" data-action="wizardNext">Siguiente &rarr;</button>
    </div>`;
}

function budgetDistributionRowHtml(item, idx, subtotal, collaborators) {
  const dist = computeItemDistribution(item, subtotal);
  return `
    <div class="card" style="margin-bottom:14px;">
      <div class="row-top"><strong>${App.escapeHtml(item.name)}</strong><span class="cell-muted">Valor cobrado: ${App.fmtMoney(dist.itemTotal)}</span></div>
      <div id="collab-list-${idx}">
        ${(item.collaborators || []).map((co, cidx) => collaboratorEntryHtml(item, idx, co, cidx, collaborators)).join("")}
      </div>
      <button class="btn btn-sm" data-action="wizardAddCollaborator" data-idx="${idx}">+ Agregar colaborador a este servicio</button>
      <div id="dist-summary-${idx}" style="margin-top:14px;">${itemDistSummaryHtml(dist)}</div>
    </div>`;
}

function collaboratorEntryHtml(item, idx, co, cidx, collaborators) {
  return `
    <div class="form-grid" style="margin-bottom:8px; align-items:flex-end;" data-collab-row="${idx}-${cidx}">
      <div class="form-field"><label>Colaborador</label>
        <select data-live="wizardCollabField" data-idx="${idx}" data-cidx="${cidx}" data-field="collaboratorId">
          <option value="">Otro (nombre libre)</option>
          ${collaborators.map(c => `<option value="${c.id}" ${co.collaboratorId === c.id ? "selected" : ""}>${App.escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
      ${!co.collaboratorId ? `<div class="form-field"><label>Nombre</label><input value="${App.escapeHtml(co.customName || "")}" data-live="wizardCollabField" data-idx="${idx}" data-cidx="${cidx}" data-field="customName"></div>` : ""}
      <div class="form-field"><label>Base de cálculo</label>
        <select data-live="wizardCollabField" data-idx="${idx}" data-cidx="${cidx}" data-field="basis">
          <option value="servicio" ${co.basis === "servicio" ? "selected" : ""}>% del servicio (recomendado)</option>
          <option value="total" ${co.basis === "total" ? "selected" : ""}>% del presupuesto total</option>
          <option value="fijo" ${co.basis === "fijo" ? "selected" : ""}>Monto fijo</option>
          <option value="hora" ${co.basis === "hora" ? "selected" : ""}>Valor por hora</option>
          <option value="jornada" ${co.basis === "jornada" ? "selected" : ""}>Valor por jornada</option>
          <option value="pieza" ${co.basis === "pieza" ? "selected" : ""}>Valor por pieza</option>
        </select>
      </div>
      <div class="form-field"><label>Valor</label><input type="number" step="0.01" value="${co.value ?? 0}" data-live="wizardCollabField" data-idx="${idx}" data-cidx="${cidx}" data-field="value"></div>
      <div class="form-field"><button type="button" class="btn btn-sm btn-danger" data-action="wizardRemoveCollaborator" data-idx="${idx}" data-cidx="${cidx}">Quitar</button></div>
    </div>`;
}

function itemDistSummaryHtml(dist) {
  return `
    <div class="summary-line"><span class="label">Costos / gastos adicionales</span><span>${App.fmtMoney(dist.extra)}</span></div>
    <div class="summary-line"><span class="label">Pago a colaboradores</span><span>${App.fmtMoney(dist.collabCost)}</span></div>
    <div class="summary-line"><span class="label">Impuestos estimados</span><span>${App.fmtMoney(dist.impuestos)}</span></div>
    <div class="summary-line"><span class="label">Ganancia bruta</span><span>${App.fmtMoney(dist.gananciaBruta)}</span></div>
    <div class="summary-line total"><span class="label">Ganancia neta de TRAMA (margen ${dist.margen.toFixed(1)}%)</span><span>${App.fmtMoney(dist.gananciaNeta)}</span></div>`;
}

function wizardGrandSummaryHtml(d, subtotal) {
  let totalCollab = 0, totalNeto = 0;
  d.items.forEach(item => { const dist = computeItemDistribution(item, subtotal); totalCollab += dist.collabCost; totalNeto += dist.gananciaNeta; });
  return `
    <div class="card-title">Totales internos del presupuesto</div>
    <div class="summary-line"><span class="label">Total pagado a colaboradores</span><span>${App.fmtMoney(totalCollab)}</span></div>
    <div class="summary-line total"><span class="label">Ganancia neta total estimada de TRAMA</span><span>${App.fmtMoney(totalNeto)}</span></div>`;
}

Actions.wizardAddCollaborator = function (el) {
  const idx = Number(el.dataset.idx);
  const item = App.state.budgets.draft.items[idx];
  item.collaborators = item.collaborators || [];
  item.collaborators.push({ collaboratorId: "", customName: "", basis: "servicio", value: 20 });
  renderBudgetWizard();
};
Actions.wizardRemoveCollaborator = function (el) {
  const idx = Number(el.dataset.idx), cidx = Number(el.dataset.cidx);
  App.state.budgets.draft.items[idx].collaborators.splice(cidx, 1);
  renderBudgetWizard();
};

function refreshStep3Summaries() {
  const d = App.state.budgets.draft;
  const subtotal = budgetItemsSubtotal(d.items);
  d.items.forEach((item, idx) => {
    const dist = computeItemDistribution(item, subtotal);
    const el = document.getElementById(`dist-summary-${idx}`);
    if (el) el.innerHTML = itemDistSummaryHtml(dist);
  });
  const grand = document.getElementById("wizard-grand-summary");
  if (grand) grand.innerHTML = wizardGrandSummaryHtml(d, subtotal);
}

Live.wizardCollabField = function (el) {
  const idx = Number(el.dataset.idx), cidx = Number(el.dataset.cidx), field = el.dataset.field;
  const co = App.state.budgets.draft.items[idx].collaborators[cidx];
  if (field === "value") co.value = Number(el.value) || 0;
  else if (field === "collaboratorId") { co.collaboratorId = el.value; renderBudgetWizard(); return; }
  else co[field] = el.value;
  refreshStep3Summaries();
};

// ---- Paso 4: revisión ------------------------------------------------------
function wizardStep4Html(d) {
  const t = budgetTotals(d);
  const cfg = Storage.getConfig();
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="form-grid">
          <div class="form-field"><label>Descuento total</label><input type="number" step="0.01" id="w4-discountTotal" value="${d.discountTotal ?? 0}" data-live="wizardTotalsField"></div>
          <div class="form-field"><label>Gastos adicionales</label><input type="number" step="0.01" id="w4-extraCostsTotal" value="${d.extraCostsTotal ?? 0}" data-live="wizardTotalsField"></div>
          <div class="form-field"><label>Impuestos (%)</label><input type="number" step="0.01" id="w4-taxPct" value="${d.taxPct ?? 0}" data-live="wizardTotalsField"></div>
          <div class="form-field"><label>Anticipo solicitado (%)</label><input type="number" step="0.01" id="w4-advancePct" value="${d.advancePct ?? 0}" data-live="wizardTotalsField"></div>
          <div class="form-field"><label>Forma de pago</label>
            <select id="w4-paymentMethod" data-live="wizardTotalsField">${(cfg.paymentMethods || []).map(m => `<option ${d.paymentMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select>
          </div>
          <div class="form-field"><label>Duración del servicio</label><input id="w4-duration" value="${App.escapeHtml(d.duration || "")}" data-live="wizardTotalsField" placeholder="Ej: 3 meses"></div>
          <div class="form-field full"><label>Fechas de pago</label><input id="w4-paymentDates" value="${App.escapeHtml(d.paymentDates || "")}" data-live="wizardTotalsField" placeholder="Ej: 50% al confirmar, 50% a los 30 días"></div>
          <div class="form-field full"><label>Condiciones generales</label><textarea id="w4-conditions" rows="6" data-live="wizardTotalsField">${App.escapeHtml(d.conditions || "")}</textarea></div>
        </div>
      </div>
      <div class="card" id="wizard-step4-summary">${wizardStep4SummaryHtml(t)}</div>
    </div>
    <div class="form-actions">
      <button class="btn" data-action="wizardPrev">&larr; Anterior</button>
      <button class="btn btn-primary" data-action="wizardNext">Siguiente &rarr;</button>
    </div>`;
}

function wizardStep4SummaryHtml(t) {
  return `
    <div class="card-title">Totales</div>
    <div class="summary-line"><span class="label">Subtotal</span><span>${App.fmtMoney(t.subtotal)}</span></div>
    <div class="summary-line"><span class="label">Descuento</span><span>-${App.fmtMoney(t.discount)}</span></div>
    <div class="summary-line"><span class="label">Gastos adicionales</span><span>${App.fmtMoney(t.extras)}</span></div>
    <div class="summary-line"><span class="label">Impuestos</span><span>${App.fmtMoney(t.taxAmount)}</span></div>
    <div class="summary-line total"><span class="label">Total final</span><span>${App.fmtMoney(t.total)}</span></div>
    <div class="summary-line"><span class="label">Anticipo</span><span>${App.fmtMoney(t.advance)}</span></div>
    <div class="summary-line"><span class="label">Saldo restante</span><span>${App.fmtMoney(t.balance)}</span></div>`;
}

Live.wizardTotalsField = function (el) {
  const d = App.state.budgets.draft;
  const map = {
    "w4-discountTotal": "discountTotal", "w4-extraCostsTotal": "extraCostsTotal", "w4-taxPct": "taxPct",
    "w4-advancePct": "advancePct", "w4-paymentMethod": "paymentMethod", "w4-duration": "duration",
    "w4-paymentDates": "paymentDates", "w4-conditions": "conditions"
  };
  const field = map[el.id];
  if (!field) return;
  const numeric = ["discountTotal", "extraCostsTotal", "taxPct", "advancePct"].includes(field);
  d[field] = numeric ? Number(el.value) || 0 : el.value;
  if (numeric) {
    const summary = document.getElementById("wizard-step4-summary");
    if (summary) summary.innerHTML = wizardStep4SummaryHtml(budgetTotals(d));
  }
};

// ---- Paso 5: exportación ---------------------------------------------------
function wizardStep5Html(d) {
  const t = budgetTotals(d);
  const isApproved = d.status === "aprobado";
  return `
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Resumen final</div>
        <h3>${App.escapeHtml(d.projectName)}</h3>
        <p class="cell-muted">${App.escapeHtml(d.client.name)} ${d.client.brand ? "— " + App.escapeHtml(d.client.brand) : ""}</p>
        ${wizardStep4SummaryHtml(t)}
        <div style="margin-top:14px;">Estado actual: ${App.statusBadge(d.status, App.BUDGET_STATUS_MAP)}</div>
      </div>
      <div class="card">
        <div class="card-title">Estado del presupuesto</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
          <button class="btn btn-sm" data-action="budgetSetStatus" data-status="borrador">Marcar borrador</button>
          <button class="btn btn-sm" data-action="budgetSetStatus" data-status="enviado">Marcar enviado</button>
          <button class="btn btn-sm" data-action="budgetSetStatus" data-status="aprobado">Marcar aprobado</button>
          <button class="btn btn-sm" data-action="budgetSetStatus" data-status="rechazado">Marcar rechazado</button>
        </div>
        <div class="card-title">Exportar</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
          <button class="btn" data-action="budgetDownloadPdfDraft">Descargar PDF</button>
          <button class="btn" data-action="budgetPrintDraft">Imprimir</button>
          <button class="btn" data-action="budgetSaveDraft">Guardar en perfil del cliente</button>
          <button class="btn" data-action="budgetDuplicateDraft">Duplicar</button>
        </div>
        <div class="card-title">Conversión (requiere estado aprobado)</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <button class="btn btn-primary" data-action="budgetConvertClient" ${isApproved ? "" : "disabled"}>Convertir en cliente activo</button>
          <button class="btn btn-primary" data-action="budgetConvertIncome" ${isApproved ? "" : "disabled"}>Convertir en ingreso pendiente</button>
        </div>
        ${d.linkedClientId ? `<p class="form-hint" style="margin-top:10px;">Ya vinculado a un cliente.</p>` : ""}
        ${d.linkedIncomeId ? `<p class="form-hint">Ya generó un ingreso pendiente.</p>` : ""}
      </div>
    </div>
    <div class="form-actions">
      <button class="btn" data-action="wizardPrev">&larr; Anterior</button>
      <button class="btn btn-primary" data-action="budgetBackToList">Finalizar</button>
    </div>`;
}

Actions.budgetSetStatus = function (el) {
  App.state.budgets.draft.status = el.dataset.status;
  persistDraft();
  App.toast("Estado actualizado a " + App.BUDGET_STATUS_MAP[el.dataset.status].label + ".", "success");
  renderBudgetWizard();
};
Actions.budgetDownloadPdfDraft = function () {
  persistDraft();
  PdfGen.downloadClientBudget(App.state.budgets.draft, Storage.getConfig());
};
Actions.budgetPrintDraft = function () {
  persistDraft();
  PdfGen.printClientBudget(App.state.budgets.draft, Storage.getConfig());
};
Actions.budgetDuplicateDraft = function () {
  const clone = JSON.parse(JSON.stringify(App.state.budgets.draft));
  clone.id = undefined; clone.projectName += " (copia)"; clone.status = "borrador";
  clone.linkedClientId = null; clone.linkedIncomeId = null;
  const saved = Storage.insert("budgets", clone);
  App.toast("Presupuesto duplicado.", "success");
  App.state.budgets.draft = saved; App.state.budgets.editingId = saved.id;
  renderBudgetWizard();
};
Actions.budgetConvertClient = function () {
  const d = App.state.budgets.draft;
  const totals = budgetTotals(d);
  const client = Storage.insert("clients", {
    name: d.client.name, brand: d.client.brand, contactPerson: "", email: d.client.email, phone: d.client.phone,
    social: "", startDate: new Date().toISOString().slice(0, 10), status: "activo",
    servicesContracted: d.items.map(i => i.serviceId).filter(Boolean),
    modality: d.items.length === 1 ? "proyecto único" : "mensual",
    agreedAmount: totals.total, paymentDay: 10, notes: `Generado desde el presupuesto "${d.projectName}".`
  });
  d.linkedClientId = client.id;
  persistDraft();
  App.toast(`Cliente "${client.name}" creado a partir del presupuesto.`, "success");
  renderBudgetWizard();
};
Actions.budgetConvertIncome = function () {
  const d = App.state.budgets.draft;
  if (!d.linkedClientId) { App.toast("Primero convertí el presupuesto en cliente.", "error"); return; }
  const totals = budgetTotals(d);
  const income = Storage.insert("incomes", {
    clientId: d.linkedClientId, concept: d.projectName, serviceId: d.items[0]?.serviceId || "",
    workMonth: App.currentMonth(), issueDate: new Date().toISOString().slice(0, 10), collectDate: "",
    totalAmount: totals.total, currency: "ARS", paymentMethod: d.paymentMethod, status: "pendiente",
    paidAmount: 0, invoiceNumber: "", notes: `Generado desde el presupuesto "${d.projectName}".`,
    recurring: false, nextPaymentDate: ""
  });
  d.linkedIncomeId = income.id;
  persistDraft();
  App.toast("Ingreso pendiente generado.", "success");
  renderBudgetWizard();
};

/* ==========================================================================
   MÓDULO: RENTABILIDAD
   ========================================================================== */

const PROFITABILITY_DIMENSIONS = {
  client: "Cliente", service: "Servicio", project: "Proyecto",
  month: "Mes", year: "Año", collaborator: "Colaborador"
};

function profitabilityRows(dimension, period) {
  if (dimension === "client") {
    return Storage.list("clients").map(c => ({ id: c.id, label: c.name, ...profitabilityForClient(c.id, period) }));
  }
  if (dimension === "service") {
    return Storage.list("services").map(sv => ({ id: sv.id, label: sv.name, ...profitabilityForService(sv.id, period) }));
  }
  if (dimension === "project") {
    const projects = new Set([
      ...Storage.list("incomes").map(i => i.project).filter(Boolean),
      ...Storage.list("expenses").map(e => e.project).filter(Boolean)
    ]);
    return Array.from(projects).map(p => ({ id: p, label: p, ...profitabilityForProject(p, period) }));
  }
  if (dimension === "month") {
    const months = Array.from(new Set(Storage.list("incomes").map(i => i.workMonth).filter(Boolean))).sort();
    return months.map(m => ({ id: m, label: App.monthLabel(m), ...profitabilityForMonth(m) }));
  }
  if (dimension === "year") {
    const years = Array.from(new Set(Storage.list("incomes").map(i => (i.workMonth || "").slice(0, 4)).filter(Boolean))).sort();
    return years.map(y => ({ id: y, label: y, ...profitabilityForYear(y) }));
  }
  if (dimension === "collaborator") {
    return Storage.list("collaborators").map(c => ({ id: c.id, label: c.name, ...profitabilityForCollaborator(c.id, period) }));
  }
  return [];
}

function viewProfitability() {
  const root = document.getElementById("profitability-root");
  const s = App.state.profitability;
  const period = { from: s.from, to: s.to };
  const rows = profitabilityRows(s.dimension, period).sort((a, b) => b.ingresos - a.ingresos);
  const isApprox = s.dimension === "project" || s.dimension === "collaborator";

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Análisis</div><h2>Rentabilidad</h2></div>
    </div>
    <div class="toolbar">
      <select class="filter-select" data-filter="profDimension">
        ${Object.keys(PROFITABILITY_DIMENSIONS).map(k => `<option value="${k}" ${s.dimension === k ? "selected" : ""}>${PROFITABILITY_DIMENSIONS[k]}</option>`).join("")}
      </select>
      <input type="month" class="filter-input" data-filter="profFrom" value="${s.from}" title="Desde">
      <input type="month" class="filter-input" data-filter="profTo" value="${s.to}" title="Hasta">
    </div>
    ${(s.dimension === "month" || s.dimension === "year") ? "" : `<p class="form-hint" style="margin-bottom:14px;">El rango de fechas no aplica a la dimensión "${PROFITABILITY_DIMENSIONS[s.dimension]}" cuando ésta ya representa un período.</p>`}
    ${isApprox ? `<div class="alert-box" style="margin-bottom:18px;">Esta dimensión es una aproximación: ${s.dimension === "project" ? "se calcula únicamente con ingresos/gastos que tengan el mismo texto de proyecto cargado." : "los ingresos atribuidos surgen de los servicios en los que participa el colaborador, y los pagos de los gastos vinculados directamente a esa persona."}</div>` : ""}
    <div class="table-wrap scroll-x">
      <table>
        <thead><tr>
          <th>${PROFITABILITY_DIMENSIONS[s.dimension]}</th><th>Ingresos cobrados</th><th>Gastos directos</th>
          <th>Pagos colaboradores</th><th>Impuestos est.</th><th>Gastos generales asig.</th>
          <th>Ganancia neta</th><th>Margen</th><th>Alerta</th>
        </tr></thead>
        <tbody>
          ${rows.length === 0 ? `<tr class="empty-row"><td colspan="9">Sin datos suficientes para esta dimensión.</td></tr>` : rows.map(r => {
            const alert = profitabilityAlert(r.margenPct);
            return `<tr>
              <td data-label="${PROFITABILITY_DIMENSIONS[s.dimension]}" class="cell-strong">${App.escapeHtml(r.label)}</td>
              <td data-label="Ingresos">${App.fmtMoney(r.ingresos)}</td>
              <td data-label="Gastos directos">${App.fmtMoney(r.gastosDirectos)}</td>
              <td data-label="Colaboradores">${App.fmtMoney(r.pagosColaboradores)}</td>
              <td data-label="Impuestos">${App.fmtMoney(r.impuestos)}</td>
              <td data-label="Generales">${App.fmtMoney(r.gastosGeneralesAsignados)}</td>
              <td data-label="Ganancia neta"><strong>${App.fmtMoney(r.gananciaNeta)}</strong></td>
              <td data-label="Margen">${r.margenPct.toFixed(1)}%</td>
              <td data-label="Alerta"><span class="badge ${alert.cls}">${alert.label}</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

Filters.profDimension = function (el) { App.state.profitability.dimension = el.value; viewProfitability(); };
Filters.profFrom = function (el) { App.state.profitability.from = el.value; viewProfitability(); };
Filters.profTo = function (el) { App.state.profitability.to = el.value; viewProfitability(); };

/* ==========================================================================
   MÓDULO: REPORTES
   ========================================================================== */

const REPORT_PERIOD_LABELS = { month: "Mes", quarter: "Trimestre", semester: "Semestre", year: "Año" };

function periodRangeFor(periodType, periodValue) {
  // periodValue: para "month" es "YYYY-MM"; para el resto es "YYYY" o "YYYY-Q1..Q4" / "YYYY-S1..S2"
  if (periodType === "month") return { from: periodValue, to: periodValue };
  if (periodType === "year") return { from: `${periodValue}-01`, to: `${periodValue}-12` };
  if (periodType === "quarter") {
    const [y, q] = periodValue.split("-Q");
    const startMonth = (Number(q) - 1) * 3 + 1;
    return { from: `${y}-${String(startMonth).padStart(2, "0")}`, to: `${y}-${String(startMonth + 2).padStart(2, "0")}` };
  }
  if (periodType === "semester") {
    const [y, sem] = periodValue.split("-S");
    const startMonth = sem === "1" ? 1 : 7;
    return { from: `${y}-${String(startMonth).padStart(2, "0")}`, to: `${y}-${String(startMonth + 5).padStart(2, "0")}` };
  }
  return { from: "", to: "" };
}

function reportPeriodOptions(periodType) {
  const years = Array.from(new Set(Storage.list("incomes").map(i => (i.workMonth || "").slice(0, 4)).filter(Boolean))).sort().reverse();
  const yearsFallback = years.length ? years : [String(new Date().getFullYear())];
  if (periodType === "year") return yearsFallback.map(y => ({ value: y, label: y }));
  if (periodType === "month") {
    const months = Array.from(new Set(Storage.list("incomes").map(i => i.workMonth).filter(Boolean))).sort().reverse();
    return (months.length ? months : [App.currentMonth()]).map(m => ({ value: m, label: App.monthLabel(m) }));
  }
  if (periodType === "quarter") {
    const out = [];
    yearsFallback.forEach(y => [1, 2, 3, 4].forEach(q => out.push({ value: `${y}-Q${q}`, label: `T${q} ${y}` })));
    return out;
  }
  if (periodType === "semester") {
    const out = [];
    yearsFallback.forEach(y => [1, 2].forEach(s => out.push({ value: `${y}-S${s}`, label: `S${s} ${y}` })));
    return out;
  }
  return [];
}

function viewReports() {
  const root = document.getElementById("reports-root");
  const s = App.state.reports;
  const periodOptions = reportPeriodOptions(s.periodType);
  if (!s.period && periodOptions.length) s.period = periodOptions[0].value;
  const period = periodRangeFor(s.periodType, s.period);

  const incomes = Storage.list("incomes").filter(i => inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => inPeriodDate(e.date, period));
  const cobrado = incomes.reduce((a, i) => a + (Number(i.paidAmount) || 0), 0);
  const facturado = incomes.reduce((a, i) => a + (Number(i.totalAmount) || 0), 0);
  const pendiente = Math.max(facturado - cobrado, 0);
  const totalGastos = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const ganancia = cobrado - totalGastos;

  const dimRows = profitabilityRows(s.dimension, period).sort((a, b) => b.gananciaNeta - a.gananciaNeta);
  const topRentables = dimRows.slice(0, 5);

  const services = Storage.list("services");
  const distribIngresos = services.map(sv => ({
    name: sv.name, total: incomes.filter(i => i.serviceId === sv.id).reduce((a, i) => a + (Number(i.paidAmount) || 0), 0)
  })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Análisis</div><h2>Reportes</h2></div>
      <div class="view-actions">
        <button class="btn" data-action="reportExportCsv">Exportar CSV</button>
        <button class="btn btn-primary" data-action="reportExportPdf">Exportar PDF</button>
      </div>
    </div>
    <div class="toolbar">
      <select class="filter-select" data-filter="reportPeriodType">
        ${Object.keys(REPORT_PERIOD_LABELS).map(k => `<option value="${k}" ${s.periodType === k ? "selected" : ""}>${REPORT_PERIOD_LABELS[k]}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="reportPeriod">
        ${periodOptions.map(o => `<option value="${o.value}" ${s.period === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
      <select class="filter-select" data-filter="reportDimension">
        ${Object.keys(PROFITABILITY_DIMENSIONS).map(k => `<option value="${k}" ${s.dimension === k ? "selected" : ""}>${PROFITABILITY_DIMENSIONS[k]}</option>`).join("")}
      </select>
    </div>

    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card kpi-card"><div class="card-title">Ingresos cobrados</div><div class="value">${App.fmtMoney(cobrado)}</div></div>
      <div class="card kpi-card"><div class="card-title">Gastos</div><div class="value">${App.fmtMoney(totalGastos)}</div></div>
      <div class="card kpi-card"><div class="card-title">Ganancia</div><div class="value">${App.fmtMoney(ganancia)}</div></div>
      <div class="card kpi-card"><div class="card-title">Pendiente de cobro</div><div class="value">${App.fmtMoney(pendiente)}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Más rentables (${PROFITABILITY_DIMENSIONS[s.dimension]})</div>
        ${topRentables.length === 0 ? `<p class="form-hint">Sin datos.</p>` : topRentables.map(r => `
          <div class="summary-line"><span class="label">${App.escapeHtml(r.label)}</span><span>${App.fmtMoney(r.gananciaNeta)} · ${r.margenPct.toFixed(1)}%</span></div>`).join("")}
      </div>
      <div class="card">
        <div class="card-title">Distribución de ingresos por servicio</div>
        ${distribIngresos.length === 0 ? `<p class="form-hint">Sin datos.</p>` : distribIngresos.map(d => `
          <div class="summary-line"><span class="label">${App.escapeHtml(d.name)}</span><span>${App.fmtMoney(d.total)}</span></div>`).join("")}
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Evolución anual de la facturación</div>
      <div class="card chart-card"><div class="chart-wrap"><canvas id="report-yearly-chart"></canvas></div></div>
    </div>`;

  Charts.renderYearlyEvolution("report-yearly-chart", Number((period.from || "").slice(0, 4)) || new Date().getFullYear());
}

Filters.reportPeriodType = function (el) { App.state.reports.periodType = el.value; App.state.reports.period = ""; viewReports(); };
Filters.reportPeriod = function (el) { App.state.reports.period = el.value; viewReports(); };
Filters.reportDimension = function (el) { App.state.reports.dimension = el.value; viewReports(); };

Actions.reportExportCsv = function () {
  const s = App.state.reports;
  const period = periodRangeFor(s.periodType, s.period);
  const rows = profitabilityRows(s.dimension, period);
  PdfGen.downloadCSV(
    `reporte-${s.dimension}-${s.period}.csv`,
    [PROFITABILITY_DIMENSIONS[s.dimension], "Ingresos", "Gastos directos", "Colaboradores", "Impuestos", "Gastos generales", "Ganancia neta", "Margen %"],
    rows.map(r => [r.label, r.ingresos, r.gastosDirectos, r.pagosColaboradores, r.impuestos, r.gastosGeneralesAsignados, r.gananciaNeta, r.margenPct.toFixed(1)])
  );
  App.toast("CSV descargado.", "success");
};

Actions.reportExportPdf = function () {
  const s = App.state.reports;
  const period = periodRangeFor(s.periodType, s.period);
  const incomes = Storage.list("incomes").filter(i => inPeriodYM(i.workMonth, period));
  const expenses = Storage.list("expenses").filter(e => inPeriodDate(e.date, period));
  const cobrado = incomes.reduce((a, i) => a + (Number(i.paidAmount) || 0), 0);
  const totalGastos = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const rows = profitabilityRows(s.dimension, period).sort((a, b) => b.gananciaNeta - a.gananciaNeta).slice(0, 10);
  PdfGen.downloadReportPDF(
    "Reporte financiero — TRAMA Studio",
    `${REPORT_PERIOD_LABELS[s.periodType]}: ${s.period} · Dimensión: ${PROFITABILITY_DIMENSIONS[s.dimension]}`,
    [
      { heading: "Resumen general", rows: [["Ingresos cobrados", App.fmtMoney(cobrado)], ["Gastos", App.fmtMoney(totalGastos)], ["Ganancia", App.fmtMoney(cobrado - totalGastos)]] },
      { heading: `Más rentables (${PROFITABILITY_DIMENSIONS[s.dimension]})`, rows: rows.map(r => [r.label, App.fmtMoney(r.gananciaNeta)]) }
    ],
    Storage.getConfig(),
    `reporte-${s.dimension}-${s.period}.pdf`
  );
  App.toast("PDF descargado.", "success");
};

/* ==========================================================================
   MÓDULO: CONFIGURACIÓN
   ========================================================================== */

function viewSettings() {
  const root = document.getElementById("settings-root");
  const cfg = Storage.getConfig();

  root.innerHTML = `
    <div class="view-header">
      <div><div class="eyebrow">Ajustes</div><h2>Configuración</h2></div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Datos de la agencia</div>
      <div class="card">
        <form data-form="settingsAgency">
          <div class="form-grid">
            <div class="form-field"><label>Nombre de la agencia</label><input name="agencyName" value="${App.escapeHtml(cfg.agencyName)}"></div>
            <div class="form-field"><label>Datos fiscales (CUIT, etc.)</label><input name="taxId" value="${App.escapeHtml(cfg.taxId)}"></div>
            <div class="form-field"><label>Correo</label><input type="email" name="email" value="${App.escapeHtml(cfg.email)}"></div>
            <div class="form-field"><label>Teléfono</label><input name="phone" value="${App.escapeHtml(cfg.phone)}"></div>
            <div class="form-field"><label>Instagram</label><input name="instagram" value="${App.escapeHtml(cfg.instagram)}"></div>
            <div class="form-field"><label>Moneda principal</label>
              <select name="currency"><option ${cfg.currency === "ARS" ? "selected" : ""}>ARS</option><option ${cfg.currency === "USD" ? "selected" : ""}>USD</option><option ${cfg.currency === "EUR" ? "selected" : ""}>EUR</option></select>
            </div>
            <div class="form-field"><label>Símbolo monetario</label><input name="currencySymbol" value="${App.escapeHtml(cfg.currencySymbol)}"></div>
            <div class="form-field"><label>% de impuestos estimado</label><input type="number" step="0.1" name="taxRatePct" value="${cfg.taxRatePct}"></div>
            <div class="form-field"><label>Margen mínimo deseado (%)</label><input type="number" step="0.1" name="minMarginPct" value="${cfg.minMarginPct}"></div>
            <div class="form-field"><label>% de anticipo habitual</label><input type="number" step="0.1" name="advancePct" value="${cfg.advancePct}"></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Guardar datos de la agencia</button></div>
        </form>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Logo</div>
      <div class="card" style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
        <img src="${cfg.logoDataUrl || "logos/trama-logo.svg"}" alt="Logo" style="width:64px; height:64px; border:1px solid var(--line); border-radius:10px; padding:6px;">
        <div>
          <input type="file" id="logo-upload-input" accept="image/*">
          <p class="form-hint">Se guarda como imagen embebida en tu navegador. También podés reemplazar el archivo <code>logos/trama-logo.svg</code> directamente en el código.</p>
          <button class="btn btn-sm" data-action="logoReset">Restaurar logo por defecto</button>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Formas de pago aceptadas</div>
      <div class="card">
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;" id="payment-methods-chips">
          ${(cfg.paymentMethods || []).map(m => `<span class="badge badge-neutral">${App.escapeHtml(m)} <button data-action="paymentMethodRemove" data-name="${App.escapeHtml(m)}" style="background:none;border:none;cursor:pointer;color:inherit;">&times;</button></span>`).join("")}
        </div>
        <form data-form="paymentMethodAdd" style="display:flex; gap:8px;">
          <input name="newMethod" placeholder="Nueva forma de pago..." style="flex:1; padding:9px 11px; border-radius:8px; border:1px solid var(--line-strong); background:var(--surface); color:var(--ink);">
          <button type="submit" class="btn">Agregar</button>
        </form>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Rangos de rentabilidad (alertas)</div>
      <div class="card">
        <form data-form="settingsRanges">
          <div class="form-grid">
            <div class="form-field"><label>Rentabilidad alta desde (%)</label><input type="number" name="alta" value="${cfg.profitabilityRanges.alta}"></div>
            <div class="form-field"><label>Saludable desde (%)</label><input type="number" name="saludable" value="${cfg.profitabilityRanges.saludable}"></div>
            <div class="form-field"><label>Baja desde (%) — debajo es pérdida</label><input type="number" name="baja" value="${cfg.profitabilityRanges.baja}"></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Guardar rangos</button></div>
        </form>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Condiciones generales predeterminadas para presupuestos</div>
      <div class="card">
        <form data-form="settingsConditions">
          <div class="form-field full"><textarea name="budgetConditions" rows="8">${App.escapeHtml(cfg.budgetConditions)}</textarea></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Guardar condiciones</button></div>
        </form>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Apariencia</div>
      <div class="card" style="display:flex; gap:12px;">
        <button class="btn" data-action="settingsToggleTheme">${cfg.theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}</button>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Seguridad</div>
      <div class="card">
        <form data-form="settingsPassword">
          <div class="form-grid">
            <div class="form-field"><label>Contraseña actual</label><input type="password" name="current"></div>
            <div class="form-field"><label>Nueva contraseña</label><input type="password" name="next"></div>
            <div class="form-field"><label>Confirmar nueva contraseña</label><input type="password" name="confirm"></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Cambiar contraseña</button></div>
        </form>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block-title">Datos y copias de seguridad</div>
      <div class="card">
        <p class="form-hint" style="margin-bottom:16px;">
          Los datos se guardan únicamente en este dispositivo (localStorage del navegador) mientras no exista
          una base de datos externa configurada. Hacé backups periódicos para no perder información.
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:10px;">
          <button class="btn" data-action="settingsExportBackup">Exportar copia de seguridad (JSON)</button>
          <button class="btn" data-action="settingsImportBackup">Importar copia de seguridad</button>
          <input type="file" id="import-backup-input" accept="application/json" class="hidden">
          <button class="btn" data-action="settingsRemoveDemo">Eliminar datos de demostración</button>
          <button class="btn btn-danger" data-action="settingsWipeAll">Restaurar datos de fábrica</button>
        </div>
      </div>
    </div>`;

  document.getElementById("logo-upload-input").addEventListener("change", handleLogoUpload);
  document.getElementById("import-backup-input").addEventListener("change", handleImportBackup);
}

Forms.settingsAgency = function (form) {
  const fd = new FormData(form);
  Storage.setConfig({
    agencyName: fd.get("agencyName")?.trim() || "TRAMA Studio",
    taxId: fd.get("taxId"), email: fd.get("email"), phone: fd.get("phone"), instagram: fd.get("instagram"),
    currency: fd.get("currency"), currencySymbol: fd.get("currencySymbol") || "$",
    taxRatePct: Number(fd.get("taxRatePct")) || 0, minMarginPct: Number(fd.get("minMarginPct")) || 0,
    advancePct: Number(fd.get("advancePct")) || 0
  });
  App.applyLogo();
  App.toast("Datos de la agencia guardados.", "success");
  viewSettings();
};

Forms.settingsRanges = function (form) {
  const fd = new FormData(form);
  Storage.setConfig({ profitabilityRanges: { alta: Number(fd.get("alta")) || 0, saludable: Number(fd.get("saludable")) || 0, baja: Number(fd.get("baja")) || 0 } });
  App.toast("Rangos de rentabilidad guardados.", "success");
  viewSettings();
};

Forms.settingsConditions = function (form) {
  const fd = new FormData(form);
  Storage.setConfig({ budgetConditions: fd.get("budgetConditions") });
  App.toast("Condiciones guardadas.", "success");
  viewSettings();
};

Forms.paymentMethodAdd = function (form) {
  const fd = new FormData(form);
  const name = fd.get("newMethod")?.trim();
  if (!name) return;
  const cfg = Storage.getConfig();
  if (!cfg.paymentMethods.includes(name)) Storage.setConfig({ paymentMethods: [...cfg.paymentMethods, name] });
  viewSettings();
};
Actions.paymentMethodRemove = function (el) {
  const cfg = Storage.getConfig();
  Storage.setConfig({ paymentMethods: cfg.paymentMethods.filter(m => m !== el.dataset.name) });
  viewSettings();
};

Actions.settingsToggleTheme = function () { App.toggleTheme ? App.toggleTheme() : null; document.getElementById("theme-toggle").click(); viewSettings(); };

function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    Storage.setConfig({ logoDataUrl: reader.result });
    App.applyLogo();
    App.toast("Logo actualizado.", "success");
    viewSettings();
  };
  reader.readAsDataURL(file);
}
Actions.logoReset = function () {
  Storage.setConfig({ logoDataUrl: "" });
  document.getElementById("sidebar-logo-img").src = "logos/trama-logo.svg";
  document.getElementById("login-logo-img").src = "logos/trama-logo.svg";
  App.toast("Logo restaurado.", "success");
  viewSettings();
};

Forms.settingsPassword = async function (form) {
  const fd = new FormData(form);
  const current = fd.get("current"), next = fd.get("next"), confirm = fd.get("confirm");
  const auth = Storage.getAuth();
  if (auth && auth.passwordHash) {
    const currentHash = await Storage.sha256(current || "");
    if (currentHash !== auth.passwordHash) { App.toast("La contraseña actual no coincide.", "error"); return; }
  }
  if (!next || next.length < 4) { App.toast("La nueva contraseña debe tener al menos 4 caracteres.", "error"); return; }
  if (next !== confirm) { App.toast("Las contraseñas nuevas no coinciden.", "error"); return; }
  const hash = await Storage.sha256(next);
  Storage.setAuth({ passwordHash: hash });
  App.toast("Contraseña actualizada.", "success");
  form.reset();
};

Actions.settingsExportBackup = function () { Storage.exportBackupFile(); App.toast("Copia de seguridad descargada.", "success"); };
Actions.settingsImportBackup = function () { document.getElementById("import-backup-input").click(); };
function handleImportBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  Storage.importBackupFile(file).then(() => {
    App.toast("Copia de seguridad importada correctamente.", "success");
    App.applyLogo();
    App.applyTheme(Storage.getConfig().theme || "light");
    App.goTo("dashboard");
  }).catch(() => App.toast("El archivo no es una copia de seguridad válida.", "error"));
}

Actions.settingsRemoveDemo = async function () {
  if (!(await App.confirmAction("¿Eliminar todos los datos de demostración (clientes, ingresos, gastos y colaboradores de ejemplo)? Tus datos reales no se verán afectados."))) return;
  Storage.removeDemoData();
  App.toast("Datos de demostración eliminados.", "success");
  App.goTo("dashboard");
};

Actions.settingsWipeAll = async function () {
  if (!(await App.confirmAction("Esto borra TODOS los datos guardados en este dispositivo (clientes, ingresos, gastos, presupuestos, configuración) y no se puede deshacer. ¿Continuar?", "Sí, borrar todo"))) return;
  Storage.wipeAll();
  App.toast("Datos borrados. Recargando...", "success");
  setTimeout(() => location.reload(), 1200);
};
