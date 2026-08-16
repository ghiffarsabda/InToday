export type FactCategory =
  | 'science'
  | 'economics'
  | 'law'
  | 'psychology'
  | 'history'
  | 'islam'
  | 'health';

export interface FactItem {
  category: FactCategory;
  categoryLabel: string;
  emoji: string;
  title: string;
  fact: string;
  explanation: string;
  actionOrExampleLabel?: string;
  example: string;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface NewsletterData {
  date: string;
  formattedDate: string;
  facts: FactItem[];
  glossary: GlossaryItem[];
}

export interface Env {
  // Cloudflare D1 SQLite Database
  DB?: D1Database;

  // Secrets
  ORCAROUTER_API_KEY: string;
  RESEND_API_KEY: string;

  // Environment variables
  FROM_EMAIL?: string;
  ORCAROUTER_BASE_URL?: string;
  ORCAROUTER_MODEL?: string;
}
