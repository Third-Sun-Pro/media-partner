require("dotenv").config();
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const { extractFromDocuments } = require("./extract");
const { listAgreements, getAgreement, saveAgreement, updateAgreement, deleteAgreement } = require("./agreements");
const { generatePDF } = require("./generate-pdf");

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------
function log(level, msg, extra = {}) {
  const entry = { time: new Date().toISOString(), level, msg, ...extra };
  const out = level === "error" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ["APP_PASSWORD", "ANTHROPIC_API_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    log("error", `Fatal: ${key} environment variable is not set.`);
    process.exit(1);
  }
}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB per file
    files: 10,
  },
});

const APP_PASSWORD = process.env.APP_PASSWORD;
const AUTH_SECRET = APP_PASSWORD;

// ---------------------------------------------------------------------------
// Auth token helpers — HMAC-SHA256 signed cookies
// ---------------------------------------------------------------------------
function createAuthToken() {
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac("sha256", AUTH_SECRET).update(timestamp).digest("hex");
  return `${timestamp}.${hmac}`;
}

function verifyAuthToken(token) {
  if (!token || !AUTH_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [timestamp, signature] = parts;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(timestamp).digest("hex");
  if (expected.length !== signature.length) return false;
  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return false;
  const age = Date.now() - parseInt(timestamp, 10);
  return age < 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.auth_token;
  if (!verifyAuthToken(token)) {
    return res.status(401).json({ error: "Authentication required." });
  }
  next();
}

const isTest = process.env.NODE_ENV === "test";

const apiLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many requests." } });

const loginLimiter = isTest
  ? (req, res, next) => next()
  : rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: "Too many login attempts." } });

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body;
  if (password !== APP_PASSWORD) {
    log("warn", "Failed login attempt");
    return res.status(401).json({ error: "Incorrect password." });
  }
  const token = createAuthToken();
  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,
  });
  log("info", "User logged in");
  res.json({ success: true });
});

app.get("/auth-check", (req, res) => {
  const token = req.cookies && req.cookies.auth_token;
  res.json({ authenticated: verifyAuthToken(token) });
});

app.post("/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Document extraction
// ---------------------------------------------------------------------------
app.post("/extract", requireAuth, apiLimiter, upload.array("files", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  log("info", "Extracting from documents", { fileCount: req.files.length, fileNames: req.files.map(f => f.originalname) });

  try {
    const result = await extractFromDocuments(req.files);
    log("info", "Extraction complete", { partner: result.partner?.name });
    res.json({ success: true, data: result });
  } catch (err) {
    log("error", "Extraction failed", { error: err.message });
    res.status(500).json({ error: "Failed to extract from documents: " + err.message });
  }
});

// ---------------------------------------------------------------------------
// Agreement CRUD
// ---------------------------------------------------------------------------
app.get("/agreements", requireAuth, (req, res) => {
  res.json(listAgreements());
});

app.get("/agreements/:id", requireAuth, (req, res) => {
  const agreement = getAgreement(req.params.id);
  if (!agreement) return res.status(404).json({ error: "Agreement not found." });
  res.json(agreement);
});

app.post("/agreements", requireAuth, (req, res) => {
  const agreement = saveAgreement(req.body);
  log("info", "Agreement saved", { id: agreement.id, partner: agreement.partner?.name });
  res.json(agreement);
});

app.put("/agreements/:id", requireAuth, (req, res) => {
  const agreement = updateAgreement(req.params.id, req.body);
  if (!agreement) return res.status(404).json({ error: "Agreement not found." });
  log("info", "Agreement updated", { id: agreement.id });
  res.json(agreement);
});

app.delete("/agreements/:id", requireAuth, (req, res) => {
  const deleted = deleteAgreement(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Agreement not found." });
  log("info", "Agreement deleted", { id: req.params.id });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------
app.get("/agreements/:id/pdf", requireAuth, apiLimiter, async (req, res) => {
  const agreement = getAgreement(req.params.id);
  if (!agreement) return res.status(404).json({ error: "Agreement not found." });

  try {
    log("info", "Generating PDF", { id: agreement.id, partner: agreement.partner?.name });
    const pdfBuffer = await generatePDF(agreement);
    const filename = `${agreement.partner?.name || "Agreement"}_Media_Partner_Agreement_${agreement.year}.pdf`
      .replace(/[^a-zA-Z0-9_\-.]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    log("error", "PDF generation failed", { error: err.message });
    res.status(500).json({ error: "Failed to generate PDF: " + err.message });
  }
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log("==================================================");
    console.log("  Media Partner Agreement Generator");
    console.log(`  Open http://127.0.0.1:${PORT} in your browser`);
    console.log("==================================================");
  });
}

module.exports = app;
