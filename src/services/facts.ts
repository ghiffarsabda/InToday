import { Env, FactItem, GlossaryItem, NewsletterData } from '../types';
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

export interface GeneratedContent {
  facts: FactItem[];
  glossary: GlossaryItem[];
}

export async function fetchDailyContent(env: Env): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    console.warn('ORCAROUTER_API_KEY is not set. Using curated facts fallback.');
    return getCuratedContentFallback();
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  const userPrompt = `You write for "InToday", a fun newsletter that makes science, economics, law, and psychology easy to understand for middle/junior high schoolers.
Explain complex concepts using simple, exciting language. Avoid dry academic jargon. Always include a concrete, relatable real-world example.

Generate a JSON object with two keys: "facts" (array of 4 objects) and "glossary" (array of 2-4 technical words introduced today with simple definitions).

Schema:
{
  "facts": [
    {
      "category": "general",
      "title": "Fun catchy title (3-6 words)",
      "fact": "1 punchy sentence stating the core mind-blowing fact.",
      "explanation": "2-3 friendly, simple sentences explaining HOW or WHY this happens in plain English.",
      "example": "1-2 sentences showing a relatable, real-world case or scenario."
    },
    {
      "category": "economics",
      "title": "Fun catchy title",
      "fact": "1 punchy sentence about an economic concept/behavior.",
      "explanation": "2-3 simple sentences explaining the concept in plain English.",
      "example": "A concrete real-world story or everyday life example."
    },
    {
      "category": "law",
      "title": "Fun catchy title",
      "fact": "1 punchy sentence about a legal rule/precedent/quirk.",
      "explanation": "2-3 simple sentences explaining why the law exists or how it works.",
      "example": "A real case or story showing what happened."
    },
    {
      "category": "psychology",
      "title": "Fun catchy title",
      "fact": "1 punchy sentence about a human brain quirk/behavior.",
      "explanation": "2-3 simple sentences explaining how the mind works here.",
      "example": "A relatable situation where you or your friends experience this."
    }
  ],
  "glossary": [
    {
      "term": "Word",
      "definition": "Easy, 1-sentence definition in simple words."
    }
  ]
}

Return JSON ONLY. No extra text or markdown fences.`;

  const messages: OrcaMessage[] = [
    { role: 'user', content: userPrompt }
  ];

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

    return parseAndEnrichContent(content);
  } catch (err: any) {
    console.warn('AI generation issue, using curated fallback content:', err?.message || err);
    return getCuratedContentFallback();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAndEnrichContent(content: string): GeneratedContent {
  let cleanJson = content.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let parsed: {
    facts?: Array<{
      category: string;
      title: string;
      fact: string;
      explanation: string;
      example: string;
    }>;
    glossary?: Array<{
      term: string;
      definition: string;
    }>;
  };

  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    // If wrapped in array directly by mistake, handle gracefully
    try {
      const rawArray = JSON.parse(cleanJson);
      if (Array.isArray(rawArray)) {
        parsed = { facts: rawArray, glossary: [] };
      } else {
        throw err;
      }
    } catch {
      throw new Error(`Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`);
    }
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
    const item = factsList.find(p => p.category?.toLowerCase() === cat) || factsList.shift();
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

  const glossary: GlossaryItem[] = (parsed.glossary || []).map(g => ({
    term: g.term || 'Concept',
    definition: g.definition || 'A key term introduced in today\'s newsletter.'
  }));

  if (glossary.length === 0) {
    glossary.push({
      term: 'Cognitive Bias',
      definition: 'A predictable mental shortcut our brain takes that can trick us into making mistakes.'
    });
  }

  return { facts, glossary };
}

/**
 * Curated backup content (plain language, real-world cases, and glossary)
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
