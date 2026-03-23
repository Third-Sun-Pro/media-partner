const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const AGREEMENTS_PATH = path.join(DATA_DIR, "agreements.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll() {
  try {
    const data = fs.readFileSync(AGREEMENTS_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeAll(entries) {
  ensureDataDir();
  fs.writeFileSync(AGREEMENTS_PATH, JSON.stringify(entries, null, 2));
}

function listAgreements() {
  const entries = readAll();
  return entries.map(({ id, year, date, status, partner, financialSummary, createdAt, updatedAt }) => ({
    id, year, date, status,
    partnerName: partner?.name || "Unknown",
    totalValue: financialSummary?.totalMediaValue || 0,
    createdAt, updatedAt,
  }));
}

function getAgreement(id) {
  return readAll().find((e) => e.id === id) || null;
}

function saveAgreement(data) {
  const entries = readAll();
  const agreement = {
    id: crypto.randomUUID(),
    year: data.year || new Date().getFullYear(),
    date: data.date || new Date().toISOString().split("T")[0],
    status: data.status || "draft",
    partner: data.partner || {},
    financialSummary: data.financialSummary || {},
    partnerDeliverables: data.partnerDeliverables || [],
    festivalDeliverables: data.festivalDeliverables || [],
    paymentDueDate: data.paymentDueDate || "",
    notes: data.notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  entries.push(agreement);
  writeAll(entries);
  return agreement;
}

function updateAgreement(id, data) {
  const entries = readAll();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  entries[idx] = {
    ...entries[idx],
    ...data,
    id, // preserve original id
    createdAt: entries[idx].createdAt, // preserve original creation date
    updatedAt: new Date().toISOString(),
  };
  writeAll(entries);
  return entries[idx];
}

function deleteAgreement(id) {
  const entries = readAll();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  writeAll(entries);
  return true;
}

module.exports = { listAgreements, getAgreement, saveAgreement, updateAgreement, deleteAgreement };
