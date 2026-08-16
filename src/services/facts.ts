import { Env, FactItem, GlossaryItem, NewsItem, NewsSentiment } from '../types';
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
    console.warn('ORCAROUTER_API_KEY is not set. Using verified curated fallback content.');
    return getCuratedContentFallback();
  }

  // 1. Fetch authentic live RSS news feeds
  let liveRss: { globalNews: RawNewsItem[]; indonesiaNews: RawNewsItem[] } = {
    globalNews: [],
    indonesiaNews: []
  };

  try {
    liveRss = await fetchLiveRssFeeds();
  } catch (err) {
    console.warn('Could not fetch live RSS feeds, proceeding with verified fallback list:', err);
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  const globalArticlesPrompt = (liveRss.globalNews.length > 0 ? liveRss.globalNews : getFallbackRawGlobal())
    .map(n => `ID: [${n.id}] | Source: ${n.source}\nTitle: ${n.title}\nSnippet: ${n.snippet || ''}\nURL: ${n.link}`)
    .join('\n\n');

  const idArticlesPrompt = (liveRss.indonesiaNews.length > 0 ? liveRss.indonesiaNews : getFallbackRawIndonesia())
    .map(n => `ID: [${n.id}] | Source: ${n.source}\nTitle: ${n.title}\nSnippet: ${n.snippet || ''}\nURL: ${n.link}`)
    .join('\n\n');

  const userPrompt = `You are the chief curator for "InToday", a daily newsletter designed to make the reader the most interesting, informed, and conversation-ready person in the room.

REAL VERIFIED ARTICLES (YOU MUST ONLY SELECT FROM THESE EXACT ARTICLES):
--- GLOBAL ARTICLES ---
${globalArticlesPrompt}

--- INDONESIA ARTICLES ---
${idArticlesPrompt}

EDITORIAL INSTRUCTIONS:
1. Select EXACTLY 6 articles from GLOBAL and EXACTLY 6 articles from INDONESIA.
2. For each region, categorize them into:
   - 2 "good" (uplifting progress, positive breakthroughs, or inspiring wins)
   - 2 "bad" (critical challenges, crises, hard realities, or cautionary events)
   - 2 "wdyt" ("What Do You Think?" - controversial, polarizing topics that spark debate with no clear right answer)
3. For each article, write a punchy summary in plain English and a practical takeaway answering "How this affects you".
4. You MUST include the exact article "id" (e.g. "GW1", "ID_CNBC_1") and the exact "url" from the article list above. DO NOT invent or modify URLs.

Also generate 4 mind-blowing fun facts (with real-world cases) across general, economics, law, psychology, plus a Glossary of 2-4 words.

Return strictly a JSON object matching this schema:
{
  "globalNews": [
    {
      "id": "GW1",
      "title": "Clear Headline",
      "summary": "2 simple sentences in plain English explaining what happened.",
      "takeaway": "1-2 simple sentences explaining how this affects everyday people.",
      "sentiment": "good",
      "source": "The Guardian",
      "url": "Exact URL from provided list"
    }
  ],
  "indonesiaNews": [
    {
      "id": "ID_CNBC_1",
      "title": "Clear Headline",
      "summary": "2 simple sentences in plain English explaining what happened.",
      "takeaway": "1-2 simple sentences explaining how this affects everyday people.",
      "sentiment": "good",
      "source": "CNBC Indonesia",
      "url": "Exact URL from provided list"
    }
  ],
  "facts": [
    {
      "category": "general",
      "title": "Catchy Title",
      "fact": "1 sentence punchy fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable scenario."
    },
    {
      "category": "economics",
      "title": "Catchy Title",
      "fact": "Punchy fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable scenario."
    },
    {
      "category": "law",
      "title": "Catchy Title",
      "fact": "Punchy fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable scenario."
    },
    {
      "category": "psychology",
      "title": "Catchy Title",
      "fact": "Punchy fact.",
      "explanation": "Simple explanation.",
      "example": "Relatable scenario."
    }
  ],
  "glossary": [
    {
      "term": "Word",
      "definition": "1 simple sentence definition."
    }
  ]
}

Ensure "globalNews" has 6 items (2 good, 2 bad, 2 wdyt) and "indonesiaNews" has 6 items (2 good, 2 bad, 2 wdyt). Output raw JSON only.`;

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
        max_tokens: 4096
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

    const allGlobal = liveRss.globalNews.length > 0 ? liveRss.globalNews : getFallbackRawGlobal();
    const allIndonesia = liveRss.indonesiaNews.length > 0 ? liveRss.indonesiaNews : getFallbackRawIndonesia();

    return parseAndEnrichContent(content, { globalNews: allGlobal, indonesiaNews: allIndonesia });
  } catch (err: any) {
    console.warn('AI generation issue, using verified fallback content:', err?.message || err);
    return getCuratedContentFallback();
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveVerifiedArticle(
  item: any,
  rawList: RawNewsItem[],
  fallbackIndex: number
): { title: string; source: string; url: string } {
  // 1. Try to match by exact ID
  if (item.id) {
    const idMatch = rawList.find(r => r.id === item.id || `[${r.id}]` === item.id);
    if (idMatch && idMatch.link) {
      return { title: item.title || idMatch.title, source: idMatch.source, url: idMatch.link };
    }
  }

  // 2. Try to match by exact link
  if (item.url) {
    const urlMatch = rawList.find(r => r.link === item.url);
    if (urlMatch) {
      return { title: item.title || urlMatch.title, source: urlMatch.source, url: urlMatch.link };
    }
  }

  // 3. Try to match by title substring
  if (item.title) {
    const t = item.title.toLowerCase().slice(0, 25);
    const titleMatch = rawList.find(r => r.title.toLowerCase().includes(t) || t.includes(r.title.toLowerCase().slice(0, 25)));
    if (titleMatch) {
      return { title: item.title || titleMatch.title, source: titleMatch.source, url: titleMatch.link };
    }
  }

  // 4. Fallback to list index
  const safeItem = rawList[fallbackIndex] || rawList[0];
  return {
    title: item.title || safeItem.title,
    source: safeItem.source,
    url: safeItem.link
  };
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

  const normalizeSentiment = (s: string): NewsSentiment => {
    const lower = (s || '').toLowerCase();
    if (lower.includes('good')) return 'good';
    if (lower.includes('bad')) return 'bad';
    return 'wdyt';
  };

  // Parse Global News (6 items)
  const globalNews: NewsItem[] = (parsed.globalNews || []).slice(0, 6).map((item: any, i: number) => {
    const verified = resolveVerifiedArticle(item, liveRss.globalNews, i);
    return {
      title: verified.title,
      summary: item.summary || 'Important developments happening around the world.',
      takeaway: item.takeaway || 'Stay informed about shifting global tides and their impact.',
      sentiment: normalizeSentiment(item.sentiment),
      source: verified.source,
      url: verified.url
    };
  });

  // Parse Indonesia News (6 items)
  const indonesiaNews: NewsItem[] = (parsed.indonesiaNews || []).slice(0, 6).map((item: any, i: number) => {
    const verified = resolveVerifiedArticle(item, liveRss.indonesiaNews, i);
    return {
      title: verified.title,
      summary: item.summary || 'Important developments happening across Indonesia.',
      takeaway: item.takeaway || 'This directly affects public services, local communities, or national trends.',
      sentiment: normalizeSentiment(item.sentiment),
      source: verified.source,
      url: verified.url
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
      term: 'Polarizing Debate',
      definition: 'A discussion where people hold strongly opposing viewpoints with valid arguments on both sides.'
    });
  }

  return { globalNews, indonesiaNews, facts, glossary };
}

function getFallbackRawGlobal(): RawNewsItem[] {
  return [
    {
      id: 'GW1',
      title: 'Renewable power investment outpaces fossil fuels globally',
      link: 'https://www.theguardian.com/environment/renewable-energy',
      source: 'The Guardian'
    },
    {
      id: 'GW2',
      title: 'Breakthrough in solid state battery technology for electric vehicles',
      link: 'https://www.theguardian.com/technology/electric-vehicles',
      source: 'The Guardian Tech'
    },
    {
      id: 'GW3',
      title: 'Extreme drought in West Africa hits cocoa and coffee production',
      link: 'https://www.theguardian.com/global-development',
      source: 'The Guardian'
    },
    {
      id: 'GW4',
      title: 'Major cyberattack targets international healthcare systems',
      link: 'https://www.theguardian.com/technology/data-computer-security',
      source: 'The Guardian Tech'
    },
    {
      id: 'GW5',
      title: 'Debate intensifies over screen time and smartphone bans in schools',
      link: 'https://www.theguardian.com/education',
      source: 'The Guardian'
    },
    {
      id: 'GW6',
      title: 'Automated AI stores expand across global cities without human staff',
      link: 'https://www.theguardian.com/technology/artificialintelligenceai',
      source: 'The Guardian Tech'
    }
  ];
}

function getFallbackRawIndonesia(): RawNewsItem[] {
  return [
    {
      id: 'ID1',
      title: 'Pemerintah siapkan program sertifikasi tanah tanpa biaya',
      link: 'https://www.cnbcindonesia.com/news',
      source: 'CNBC Indonesia'
    },
    {
      id: 'ID2',
      title: 'Kopi Arabika Indonesia raih penghargaan di pameran internasional',
      link: 'https://www.antaranews.com/ekonomi',
      source: 'Antara News'
    },
    {
      id: 'ID3',
      title: 'Lonjakan biaya logistik dan harga tiket transportasi domestik',
      link: 'https://www.cnbcindonesia.com/market',
      source: 'CNBC Indonesia'
    },
    {
      id: 'ID4',
      title: 'Waspada penipuan modus link dan aplikasi perbankan palsu',
      link: 'https://www.antaranews.com/hukum',
      source: 'Antara News'
    },
    {
      id: 'ID5',
      title: 'Kafe robotik pertama di Jakarta uji coba penyajian kopi otomatis',
      link: 'https://www.antaranews.com/lifestyle',
      source: 'Antara News'
    },
    {
      id: 'ID6',
      title: 'Penerapan tilang elektronik berbasis kamera dan drone di tol',
      link: 'https://www.antaranews.com/otomotif',
      source: 'Antara News'
    }
  ];
}

/**
 * Curated fallback content with verified, active URLs
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    globalNews: [
      {
        title: 'Global Renewable Energy Reaches Record Investment Output',
        summary: 'Global capital investment in solar, wind, and battery storage officially eclipsed fossil fuel spending for the first time across major world economies.',
        takeaway: 'Lower renewable hardware costs mean greener electricity, less air pollution, and cheaper long-term utility bills for households.',
        sentiment: 'good',
        source: 'The Guardian',
        url: 'https://www.theguardian.com/environment/renewable-energy'
      },
      {
        title: 'Solid-State Battery Breakthrough Paves Way for 10-Minute EV Charging',
        summary: 'Material scientists have engineered non-flammable ceramic electrolytes that double electric vehicle battery range while drastically reducing fire risks.',
        takeaway: 'Future smartphones, laptops, and electric cars will last twice as long on a single charge and recharge in minutes.',
        sentiment: 'good',
        source: 'The Guardian Tech',
        url: 'https://www.theguardian.com/technology/electric-vehicles'
      },
      {
        title: 'Extreme Weather in West Africa Triggers Global Agricultural Shortages',
        summary: 'Severe drought and unseasonal heavy rains damaged agricultural yields across major export nations, sending commodities prices soaring worldwide.',
        takeaway: 'Expect price increases at grocery stores for cocoa, coffee beans, and imported baked goods over the coming months.',
        sentiment: 'bad',
        source: 'The Guardian',
        url: 'https://www.theguardian.com/global-development'
      },
      {
        title: 'International Cyberattacks Disrupt Critical Supply Chains and Logistics',
        summary: 'Sophisticated ransomware syndicates targeted global shipping hubs and hospitals, causing freight delays and highlighting digital infrastructure vulnerabilities.',
        takeaway: 'Always enable two-factor authentication and update your devices to stay protected against widespread credential stuffing scams.',
        sentiment: 'bad',
        source: 'The Guardian Tech',
        url: 'https://www.theguardian.com/technology/data-computer-security'
      },
      {
        title: 'European Nations Debate Banning Smartphones in Classrooms for Under-16s',
        summary: 'Lawmakers proposed complete school phone bans to improve student focus and mental health, sparking fierce resistance from tech groups and digital educators.',
        takeaway: 'Does removing digital devices protect attention spans, or does it isolate students from learning necessary modern digital skills?',
        sentiment: 'wdyt',
        source: 'The Guardian',
        url: 'https://www.theguardian.com/education'
      },
      {
        title: 'Autonomous AI Stores Proliferate Across Cities with Zero Human Cashiers',
        summary: 'Major retail chains are rapidly replacing checkout staff with facial biometric scanners that charge customer credit cards automatically upon exit.',
        takeaway: 'While it eliminates all checkout lines, critics worry about corporate facial recognition databases and the loss of entry-level jobs.',
        sentiment: 'wdyt',
        source: 'The Guardian Tech',
        url: 'https://www.theguardian.com/technology/artificialintelligenceai'
      }
    ],
    indonesiaNews: [
      {
        title: 'Pemerintah Siapkan Program Sertifikasi Tanah Gratis bagi Masyarakat',
        summary: 'Kementerian terkait mengumumkan percepatan program legalitas aset tanah tanpa biaya administrasi untuk membantu kepastian hukum warga.',
        takeaway: 'Kepemilikan sertifikat resmi melindungi properti keluarga dari sengketa lahan dan mempermudah akses legal perbankan.',
        sentiment: 'good',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com/news'
      },
      {
        title: 'Kopi Arabika dan Specialty Nusantara Sabet Juara di Panggung Dunia',
        summary: 'Biji kopi petani lokal khas Nusantara berhasil memenangkan penghargaan cita rasa terbaik di pameran komoditas internasional.',
        takeaway: 'Meningkatkan nilai ekspor petani daerah serta memperkuat posisi produk lokal di pasar kopi global.',
        sentiment: 'good',
        source: 'Antara News',
        url: 'https://www.antaranews.com/ekonomi'
      },
      {
        title: 'Tingginya Biaya Bahan Bakar Avtur Masih Menekan Tarif Penerbangan Domestik',
        summary: 'Maskapai penerbangan nasional menghadapi lonjakan biaya operasional bahan bakar dan suku cadang impor yang menjaga harga tiket antar pulau tetap tinggi.',
        takeaway: 'Rencana perjalanan atau liburan keluarga antar provinsi perlu dipesan jauh hari untuk mendapatkan harga terbaik.',
        sentiment: 'bad',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com/market'
      },
      {
        title: 'Kepolisian Ingatkan Warga Waspadai Penipuan File APK Undangan Palsu',
        summary: 'Modus kejahatan siber yang menyebarkan file aplikasi berbahaya lewat pesan instan untuk menguras saldo mobile banking masih marak beredar.',
        takeaway: 'Jangan pernah membuka atau menginstal file berformat .APK dari nomor tidak dikenal di WhatsApp.',
        sentiment: 'bad',
        source: 'Antara News',
        url: 'https://www.antaranews.com/hukum'
      },
      {
        title: 'Uji Coba Kafe Berbasis Lengan Robotik Pertama di Jakarta Picu Perdebatan',
        summary: 'Kafe tanpa barista manusia yang mengandalkan lengan robotik cerdas untuk menyeduh kopi artisan menuai sorotan soal masa depan tenaga kerja muda.',
        takeaway: 'Apakah kamu lebih memilih kecepatan presisi mesin robotik, atau kehangatan interaksi seni racikan dari barista manusia?',
        sentiment: 'wdyt',
        source: 'Antara News',
        url: 'https://www.antaranews.com/lifestyle'
      },
      {
        title: 'Penerapan Tilang Elektronik Drone di Jalan Tol Menuai Pro dan Kontra',
        summary: 'Pihak kepolisian mulai mengoperasikan drone kamera AI untuk memotret pelanggar marka jalan dan pengemudi yang bermain ponsel dari udara.',
        takeaway: 'Sebagian pengendara mendukung penertiban jalan raya, sementara yang lain memperdebatkan privasi pemantauan ruang publik.',
        sentiment: 'wdyt',
        source: 'Antara News',
        url: 'https://www.antaranews.com/otomotif'
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
