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
  'quantum mechanics in daily electronics, artificial scarcity in marketing, copyright oddities, cognitive dissonance, Nusantara kingdom diplomatic letters, the prophetic advice on gentle speech and avoiding gossip (Ghibah), taking a 10-minute post-meal walk to blunt glucose spikes'
];

/**
 * Fetches 7 concise, high-signal, actionable daily micro-insights.
 */
export async function fetchDailyContent(env: Env): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    console.warn('ORCAROUTER_API_KEY is not set. Using curated fallback content.');
    return getCuratedContentFallback();
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  const randomSeed = TOPIC_SEEDS[Math.floor(Math.random() * TOPIC_SEEDS.length)];
  const timestamp = Date.now();

  const userPrompt = `You are the chief editor of "InToday", a punchy, high-signal daily newsletter for Gen-Z and modern readers. Keep text crisp, zero fluff, and easy for students to digest.

Focus inspiration (${timestamp}): ${randomSeed}.

Generate EXACTLY 7 items across these categories:
1. "science" - Science (mind-blowing natural/physics discovery + relatable real-world example)
2. "economics" - Economics (surprising market quirk/behavioral economics + real-world example)
3. "law" - Law & Governance (fascinating historical/modern law oddity + real-world example)
4. "psychology" - Psychology (counter-intuitive mental bias/behavior quirk + real-world example)
5. "history" - History (Pick ONE fascinating story: either World history OR Indonesian history)
6. "islam" - Islam & Faith (ACTIONABLE spiritual advice or Sunnah habit to practice better faith, calm the heart, and build noble character)
7. "health" - Health & Body (ACTIONABLE science-backed micro-habit to do today to boost energy, focus, or physical wellness)

For each item provide:
- "category": Exact key matching one of the 7 above
- "title": Catchy, intriguing title
- "fact": 1 punchy core sentence
- "explanation": 2 simple sentences explaining the context or mechanism
- "example": For Science/Econ/Law/Psych/History provide a real-world case; for Islam provide a practical spiritual action; for Health provide a clear, actionable habit to do today.

Also provide a "glossary" of 2-3 new vocabulary words with 1-sentence simple definitions.

Return valid JSON ONLY matching this schema:
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
  const timeoutId = setTimeout(() => controller.abort(), 35000);

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
          { role: 'system', content: 'You are a JSON assistant for a student newsletter. Output strictly valid JSON with all 7 categories. No markdown wrappers, no reasoning.' },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.75,
        max_tokens: 2800
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

  if (glossary.length === 0) {
    glossary.push({
      term: 'Husnuzan',
      definition: 'The Islamic practice of maintaining positive assumptions and good faith toward Allah and fellow human beings.'
    });
  }

  return { facts, glossary };
}

/**
 * Curated backup facts covering all 7 categories
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    facts: [
      {
        category: 'science',
        categoryLabel: 'Science',
        emoji: '🔬',
        actionOrExampleLabel: '💡 Real-world case:',
        title: 'Why Rain Smells So Good (Petrichor)',
        fact: 'That fresh, earthy smell right after it rains isn’t water—it’s a scent released by soil bacteria.',
        explanation: 'During dry weather, microscopic bacteria in the ground produce a chemical called geosmin. When raindrops hit dry soil, they trap tiny air bubbles that shoot up like champagne fizz, spraying the sweet aroma into the air.',
        example: 'Next time you walk outside after a summer shower and take a deep breath, you are smelling aerosolized bacterial perfumes and plant oils!'
      },
      {
        category: 'economics',
        categoryLabel: 'Economics',
        emoji: '📈',
        actionOrExampleLabel: '💡 Real-world case:',
        title: 'The Cobra Trap and Bad Rewards',
        fact: 'Paying people to solve a problem can accidentally make them create more of the problem.',
        explanation: 'In economics, this is called a perverse incentive. When leaders offer a reward without thinking about how people might cheat the system, people will naturally find the easiest way to cash in.',
        example: 'In colonial Delhi, the government offered cash for dead cobra snakes to reduce the population. Instead of hunting wild snakes, clever locals started breeding thousands of cobras in their basements to sell them!'
      },
      {
        category: 'law',
        categoryLabel: 'Law & Governance',
        emoji: '⚖️',
        actionOrExampleLabel: '💡 Real-world case:',
        title: 'When Animals Had Real Lawyers in Court',
        fact: 'Hundreds of years ago in Europe, animals accused of crimes were put on trial with real judges, witnesses, and defense attorneys.',
        explanation: 'Medieval courts believed that the law had to apply to all creatures fairly. If an animal caused damage, lawyers were assigned to speak for the animal in court, argue their case, and present evidence.',
        example: 'In 1457 in France, a mother pig and her six piglets were tried for eating farm crops. The defense lawyer successfully argued the piglets were just copying their mother, and the judge acquitted all six piglets!'
      },
      {
        category: 'psychology',
        categoryLabel: 'Psychology',
        emoji: '🧠',
        actionOrExampleLabel: '💡 Real-world case:',
        title: 'Spilling Your Drink Makes You Likable (The Pratfall Effect)',
        fact: 'Smart and talented people actually become more popular and friendly when they make a clumsy little mistake.',
        explanation: 'When someone seems "too perfect," we feel intimidated by them. But when a highly competent person trips on a shoelace or drops their pen, it humanizes them, making others feel closer and more connected.',
        example: 'If the top student in your class gives a brilliant presentation but accidentally drops their cue cards on the floor, everyone smiles and likes them even more because it breaks the ice.'
      },
      {
        category: 'history',
        categoryLabel: 'History',
        emoji: '🏛️',
        actionOrExampleLabel: '💡 Real-world case:',
        title: 'The Majapahit Navy Built Giant Ships Bigger Than European Vessels',
        fact: 'In the 14th century, the Indonesian Majapahit Kingdom sailed giant multi-deck wooden warships called "Jung Jawa" that dwarfed European ships of that era.',
        explanation: 'These massive ships were built with multiple layers of teak wood hull that could repel cannon fire and transport hundreds of tons of spices and sailors across the Indian Ocean.',
        example: 'When Portuguese explorer Afonso de Albuquerque first encountered a Javanese Jung in Malacca in 1511, he noted that Portuguese cannonballs bounced harmlessly off its thick teak hull!'
      },
      {
        category: 'islam',
        categoryLabel: 'Islam & Faith',
        emoji: '🌙',
        actionOrExampleLabel: '✨ Faith in Action:',
        title: 'The Power of "Husnuzan" (Positive Assumption) to Free Your Mind',
        fact: 'Islam teaches that assuming the best about others is not just good manners—it is a spiritual shield that protects your heart from anxiety and bitterness.',
        explanation: 'The Prophet Muhammad (ﷺ) warned against suspicion (Dhann), calling it the most untruthful form of speech. When you assume good intentions first, you instantly dissolve unnecessary grudges and protect your inner peace.',
        example: 'If a friend takes hours to reply to your text, instead of thinking "they are ignoring me," consciously practice Husnuzan: "they might be driving, praying, or helping their family." You will feel immediate calm.'
      },
      {
        category: 'health',
        categoryLabel: 'Health & Body',
        emoji: '🩺',
        actionOrExampleLabel: '⚡ Actionable step for today:',
        title: 'Get 10 Minutes of Morning Sunlight to Fix Your Energy & Sleep',
        fact: 'Viewing natural morning sunlight within 60 minutes of waking sets a timer in your brain that boosts daytime focus and ensures deep sleep at night.',
        explanation: 'Special cells in your eyes detect blue-frequency sunlight and signal your brain\'s clock to release a healthy pulse of cortisol (for energy) and set a 14-hour countdown for melatonin (sleep hormone) release tonight.',
        example: 'Tomorrow morning, step outside on your porch or balcony for 10 minutes without sunglasses while sipping water before looking at your phone.'
      }
    ],
    glossary: [
      {
        term: 'Petrichor',
        definition: 'The pleasant, earthy aroma produced when rainfall touches dry soil or stone.'
      },
      {
        term: 'Perverse Incentive',
        definition: 'A reward system that unintentionally encourages people to do the exact opposite of the original goal.'
      },
      {
        term: 'Husnuzan',
        definition: 'The Islamic spiritual practice of maintaining positive thoughts and good faith toward others and Allah.'
      }
    ]
  };
}
