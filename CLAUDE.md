# Media Partner Generator

UAF (Utah Arts Festival) Media Partner Agreement Generator for Jocelyn. Uploads partner docs, AI extracts deliverables, generates branded PDF agreements.

## What It Does

- Jocelyn uploads partner documents (PDF, Word, Excel, etc.)
- Claude extracts deliverables, sponsorship level, dates, partner contact info
- Renders a UAF-branded HTML agreement that the browser turns into a PDF (client-side via html2pdf.js)
- Stores agreements in a JSON file; supports list/view/edit/delete

## Tech Stack

Node.js + Express 5, Anthropic SDK (`claude-haiku-4-5-20251001` by default), multer (in-memory uploads), xlsx (Excel parsing), express-rate-limit, cookie-parser. Vanilla HTML/CSS/JS frontend with html2pdf.js for client-side PDF rendering. Vitest + Supertest for tests.

## How to Run

```bash
npm install
node server.js          # Starts on port 3000 (override with PORT env var)
npm test                # Run tests
```

## Environment Variables (.env)

- `APP_PASSWORD` — required (team login; also used as HMAC auth secret)
- `ANTHROPIC_API_KEY` — required
- `CLAUDE_MODEL` — optional, defaults to `claude-haiku-4-5-20251001`
- `DATA_DIR` — **must be set in production** to a path outside the deploy folder (e.g. `../data`). Defaults to `./data` which lives inside the deploy folder and gets wiped on every Hostinger deploy. The `.env.example` is missing this — verify the production `.env` has it.
- `PORT` — optional, defaults to 3000
- `NODE_ENV` — set to `production` on deploy

Server **exits on startup** if `APP_PASSWORD` or `ANTHROPIC_API_KEY` is missing.

## Key Files

- `server.js` — Express app, auth, rate limiting, upload + agreement endpoints
- `extract.js` — Anthropic calls; pulls deliverables / partner info from uploaded docs
- `generate-pdf.js` — Builds the agreement HTML from `templates/agreement.html`
- `agreements.js` — JSON-file CRUD for stored agreements
- `templates/agreement.html` — UAF-branded agreement template (rendered server-side, PDF-ified client-side)
- `public/index.html` — Single-page web UI
- `public/uaf-logo.png` / `uaf-logo-black.png` — UAF branding assets
- `data/agreements.json` — Stored agreements (gitignored; lives outside deploy folder in production)
- `tests/` — Vitest suite

## Endpoints

- `POST /login` / `GET /auth-check` / `POST /logout` — HMAC cookie auth (24h)
- `POST /extract` — upload partner docs (max 10 files, 25 MB each) → extracted JSON
- `GET /agreements` / `GET /agreements/:id` — list / fetch agreements
- `POST /agreements` — save a new agreement
- `GET /agreements/:id/pdf-html` — server-rendered HTML for the PDF (the browser converts to PDF via html2pdf.js)

## Important Context

- **Hostinger can't run Chrome/Puppeteer** — that's why PDF generation is client-side via html2pdf.js. Don't switch to Puppeteer/Playwright for PDFs without first confirming the host can run a browser.
- Tool is **Jocelyn-specific**, only for her UAF work — not part of the general client pipeline.
- File uploads use **memory storage** (no temp files written to disk).
- Rate limited: login attempts and `/extract` calls.
- Future feature ideas (sponsorship templates, duplicate agreement, status tracking, year-over-year comparison) live in memory at `media_partner_future.md`.

## Deployment

Deployed at **mediaagreements.tsapp.us** on Hostinger (auto-deploy from GitHub push).

`.env` created **manually** on the server. Hostinger wipes the app directory on deploy — `data/agreements.json` should live outside the deploy folder if you want it to persist (verify path before any push that might reset it).

## Git

- Remote: github.com/Third-Sun-Pro/media-partner (public — required for scheduled remote agents)
