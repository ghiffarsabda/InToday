import { Env, FactCategory, FactItem, GlossaryItem } from '../types';
import { CATEGORY_DEFINITIONS, GeneratedContent } from './facts';
import { getRecentTopics, saveGeneratedFacts } from './db';

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Generates fresh daily facts using Google Gemini API.
 * Supports Gemini 3.1 Flash-Lite / Gemini 2.5 Flash with native JSON mode.
 */
export async function generateContentWithGemini(env: Env): Promise<GeneratedContent> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment variables.');
  }

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'; // or gemini-3.1-flash-lite / gemini-2.5-flash-lite
  const todayKey = new Date().toISOString().split('T')[0];

  // 1. Fetch recent topic history from SQLite database
  let pastTopics: Array<{ category: string; title: string; fact: string }> = [];
  try {
    pastTopics = await getRecentTopics(env.DB, 50);
  } catch (e) {
    console.warn('[Gemini] DB lookup failed, proceeding without history:', e);
  }

  let pastTopicsPrompt = '';
  if (pastTopics.length > 0) {
    const lines = pastTopics.slice(0, 30).map(t => `- [${t.category}] ${t.title}`);
    pastTopicsPrompt = `\n\nALREADY DISCUSSED TOPICS IN DATABASE (CRITICAL: DO NOT REPEAT ANY OF THESE TOPICS OR THEMES):\n${lines.join('\n')}\n`;
  }

  const timestamp = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const promptText = `You are the chief editor of "InToday", a high-signal daily briefing newsletter for students and modern readers.
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

Return valid JSON matching this schema:
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
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  console.log(`[Google Gemini] Generating daily briefing with model '${model}'...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 3500
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Gemini API returned HTTP ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as GeminiGenerateResponse;
  const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawJson) {
    throw new Error('Google Gemini returned an empty response.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`Failed to parse Gemini JSON: ${err instanceof Error ? err.message : String(err)}`);
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

  const factsList = parsed.facts || parsed.fun_facts || [];
  if (factsList.length === 0) {
    throw new Error('Gemini returned an empty facts array.');
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

  // Save to SQLite database
  try {
    await saveGeneratedFacts(env.DB, facts, todayKey);
  } catch (dbErr) {
    console.warn('[DB] Could not save facts to D1:', dbErr);
  }

  console.log(`[Google Gemini] ✓ Successfully generated and saved ${facts.length} fresh facts!`);
  return { facts, glossary };
}
