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

export const CATEGORY_DEFINITIONS: Record<FactCategory, { label: string; emoji: string }> = {
  science: { label: 'Science', emoji: '🔬' },
  economics: { label: 'Economics', emoji: '📈' },
  law: { label: 'Law & Governance', emoji: '⚖️' },
  psychology: { label: 'Psychology', emoji: '🧠' },
  history_world: { label: 'History (World)', emoji: '🏛️' },
  history_indonesia: { label: 'History (Indonesia)', emoji: '🇮🇩' },
  religions: { label: 'Religions', emoji: '🕊️' },
  islam: { label: 'Islam', emoji: '🌙' },
  health: { label: 'Health', emoji: '🩺' },
  music: { label: 'Music', emoji: '🎵' },
  movie: { label: 'Movie', emoji: '🎬' },
  pop_culture: { label: 'Pop Culture', emoji: '🍿' }
};

const TOPIC_SEEDS = [
  'astronomy breakthroughs, behavioral economics, quirky maritime law, memory biases, ancient empire logistics, nusantara spice trade kingdoms, ancient world faith rituals, Islamic Golden Age astronomy, neuroplasticity, soundtrack acoustics, iconic cinema illusions, viral internet origins',
  'quantum physics in daily objects, hidden pricing tricks, medieval dispute trials, the bystander effect, silk road trade routes, Majapahit diplomacy, sacred architecture geometry, Ibn Sina medicine discoveries, gut microbiome biology, psychoacoustics in pop songs, CGI camera revolutions, video game culture history',
  'deep sea bioluminescence, artificial scarcity, constitutional quirks, optical illusions, forgotten ancient civilizations, Sriwijaya naval trade, comparative spiritual ethics, House of Wisdom Baghdad translations, immune system tactics, the science of earworms, movie sound design foley, cartoon animation secrets'
];

