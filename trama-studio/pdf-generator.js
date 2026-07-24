/* ==========================================================================
   TRAMA Studio — pdf-generator.js
   Generación de PDFs con jsPDF: presupuestos para clientes (sin datos
   internos de rentabilidad/colaboradores) y reportes internos.
   ========================================================================== */

const PdfGen = (() => {
  const INK = [26, 26, 24];
  const WARM = [122, 112, 96];
  const LINE = [216, 210, 196];
  const CREAM = [239, 233, 221];

  function newDoc() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: "pt", format: "a4" });
  }

  function money(n) { return App.fmtMoney(n); }

  function addHeader(doc, cfg, pageW, margin) {
    let y = margin;
    if (cfg.logoDataUrl) {
      try { doc.addImage(cfg.logoDataUrl, "PNG", margin, y - 6, 34, 34); } catch (e) { /* logo inválido, se omite */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(cfg.agencyName || "TRAMA Studio", margin + (cfg.logoDataUrl ? 44 : 0), y + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...WARM);
    doc.text("Estrategia · Diseño · Moda · Imagen · Contenido · Comunicación", margin + (cfg.logoDataUrl ? 44 : 0), y + 26);
    y += 46;
    doc.setDrawColor(...LINE);
    doc.line(margin, y, pageW - margin, y);
    return y + 24;
  }

  function addFooter(doc, cfg, pageW, pageH, margin) {
    doc.setDrawColor(...LINE);
    doc.line(margin, pageH - 46, pageW - margin, pageH - 46);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...WARM);
    const contact = [cfg.email, cfg.phone, cfg.instagram].filter(Boolean).join("   ·   ");
    doc.text(contact, margin, pageH - 30);
    doc.text(cfg.agencyName || "TRAMA Studio", pageW - margin, pageH - 30, { align: "right" });
  }

  function checkPageBreak(doc, y, margin, pageH, needed = 60) {
    if (y + needed > pageH - 60) {
      doc.addPage();
      return margin;
    }
    return y;
  }

  // ---- Presupuesto para el cliente (sin datos internos) ------------------
  function generateClientBudgetPDF(budget, cfg) {
    const doc = newDoc();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = addHeader(doc, cfg, pageW, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...INK);
    doc.text("Propuesta de trabajo", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...WARM);
    doc.text(budget.projectName || "Proyecto sin nombre", margin, y);
    y += 28;

    // Datos del cliente / proyecto
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const infoRows = [
      ["Cliente", budget.client?.name || "-"],
      ["Empresa / Marca", budget.client?.brand || "-"],
      ["Fecha", budget.date || "-"],
      ["Validez de la propuesta", (budget.validity || "15") + " días"],
      ["Contacto", [budget.client?.email, budget.client?.phone].filter(Boolean).join(" · ") || "-"]
    ];
    infoRows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label + ":", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value), margin + 140, y);
      y += 15;
    });
    y += 10;

    if (budget.objective) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text("Objetivo general", margin, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...WARM);
      const lines = doc.splitTextToSize(budget.objective, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 12 + 12;
      doc.setTextColor(...INK);
    }

    // Servicios incluidos
    y = checkPageBreak(doc, y, margin, pageH, 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Servicios incluidos", margin, y);
    y += 16;

    const colX = [margin, margin + 260, pageW - margin - 90];
    doc.setFillColor(...CREAM);
    doc.rect(margin, y - 11, pageW - margin * 2, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("SERVICIO", colX[0] + 4, y + 3);
    doc.text("DESCRIPCIÓN", colX[1], y + 3);
    doc.text("INVERSIÓN", colX[2], y + 3, { align: "left" });
    y += 20;

    let subtotal = 0;
    (budget.items || []).forEach(item => {
      const lineTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
      subtotal += lineTotal;
      y = checkPageBreak(doc, y, margin, pageH, 40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(item.name || "-", colX[0] + 4, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.7);
      doc.setTextColor(...WARM);
      const desc = doc.splitTextToSize(item.description || "", 230);
      doc.text(desc, colX[1], y);
      doc.setTextColor(...INK);
      doc.setFont("helvetica", "bold");
      doc.text(money(lineTotal), colX[2], y);
      y += Math.max(desc.length * 11, 16) + 6;
      doc.setDrawColor(...LINE);
      doc.line(margin, y - 4, pageW - margin, y - 4);
    });
    y += 10;

    // Totales
    const discount = Number(budget.discountTotal) || 0;
    const extras = Number(budget.extraCostsTotal) || 0;
    const taxPct = Number(budget.taxPct) || 0;
    const preTax = subtotal - discount + extras;
    const taxAmount = preTax * (taxPct / 100);
    const total = preTax + taxAmount;
    const advancePct = Number(budget.advancePct) || 0;
    const advance = total * (advancePct / 100);
    const balance = total - advance;

    y = checkPageBreak(doc, y, margin, pageH, 120);
    const totalsX = pageW - margin - 200;
    const printTotalRow = (label, value, bold) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 11 : 9.5);
      doc.text(label, totalsX, y);
      doc.text(money(value), pageW - margin, y, { align: "right" });
      y += bold ? 20 : 15;
    };
    printTotalRow("Subtotal", subtotal, false);
    if (discount) printTotalRow("Descuento", -discount, false);
    if (extras) printTotalRow("Gastos adicionales", extras, false);
    if (taxPct) printTotalRow(`Impuestos (${taxPct}%)`, taxAmount, false);
    doc.setDrawColor(...INK);
    doc.line(totalsX, y - 4, pageW - margin, y - 4);
    y += 8;
    printTotalRow("TOTAL", total, true);
    if (advancePct) {
      printTotalRow(`Anticipo (${advancePct}%)`, advance, false);
      printTotalRow("Saldo restante", balance, false);
    }
    y += 10;

    // Condiciones
    y = checkPageBreak(doc, y, margin, pageH, 100);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Forma de pago y condiciones", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(...WARM);
    const condText = (budget.conditions || "").trim();
    const condLines = doc.splitTextToSize(condText, pageW - margin * 2);
    condLines.forEach(line => {
      y = checkPageBreak(doc, y, margin, pageH, 14);
      doc.text(line, margin, y);
      y += 12;
    });

    addFooter(doc, cfg, pageW, pageH, margin);
    return doc;
  }

  function downloadClientBudget(budget, cfg) {
    const doc = generateClientBudgetPDF(budget, cfg);
    const name = (budget.projectName || "presupuesto").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    doc.save(`presupuesto-${name}.pdf`);
  }

  function printClientBudget(budget, cfg) {
    const doc = generateClientBudgetPDF(budget, cfg);
    doc.autoPrint && doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  }

  // ---- Reportes internos --------------------------------------------------
  function generateReportPDF(title, subtitle, sections, cfg) {
    const doc = newDoc();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = addHeader(doc, cfg, pageW, margin);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...INK);
    doc.text(title, margin, y);
    y += 16;
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...WARM);
      doc.text(subtitle, margin, y);
      y += 20;
    } else { y += 10; }

    sections.forEach(section => {
      y = checkPageBreak(doc, y, margin, pageH, 60);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(...INK);
      doc.text(section.heading, margin, y);
      y += 14;

      if (section.rows && section.rows.length) {
        section.rows.forEach(row => {
          y = checkPageBreak(doc, y, margin, pageH, 16);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(...INK);
          doc.text(String(row[0]), margin, y);
          doc.setTextColor(...WARM);
          doc.text(String(row[1]), pageW - margin, y, { align: "right" });
          y += 14;
        });
      }
      y += 10;
      doc.setDrawColor(...LINE);
      doc.line(margin, y - 6, pageW - margin, y - 6);
    });

    addFooter(doc, cfg, pageW, pageH, margin);
    return doc;
  }

  function downloadReportPDF(title, subtitle, sections, cfg, filename) {
    const doc = generateReportPDF(title, subtitle, sections, cfg);
    doc.save(filename || "reporte-trama.pdf");
  }

  // ---- Exportación CSV -----------------------------------------------------
  function downloadCSV(filename, headers, rows) {
    const escape = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(escape).join(";"), ...rows.map(r => r.map(escape).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return { generateClientBudgetPDF, downloadClientBudget, printClientBudget, generateReportPDF, downloadReportPDF, downloadCSV };
})();
