/* ==========================================================================
   TRAMA Studio — storage.js
   Capa de persistencia. Usa localStorage (síncrono, suficiente para el
   volumen de datos de una agencia) con una API pequeña e independiente
   del resto de la app. Todo vive bajo claves con prefijo "trama_".
   ========================================================================== */

const Storage = (() => {
  const PREFIX = "trama_";
  const COLLECTIONS = [
    "clients", "incomes", "expenses", "services", "collaborators",
    "budgets", "categories"
  ];

  function key(name) { return PREFIX + name; }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function get(name, fallback) {
    try {
      const raw = localStorage.getItem(key(name));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error("Storage.get error", name, e);
      return fallback;
    }
  }

  function set(name, value) {
    try {
      localStorage.setItem(key(name), JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage.set error", name, e);
      notifyQuotaError();
      return false;
    }
  }

  function notifyQuotaError() {
    if (window.App && App.toast) {
      App.toast("No se pudo guardar: almacenamiento local lleno o no disponible.", "error");
    }
  }

  // ---- Colecciones genéricas -------------------------------------------
  function list(name) { return get(name, []); }
  function saveList(name, arr) { return set(name, arr); }

  function insert(name, record) {
    const arr = list(name);
    if (!record.id) record.id = uid(name.slice(0, 3));
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    arr.push(record);
    saveList(name, arr);
    return record;
  }

  function update(name, id, patch) {
    const arr = list(name);
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...patch, id };
    saveList(name, arr);
    return arr[idx];
  }

  function remove(name, id) {
    const arr = list(name);
    const next = arr.filter(r => r.id !== id);
    saveList(name, next);
    return next.length !== arr.length;
  }

  function find(name, id) {
    return list(name).find(r => r.id === id) || null;
  }

  // ---- Configuración ------------------------------------------------------
  const DEFAULT_CONFIG = {
    agencyName: "TRAMA Studio",
    logoDataUrl: "",
    taxId: "",
    email: "hola@tramastudio.com",
    phone: "",
    instagram: "@tramastudio",
    currency: "ARS",
    currencySymbol: "$",
    taxRatePct: 21,
    minMarginPct: 30,
    advancePct: 50,
    paymentMethods: ["Transferencia bancaria", "Mercado Pago", "Efectivo", "Cheque"],
    budgetConditions:
      "• Este presupuesto tiene una validez de 15 días desde su emisión.\n" +
      "• El trabajo comienza una vez confirmado el presupuesto y abonado el anticipo.\n" +
      "• Los gastos externos no incluidos en esta propuesta se presupuestan por separado.\n" +
      "• Las modificaciones adicionales al alcance acordado pueden generar costos extra.\n" +
      "• Las fechas de entrega dependen de la aprobación a tiempo del material por parte del cliente.\n" +
      "• El saldo restante debe abonarse según las fechas acordadas en este documento.\n" +
      "• Los valores presupuestados pueden actualizarse en trabajos futuros.",
    profitabilityRanges: { alta: 40, saludable: 15, baja: 0 },
    theme: "light",
    demoMode: true
  };

  function getConfig() {
    return { ...DEFAULT_CONFIG, ...get("config", {}) };
  }
  function setConfig(patch) {
    const next = { ...getConfig(), ...patch };
    set("config", next);
    return next;
  }

  const DEFAULT_EXPENSE_CATEGORIES = [
    "Sueldos", "Colaboradores freelance", "Fotógrafos", "Modelos",
    "Maquillaje y peinado", "Alquiler de locación", "Traslados", "Viáticos",
    "Utilería", "Vestuario", "Impresiones", "Publicidad", "Herramientas digitales",
    "Suscripciones", "Equipamiento", "Impuestos", "Gastos administrativos",
    "Producción", "Otros"
  ];

  // Categorías cuyo gasto se considera "pago a colaborador" para rentabilidad
  const COLLABORATOR_CATEGORIES = [
    "Sueldos", "Colaboradores freelance", "Fotógrafos", "Modelos", "Maquillaje y peinado"
  ];

  // ---- Auth ---------------------------------------------------------------
  function getAuth() { return get("auth", null); }
  function setAuth(auth) { return set("auth", auth); }

  async function sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // ---- Backup / restauración ------------------------------------------
  function fullSnapshot() {
    const snapshot = { _meta: { app: "trama-studio", exportedAt: new Date().toISOString(), version: 1 } };
    COLLECTIONS.forEach(c => { snapshot[c] = list(c); });
    snapshot.config = getConfig();
    return snapshot;
  }

  function exportBackupFile() {
    const snapshot = fullSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `trama-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== "object") throw new Error("Archivo inválido");
          COLLECTIONS.forEach(c => {
            if (Array.isArray(data[c])) saveList(c, data[c]);
          });
          if (data.config) setConfig(data.config);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function wipeAll() {
    COLLECTIONS.forEach(c => localStorage.removeItem(key(c)));
    localStorage.removeItem(key("config"));
    localStorage.removeItem(key("auth"));
  }

  // ---- Datos de demostración -------------------------------------------
  function seedIfEmpty() {
    if (list("categories").length === 0) saveList("categories", DEFAULT_EXPENSE_CATEGORIES);

    if (list("services").length === 0) saveList("services", demoServices());
    if (list("clients").length === 0) saveList("clients", demoClients());
    if (list("collaborators").length === 0) saveList("collaborators", demoCollaborators());
    if (list("incomes").length === 0) saveList("incomes", demoIncomes());
    if (list("expenses").length === 0) saveList("expenses", demoExpenses());
    if (list("budgets").length === 0) saveList("budgets", demoBudgets());
  }

  function removeDemoData() {
    ["clients", "incomes", "expenses", "collaborators", "budgets"].forEach(c => {
      const arr = list(c).filter(r => !r._demo);
      saveList(c, arr);
    });
    const services = list("services").filter(r => !r._demo);
    saveList("services", services.length ? services : DEFAULT_SERVICES_SEED());
    setConfig({ demoMode: false });
  }

  function DEFAULT_SERVICES_SEED() { return demoServices().map(s => ({ ...s, _demo: false })); }

  function demoServices() {
    const base = [
      ["Creación de contenido", "mensual", 350000, "media"],
      ["Social Media Management", "mensual", 400000, "media"],
      ["Community Management", "mensual", 200000, "baja"],
      ["Producción de fotos", "jornada", 300000, "alta"],
      ["Estilismo", "jornada", 150000, "media"],
      ["Branding completo", "proyecto", 1200000, "alta"],
      ["Branding parcial", "proyecto", 500000, "media"],
      ["Diseño de identidad visual", "proyecto", 450000, "media"],
      ["Diseño gráfico para redes", "mensual", 180000, "baja"],
      ["Edición de videos", "pieza", 60000, "media"],
      ["Diseño de menú", "proyecto", 120000, "baja"],
      ["Asesoramiento de imagen", "personalizado", 90000, "baja"]
    ];
    return base.map(([name, billingType, referencePrice, complexity]) => ({
      id: uid("srv"),
      name,
      description: `Servicio de ${name.toLowerCase()} para clientes de TRAMA Studio.`,
      referencePrice,
      billingType,
      estimatedHours: billingType === "jornada" ? 8 : 20,
      complexity,
      suggestedPct: 20,
      internalCost: Math.round(referencePrice * 0.15),
      desiredMargin: 40,
      collaboratorPct: 25,
      tramaPct: 75,
      extraCosts: 0,
      taxes: 0,
      notes: "",
      active: true,
      _demo: true,
      createdAt: new Date().toISOString()
    }));
  }

  function demoClients() {
    const base = [
      ["ROOT", "ROOT Sneakers", "activo", "mensual", 450000, 10],
      ["La Nueva", "La Nueva Café", "activo", "mensual", 320000, 5],
      ["Müller", "Müller Indumentaria", "activo", "proyecto único", 900000, 15],
      ["Cliente de branding", "Estudio Almendra", "potencial", "proyecto único", 750000, 1],
      ["Cliente de producción de fotos", "Casa Lino", "pausado", "producción puntual", 380000, 20]
    ];
    return base.map(([name, brand, status, modality, amount, payDay]) => ({
      id: uid("cli"),
      name, brand,
      contactPerson: "Contacto de " + name,
      email: name.toLowerCase().replace(/\s+/g, "") + "@ejemplo.com",
      phone: "+54 9 11 0000-0000",
      social: "@" + name.toLowerCase().replace(/\s+/g, ""),
      startDate: "2026-01-15",
      status,
      servicesContracted: [],
      modality,
      agreedAmount: amount,
      paymentDay: payDay,
      notes: "Cliente de ejemplo (datos ficticios).",
      _demo: true,
      createdAt: new Date().toISOString()
    }));
  }

  function demoCollaborators() {
    const base = [
      ["Carla Ibáñez", "Editora de contenido", "freelance", 25],
      ["Nico Fernández", "Community Manager", "freelance", 35],
      ["Sol Medina", "Fotógrafa", "externa", 45],
      ["Juan Pratto", "Maquillador", "externo", 20]
    ];
    return base.map(([name, role, modality, usualPct]) => ({
      id: uid("col"),
      name, role, modality,
      email: name.toLowerCase().replace(/\s+/g, ".") + "@ejemplo.com",
      phone: "+54 9 11 0000-0000",
      hourlyRate: 8000,
      dayRate: 60000,
      pieceRate: 25000,
      usualPct,
      servicesInvolved: [],
      notes: "",
      _demo: true,
      createdAt: new Date().toISOString()
    }));
  }

  function demoIncomes() {
    const clients = list("clients");
    if (!clients.length) return [];
    const months = ["2026-05", "2026-06", "2026-07"];
    const rows = [];
    clients.forEach((c, i) => {
      months.forEach((m, mi) => {
        if (c.status === "potencial") return;
        const total = c.agreedAmount || 300000;
        const paid = mi === months.length - 1 ? Math.round(total * 0.5) : total;
        rows.push({
          id: uid("inc"),
          clientId: c.id,
          concept: "Honorarios " + c.modality,
          serviceId: "",
          workMonth: m,
          issueDate: m + "-01",
          collectDate: mi === months.length - 1 ? "" : m + "-0" + (5 + (i % 3)),
          totalAmount: total,
          currency: "ARS",
          paymentMethod: i % 2 === 0 ? "Transferencia bancaria" : "Mercado Pago",
          status: paid >= total ? "cobrado" : (paid > 0 ? "parcial" : "pendiente"),
          paidAmount: paid,
          invoiceNumber: `A-000${i}${mi}`,
          notes: "",
          attachmentName: "",
          recurring: c.modality === "mensual",
          nextPaymentDate: "",
          _demo: true,
          createdAt: new Date().toISOString()
        });
      });
    });
    return rows;
  }

  function demoExpenses() {
    const clients = list("clients");
    const cats = DEFAULT_EXPENSE_CATEGORIES;
    const rows = [
      ["2026-07-03", "Colaboradores freelance", "Edición de contenido mensual", null, "general", 60000],
      ["2026-07-05", "Herramientas digitales", "Suscripción Canva + Meta Business", null, "general", 25000],
      ["2026-07-08", "Fotógrafos", "Producción de fotos Müller", clients[2]?.id, "cliente", 150000],
      ["2026-07-10", "Alquiler de locación", "Locación shooting ROOT", clients[0]?.id, "cliente", 90000],
      ["2026-07-12", "Suscripciones", "Adobe Creative Cloud", null, "general", 32000],
      ["2026-07-15", "Gastos administrativos", "Contador mensual", null, "general", 70000]
    ];
    return rows.map(([date, category, description, clientId, scope, amount]) => ({
      id: uid("exp"),
      date, category, description,
      clientId: clientId || "",
      project: "",
      serviceId: "",
      provider: "",
      amount,
      currency: "ARS",
      paymentMethod: "Transferencia bancaria",
      status: "pagado",
      receipt: "",
      notes: "",
      scope,
      _demo: true,
      createdAt: new Date().toISOString()
    }));
  }

  function demoBudgets() { return []; }

  return {
    uid, get, set, list, saveList, insert, update, remove, find,
    getConfig, setConfig,
    getAuth, setAuth, sha256,
    exportBackupFile, importBackupFile, wipeAll,
    seedIfEmpty, removeDemoData,
    DEFAULT_EXPENSE_CATEGORIES, COLLABORATOR_CATEGORIES,
    COLLECTIONS
  };
})();
