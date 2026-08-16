import { Env, FactItem, GlossaryItem } from '../types';

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

const TOPIC_SEEDS = [
  'space phenomena, quirky monetary policy, ancient animal trials, optical illusions',
  'deep-sea biology, hidden costs of free products, weird municipal laws, memory tricks',
  'human anatomy quirks, the economics of everyday items, bizarre medieval trials, decision-making biases',
  'animal intelligence, game theory in daily life, copyright peculiarities, the psychology of habits',
  'meteorology mysteries, pricing psychology, landmark courtroom oddities, cognitive dissonance',
  'food chemistry secrets, supply chain anomalies, unusual international laws, social conformity experiments'
];

/**
 * Fetches fresh, mind-blowing daily facts across General, Economics, Law, and Psychology.
 */
export async function fetchDailyContent(env: Env): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    console.warn('ORCAROUTER_API_KEY is not set. Using curated fallback content.');
    return getCuratedContentFallback();
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  // Pick a random seed focus to guarantee fresh facts on every generation
  const randomSeed = TOPIC_SEEDS[Math.floor(Math.random() * TOPIC_SEEDS.length)];
  const timestamp = Date.now();

  const userPrompt = `You are the chief curator for "InToday", a daily newsletter designed to make the reader the most interesting, informed, and conversation-ready person in the room.

TASK:
Generate 4 BRAND NEW, mind-blowing, fun facts for junior high and high school students (easy to digest, zero dry jargon).
Focus inspiration for today (${timestamp}): ${randomSeed}.

The 4 categories MUST be:
1. "general" (Anything & Everything - nature, space, biology, technology)
2. "economics" (Surprising market behaviors, hidden costs, quirky trade rules)
3. "law" (Fascinating historical or modern laws, unusual courtroom cases)
4. "psychology" (Counter-intuitive brain quirks, optical or social behavior experiments)

For each fact provide:
- "title": Catchy, intriguing title
- "fact": 1 punchy sentence stating the core mind-blowing fact
- "explanation": 2 simple sentences explaining why/how it works in plain English
- "example": 1 relatable real-world scenario or practical case

Also provide a "glossary" of 2-3 technical or interesting words introduced in these facts with simple 1-sentence definitions.

Return valid JSON ONLY matching this schema:
{
  "facts": [
    {
      "category": "general",
      "title": "Title",
      "fact": "Core fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable case."
    },
    {
      "category": "economics",
      "title": "Title",
      "fact": "Core fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable case."
    },
    {
      "category": "law",
      "title": "Title",
      "fact": "Core fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable case."
    },
    {
      "category": "psychology",
      "title": "Title",
      "fact": "Core fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable case."
    }
  ],
  "glossary": [
    {
      "term": "Word",
      "definition": "Simple definition."
    }
  ]
}

Output raw JSON only. Do not wrap in markdown or reasoning.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a JSON assistant. Output strictly valid JSON immediately. No reasoning, no markdown wrappers, no commentary.' },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.75,
        max_tokens: 2200
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`OrcaRouter error (${response.status}): ${errText}`);
      throw new Error(`OrcaRouter API returned ${response.status}`);
    }

    const result = (await response.json()) as OrcaChatResponse;
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty AI response received');
    }

    return parseFactsContent(content);
  } catch (err: any) {
    console.error('[Facts Service] Detailed AI Generation Error:', err);
    return getCuratedContentFallback();
  } finally {
    clearTimeout(timeoutId);
  }
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

  const categoryMap: Record<string, { label: string; emoji: string }> = {
    general: { label: 'Anything & Everything', emoji: '🌍' },
    economics: { label: 'Economics', emoji: '📈' },
    law: { label: 'Law & Governance', emoji: '⚖️' },
    psychology: { label: 'Psychology', emoji: '🧠' }
  };

  const factsList = parsed.facts || [];
  const facts: FactItem[] = [];

  for (const cat of ['general', 'economics', 'law', 'psychology'] as const) {
    const item = factsList.find((p: any) => p.category?.toLowerCase() === cat) || factsList.shift();
    const meta = categoryMap[cat];

    facts.push({
      category: cat,
      categoryLabel: meta.label,
      emoji: meta.emoji,
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

  if (glossary.length === 0) {
    glossary.push({
      term: 'Petrichor',
      definition: 'The pleasant, earthy smell produced when rain falls on dry ground or rocks.'
    });
  }

  return { facts, glossary };
}

/**
 * Curated backup facts if internet or API is offline
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    facts: [
      {
        category: 'general',
        categoryLabel: 'Anything & Everything',
        emoji: '🌍',
        title: 'Why Rain Smells So Good',
        fact: 'That fresh, earthy smell right after it rains isn’t water—it’s a scent released by soil bacteria.',
        explanation: 'During dry weather, microscopic bacteria in the ground make a special chemical. When raindrops hit the dry dirt, they trap tiny air bubbles that shoot up like champagne fizz, spraying the sweet-smelling aroma into the air.',
        example: 'Next time you walk outside after a summer storm and take a deep breath, you are smelling aerosolized plant oils and bacterial perfumes called petrichor!'
      },
      {
        category: 'economics',
        categoryLabel: 'Economics',
        emoji: '📈',
        title: 'The Cobra Trap and Bad Rewards',
        fact: 'Paying people to solve a problem can accidentally make them create more of the problem.',
        explanation: 'In economics, this is called a perverse incentive. When leaders offer a reward without thinking about how people might cheat the system, people will naturally find the easiest way to cash in.',
        example: 'A long time ago in Delhi, the government wanted fewer poisonous cobra snakes, so they offered cash for every dead cobra. Instead of hunting wild snakes, clever locals started breeding thousands of cobras in their basements just to sell them for cash!'
      },
      {
        category: 'law',
        categoryLabel: 'Law & Governance',
        emoji: '⚖️',
        title: 'When Animals Had Real Lawyers',
        fact: 'Hundreds of years ago in Europe, animals accused of crimes were put on trial with real judges, witnesses, and defense attorneys.',
        explanation: 'Medieval courts believed that the law had to apply to all creatures fairly. If an animal caused damage, lawyers were assigned to speak for the animal in court, argue their case, and present evidence.',
        example: 'In 1457 in France, a mother pig and her six piglets were put on trial for eating food from a farm. The lawyer successfully defended the piglets by arguing they were just young kids copying their mother, and the judge let them all go free!'
      },
      {
        category: 'psychology',
        categoryLabel: 'Psychology',
        emoji: '🧠',
        title: 'Spilling Your Drink Makes You Likable',
        fact: 'Smart and talented people actually become more popular and friendly when they make a clumsy little mistake.',
        explanation: 'When someone seems "too perfect," we feel intimidated by them. But when a smart person trips on a shoelace or drops their pen, it proves they are human just like us, making us like them a lot more.',
        example: 'If the top student in your class gives a brilliant presentation but accidentally drops their cue cards on the floor, everyone smiles and likes them even more because it breaks the ice.'
      }
    ],
    glossary: [
      {
        term: 'Petrichor',
        definition: 'The pleasant, earthy smell produced when rain falls on dry ground or rocks.'
      },
      {
        term: 'Perverse Incentive',
        definition: 'A reward or rule that accidentally encourages people to do the exact opposite of what was intended.'
      },
      {
        term: 'Pratfall Effect',
        definition: 'A psychological trend where competent people seem more likable and relatable after making a harmless mistake.'
      }
    ]
  };
}
