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
    ? liveRss.globalNews.map((n, i) => `${i + 1}. [${n.source}] ${n.title} (URL: ${n.link})`).join('\n')
    : '1. [Reuters] Major international clean energy milestones achieved.\n2. [BBC] Global economic summit releases latest forecasts.';

  const idHeadlinesStr = liveRss.indonesiaNews.length > 0
    ? liveRss.indonesiaNews.map((n, i) => `${i + 1}. [${n.source}] ${n.title} (URL: ${n.link})`).join('\n')
    : '1. [Antara] Pembangunan infrastruktur nasional terus dipercepat.\n2. [Kompas] Pertumbuhan ekonomi kuartal ini catatkan hasil positif.';

  const userPrompt = `You write for "InToday", a daily newsletter that provides:
1. Top 5 Most Important Global News
2. Top 5 Most Important Indonesia News
3. 4 Fun Facts (easy to understand for junior high schoolers, with real-world examples)
4. A Glossary of new words

Live Headlines to select from:
GLOBAL:
${globalHeadlinesStr}

INDONESIA:
${idHeadlinesStr}

For every news story, provide:
- "title": Clear headline
- "summary": 1-2 simple, easy-to-understand sentences in plain English explaining what happened.
- "takeaway": 1-2 simple sentences answering: "How does this affect you / everyday people?" (e.g. impact on wallet, travel, technology, daily life, or global future).
- "source": Source name (e.g. Reuters, BBC, Kompas, Antara, Detik)
- "url": The exact link provided in the list (or source domain)

Return strictly a JSON object with this exact schema:
{
  "globalNews": [
    {
      "title": "Headline",
      "summary": "Simple explanation.",
      "takeaway": "How this affects you in everyday life.",
      "source": "Source Name",
      "url": "https://..."
    }
  ],
  "indonesiaNews": [
    {
      "title": "Headline",
      "summary": "Simple explanation.",
      "takeaway": "How this affects you in everyday life.",
      "source": "Source Name",
      "url": "https://..."
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
        max_tokens: 3800
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
      takeaway: item.takeaway || 'Stay informed about changing global trends and international relations.',
      source: item.source || matchedRss?.source || 'International Press',
      url: item.url || matchedRss?.link || 'https://news.google.com'
    };
  });

  // Parse Indonesia News
  const indonesiaNews: NewsItem[] = (parsed.indonesiaNews || []).slice(0, 5).map((item: any, i: number) => {
    const matchedRss = liveRss.indonesiaNews[i];
    return {
      title: item.title || matchedRss?.title || 'Indonesia News Update',
      summary: item.summary || 'Important developments happening across Indonesia today.',
      takeaway: item.takeaway || 'This directly affects public services, national economic momentum, or local communities.',
      source: item.source || matchedRss?.source || 'Indonesian Media',
      url: item.url || matchedRss?.link || 'https://news.google.com'
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
 * Curated fallback content with clickable links, takeaways, facts, and glossary
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    globalNews: [
      {
        title: 'Global Renewable Energy Reaches Record Output',
        summary: 'Solar and wind power produced more electricity globally this month than fossil fuels across several major economies.',
        takeaway: 'Cheaper green electricity means cleaner air and lower long-term household utility bills across the world.',
        source: 'Reuters',
        url: 'https://www.reuters.com'
      },
      {
        title: 'International Space Station Welcomes New Crew',
        summary: 'Astronauts from three continents docked safely with the ISS to begin a mission researching microgravity medicine.',
        takeaway: 'Medical tests conducted in space help scientists develop better vaccines and treatments for diseases back on Earth.',
        source: 'BBC News',
        url: 'https://www.bbc.com/news'
      },
      {
        title: 'Global Tech Summit Finalizes AI Safety Standards',
        summary: 'Representatives from 40 nations signed a pledge establishing transparency and privacy benchmarks for AI apps.',
        takeaway: 'New rules ensure AI features in your phone and search engines protect your private data and prevent scams.',
        source: 'The Verge',
        url: 'https://www.theverge.com'
      },
      {
        title: 'Major Breakthrough in Ocean Plastic Cleanup',
        summary: 'Engineers deployed new floating barrier systems that collected over 100 tons of plastic debris from the Pacific.',
        takeaway: 'Less plastic in the ocean protects fish populations and keeps microplastics out of the global food supply.',
        source: 'The Guardian',
        url: 'https://www.theguardian.com'
      },
      {
        title: 'Global Microchip Supply Chains Stabilize',
        summary: 'New semiconductor factories opened in Europe and Asia, ending supply shortages for cars and electronics.',
        takeaway: 'Gadgets like smartphones, game consoles, and laptops will face fewer stock delays and price gouging.',
        source: 'Bloomberg',
        url: 'https://www.bloomberg.com'
      }
    ],
    indonesiaNews: [
      {
        title: 'Pembangunan IKN Nusantara Capai Tahap Krusial',
        summary: 'Fasilitas pemerintahan utama dan sistem transportasi hijau di Ibu Kota Nusantara resmi siap untuk beroperasi penuh.',
        takeaway: 'Pemerataan pusat ekonomi baru di Kalimantan akan membuka ribuan lapangan kerja dan memecah kepadatan di Pulau Jawa.',
        source: 'Antara News',
        url: 'https://www.antaranews.com'
      },
      {
        title: 'Ekspor Produk Manufaktur dan Nikel RI Meningkat',
        summary: 'Hilirisasi industri mineral nasional mencatatkan kenaikan surplus perdagangan ekspor sebesar 12% kuartal ini.',
        takeaway: 'Cadangan devisa negara yang kuat membantu menstabilkan nilai tukar Rupiah sehingga harga barang impor tidak melonjak.',
        source: 'Kompas',
        url: 'https://www.kompas.com'
      },
      {
        title: 'Program Vaksinasi Anak Sekolah (BIAS) Digelar Serentak',
        summary: 'Dinas Kesehatan di berbagai provinsi memulai Bulan Imunisasi Anak Sekolah untuk melindungi puluhan ribu siswa dari penyakit menular.',
        takeaway: 'Membantu menjaga kekebalan kelompok di lingkungan sekolah sehingga anak-anak dan adik di rumah tidak mudah tertular sakit.',
        source: 'Detik News',
        url: 'https://news.detik.com'
      },
      {
        title: 'Kereta Cepat Whoosh Catat Rekor 5 Juta Penumpang',
        summary: 'Layanan transportasi Whoosh relasi Jakarta-Bandung berhasil melayani lonjakan penumpang dengan ketepatan waktu 99%.',
        takeaway: 'Perjalanan antar kota makin cepat dan efisien, memangkas waktu tempuh dari 3 jam menjadi cuma 45 menit.',
        source: 'Tempo',
        url: 'https://www.tempo.co'
      },
      {
        title: 'Startup Pertanian Lokal Raih Pendanaan Global',
        summary: 'Platform agritech asal Indonesia yang membantu petani kopi lokal sukses mendapatkan suntikan modal ventura internasional.',
        takeaway: 'Petani lokal bisa menjual hasil panen dengan harga lebih adil langsung ke pembeli tanpa terpotong tengkulak.',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com'
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
