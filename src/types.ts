export interface FactItem {
  category: 'general' | 'economics' | 'law' | 'psychology';
  categoryLabel: string;
  emoji: string;
  title: string;
  fact: string;
  detail: string;
}

export interface NewsletterData {
  date: string;
  formattedDate: string;
  facts: FactItem[];
}

export interface Env {
  // Secrets (stored via wrangler secret put or .dev.vars)
  ORCAROUTER_API_KEY: string;
  RESEND_API_KEY: string;

  // Environment variables (from wrangler.jsonc or .dev.vars)
  FROM_EMAIL?: string;
  ORCAROUTER_BASE_URL?: string;
  ORCAROUTER_MODEL?: string;
}
