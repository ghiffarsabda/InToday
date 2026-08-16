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
  actionOrExampleLabel?: string; // "💡 Real-world case:", "✨ Faith in Action:", "⚡ Do this today:"
  example: string; // The action or example text
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
  // Secrets
  ORCAROUTER_API_KEY: string;
  RESEND_API_KEY: string;

  // Environment variables
  FROM_EMAIL?: string;
  ORCAROUTER_BASE_URL?: string;
  ORCAROUTER_MODEL?: string;
}
