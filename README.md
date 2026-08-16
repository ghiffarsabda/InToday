# InToday ☀️

A private, automated, intelligent daily newsletter briefing powered by **Cloudflare Workers**, **Google Gemini 3.1 Flash-Lite**, **Cloudflare D1 SQLite**, and **Direct Gmail SMTP / Resend**.

---

## ⚡️ Architecture & Capabilities

```
               ┌──────────────────────────────────────────────┐
               │    Cloudflare Cron (Daily 06:00 AM WIB)       │
               └──────────────────────┬───────────────────────┘
                                      │
                                      ▼
               ┌──────────────────────────────────────────────┐
               │        Cloudflare Worker (`src/index.ts`)     │
               └──────┬────────────────┬───────────────┬──────┘
                      │                │               │
                      ▼                ▼               ▼
           ┌──────────────────┐ ┌──────────────┐ ┌────────────────────┐
           │ Cloudflare D1    │ │ Google Gemini│ │ Cloudflare Sockets │
           │ SQLite Memory    │ │ 3.1 Flash    │ │ Gmail SMTP / Resend│
           │ (Subscribers &   │ │ (7 Insights +│ │ (Direct TLS 465    │
           │ Topic History)   │ │ 3 Glossary)  │ │  from Gmail)       │
           └──────────────────┘ └──────────────┘ └────────────────────┘
```

1. **Daily Cron Trigger (`0 23 * * *`)**:
   - Runs automatically every morning at **06:00 AM WIB (23:00 UTC)**.
2. **Google Gemini 3.1 Flash-Lite AI Pipeline**:
   - Generates **7 micro-facts** across 7 distinct categories (*Anything & Everything, Economics, Law & Governance, Psychology, Tech & Computing, History & Civilizations, Philosophy & Human Nature*).
   - Generates **3 developer & tech glossary items** with concise definitions and context.
3. **Cloudflare D1 SQLite Topic Deduplication (Title-Only)**:
   - Queries recent topic titles from D1 SQLite memory to prevent repeated topics.
   - Title-only query saves ~85% input tokens on daily generation.
4. **Direct Gmail SMTP Dispatch**:
   - Connects via native TLS (`cloudflare:sockets`) to `smtp.gmail.com:465`.
   - Sends directly from your real Gmail address (`ghiffarsabda@gmail.com`) to all subscribers with genuine DKIM/SPF signatures (no third-party domain verification needed).
   - Falls back gracefully to Resend API if configured.
5. **Interactive Web Control Center**:
   - **Dashboard (`/`)**: Real-time status, live animated progress bar, stopwatch timer, and step-by-step dispatch checklist.
   - **Live Preview (`/preview`)**: Full visual rendering of today's newsletter with one-click test dispatch.
   - **Mailing List Manager (`/subscribers`)**: Add and remove subscribers via web UI or REST API.
   - **Topic History Viewer (`/history`)**: Browse past generated topics stored in SQLite.
   - **Admin Security Gate**: Protected by `ADMIN_KEY` with secure `HttpOnly` sessions.

---

## 📁 Project Structure

```
InToday/
├── src/
│   ├── config.ts              # Category configurations & fallback defaults
│   ├── types.ts               # TypeScript interfaces & Cloudflare Env types
│   ├── index.ts               # Worker entrypoint (Cron handler + Web Control Center + Auth)
│   ├── services/
│   │   ├── db.ts              # Cloudflare D1 SQLite operations (subscribers & history)
│   │   ├── gemini.ts          # Google Gemini 3.1 Flash-Lite AI service & JSON parser
│   │   ├── smtp.ts            # Native Gmail SMTP over Cloudflare Sockets (TLS 465)
│   │   ├── email.ts           # Unified email dispatch (Gmail SMTP primary + Resend fallback)
│   │   └── facts.ts           # AI content router & multi-provider fallback
│   └── templates/
│       └── newsletter.ts      # GitHub-flavored HTML & plaintext email templates
├── .dev.vars.example          # Sample environment variables template
├── wrangler.jsonc             # Cloudflare Worker configuration, D1 database & Cron trigger
├── package.json
└── tsconfig.json
```

---

## 🔑 Environment Variables & Secrets

| Secret / Variable | Description | Required |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key | **Yes** (Primary AI) |
| `GMAIL_USER` | Your Gmail address (e.g. `you@gmail.com`) | **Yes** (For Gmail SMTP) |
| `GMAIL_APP_PASSWORD` | 16-letter Google App Password | **Yes** (For Gmail SMTP) |
| `ADMIN_KEY` | Admin password for Web Control Center | **Yes** (Auth gate) |
| `RESEND_API_KEY` | Resend API Key | Optional (Fallback) |
| `OPENROUTER_API_KEY` | OpenRouter API Key | Optional (Fallback AI) |
| `ORCAROUTER_API_KEY` | OrcaRouter API Key | Optional (Fallback AI) |

---

## 🚀 Quick Setup & Local Development

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/ghiffarsabda/InToday.git
cd InToday
npm install
```

### 2. Configure Local Secrets

Create a `.dev.vars` file in the root directory:

```bash
cp .dev.vars.example .dev.vars
```

Fill in your secrets in `.dev.vars`:

```ini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_letter_app_password
ADMIN_KEY=your_admin_password
RESEND_API_KEY=re_your_resend_key
```

### 3. Initialize Local D1 Database

```bash
# Create local tables
npx wrangler d1 execute intoday-db --local --command "
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"
```

### 4. Start Local Dev Server

```bash
npm run dev
```

Visit **`http://localhost:8787`** in your browser and enter your `ADMIN_KEY` to access the Control Center!

---

## 🚢 Production Deployment

### 1. Create Cloudflare D1 Database

```bash
npx wrangler d1 create intoday-db
```

Copy the generated `database_id` into [`wrangler.jsonc`](file:///home/ghiffar-sabda/InToday/wrangler.jsonc).

### 2. Initialize Remote D1 Tables

```bash
npx wrangler d1 execute intoday-db --remote --command "
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"
```

### 3. Set Production Secrets

```bash
echo "your_gemini_api_key" | npx wrangler secret put GEMINI_API_KEY
echo "your_gmail@gmail.com" | npx wrangler secret put GMAIL_USER
echo "your_app_password" | npx wrangler secret put GMAIL_APP_PASSWORD
echo "your_admin_password" | npx wrangler secret put ADMIN_KEY
echo "re_your_resend_key" | npx wrangler secret put RESEND_API_KEY
```

### 4. Deploy to Cloudflare Workers

```bash
npm run deploy
```

---

## 🌐 Web Endpoints & REST APIs

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Main Control Center dashboard with live dispatch progress tracker |
| `/preview` | `GET` | Live rendered HTML preview of today's newsletter |
| `/subscribers` | `GET` | Interactive mailing list manager |
| `/history` | `GET` | SQLite topic history viewer |
| `/send` | `POST` | Manually trigger generation & dispatch |
| `/login` | `GET/POST`| Security verification gate |
| `/logout` | `GET` | Clear session cookie |
| `/api/subscribers` | `GET/POST/DELETE` | REST API for managing subscribers |
| `/api/history` | `GET` | JSON endpoint for topic history |
| `/api/facts` | `GET` | JSON endpoint for today's generated facts |

---

## 📄 License

MIT © [Ghiffar Sabda](https://github.com/ghiffarsabda)
