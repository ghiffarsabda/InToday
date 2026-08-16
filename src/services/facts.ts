import { Env, FactCategory, FactItem, GlossaryItem } from '../types';

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

const TOPIC_SEEDS = [
  'astronomy mysteries, pricing psychology, unusual maritime dispute laws, memory biases, Majapahit spice trade fleet, the Islamic principle of Husnuzan (good assumptions) and controlling anger, viewing morning sunlight for circadian cortisol',
  'deep-sea bioluminescence, the sunk cost trap in daily choices, bizarre medieval animal trials, the bystander effect, ancient Roman self-repairing concrete, the Sunnah habit of mindful eating and sitting while drinking, the 20-20-20 rule for eye strain and screen fatigue',
  'food chemistry petrichor, perverse incentives and cobra effects, strange municipal laws, the pratfall effect (clumsiness makes you likable), Fatima al-Fihri founding the oldest university, the Islamic practice of Tahajjud / morning Dhikr for mental calm, drinking a glass of water with a pinch of mineral salt upon waking',
  'quantum mechanics in daily electronics, artificial scarcity in marketing, copyright oddities, cognitive dissonance, Nusantara kingdom diplomatic letters, the prophetic advice on gentle speech and avoiding gossip (Ghibah), taking a 10-minute post-meal walk to blunt glucose spikes',
  'cellular regeneration, market bubbles and mania history, ancient sumerian laws, optimism bias, Malacca maritime trade hub, Prophet Muhammad advice on taking breaks during stress, cold water face immersion for vagus nerve stimulation'
];

/**
 * Strictly generates fresh, live AI content.
 * Automatically retries up to 3 times on transient network/API hiccups.
 * NO static fallback data.
 */
export async function fetchDailyContent(env: Env, maxRetries = 3): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('ORCAROUTER_API_KEY is missing in worker environment. Cannot generate live content.');
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const randomSeed = TOPIC_SEEDS[Math.floor(Math.random() * TOPIC_SEEDS.length)];
    const timestamp = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const userPrompt = `You are the chief editor of "InToday", a punchy daily newsletter for modern readers and students.
Task (${timestamp}): Generate 7 BRAND-NEW, UNIQUE, mind-blowing insights inspired by: ${randomSeed}.

Generate EXACTLY 1 item for each of the 7 categories:
1. "science" - Science (natural/physics discovery + relatable real-world example)
2. "economics" - Economics (surprising market quirk/behavioral economics + real-world example)
3. "law" - Law & Governance (fascinating law oddity/court history + real-world example)
4. "psychology" - Psychology (mental bias/brain quirk + real-world example)
5. "history" - History (Pick ONE fascinating story: either World history OR Indonesian history)
6. "islam" - Islam & Faith (ACTIONABLE spiritual advice or Sunnah habit to practice better faith, calm the heart, and build noble character)
7. "health" - Health & Body (ACTIONABLE science-backed micro-habit to do today for energy, focus, or physical wellness)

For each item provide:
- "category": Exact key matching one of the 7 above
- "title": Catchy, intriguing title
- "fact": 1 punchy core sentence
- "explanation": 2 simple sentences in plain English
- "example": Practical real-world case or actionable advice step

Also provide a "glossary" of 2-3 new vocabulary words with 1-sentence simple definitions.

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
      console.log(`[OrcaRouter] Attempt ${attempt}/${maxRetries} generating live facts...`);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: 'You are a JSON assistant. Output strictly valid JSON with all 7 categories immediately. No reasoning, no markdown wrappers, no commentary.' },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.85,
          max_tokens: 3000
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OrcaRouter HTTP ${response.status}: ${errText}`);
      }

      const result = (await response.json()) as OrcaChatResponse;
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OrcaRouter returned empty completion.');
      }

      const parsed = parseFactsContent(content);
      console.log(`[OrcaRouter] Attempt ${attempt} succeeded! Generated ${parsed.facts.length} facts.`);
      return parsed;
    } catch (err: any) {
      lastError = err;
      console.warn(`[OrcaRouter] Attempt ${attempt} failed:`, err?.message || err);
      if (attempt < maxRetries) {
        // Wait 1.5s before retry
        await new Promise(r => setTimeout(r, 1500));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`Live AI generation failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
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
