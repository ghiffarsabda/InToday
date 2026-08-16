# InToday ☀️

A private, automated, zero-database daily intellectual newsletter powered by **Cloudflare Workers**, **OrcaRouter** (AI), **Resend**, and **Cron Triggers**.

---

## ⚡️ Architecture & Flow

1. **Daily Cron Trigger (`wrangler.jsonc`)**: Runs every day (default: `0 8 * * *` / 08:00 UTC).
2. **OrcaRouter AI Call**: Queries OrcaRouter's OpenAI-compatible inference endpoint to generate 4 distinct, non-cliché fun facts:
   - 🌍 **Anything & Everything**: General curiosity, nature, science, history
   - 📈 **Economics**: Surprising market dynamics, incentives, financial history
   - ⚖️ **Law & Governance**: Legal precedents, unusual legislation, constitutional quirks
   - 🧠 **Psychology**: Cognitive biases, behavioral experiments, human quirks
3. **GitHub-Flavored Markdown Aesthetic**: Generates clean HTML & plain-text emails styled with GitHub's minimalist markdown design (subtle borders, monospaced badges, clean blockquotes, high legibility).
4. **Resend Dispatch**: Dispatches the daily edition to your hardcoded subscriber list.
5. **Web Preview & Dashboard**: Provides a built-in UI at `/` and `/preview` for instant testing without waiting for the cron.

---

## 📁 Project Structure

```
InToday/
├── src/
│   ├── config.ts              # Hardcoded recipient list & category configurations
│   ├── types.ts               # Data models and Env interface
│   ├── index.ts               # Worker entrypoint (scheduled cron + fetch handler)
│   ├── services/
│   │   ├── facts.ts           # OrcaRouter API integration
│   │   └── email.ts           # Resend dispatch service
│   └── templates/
│       └── newsletter.ts      # GitHub-flavored HTML & text email templates
├── .dev.vars.example          # Sample environment variables
├── wrangler.jsonc             # Cloudflare Worker configuration & Cron triggers
├── package.json
└── tsconfig.json
```

---

## 🚀 Quick Setup & Local Development

### 1. Configure Secrets

Create a `.dev.vars` file for local development:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` with your API keys:

```ini
ORCAROUTER_API_KEY=your_orcarouter_api_key_here
RESEND_API_KEY=re_your_resend_api_key_here
```

### 2. Configure Subscribers

Open [`src/config.ts`](file:///home/ghiffar-sabda/InToday/src/config.ts) and add your list of recipient emails:

```typescript
export const RECIPIENT_EMAILS: string[] = [
  'you@example.com',
  'friend@example.com'
];
```

### 3. Start Local Development Server

```bash
npm run dev
```

Visit:
- **Dashboard:** `http://localhost:8787/` (Check status, trigger manual send)
- **Live HTML Preview:** `http://localhost:8787/preview` (Inspect the rendered email)
- **Facts JSON API:** `http://localhost:8787/api/facts`

---

## 🚢 Production Deployment

### 1. Set Production Secrets

Upload your secrets securely to Cloudflare:

```bash
npx wrangler secret put ORCAROUTER_API_KEY
npx wrangler secret put RESEND_API_KEY
```

### 2. Deploy Worker

```bash
npm run deploy
```

The worker will automatically run every day at 08:00 UTC via Cloudflare Cron Triggers. You can adjust the schedule in [`wrangler.jsonc`](file:///home/ghiffar-sabda/InToday/wrangler.jsonc).
