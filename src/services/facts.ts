import { Env, FactCategory, FactItem, GlossaryItem } from '../types';
import { getRecentTopics, saveGeneratedFacts, HistoryRecord } from './db';

interface OrcaChatResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content: string;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface GeneratedContent {
  facts: FactItem[];
  glossary: GlossaryItem[];
}

export const CATEGORY_DEFINITIONS: Record<FactCategory, { label: string; emoji: string; actionLabel: string }> = {
  science: { label: 'Science', emoji: '🔬', actionLabel: '💡 Real-world case:' },
  economics: { label: 'Economics', emoji: '📈', actionLabel: '💡 Real-world case:' },
  law: { label: 'Law & Governance', emoji: '⚖️', actionLabel: '💡 Real-world case:' },
  psychology: { label: 'Psychology', emoji: '🧠', actionLabel: '💡 Real-world case:' },
  history: { label: 'History', emoji: '🏛️', actionLabel: '💡 Real-world case:' },
  islam: { label: 'Islam & Faith', emoji: '🌙', actionLabel: '✨ Faith in Action:' },
  health: { label: 'Health & Body', emoji: '🩺', actionLabel: '⚡ Actionable step for today:' }
};

// In-memory fallback tracking when running without D1
const inMemoryHistory: Array<{ category: string; title: string; fact: string }> = [];

const FREE_MODELS = [
  'orcarouter/free',
  'deepseek/deepseek-v4-flash-free',
  'qwen/qwen3.8-27b-free',
  'deepseek/deepseek-v4-pro-free'
];

/**
 * Strictly generates fresh, live AI content while checking the SQLite history database
 * to guarantee that no previous topic is ever repeated.
 */
export async function fetchDailyContent(env: Env, maxRetries = 3): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('ORCAROUTER_API_KEY is missing in worker environment. Cannot generate live content.');
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const primaryModel = env.ORCAROUTER_MODEL || 'orcarouter/free';
  const todayKey = new Date().toISOString().split('T')[0];

  // 1. Fetch recent topic history from SQLite D1 database (or memory)
  let pastTopics: Array<{ category: string; title: string; fact: string }> = [];
  try {
    const dbRecords = await getRecentTopics(env.DB, 50);
    pastTopics = dbRecords.length > 0 ? dbRecords : inMemoryHistory;
  } catch (e) {
    pastTopics = inMemoryHistory;
  }

  let pastTopicsPrompt = '';
  if (pastTopics.length > 0) {
    const lines = pastTopics.slice(0, 40).map(t => `- [${t.category}] ${t.title}`);
    pastTopicsPrompt = `\n\nALREADY DISCUSSED TOPICS IN DATABASE (CRITICAL: DO NOT REPEAT ANY OF THESE TOPICS OR THEMES):\n${lines.join('\n')}\n`;
  }

  const modelsToTry = [primaryModel, ...FREE_MODELS.filter(m => m !== primaryModel)];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const currentModel = modelsToTry[(attempt - 1) % modelsToTry.length];
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const userPrompt = `You are the chief editor of "InToday", a daily newsletter for modern readers and students.
Task (${timestamp}): Generate 7 BRAND-NEW, NEVER-BEFORE-SEEN insights across human knowledge.
${pastTopicsPrompt}
Generate EXACTLY 1 item for each of the 7 categories:
1. "science" - Science (a fascinating natural/physics/astronomy discovery + relatable real-world example)
2. "economics" - Economics (a surprising market quirk/behavioral economics concept + real-world example)
3. "law" - Law & Governance (a landmark legal oddity or unusual court history + real-world example)
4. "psychology" - Psychology (a counter-intuitive mental bias or human behavior quirk + real-world example)
5. "history" - History (Pick ONE fascinating story: either World history OR Indonesian history)
6. "islam" - Islam & Faith (ACTIONABLE spiritual advice or Sunnah habit to practice better faith, calm the heart, and build noble character)
7. "health" - Health & Body (ACTIONABLE science-backed micro-habit to do today for energy, focus, or physical wellness)

For each item provide:
- "category": Exact key matching one of the 7 above
- "title": Catchy, intriguing title
- "fact": 1 punchy core sentence stating the insight
- "explanation": 2 simple sentences in plain English
- "example": Practical real-world case or actionable advice step

Also provide a "glossary" of 2-3 new vocabulary words introduced with 1-sentence simple definitions.

Return valid JSON ONLY matching this structure:
{
  "facts": [
    { "category": "science", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "economics", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "law", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "psychology", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "history", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "islam", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "health", "title": "...", "fact": "...", "explanation": "...", "example": "..." }
  ],
  "glossary": [
    { "term": "Word", "definition": "Simple 1-sentence definition." }
  ]
}

Output raw JSON only.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      console.log(`[OrcaRouter] Attempt ${attempt}/${maxRetries} using model '${currentModel}' with database check (${pastTopics.length} excluded past topics)...`);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: 'system', content: 'You are a JSON assistant. Output strictly valid JSON with all 7 categories immediately. No reasoning, no markdown wrappers, no commentary.' },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2200
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OrcaRouter HTTP ${response.status} (${currentModel}): ${errText}`);
      }

      const result = (await response.json()) as OrcaChatResponse;
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(`OrcaRouter (${currentModel}) returned empty completion.`);
      }

      const parsed = parseFactsContent(content);

      // Save new facts into SQLite database history
      try {
        await saveGeneratedFacts(env.DB, parsed.facts, todayKey);
      } catch (dbErr) {
        console.warn('[DB] Could not save to D1, appending to memory cache:', dbErr);
      }

      // Also append to in-memory history tracker
      parsed.facts.forEach(f => {
        inMemoryHistory.unshift({ category: f.category, title: f.title, fact: f.fact });
      });

      console.log(`[OrcaRouter] Succeeded! Stored ${parsed.facts.length} fresh facts into database history.`);
      return parsed;
    } catch (err: any) {
      lastError = err;
      console.warn(`[OrcaRouter] Attempt ${attempt} failed:`, err?.message || err);
      if (attempt < maxRetries) {
        // Linear backoff
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`Live AI generation failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}

function parseFactsContent(content: string): GeneratedContent {
  let cleanJson = content.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Failed to parse AI facts JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const allCategories: FactCategory[] = [
    'science',
    'economics',
    'law',
    'psychology',
    'history',
    'islam',
    'health'
  ];

  const factsList = parsed.facts || [];
  if (factsList.length === 0) {
    throw new Error('AI returned an empty facts array.');
  }

  const facts: FactItem[] = [];

  for (const cat of allCategories) {
    const item = factsList.find((p: any) => p.category?.toLowerCase() === cat) || factsList.shift();
    const meta = CATEGORY_DEFINITIONS[cat];

    facts.push({
      category: cat,
      categoryLabel: meta.label,
      emoji: meta.emoji,
      actionOrExampleLabel: meta.actionLabel,
      title: item?.title || `Insight on ${meta.label}`,
      fact: item?.fact || 'An interesting discovery waiting to be explored.',
      explanation: item?.explanation || 'A fascinating look at how the world works around us.',
      example: item?.example || 'Think about how this shows up in everyday life!'
    });
  }

  const glossary: GlossaryItem[] = (parsed.glossary || []).map((g: any) => ({
    term: g.term || 'Concept',
    definition: g.definition || 'A key term introduced in today\'s newsletter.'
  }));

  return { facts, glossary };
}
