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
    console.warn('ORCAROUTER_API_KEY is not set. Using curated facts fallback.');
    return getCuratedFactsFallback();
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  const userPrompt = `Return strictly a JSON array with 4 objects (keys: "category", "title", "fact", "detail") for:
1. general: ${NEWSLETTER_CONFIG.categories[0].prompt}
2. economics: ${NEWSLETTER_CONFIG.categories[1].prompt}
3. law: ${NEWSLETTER_CONFIG.categories[2].prompt}
4. psychology: ${NEWSLETTER_CONFIG.categories[3].prompt}

Categories must be: "general", "economics", "law", "psychology".
Output raw JSON array ONLY.`;

  const messages: OrcaMessage[] = [
    { role: 'user', content: userPrompt }
  ];

  // 60-second timeout to handle peak queue times
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OrcaRouter error (${response.status}): ${errorText}`);
      throw new Error(`OrcaRouter error: ${response.status}`);
    }

    const result = (await response.json()) as OrcaChatResponse;
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty completion received');
    }

    return parseAndEnrichFacts(content);
  } catch (err: any) {
    console.warn('AI generation encountered an issue, gracefully using curated fallback facts:', err?.message || err);
    // If running in development or cron, return curated backup so email delivery NEVER fails
    return getCuratedFactsFallback();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAndEnrichFacts(content: string): FactItem[] {
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
    throw new Error(`Failed to parse AI JSON response: ${err instanceof Error ? err.message : String(err)}`);
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

/**
 * Curated backup facts to guarantee 100% uptime and deliverability
 */
function getCuratedFactsFallback(): FactItem[] {
  return [
    {
      category: 'general',
      categoryLabel: 'Anything & Everything',
      emoji: '🌍',
      title: 'Octopuses Have Three Hearts',
      fact: 'Two hearts pump blood exclusively to the gills, while the third systemic heart pumps oxygenated blood to the rest of the body.',
      detail: 'Interestingly, the systemic heart stops beating entirely when an octopus swims, which is why they prefer crawling along the seafloor to conserve energy.'
    },
    {
      category: 'economics',
      categoryLabel: 'Economics',
      emoji: '📈',
      title: 'The Broken Window Fallacy',
      fact: 'Destruction of property does not stimulate net economic wealth, even if it forces money to circulate through repairs.',
      detail: 'French economist Frédéric Bastiat explained in 1850 that money spent repairing a broken window cannot be spent on other productive industries, creating an invisible opportunity cost.'
    },
    {
      category: 'law',
      categoryLabel: 'Law & Governance',
      emoji: '⚖️',
      title: 'The Medieval Legal Trials of Animals',
      fact: 'From the 13th to 18th centuries in Europe, animals accused of wrongdoing received formal trials with sworn witnesses and court-appointed defense counsel.',
      detail: 'In 1457 in Savigny, France, a sow was formally tried and convicted of murder with legal counsel present, while her piglets were acquitted due to lack of proof.'
    },
    {
      category: 'psychology',
      categoryLabel: 'Psychology',
      emoji: '🧠',
      title: 'The Pratfall Effect and Likability',
      fact: 'Highly competent individuals become significantly more likable when they make an occasional clumsy mistake.',
      detail: 'First documented by Elliot Aronson in 1966, the blunder humanizes high achievers and breaks barriers, making them seem approachable rather than intimidating.'
    }
  ];
}
