/* ==========================================================================
   TRAMA Studio — charts.js
   Construcción de todos los gráficos (Chart.js) a partir de los datos
   guardados en Storage. Cada función destruye la instancia previa antes
   de crear una nueva, para poder refrescar al cambiar de mes/filtros.
   ========================================================================== */

const Charts = (() => {
  const instances = {};

  // Los gráficos se dibujan sobre <canvas>, así que sus colores no siguen el
  // CSS automáticamente: hay que resolver la paleta según el tema activo
  // cada vez que se renderiza (y volver a renderizar cuando cambia el tema).
  function isDarkMode() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function getPalette() {
    if (isDarkMode()) {
      return {
        ink: "#f3f0e6", warm: "#a39a86", line: "#3d3928", cream: "#2a281e",
        accentSeries: ["#f3f0e6", "#c7a97a", "#8fbf9b", "#a39a86", "#5f5a4a", "#e2897a"]
      };
    }
    return {
      ink: "#211f1c", warm: "#8a7f6e", line: "#d8d2c4", cream: "#efe9dd",
      accentSeries: ["#211f1c", "#8a7f6e", "#b9ae98", "#d8d2c4", "#4a463d", "#c7a97a"]
    };
  }

  function destroy(id) {
    if (instances[id]) { instances[id].destroy(); delete instances[id]; }
  }

  function baseOptions(palette, extra = {}) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: palette.ink, font: { family: "'Inter', sans-serif", size: 11 } } },
        tooltip: {
          backgroundColor: palette.ink, titleColor: palette.cream, bodyColor: palette.cream,
          titleFont: { family: "'Inter', sans-serif" },
          bodyFont: { family: "'Inter', sans-serif" },
          padding: 10
        }
      },
      scales: {
        x: { grid: { color: palette.line, drawBorder: false }, ticks: { color: palette.warm, font: { size: 10 } } },
        y: { grid: { color: palette.line, drawBorder: false }, ticks: { color: palette.warm, font: { size: 10 } } }
      }
    }, extra);
  }

  function money(n) { return App.fmtMoney(n); }

  function lastMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }

  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
  }

  // ---- Ingresos / Gastos / Ganancia por mes (últimos 6 meses) ----------
  function renderMonthlyFlow(canvasId, months = lastMonths(6)) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const palette = getPalette();
    const incomes = Storage.list("incomes");
    const expenses = Storage.list("expenses");
    const ingresos = months.map(m => incomes.filter(i => i.workMonth === m).reduce((s, i) => s + (Number(i.paidAmount) || 0), 0));
    const gastos = months.map(m => expenses.filter(e => (e.date || "").slice(0, 7) === m).reduce((s, e) => s + (Number(e.amount) || 0), 0));
    const ganancia = months.map((m, i) => ingresos[i] - gastos[i]);

    instances[canvasId] = new Chart(el, {
      type: "bar",
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: "Ingresos", data: ingresos, backgroundColor: palette.ink, borderRadius: 3, maxBarThickness: 22 },
          { label: "Gastos", data: gastos, backgroundColor: palette.warm, borderRadius: 3, maxBarThickness: 22 },
          { label: "Ganancia", data: ganancia, type: "line", borderColor: "#c7a97a", backgroundColor: "#c7a97a", tension: 0.35, pointRadius: 3 }
        ]
      },
      options: baseOptions(palette, {
        plugins: {
          legend: { labels: { color: palette.ink, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` } }
        }
      })
    });
  }

  // ---- Ingresos por cliente (mes actual o filtro) -----------------------
  function renderIncomeByClient(canvasId, workMonth) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const palette = getPalette();
    const clients = Storage.list("clients");
    const incomes = Storage.list("incomes").filter(i => !workMonth || i.workMonth === workMonth);
    const data = clients.map(c => ({
      name: c.name,
      total: incomes.filter(i => i.clientId === c.id).reduce((s, i) => s + (Number(i.paidAmount) || 0), 0)
    })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

    instances[canvasId] = new Chart(el, {
      type: "doughnut",
      data: {
        labels: data.map(d => d.name),
        datasets: [{ data: data.map(d => d.total), backgroundColor: palette.accentSeries, borderWidth: 0 }]
      },
      options: baseOptions(palette, {
        scales: undefined,
        plugins: {
          legend: { position: "bottom", labels: { color: palette.ink, font: { size: 10 }, boxWidth: 10 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}` } }
        }
      })
    });
  }

  // ---- Ingresos por servicio ---------------------------------------------
  function renderIncomeByService(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const palette = getPalette();
    const services = Storage.list("services");
    const incomes = Storage.list("incomes");
    const data = services.map(s => ({
      name: s.name,
      total: incomes.filter(i => i.serviceId === s.id).reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0)
    })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

    instances[canvasId] = new Chart(el, {
      type: "bar",
      data: {
        labels: data.map(d => d.name),
        datasets: [{ label: "Ingresos", data: data.map(d => d.total), backgroundColor: palette.ink, borderRadius: 3 }]
      },
      options: baseOptions(palette, {
        indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.x) } } }
      })
    });
  }

  // ---- Evolución anual de facturación -----------------------------------
  function renderYearlyEvolution(canvasId, year) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const palette = getPalette();
    const y = year || new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
    const incomes = Storage.list("incomes");
    const totals = months.map(m => incomes.filter(i => i.workMonth === m).reduce((s, i) => s + (Number(i.totalAmount) || 0), 0));

    instances[canvasId] = new Chart(el, {
      type: "line",
      data: {
        labels: months.map(monthLabel),
        datasets: [{
          label: `Facturación ${y}`, data: totals, borderColor: palette.ink,
          backgroundColor: "rgba(199,169,122,.15)", fill: true, tension: 0.35, pointRadius: 3
        }]
      },
      options: baseOptions(palette, { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.y) } } } })
    });
  }

  // ---- Distribución TRAMA / colaboradores / gastos (mes o global) -------
  function renderMoneyDistribution(canvasId, workMonth) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const palette = getPalette();
    const incomes = Storage.list("incomes").filter(i => !workMonth || i.workMonth === workMonth);
    const expenses = Storage.list("expenses").filter(e => !workMonth || (e.date || "").slice(0, 7) === workMonth);
    const cats = Storage.COLLABORATOR_CATEGORIES;
    const cobrado = incomes.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
    const colaboradores = expenses.filter(e => cats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const otrosGastos = expenses.filter(e => !cats.includes(e.category)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const paraTrama = Math.max(cobrado - colaboradores - otrosGastos, 0);

    instances[canvasId] = new Chart(el, {
      type: "pie",
      data: {
        labels: ["TRAMA", "Colaboradores", "Gastos"],
        datasets: [{ data: [paraTrama, colaboradores, otrosGastos], backgroundColor: [palette.ink, "#c7a97a", palette.warm], borderWidth: 0 }]
      },
      options: baseOptions(palette, {
        scales: undefined,
        plugins: {
          legend: { position: "bottom", labels: { color: palette.ink, font: { size: 10 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)}` } }
        }
      })
    });
  }

  // ---- Comparación entre meses (barras agrupadas simples) ---------------
  function renderMonthComparison(canvasId, monthA, monthB) {
    const el = document.getElementById(canvasId);
    if (!el) return;
    destroy(canvasId);
    const palette = getPalette();
    const incomes = Storage.list("incomes");
    const expenses = Storage.list("expenses");
    const sums = (m) => ({
      ingresos: incomes.filter(i => i.workMonth === m).reduce((s, i) => s + (Number(i.paidAmount) || 0), 0),
      gastos: expenses.filter(e => (e.date || "").slice(0, 7) === m).reduce((s, e) => s + (Number(e.amount) || 0), 0)
    });
    const a = sums(monthA), b = sums(monthB);
    instances[canvasId] = new Chart(el, {
      type: "bar",
      data: {
        labels: ["Ingresos", "Gastos", "Ganancia"],
        datasets: [
          { label: monthLabel(monthA), data: [a.ingresos, a.gastos, a.ingresos - a.gastos], backgroundColor: palette.ink, borderRadius: 3 },
          { label: monthLabel(monthB), data: [b.ingresos, b.gastos, b.ingresos - b.gastos], backgroundColor: "#c7a97a", borderRadius: 3 }
        ]
      },
      options: baseOptions(palette, { plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed.y)}` } } } })
    });
  }

  return {
    renderMonthlyFlow, renderIncomeByClient, renderIncomeByService,
    renderYearlyEvolution, renderMoneyDistribution, renderMonthComparison,
    lastMonths, monthLabel, destroy
  };
})();
