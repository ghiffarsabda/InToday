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

  // Primary Google Gemini API
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;

  // Backup / Legacy Keys
  OPENROUTER_API_KEY?: string;
  ORCAROUTER_API_KEY?: string;
  RESEND_API_KEY: string;

  // Environment variables
  FROM_EMAIL?: string;
  OPENROUTER_BASE_URL?: string;
  ORCAROUTER_BASE_URL?: string;
  OPENROUTER_MODEL?: string;
  ORCAROUTER_MODEL?: string;
  ADMIN_KEY?: string;
}