/**
 * Fetches fresh, mind-blowing daily facts across all 12 categories.
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

  const userPrompt = `You are the chief curator for "InToday", a daily newsletter designed to make the reader the most interesting, informed, and conversation-ready person in the room.

TASK:
Generate 12 BRAND NEW, mind-blowing fun facts for junior high/high school students (easy to digest, zero dry academic jargon, engaging style).
Focus inspiration (${timestamp}): ${randomSeed}.

You MUST generate exactly 1 fact for each of the following 12 categories:
1. "science" - Science (physics, astronomy, chemistry, nature)
2. "economics" - Economics (markets, invisible costs, behavioral economics)
3. "law" - Law & Governance (unusual historical/modern laws, landmark legal oddities)
4. "psychology" - Psychology (mental biases, human behavior, brain quirks)
5. "history_world" - History (World) (mind-blowing global historical moments, ancient engineering, unexpected alliances)
6. "history_indonesia" - History (Indonesia) (Nusantara kingdoms, colonial quirks, maritime achievements, national heritage)
7. "religions" - Religions (comparative world religion history, fascinating theological facts, sacred traditions)
8. "islam" - Islam (Islamic Golden Age innovations, historical Islamic scholars, science/astronomy in Islamic heritage)
9. "health" - Health (human body physiology, medical history, nutrition science, longevity quirks)
10. "music" - Music (sound physics, musical theory hacks, famous song origins, psychoacoustics)
11. "movie" - Movie (cinematic magic, practical effects history, easter eggs, filmmaking breakthroughs)
12. "pop_culture" - Pop Culture (gaming history, internet culture, iconic trends, viral folklore)

For each fact provide:
- "category": Exact key matching one of the 12 above
- "title": Catchy, intriguing title
- "fact": 1 punchy sentence stating the core mind-blowing fact
- "explanation": 2 simple sentences explaining why/how it works in plain English
- "example": 1 relatable real-world scenario or practical case

Also provide a "glossary" of 3-4 interesting words introduced today with simple 1-sentence definitions.

Return valid JSON ONLY matching this exact structure:
{
  "facts": [
    { "category": "science", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "economics", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "law", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "psychology", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "history_world", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "history_indonesia", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "religions", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "islam", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "health", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "music", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "movie", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "pop_culture", "title": "...", "fact": "...", "explanation": "...", "example": "..." }
  ],
  "glossary": [
    { "term": "Word", "definition": "1 simple sentence definition." }
  ]
}

Output raw JSON only.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

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
          { role: 'system', content: 'You are a JSON generator. Output strictly valid JSON with all 12 categories. Do not output markdown code blocks or reasoning.' },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.75,
        max_tokens: 3800
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
    'history_world',
    'history_indonesia',
    'religions',
    'islam',
    'health',
    'music',
    'movie',
    'pop_culture'
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
      title: item?.title || `Fascinating Insight on ${meta.label}`,
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
      term: 'Polymath',
      definition: 'A person with wide-ranging knowledge and expertise across many different scientific and artistic subjects.'
    });
  }

  return { facts, glossary };
}

/**
 * Curated backup facts covering all 12 categories
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    facts: [
      {
        category: 'science',
        categoryLabel: 'Science',
        emoji: '🔬',
        title: 'Why Rain Smells So Good (Petrichor)',
        fact: 'That fresh, earthy smell right after it rains isn’t water—it’s a scent released by soil bacteria.',
        explanation: 'During dry weather, microscopic bacteria in the ground produce a chemical called geosmin. When raindrops hit the dry dirt, they trap tiny air bubbles that shoot up like champagne fizz, spraying the sweet aroma into the air.',
        example: 'Next time you walk outside after a summer storm and take a deep breath, you are smelling aerosolized bacterial perfumes and plant oils!'
      },
      {
        category: 'economics',
        categoryLabel: 'Economics',
        emoji: '📈',
        title: 'The Cobra Trap and Bad Rewards',
        fact: 'Paying people to solve a problem can accidentally make them create more of the problem.',
        explanation: 'In economics, this is called a perverse incentive. When leaders offer a reward without thinking about how people might cheat the system, people will naturally find the easiest way to cash in.',
        example: 'In colonial Delhi, the government offered cash for dead cobra snakes to reduce the population. Instead of hunting wild snakes, clever locals started breeding thousands of cobras in their basements to sell them!'
      },
      {
        category: 'law',
        categoryLabel: 'Law & Governance',
        emoji: '⚖️',
        title: 'When Animals Had Real Lawyers in Court',
        fact: 'Hundreds of years ago in Europe, animals accused of crimes were put on trial with real judges, witnesses, and defense attorneys.',
        explanation: 'Medieval courts believed that the law had to apply to all creatures fairly. If an animal caused damage, lawyers were assigned to speak for the animal in court, argue their case, and present evidence.',
        example: 'In 1457 in France, a mother pig and her six piglets were tried for eating farm crops. The defense lawyer successfully argued the piglets were just copying their mother, and the judge acquitted all six piglets!'
      },
      {
        category: 'psychology',
        categoryLabel: 'Psychology',
        emoji: '🧠',
        title: 'Spilling Your Drink Makes You Likable (The Pratfall Effect)',
        fact: 'Smart and talented people actually become more popular and friendly when they make a clumsy little mistake.',
        explanation: 'When someone seems "too perfect," we feel intimidated by them. But when a highly competent person trips on a shoelace or drops their pen, it humanizes them, making others feel closer and more connected.',
        example: 'If the top student in your class gives a brilliant presentation but accidentally drops their cue cards on the floor, everyone smiles and likes them even more because it breaks the ice.'
      },
      {
        category: 'history_world',
        categoryLabel: 'History (World)',
        emoji: '🏛️',
        title: 'Ancient Rome Used Ancient Roman Concrete That Healed Itself',
        fact: 'Roman buildings like the Pantheon have survived over 2,000 years because their concrete actually repairs its own cracks when it rains.',
        explanation: 'Romans mixed quicklime chunks into volcanic ash concrete. When rainwater seeps into small cracks, it reacts with the lime to form fresh limestone crystals that automatically seal the cracks shut.',
        example: 'While modern bridges often crack and crumble after 50 years, ancient Roman sea harbors and dome temples are still standing strong after millennia.'
      },
      {
        category: 'history_indonesia',
        categoryLabel: 'History (Indonesia)',
        emoji: '🇮🇩',
        title: 'The Majapahit Navy Built Giant Ships Bigger Than European Vessels',
        fact: 'In the 14th century, the Majapahit Kingdom sailed giant multi-deck wooden warships called "Jung Jawa" that dwarfed European ships of that era.',
        explanation: 'These massive Indonesian ships were built with multiple layers of teak wood hull that could repel cannon fire and transport hundreds of tons of spices and sailors across Southeast Asia and the Indian Ocean.',
        example: 'When Portuguese explorer Afonso de Albuquerque first encountered a Javanese Jung in Malacca in 1511, he noted that Portuguese cannonballs bounced harmlessly off its thick teak hull!'
      },
      {
        category: 'religions',
        categoryLabel: 'Religions',
        emoji: '🕊️',
        title: 'The World’s Oldest Continuously Running University Was Founded by a Woman',
        fact: 'The University of al-Qarawiyyin in Morocco, recognized by UNESCO as the world\'s oldest existing university, was founded in 859 CE by Fatima al-Fihri.',
        explanation: 'Using her inheritance, Fatima built a grand mosque and learning center that welcomed scholars of science, religion, mathematics, and philosophy from all over the Mediterranean.',
        example: 'Centuries before Oxford or Cambridge existed, students of diverse backgrounds traveled to al-Qarawiyyin to study astronomy, grammar, and medicine.'
      },
      {
        category: 'islam',
        categoryLabel: 'Islam',
        emoji: '🌙',
        title: 'How an 11th-Century Muslim Scholar Invented the Camera',
        fact: 'Muslim polymath Ibn al-Haytham (Alhazen) discovered how light and human vision work by sitting in a dark tent with a tiny hole, creating the "Camera Obscura".',
        explanation: 'Before him, ancient Greeks thought human eyes shot out invisible beams of light to see. Ibn al-Haytham proved that light bounces off objects and enters our eyes, laying the scientific foundation for modern cameras and eyeglasses.',
        example: 'Every digital camera, phone lens, and telescope in existence today uses the optical laws first proven by Ibn al-Haytham over 1,000 years ago.'
      },
      {
        category: 'health',
        categoryLabel: 'Health',
        emoji: '🩺',
        title: 'Your Body Completely Replaces Its Stomach Lining Every 14 Days',
        fact: 'Your stomach acid is strong enough to dissolve metal razor blades, so your body must build a brand-new protective stomach lining every two weeks.',
        explanation: 'Gastric acid contains hydrochloric acid to digest food. To prevent the stomach from digesting itself, specialized cells continuously secrete a mucus barrier and replace the entire lining layer on a 14-day cycle.',
        example: 'Even when you eat heavy, acidic, or spicy meals, your stomach cells are already regenerating a fresh shield to keep your digestive tract healthy.'
      },
      {
        category: 'music',
        categoryLabel: 'Music',
        emoji: '🎵',
        title: 'Why Movie Scores Use "Infrasound" to Give You Goosebumps',
        fact: 'Horror and thriller movies use sound frequencies below 20 Hertz (infrasound) that your ears cannot hear, but your body feels as intense dread and anxiety.',
        explanation: 'In nature, extreme low-frequency vibrations are made by approaching predators, earthquakes, or storms. When sound designers pump infrasound into movie theaters, your primitive brain triggers a fight-or-flight panic response.',
        example: 'In movies like *Paranormal Activity* or *Dune*, you might suddenly feel a cold chill on your neck not because of the visuals, but because a hidden sub-bass vibration is vibrating your chest.'
      },
      {
        category: 'movie',
        categoryLabel: 'Movie',
        emoji: '🎬',
        title: 'The Iconic Star Wars Lightsaber Sound Was Made by an Old TV and a Projector',
        fact: 'The legendary hum and clash of lightsabers in *Star Wars* was created accidentally by sound designer Ben Burtt using broken motors.',
        explanation: 'Burtt combined the humming motor of an old 35mm film projector with the electric buzz of a television picture tube, then swung a microphone in the air to create the doppler movement effect.',
        example: 'Next time you hear a Jedi ignite a lightsaber, you are listening to the combined electronic hum of a 1970s classroom projector and television tube.'
      },
      {
        category: 'pop_culture',
        categoryLabel: 'Pop Culture',
        emoji: '🍿',
        title: 'Pac-Man Was Designed to Appeal to People Who Loved Eating Desserts',
        fact: 'Game creator Toru Iwatani designed *Pac-Man* in 1980 because early arcade games were violent space shooters that only attracted male gamers.',
        explanation: 'Iwatani wanted a colorful, cheerful game centered around food and eating cute ghosts. The iconic shape of Pac-Man was inspired when he looked down at a pizza with one slice missing.',
        example: 'What started as a sketch of a pizza with a missing slice became the most recognizable video game icon in world history.'
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
        term: 'Camera Obscura',
        definition: 'An optical device consisting of a darkened room or box with a small hole that projects an upside-down image of the outside scene.'
      },
      {
        term: 'Infrasound',
        definition: 'Low-frequency sound waves below 20 Hertz that are inaudible to human ears but felt as physical vibrations.'
      }
    ]
  };
}
