import { Env, FactItem } from '../types';
import { NEWSLETTER_CONFIG } from '../config';

interface OrcaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OrcaChatResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
}

export async function fetchDailyFacts(env: Env): Promise<FactItem[]> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('ORCAROUTER_API_KEY is not configured in worker environment.');
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'orcarouter/auto';

  const systemPrompt = `You are a world-class curator and researcher for a private intellectual daily newsletter called "InToday".
Your mission is to find four genuinely surprising, mind-expanding, and strictly accurate fun facts.
Avoid cliché facts that everyone already knows. Provide deep, fascinating context.

You MUST respond strictly with a valid JSON array of objects, with no extra conversational text.
Each object must have the following structure:
[
  {
    "category": "general",
    "title": "Short catchy title (3-6 words)",
    "fact": "A 1-2 sentence core surprising fact.",
    "detail": "2-3 sentences providing historical context, underlying mechanism, or practical takeaway."
  },
  {
    "category": "economics",
    "title": "Short catchy title",
    "fact": "Core fact about economics/finance/markets.",
    "detail": "Deeper context and real-world implication."
  },
  {
    "category": "law",
    "title": "Short catchy title",
    "fact": "Core fact about law/legal history/jurisprudence.",
    "detail": "Deeper context and significance."
  },
  {
    "category": "psychology",
    "title": "Short catchy title",
    "fact": "Core fact about human psychology/cognitive bias/neuroscience.",
    "detail": "Deeper context and how it affects everyday life."
  }
]`;

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const userPrompt = `Generate today's (${todayStr}) 4 facts across the 4 required categories:
1. General/Anything: ${NEWSLETTER_CONFIG.categories[0].prompt}
2. Economics: ${NEWSLETTER_CONFIG.categories[1].prompt}
3. Law: ${NEWSLETTER_CONFIG.categories[2].prompt}
4. Psychology: ${NEWSLETTER_CONFIG.categories[3].prompt}

Return ONLY the raw JSON array.`;

  const messages: OrcaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 8192
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OrcaRouter API request failed with status ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as OrcaChatResponse;
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OrcaRouter returned an empty completion response.');
  }

  return parseAndEnrichFacts(content);
}

function parseAndEnrichFacts(content: string): FactItem[] {
  // Strip Markdown code blocks (e.g. ```json ... ```)
  let cleanJson = content.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let parsed: Array<{
    category: string;
    title: string;
    fact: string;
    detail: string;
  }>;

  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err instanceof Error ? err.message : String(err)}\nRaw content: ${content}`);
  }

  const categoryMap: Record<string, { label: string; emoji: string }> = {
    general: { label: 'Anything & Everything', emoji: '🌍' },
    economics: { label: 'Economics', emoji: '📈' },
    law: { label: 'Law & Governance', emoji: '⚖️' },
    psychology: { label: 'Psychology', emoji: '🧠' }
  };

  const facts: FactItem[] = [];

  for (const cat of ['general', 'economics', 'law', 'psychology'] as const) {
    const item = parsed.find(p => p.category?.toLowerCase() === cat) || parsed.shift();
    const meta = categoryMap[cat];

    facts.push({
      category: cat,
      categoryLabel: meta.label,
      emoji: meta.emoji,
      title: item?.title || `Insight on ${meta.label}`,
      fact: item?.fact || 'An interesting discovery waiting to be explored.',
      detail: item?.detail || 'Stay curious and keep exploring the nuances of the world.'
    });
  }

  return facts;
}
