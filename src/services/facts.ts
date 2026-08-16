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
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  const userPrompt = `Return strictly a JSON array with 4 objects (with keys: "category", "title", "fact", "detail") for:
1. general: ${NEWSLETTER_CONFIG.categories[0].prompt}
2. economics: ${NEWSLETTER_CONFIG.categories[1].prompt}
3. law: ${NEWSLETTER_CONFIG.categories[2].prompt}
4. psychology: ${NEWSLETTER_CONFIG.categories[3].prompt}

Categories must be: "general", "economics", "law", "psychology".
Output raw JSON array ONLY, no reasoning or markdown wrappers.`;

  const messages: OrcaMessage[] = [
    { role: 'user', content: userPrompt }
  ];

  // 60-second timeout to handle peak queue times
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.5,
        max_tokens: 2048
      }),
      signal: controller.signal
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('OrcaRouter API request timed out after 60 seconds. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

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
