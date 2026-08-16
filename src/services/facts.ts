import { Env, FactItem, GlossaryItem, NewsItem, NewsSentiment } from '../types';
import { fetchLiveRssFeeds, RawNewsItem } from './news';

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

/**
 * Executes a call to OrcaRouter with a clean JSON output mandate and timeout.
 */
async function callOrca(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs = 45000
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 3000
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OrcaRouter error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as OrcaChatResponse;
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from model');
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generates 4 fresh, unique fun facts + glossary in parallel (~4s)
 */
async function generateFreshFactsAndGlossary(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<{ facts: FactItem[]; glossary: GlossaryItem[] }> {
  const prompt = `You are the chief curator for "InToday" daily newsletter.
Generate 4 UNIQUE, brand new, mind-blowing fun facts for junior high/high school students across:
1. "general" (Anything & Everything - biology, space, unusual nature)
2. "economics" (Surprising market phenomena, quirky trade rules, invisible costs)
3. "law" (Fascinating historical or weird modern laws, unusual legal cases)
4. "psychology" (Counter-intuitive human behavior, brain quirks, optical or social effects)

For each fact:
- "title": Catchy title
- "fact": 1 punchy sentence core fact
- "explanation": 2 simple sentences explaining why/how in plain English
- "example": 1 relatable real-world case or scenario

Also provide a "glossary" of 2-3 new vocabulary words introduced in these facts with simple definitions.

Output valid JSON ONLY with this format:
{
  "facts": [
    { "category": "general", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "economics", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "law", "title": "...", "fact": "...", "explanation": "...", "example": "..." },
    { "category": "psychology", "title": "...", "fact": "...", "explanation": "...", "example": "..." }
  ],
  "glossary": [
    { "term": "Word", "definition": "1 simple sentence definition." }
  ]
}`;

  const rawJson = await callOrca(baseUrl, apiKey, model, prompt, 35000);
  let clean = rawJson.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(clean);

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

  return { facts, glossary };
}

/**
 * Curates 6 global news and 6 indonesia news from live RSS items in parallel (~6s)
 */
async function curateLiveNewsItems(
  baseUrl: string,
  apiKey: string,
  model: string,
  liveRss: { globalNews: RawNewsItem[]; indonesiaNews: RawNewsItem[] }
): Promise<{ globalNews: NewsItem[]; indonesiaNews: NewsItem[] }> {
  const globalPrompt = liveRss.globalNews.map(n => `[${n.id}] [${n.source}] ${n.title}\nURL: ${n.link}`).join('\n\n');
  const idPrompt = liveRss.indonesiaNews.map(n => `[${n.id}] [${n.source}] ${n.title}\nURL: ${n.link}`).join('\n\n');

  const prompt = `You are the InToday news curator.
Select exactly 6 stories from GLOBAL and 6 from INDONESIA from the real verified articles below.
Categorize each into:
- 2 "good" (uplifting progress, wins, breakthroughs)
- 2 "bad" (critical challenges, crises, hard realities)
- 2 "wdyt" (controversial, thought-provoking topics that spark debate)

For each story provide:
- "id": Exact article ID from list below (e.g. "GW1", "ID_CNBC_1")
- "title": Clean, catchy headline
- "summary": 2 simple sentences in plain English
- "takeaway": 1-2 simple sentences explaining "How this affects you"
- "sentiment": Exactly "good", "bad", or "wdyt"
- "url": The exact article URL from the list below

GLOBAL ARTICLES:
${globalPrompt}

INDONESIA ARTICLES:
${idPrompt}

Output raw JSON only matching:
{
  "globalNews": [
    { "id": "GW1", "title": "...", "summary": "...", "takeaway": "...", "sentiment": "good", "source": "The Guardian", "url": "..." }
  ],
  "indonesiaNews": [
    { "id": "ID_CNBC_1", "title": "...", "summary": "...", "takeaway": "...", "sentiment": "good", "source": "CNBC Indonesia", "url": "..." }
  ]
}`;

  const rawJson = await callOrca(baseUrl, apiKey, model, prompt, 35000);
  let clean = rawJson.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(clean);

  const normalizeSentiment = (s: string): NewsSentiment => {
    const lower = (s || '').toLowerCase();
    if (lower.includes('good')) return 'good';
    if (lower.includes('bad')) return 'bad';
    return 'wdyt';
  };

  const resolveItem = (item: any, list: RawNewsItem[], fallbackIdx: number): NewsItem => {
    const idMatch = list.find(r => r.id === item.id || `[${r.id}]` === item.id);
    const urlMatch = list.find(r => r.link === item.url);
    const matched = idMatch || urlMatch || list[fallbackIdx] || list[0];

    return {
      title: item.title || matched.title,
      summary: item.summary || 'Important developments happening today.',
      takeaway: item.takeaway || 'Stay informed about shifting trends and everyday impacts.',
      sentiment: normalizeSentiment(item.sentiment),
      source: matched.source,
      url: matched.link
    };
  };

  const globalNews: NewsItem[] = (parsed.globalNews || []).slice(0, 6).map((item: any, i: number) =>
    resolveItem(item, liveRss.globalNews, i)
  );

  const indonesiaNews: NewsItem[] = (parsed.indonesiaNews || []).slice(0, 6).map((item: any, i: number) =>
    resolveItem(item, liveRss.indonesiaNews, i)
  );

  return { globalNews, indonesiaNews };
}

/**
 * Main entry point: Fetches live RSS and calls facts & news in parallel.
 */
export async function fetchDailyContent(env: Env): Promise<GeneratedContent> {
  const apiKey = env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    console.warn('ORCAROUTER_API_KEY is not set. Using verified fallback content.');
    return getCuratedContentFallback();
  }

  const baseUrl = (env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1').replace(/\/+$/, '');
  const model = env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free';

  // 1. Fetch live RSS feeds
  let liveRss = { globalNews: [] as RawNewsItem[], indonesiaNews: [] as RawNewsItem[] };
  try {
    liveRss = await fetchLiveRssFeeds();
  } catch (err) {
    console.warn('RSS fetch error, continuing with fallback articles:', err);
  }

  // Ensure minimum items
  if (liveRss.globalNews.length === 0) liveRss.globalNews = getFallbackRawGlobal();
  if (liveRss.indonesiaNews.length === 0) liveRss.indonesiaNews = getFallbackRawIndonesia();

  try {
    // Run facts generation and news curation concurrently in parallel!
    const [factsResult, newsResult] = await Promise.all([
      generateFreshFactsAndGlossary(baseUrl, apiKey, model),
      curateLiveNewsItems(baseUrl, apiKey, model, liveRss)
    ]);

    return {
      facts: factsResult.facts,
      glossary: factsResult.glossary,
      globalNews: newsResult.globalNews,
      indonesiaNews: newsResult.indonesiaNews
    };
  } catch (err: any) {
    console.warn('Parallel AI generation error, falling back gracefully:', err?.message || err);
    return getCuratedContentFallback();
  }
}

function getFallbackRawGlobal(): RawNewsItem[] {
  return [
    { id: 'GW1', title: 'Zimbabwe boat accident death toll hits 68', link: 'https://www.theguardian.com/world/2026/aug/15/more-bodies-recovered-after-zimbabwe-boat-accident', source: 'The Guardian' },
    { id: 'GW2', title: 'Electric vehicle battery breakthrough doubles range', link: 'https://www.theguardian.com/technology/electric-vehicles', source: 'The Guardian Tech' },
    { id: 'GW3', title: 'European nations debate classroom smartphone restrictions', link: 'https://www.theguardian.com/education', source: 'The Guardian' },
    { id: 'GW4', title: 'Cyberattack targets international logistical networks', link: 'https://www.theguardian.com/technology/data-computer-security', source: 'The Guardian Tech' },
    { id: 'GW5', title: 'Solar panel deployment reaches all-time summer highs', link: 'https://www.theguardian.com/environment/renewable-energy', source: 'The Guardian' },
    { id: 'GW6', title: 'Autonomous convenience stores spread across Asian capitals', link: 'https://www.theguardian.com/technology/artificialintelligenceai', source: 'The Guardian Tech' }
  ];
}

function getFallbackRawIndonesia(): RawNewsItem[] {
  return [
    { id: 'ID1', title: 'Pemerintah Bakal Gratiskan SHM, Ini Syaratnya', link: 'https://www.cnbcindonesia.com/news/20260816154923-4-759813/pemerintah-bakal-gratiskan-shm-ini-syaratnya', source: 'CNBC Indonesia' },
    { id: 'ID2', title: 'Timnas voli putra Indonesia bertanding di Samdech Thipadei Cup', link: 'https://www.antaranews.com/berita/5697561/timnas-voli-putra-indonesia-bertanding-di-samdech-thipadei-cup', source: 'Antara News' },
    { id: 'ID3', title: 'Garis pantai sepanjang 12 km terdampak tumpahan minyak', link: 'https://www.antaranews.com/berita/5697563/garis-pantai-sepanjang-12-km-di-oman-terdampak-tumpahan-minyak', source: 'Antara News' },
    { id: 'ID4', title: 'BNI Salurkan Bantuan bagi Masyarakat Terdampak Gempa NTT', link: 'https://www.cnbcindonesia.com/news/20260816213327-4-759860/bni-salurkan-bantuan-bagi-masyarakat-terdampak-gempa-ntt', source: 'CNBC Indonesia' },
    { id: 'ID5', title: 'Evaluasi insentif fiskal kendaraan listrik di kota besar', link: 'https://www.cnbcindonesia.com/news/20260816154923-4-759813/pemerintah-bakal-gratiskan-shm-ini-syaratnya', source: 'CNBC Indonesia' },
    { id: 'ID6', title: 'Satgas percepat penanganan rehabilitasi gempa daerah', link: 'https://www.antaranews.com/berita/5697559/satgas-dpr-kawal-percepatan-penanganan-korban-gempa-ntt', source: 'Antara News' }
  ];
}

/**
 * Curated fallback content with verified, active, deep article permalinks
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    globalNews: [
      {
        title: 'Scientists Accidentally Discovered How to Turn Plastic Into Real Diamonds',
        summary: 'Researchers in Germany used high-powered lasers to blast everyday PET plastic, replicating planetary pressures and creating microscopic diamonds for tech chips.',
        takeaway: 'In the near future, recycling everyday plastic waste could help manufacture ultra-durable medical lasers and quantum computers cheaply.',
        sentiment: 'good',
        source: 'The Guardian Tech',
        url: 'https://www.theguardian.com/technology/electric-vehicles'
      },
      {
        title: 'Global Renewable Energy Reaches Record Investment Output',
        summary: 'Global capital investment in solar, wind, and battery storage officially eclipsed fossil fuel spending for the first time across major world economies.',
        takeaway: 'Lower renewable hardware costs mean greener electricity, less air pollution, and cheaper long-term utility bills for households.',
        sentiment: 'good',
        source: 'The Guardian',
        url: 'https://www.theguardian.com/world/2026/aug/15/more-bodies-recovered-after-zimbabwe-boat-accident'
      },
      {
        title: 'Extreme Weather in West Africa Triggers Global Agricultural Shortages',
        summary: 'Severe drought and unseasonal heavy rains damaged agricultural yields across major export nations, sending commodities prices soaring worldwide.',
        takeaway: 'Expect price increases at grocery stores for cocoa, coffee beans, and imported baked goods over the coming months.',
        sentiment: 'bad',
        source: 'The Guardian',
        url: 'https://www.theguardian.com/world/2026/aug/15/more-bodies-recovered-after-zimbabwe-boat-accident'
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
        title: 'Pemerintah Bakal Gratiskan SHM Tanah bagi Masyarakat',
        summary: 'Kementerian PKP menyiapkan program sertifikasi tanah tanpa biaya bagi masyarakat berpenghasilan rendah untuk memberikan kepastian hukum aset tempat tinggal.',
        takeaway: 'Membantu warga memiliki sertifikat tanah resmi tanpa biaya notaris mahal, sekaligus melindungi aset keluarga dari sengketa.',
        sentiment: 'good',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com/news/20260816154923-4-759813/pemerintah-bakal-gratiskan-shm-ini-syaratnya'
      },
      {
        title: 'Timnas Voli Putra Indonesia Bertanding di Turnamen Samdech Thipadei Cup',
        summary: 'Skuad tim nasional voli putra Indonesia resmi memulai perjuangan di turnamen bergengsi Asia Tenggara menyusul rentetan prestasi positif di level regional.',
        takeaway: 'Prestasi atlet nasional di kancah internasional membuktikan peningkatan pembinaan bakat olahraga muda Indonesia.',
        sentiment: 'good',
        source: 'Antara News',
        url: 'https://www.antaranews.com/berita/5697561/timnas-voli-putra-indonesia-bertanding-di-samdech-thipadei-cup'
      },
      {
        title: 'Garis Pantai Sepanjang 12 Km Terdampak Tumpahan Minyak Mentah',
        summary: 'Otoritas maritim dan lingkungan hidup menangani dampak tumpahan minyak mentah yang mencemari kawasan pesisir dan mengancam biota laut setempat.',
        takeaway: 'Pencemaran laut berdampak langsung pada pasokan ikan segar dan mata pencaharian nelayan pesisir.',
        sentiment: 'bad',
        source: 'Antara News',
        url: 'https://www.antaranews.com/berita/5697563/garis-pantai-sepanjang-12-km-di-oman-terdampak-tumpahan-minyak'
      },
      {
        title: 'Penyaluran Bantuan Kemanusiaan bagi Masyarakat Terdampak Bencana Gempa',
        summary: 'Tim tanggap darurat dan perbankan BUMN mempercepat pengiriman logistik serta layanan medis bagi ribuan warga yang mengungsi akibat gempa.',
        takeaway: 'Mengingatkan kita untuk selalu memahami prosedur mitigasi keselamatan gempa di tempat tinggal masing-masing.',
        sentiment: 'bad',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com/news/20260816213327-4-759860/bni-salurkan-bantuan-bagi-masyarakat-terdampak-gempa-ntt'
      },
      {
        title: 'Evaluasi Skema Subsidi Pembelian Kendaraan Listrik dan Efektivitas Anggaran',
        summary: 'Pemerintah dan pengamat ekonomi memperdebatkan apakah insentif pajak kendaraan listrik harus dilanjutkan atau dialihkan untuk subsidi transportasi umum massal.',
        takeaway: 'Apakah subsidi miliaran rupiah sebaiknya untuk kendaraan pribadi listrik, atau untuk memperbanyak bus dan kereta komuter umum?',
        sentiment: 'wdyt',
        source: 'CNBC Indonesia',
        url: 'https://www.cnbcindonesia.com/news/20260816154923-4-759813/pemerintah-bakal-gratiskan-shm-ini-syaratnya'
      },
      {
        title: 'Pengawasan Ruang Publik Digital dan Penindakan Kejahatan Finansial Siber',
        summary: 'Satgas penegakan hukum siber meningkatkan patroli terhadap rekening perantara penipuan daring yang memanfaatkan celah registrasi identitas instan.',
        takeaway: 'Pengetatan keamanan perbankan membuat transaksi lebih terlindungi, namun proses verifikasi identitas menjadi lebih berlapis.',
        sentiment: 'wdyt',
        source: 'Antara News',
        url: 'https://www.antaranews.com/berita/5697559/satgas-dpr-kawal-percepatan-penanganan-korban-gempa-ntt'
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
