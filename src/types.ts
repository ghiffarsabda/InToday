export interface FactItem {
  category: 'general' | 'economics' | 'law' | 'psychology';
  categoryLabel: string;
  emoji: string;
  title: string;
  fact: string;
  explanation: string;
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
  // Secrets
  ORCAROUTER_API_KEY: string;
  RESEND_API_KEY: string;

  // Environment variables
  FROM_EMAIL?: string;
  ORCAROUTER_BASE_URL?: string;
  ORCAROUTER_MODEL?: string;
}
