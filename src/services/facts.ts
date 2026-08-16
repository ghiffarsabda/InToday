import { Env, FactItem, GlossaryItem, NewsItem } from '../types';
import { NEWSLETTER_CONFIG } from '../config';
import { fetchLiveRssFeeds, RawNewsItem } from './news';

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
  globalNews: NewsItem[];
  indonesiaNews: NewsItem[];
  facts: FactItem[];
  glossary: GlossaryItem[];
}

export async function fetchDailyContent(env: Env): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    console.warn('ORCAROUTER_API_KEY is not set. Using curated fallback content.');
    return getCuratedContentFallback();
  }

  // 1. Fetch live RSS news feeds in parallel
  let liveRss: { globalNews: RawNewsItem[]; indonesiaNews: RawNewsItem[] } = {
    globalNews: [],
    indonesiaNews: []
  };

  try {
    liveRss = await fetchLiveRssFeeds();
  } catch (err) {
    console.warn('Could not fetch live RSS feeds, proceeding with fallback news list:', err);
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  const globalHeadlinesStr = liveRss.globalNews.length > 0
    ? liveRss.globalNews.map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join('\n')
    : '1. [Reuters] Major international diplomatic talks underway.\n2. [BBC] World economic summit outlines growth projections.';

  const idHeadlinesStr = liveRss.indonesiaNews.length > 0
    ? liveRss.indonesiaNews.map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join('\n')
    : '1. [Antara] Pembangunan infrastruktur nasional terus dipercepat.\n2. [Kompas] Pertumbuhan ekonomi kuartal ini catatkan hasil positif.';

  const userPrompt = `You write for "InToday", a daily newsletter that provides:
1. Top 5 Most Important Global News You Can't Miss Today
2. Top 5 Most Important Indonesia News You Can't Miss Today
3. 4 Fun Facts (easy to understand for junior high schoolers, with real-world examples)
4. A Glossary of new words

Live Headlines to select from:
GLOBAL:
${globalHeadlinesStr}

INDONESIA:
${idHeadlinesStr}

Return strictly a JSON object with this exact schema:
{
  "globalNews": [
    {
      "title": "Clear Headline",
      "summary": "1-2 simple, easy-to-understand sentences in plain English explaining what happened and why it matters.",
      "source": "Source Name (e.g. Reuters, BBC, NYT)"
    }
  ],
  "indonesiaNews": [
    {
      "title": "Clear Headline",
      "summary": "1-2 simple, easy-to-understand sentences in plain English explaining the story.",
      "source": "Source Name (e.g. Antara, Kompas, Detik)"
    }
  ],
  "facts": [
    {
      "category": "general",
      "title": "Fun Title",
      "fact": "1 sentence punchy fact.",
      "explanation": "2-3 simple sentences explaining how/why.",
      "example": "Relatable real-world scenario."
    },
    {
      "category": "economics",
      "title": "Fun Title",
      "fact": "1 sentence punchy fact.",
      "explanation": "2-3 simple sentences explaining how/why.",
      "example": "Relatable real-world scenario."
    },
    {
      "category": "law",
      "title": "Fun Title",
      "fact": "1 sentence punchy fact.",
      "explanation": "2-3 simple sentences explaining how/why.",
      "example": "Relatable real-world scenario."
    },
    {
      "category": "psychology",
      "title": "Fun Title",
      "fact": "1 sentence punchy fact.",
      "explanation": "2-3 simple sentences explaining how/why.",
      "example": "Relatable real-world scenario."
    }
  ],
  "glossary": [
    {
      "term": "Word",
      "definition": "1 simple definition sentence."
    }
  ]
}

Make sure "globalNews" has exactly 5 items and "indonesiaNews" has exactly 5 items.
Return raw JSON ONLY.`;

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
        max_tokens: 3500
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

    return parseAndEnrichContent(content, liveRss);
  } catch (err: any) {
    console.warn('AI generation issue, using curated fallback content:', err?.message || err);
    return getCuratedContentFallback();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAndEnrichContent(
  content: string,
  liveRss: { globalNews: RawNewsItem[]; indonesiaNews: RawNewsItem[] }
): GeneratedContent {
  let cleanJson = content.trim();
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Failed to parse AI JSON response: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Parse Global News
  const globalNews: NewsItem[] = (parsed.globalNews || []).slice(0, 5).map((item: any, i: number) => {
    const matchedRss = liveRss.globalNews[i];
    return {
      title: item.title || matchedRss?.title || 'Global News Update',
      summary: item.summary || 'Important developments happening around the world today.',
      source: item.source || matchedRss?.source || 'International Press',
      url: matchedRss?.link
    };
  });

  // Parse Indonesia News
  const indonesiaNews: NewsItem[] = (parsed.indonesiaNews || []).slice(0, 5).map((item: any, i: number) => {
    const matchedRss = liveRss.indonesiaNews[i];
    return {
      title: item.title || matchedRss?.title || 'Indonesia News Update',
      summary: item.summary || 'Important developments happening across Indonesia today.',
      source: item.source || matchedRss?.source || 'Indonesian Media',
      url: matchedRss?.link
    };
  });

  // Parse Facts
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

  // Parse Glossary
  const glossary: GlossaryItem[] = (parsed.glossary || []).map((g: any) => ({
    term: g.term || 'Concept',
    definition: g.definition || 'A key term introduced in today\'s newsletter.'
  }));

  if (glossary.length === 0) {
    glossary.push({
      term: 'Diplomatic Accord',
      definition: 'An official formal agreement reached between different nations.'
    });
  }

  return { globalNews, indonesiaNews, facts, glossary };
}

/**
 * Curated fallback content with Top 5 Global, Top 5 Indonesia, Facts, and Glossary
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    globalNews: [
      {
        title: 'Global Renewable Energy Reaches New Milestone',
        summary: 'Solar and wind power produced more electricity globally this month than fossil fuels in several major economies, marking a historic shift toward clean energy.',
        source: 'Reuters'
      },
      {
        title: 'International Space Station Welcomes New Global Crew',
        summary: 'Astronauts from three continents docked safely with the ISS to begin a six-month mission researching microgravity biology.',
        source: 'BBC News'
      },
      {
        title: 'Tech Summit Finalizes Ethical Standards for AI',
        summary: 'Representatives from 40 nations signed a joint pledge establishing safety and fairness benchmarks for autonomous AI systems.',
        source: 'The Verge'
      },
      {
        title: 'Major Breakthrough in Ocean Cleanup Initiative',
        summary: 'Engineers deployed new floating barrier systems that successfully collected over 100 tons of plastic debris from the Pacific Garbage Patch.',
        source: 'The Guardian'
      },
      {
        title: 'Global Semiconductor Supply Chains Rebalance',
        summary: 'New microchip fabrication facilities opened in Europe and North America, easing global hardware supply shortages.',
        source: 'Bloomberg'
      }
    ],
    indonesiaNews: [
      {
        title: 'Pembangunan IKN Nusantara Capai Tahap Krusial',
        summary: 'Fasilitas pemerintahan utama dan jalur transportasi hijau di Ibu Kota Nusantara resmi siap untuk beroperasi penuh.',
        source: 'Antara News'
      },
      {
        title: 'Ekspor Produk Manufaktur dan Nikel RI Meningkat',
        summary: 'Hilirisasi industri mineral nasional mencatatkan kenaikan surplus perdagangan ekspor sebesar 12% pada kuartal ini.',
        source: 'Kompas'
      },
      {
        title: 'Program Vaksinasi dan Kesehatan Sekolah Serentak',
        summary: 'Dinas Kesehatan di berbagai provinsi memulai Bulan Imunisasi Anak Sekolah (BIAS) untuk memperkuat imun puluhan ribu siswa SD.',
        source: 'Detik News'
      },
      {
        title: 'Kereta Cepat Whoosh Catat Rekor 5 Juta Penumpang',
        summary: 'Layanan transportasi Whoosh relasi Jakarta-Bandung berhasil melayani lonjakan penumpang liburan dengan ketepatan waktu 99%.',
        source: 'Tempo'
      },
      {
        title: 'Inovasi Startup Pertanian Lokal Raih Pendanaan Global',
        summary: 'Platform agritech asal Indonesia yang membantu petani kopi lokal sukses mendapatkan suntikan modal ventura internasional.',
        source: 'CNBC Indonesia'
      }
    ],
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
