const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "templates", "agreement.html");

function formatCurrency(val) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val || 0);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildDeliverableRows(items) {
  if (!items || items.length === 0) return "<li>TBD</li>";
  return items
    .map((item) => {
      let text = "";
      if (item.qty) text += `${escapeHtml(item.qty)} `;
      text += escapeHtml(item.description);
      if (item.dates) text += ` (${escapeHtml(item.dates)})`;
      if (item.value) text += ` — <strong>${formatCurrency(item.value)} value</strong>`;
      return `<li>${text}</li>`;
    })
    .join("\n");
}

function generateAgreementHTML(agreement) {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const { partner, financialSummary, partnerDeliverables, festivalDeliverables } = agreement;

  // Build logo as base64 data URI for PDF rendering
  const logoPath = path.join(__dirname, "public", "uaf-logo-black.png");
  let logoDataUri = "";
  try {
    const logoBuffer = fs.readFileSync(logoPath);
    logoDataUri = `data:image/png;base64,${logoBuffer.toString("base64")}`;
  } catch {
    logoDataUri = "";
  }

  const replacements = {
    "{{LOGO_DATA_URI}}": logoDataUri,
    "{{YEAR}}": agreement.year || new Date().getFullYear(),
    "{{DATE}}": agreement.date || new Date().toISOString().split("T")[0],
    "{{PARTNER_NAME}}": escapeHtml(partner?.name || ""),
    "{{PARTNER_CONTACT}}": escapeHtml(partner?.contact || ""),
    "{{PARTNER_EMAIL}}": escapeHtml(partner?.email || ""),
    "{{PARTNER_PHONE_DISPLAY}}": partner?.phone ? `, ${escapeHtml(partner.phone)}` : "",
    "{{FESTIVAL_CASH_SPEND}}": formatCurrency(financialSummary?.festivalCashSpend),
    "{{PARTNER_INKIND_VALUE}}": formatCurrency(financialSummary?.partnerInKindValue),
    "{{TOTAL_MEDIA_VALUE}}": formatCurrency(financialSummary?.totalMediaValue),
    "{{PAYMENT_DUE_DATE}}": escapeHtml(agreement.paymentDueDate || ""),
    "{{PARTNER_DELIVERABLES}}": buildDeliverableRows(partnerDeliverables),
    "{{FESTIVAL_DELIVERABLES}}": buildDeliverableRows(festivalDeliverables),
  };

  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(key, value);
  }

  return html;
}

module.exports = { generateAgreementHTML };
