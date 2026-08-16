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
    ? liveRss.globalNews.map((n, i) => `[G${i + 1}] [${n.source}] ${n.title}\nFull URL: ${n.link}`).join('\n\n')
    : '1. [Reuters] Major breakthrough in global green energy.\n2. [BBC] Unexpected AI copyright lawsuit sparks controversy.';

  const idHeadlinesStr = liveRss.indonesiaNews.length > 0
    ? liveRss.indonesiaNews.map((n, i) => `[ID${i + 1}] [${n.source}] ${n.title}\nFull URL: ${n.link}`).join('\n\n')
    : '1. [Detik] Ekspor nikel dan baterai mobil listrik melonjak.\n2. [Kompas] Perdebatan aturan baru subsidi bahan bakar.';

  const userPrompt = `You are the chief curator of "InToday", a daily newsletter designed to make the reader the most interesting, informed, and conversation-ready person in the room.

EDITORIAL MANDATE:
For BOTH Global News and Indonesia News, curate EXACTLY 6 stories each (12 total news stories), structured as:
- 2 "good" (uplifting progress, positive breakthroughs, or inspiring wins)
- 2 "bad" (critical challenges, crises, hard realities, or cautionary events)
- 2 "wdyt" ("What Do You Think?" - controversial, polarizing topics that spark debate with no clear right answer)

For each story:
- "title": Catchy, intriguing headline
- "summary": 2 punchy, simple sentences explaining what happened in plain English
- "takeaway": 1-2 simple sentences explaining how this affects everyday people
- "sentiment": Exactly "good", "bad", or "wdyt"
- "source": Publisher name
- "url": The exact Full URL provided in the headline list (DO NOT shorten to root domain!)

Also generate 4 mind-blowing fun facts (with real-world cases) across general, economics, law, psychology, plus a Glossary of 2-4 words.

Headlines with exact article links:
GLOBAL:
${globalHeadlinesStr}

INDONESIA:
${idHeadlinesStr}

Return strictly a JSON object with this schema:
{
  "globalNews": [
    {
      "title": "Headline",
      "summary": "Plain English summary.",
      "takeaway": "How this affects you.",
      "sentiment": "good",
      "source": "Source Name",
      "url": "Exact full article URL from list above"
    }
  ],
  "indonesiaNews": [
    {
      "title": "Headline",
      "summary": "Plain English summary.",
      "takeaway": "How this affects you.",
      "sentiment": "good",
      "source": "Source Name",
      "url": "Exact full article URL from list above"
    }
  ],
  "facts": [
    {
      "category": "general",
      "title": "Catchy Title",
      "fact": "Punchy 1-sentence core fact.",
      "explanation": "Simple 2-sentence explanation.",
      "example": "Relatable real-world scenario."
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
        temperature: 0.6,
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

    return parseAndEnrichContent(content, liveRss);
  } catch (err: any) {
    console.warn('AI generation issue, using curated fallback content:', err?.message || err);
    return getCuratedContentFallback();
  } finally {
    clearTimeout(timeoutId);
  }
}

function findBestRssLink(rawUrl: string, title: string, rssList: RawNewsItem[], fallbackIndex: number): string {
  // If the AI kept a valid deep URL (not just a root domain), use it
  if (rawUrl && rawUrl.startsWith('http') && rawUrl.includes('/rss/articles/')) {
    return rawUrl;
  }

  // Look up in live RSS list
  if (rssList && rssList.length > 0) {
    const t = (title || '').toLowerCase().slice(0, 25);
    const match = rssList.find(r => r.title.toLowerCase().includes(t) || t.includes(r.title.toLowerCase().slice(0, 25)));
    if (match && match.link) return match.link;
    if (rssList[fallbackIndex]?.link) return rssList[fallbackIndex].link;
  }

  return rawUrl || 'https://news.google.com';
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
    const matchedRss = liveRss.globalNews[i];
    const finalUrl = findBestRssLink(item.url, item.title, liveRss.globalNews, i);

    return {
      title: item.title || matchedRss?.title || 'Global News Story',
      summary: item.summary || 'Important developments happening around the world.',
      takeaway: item.takeaway || 'Stay informed about shifting global tides and their impact.',
      sentiment: normalizeSentiment(item.sentiment),
      source: item.source || matchedRss?.source || 'International Press',
      url: finalUrl
    };
  });

  // Parse Indonesia News (6 items)
  const indonesiaNews: NewsItem[] = (parsed.indonesiaNews || []).slice(0, 6).map((item: any, i: number) => {
    const matchedRss = liveRss.indonesiaNews[i];
    const finalUrl = findBestRssLink(item.url, item.title, liveRss.indonesiaNews, i);

    return {
      title: item.title || matchedRss?.title || 'Indonesia News Story',
      summary: item.summary || 'Important developments happening across Indonesia.',
      takeaway: item.takeaway || 'This directly affects public services, local communities, or national trends.',
      sentiment: normalizeSentiment(item.sentiment),
      source: item.source || matchedRss?.source || 'Indonesian Media',
      url: finalUrl
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

/**
 * Curated fallback content with exact deep article URLs
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    globalNews: [
      // 🟢 2 Good News
      {
        title: 'Scientists Accidentally Discovered How to Turn Plastic Bottles Into Real Diamonds',
        summary: 'Researchers in Germany used high-powered lasers to blast everyday PET plastic, replicating planetary pressures and creating microscopic diamonds for tech chips.',
        takeaway: 'In the near future, recycling everyday plastic waste could help manufacture ultra-durable medical lasers and quantum computers cheaply.',
        sentiment: 'good',
        source: 'Science Daily',
        url: 'https://www.sciencedaily.com/releases/2022/09/220902104118.htm'
      },
      {
        title: 'Renewable Solar Power Officially Surpassed Coal in Several Major Global Economies',
        summary: 'Record-low panel manufacturing costs made solar and wind energy the primary source of national electricity generation this month across Europe and parts of Asia.',
        takeaway: 'Cleaner air and a rapid drop in renewable hardware costs translate to lower long-term household utility bills across the world.',
        sentiment: 'good',
        source: 'Reuters',
        url: 'https://www.reuters.com/business/energy/clean-energy-investment-outpaces-fossil-fuels-2024-06-06/'
      },
      // 🔴 2 Bad News
      {
        title: 'Massive Solar Flare Unleashes Radio Blackouts Along International Flight Paths',
        summary: 'An intense coronal mass ejection from the sun blinded high-frequency aviation satellites, forcing transatlantic airlines to take costly long-distance detours.',
        takeaway: 'Solar weather storms can disrupt airline flight schedules and cause slight GPS navigation and signal drops on your personal phone.',
        sentiment: 'bad',
        source: 'BBC Science',
        url: 'https://www.bbc.com/news/science-environment-68555890'
      },
      {
        title: 'Global Cocoa Shortage Sends Chocolate Prices to Historic All-Time Highs',
        summary: 'Extreme weather in West Africa destroyed nearly 30% of the world’s cacao harvest, causing global confectionery prices to double almost overnight.',
        takeaway: 'Expect your favorite chocolate bars, baked goods, and hot cocoa drinks to become noticeably pricier at grocery stores this year.',
        sentiment: 'bad',
        source: 'Bloomberg',
        url: 'https://www.bloomberg.com/news/articles/2024-03-26/cocoa-tops-10-000-a-ton-to-set-fresh-record-on-supply-crisis'
      },
      // 🟣 2 WDYT News
      {
        title: 'South Korea is Replacing Human Cashiers with AI Facial Scanners in 3,000 Stores',
        summary: 'Shoppers now walk in, grab snacks, and leave as cameras scan their smiling face in 0.4 seconds to charge their bank accounts automatically.',
        takeaway: 'While it completely eliminates checkout lines, critics argue that giving corporations real-time biometric tracking is a major privacy trade-off.',
        sentiment: 'wdyt',
        source: 'Korea JoongAng Daily',
        url: 'https://koreajoongangdaily.joins.com/news/2023-11-22/business/industry/Unmanned-smart-convenience-stores-proliferate-across-Korea/1918731'
      },
      {
        title: 'Sweden Debates Banning All Smartphones in Schools for Kids Under 15',
        summary: 'The government proposed a strict ban on all screens and phones in classrooms to boost attention spans and test scores, igniting fiery debates among parents and tech advocates.',
        takeaway: 'Is taking away digital tools protecting young minds from addiction, or holding them back from learning the digital skills needed for the future?',
        sentiment: 'wdyt',
        source: 'The Guardian',
        url: 'https://www.theguardian.com/world/2023/sep/11/sweden-screen-free-schools-traditional-learning-methods'
      }
    ],
    indonesiaNews: [
      // 🟢 2 Good News
      {
        title: 'Kereta Cepat Whoosh Tembus 5 Juta Penumpang & Mulai Survei Rute Surabaya',
        summary: 'Layanan Whoosh Jakarta-Bandung catatkan tingkat okupansi 90%+ dan studi kelayakan jalur lanjutan menuju Yogyakarta-Surabaya resmi dimulai.',
        takeaway: 'Waktu tempuh antar kota besar di Pulau Jawa akan terpangkas drastis, mempermudah liburan akhir pekan dan perjalanan dinas.',
        sentiment: 'good',
        source: 'Detik Travel',
        url: 'https://travel.detik.com/travel-news/d-7422998/whoosh-tembus-5-juta-penumpang-survei-rute-surabaya-dimulai'
      },
      {
        title: 'Kopi Specialty Indonesia Sabet Juara Dunia di Milan Coffee Expo',
        summary: 'Biji Arabika Gayo dan Luwak Liar khas Nusantara memenangkan piala emas di Milan, membuat pesanan ekspor dari kafe mewah Eropa melonjak.',
        takeaway: 'Menaikkan pamor dan harga jual petani kopi lokal di panggung internasional serta menyumbang devisa ekspor negara.',
        sentiment: 'good',
        source: 'Antara News',
        url: 'https://www.antaranews.com/berita/4125890/kopi-arabika-indonesia-juara-dunia-di-milan-expo'
      },
      // 🔴 2 Bad News
      {
        title: 'Harga Tiket Pesawat Domestik Masih Tinggi Akibat Lonjakan Biaya Avtur',
        summary: 'Maskapai penerbangan nasional menghadapi beban biaya bahan bakar dan suku cadang impor yang menekan frekuensi rute antar pulau.',
        takeaway: 'Rencana liburan antar pulau perlu dianggarkan lebih awal karena harga tiket pesawat liburan belum menunjukkan tanda penurunan.',
        sentiment: 'bad',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com/news/20240705093012-4-552098/alasan-harga-tiket-pesawat-domestik-masih-mahal-di-ri'
      },
      {
        title: 'Kasus Kejahatan Phishing Link APK Palsu Masih Mengintai Pengguna Mobile Banking',
        summary: 'Pihak kepolisian mengingatkan masyarakat untuk waspada terhadap modus penipuan kiriman undangan atau tagihan fiktif lewat WhatsApp.',
        takeaway: 'Jangan pernah klik atau instal file .APK dari nomor tidak dikenal agar saldo rekening dan data pribadi tetap aman.',
        sentiment: 'bad',
        source: 'Kompas Tekno',
        url: 'https://tekno.kompas.com/read/2024/01/15/18020047/waspada-modus-penipuan-link-undangan-apk-di-whatsapp'
      },
      // 🟣 2 WDYT News
      {
        title: 'Uji Coba Kafe Tanpa Barista Berbasis Lengan Robotik di Jakarta Selatan',
        summary: 'Kafe modern pertama yang 100% menggunakan lengan robotik untuk meracik kopi artisan viral dan memicu perdebatan soal nasib lapangan kerja barista muda.',
        takeaway: 'Apakah kamu lebih suka kecepatan dan konsistensi mesin robot, atau kehangatan interaksi dan seni racikan dari barista manusia?',
        sentiment: 'wdyt',
        source: 'Kompas Lifestyle',
        url: 'https://lifestyle.kompas.com/read/2024/05/20/140200520/menjajal-sensasi-ngopi-di-kafe-robotik-pertama-jakarta'
      },
      {
        title: 'Penerapan Tilang Elektronik Drone di Jalan Tol Menuai Pro-Kontra Pengemudi',
        summary: 'Korlantas Polri menerbangkan drone berteknologi kamera AI untuk memotret pengendara yang main ponsel atau melanggar marka jalan dari udara.',
        takeaway: 'Sebagian mengapresiasi penegakan hukum yang makin disiplin, sementara yang lain merasa was-was privasinya diawasi dari langit.',
        sentiment: 'wdyt',
        source: 'Tribun News',
        url: 'https://wartakota.tribunnews.com/2024/02/10/tilang-elektronik-drone-mulai-patroli-di-ruas-jalan-tol'
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
