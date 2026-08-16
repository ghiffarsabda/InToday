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
    : '1. [Reuters] Major AI breakthrough sparks global debate.\n2. [BBC] Unexpected travel and technology rules announced.';

  const idHeadlinesStr = liveRss.indonesiaNews.length > 0
    ? liveRss.indonesiaNews.map((n, i) => `${i + 1}. [${n.source}] ${n.title} (URL: ${n.link})`).join('\n')
    : '1. [Detik] Kebijakan baru transportasi dan tarif liburan jadi perbincangan hangat.\n2. [Kompas] Fenomena tren viral baru di kalangan anak muda kota besar.';

  const userPrompt = `You are the chief curator of "InToday", a daily newsletter designed to make the reader the most interesting, informed, and conversation-ready person in the room.

EDITORIAL MANDATE:
1. Filter out dry bureaucratic announcements. Pick the 5 most sensational, "gossip-worthy", and talk-about-with-friends stories globally, and 5 in Indonesia.
2. The stories must be great conversation starters that you'd bring up when hanging out with normal friends ("Hey guys, did you know that...?"). It can be wild tech shifts, unbelievable societal changes, viral policies, surprising controversies, or jaw-dropping events.
3. Keep the tone sharp, punchy, and conversational (easy for junior high/high schoolers to digest).

For each story:
- "title": Catchy, intriguing headline
- "summary": 2 punchy, engaging sentences explaining the scoop in plain English
- "conversationStarter": A natural hook to bring up with friends, starting with "🗣️ Bring this up: 'Did you know...?'" and why it's fun to talk about
- "source": Publisher name
- "url": Extracted URL or publisher website

Also generate 4 mind-blowing fun facts (with real-world cases) across general, economics, law, psychology, plus a Glossary of 2-4 words.

Headlines to choose from:
GLOBAL:
${globalHeadlinesStr}

INDONESIA:
${idHeadlinesStr}

Return JSON ONLY with this schema:
{
  "globalNews": [
    {
      "title": "Catchy Headline",
      "summary": "Juicy, easy-to-understand breakdown.",
      "conversationStarter": "Did you know that...?",
      "source": "Source Name",
      "url": "https://..."
    }
  ],
  "indonesiaNews": [
    {
      "title": "Catchy Headline",
      "summary": "Juicy, easy-to-understand breakdown.",
      "conversationStarter": "Did you know that...?",
      "source": "Source Name",
      "url": "https://..."
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

Ensure "globalNews" has 5 items and "indonesiaNews" has 5 items. Output raw JSON only.`;

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
      summary: item.summary || 'A major development everyone around the world is talking about today.',
      conversationStarter: item.conversationStarter || 'Did you know about this? It is sparking massive debates across the internet right now!',
      source: item.source || matchedRss?.source || 'International Press',
      url: item.url || matchedRss?.link || 'https://news.google.com'
    };
  });

  // Parse Indonesia News
  const indonesiaNews: NewsItem[] = (parsed.indonesiaNews || []).slice(0, 5).map((item: any, i: number) => {
    const matchedRss = liveRss.indonesiaNews[i];
    return {
      title: item.title || matchedRss?.title || 'Indonesia News Update',
      summary: item.summary || 'A hot topic making waves across Indonesia today.',
      conversationStarter: item.conversationStarter || 'Did you hear about this? It is trending everywhere on social media and group chats!',
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
      term: 'Viral Phenomenon',
      definition: 'An event or trend that spreads rapidly through social networks and word-of-mouth.'
    });
  }

  return { globalNews, indonesiaNews, facts, glossary };
}

/**
 * Curated fallback content loaded with conversational dynamite
 */
export function getCuratedContentFallback(): GeneratedContent {
  return {
    globalNews: [
      {
        title: 'Scientists Accidentally Discovered How to Turn Plastic Into Real Diamonds',
        summary: 'Researchers in Germany used high-powered lasers to blast everyday PET plastic bottles, replicating the extreme core pressure of giant planets and creating microscopic real diamonds.',
        conversationStarter: 'Did you know scientists just figured out how to zap cheap plastic soda bottles with lasers and turn them into real nano-diamonds?',
        source: 'Science Daily',
        url: 'https://www.sciencedaily.com'
      },
      {
        title: 'South Korea is Replacing Traditional Cashiers with AI Face Recognition Everywhere',
        summary: 'Over 3,000 convenience stores across Seoul now allow customers to grab snacks and walk straight out the door by scanning their smiling face in under 0.5 seconds.',
        conversationStarter: 'Did you hear that thousands of Korean stores let you pay by literally just looking at a mirror scanner and walking out with snacks?',
        source: 'Korea Times',
        url: 'https://www.koreatimes.co.kr'
      },
      {
        title: 'New Global Study Reveals Why Everyone Feels Like Time is Passing Faster',
        summary: 'Neuroscientists discovered that because we consume so much rapid-fire short video content, our brain creates fewer novel memory checkpoints, tricking us into feeling months evaporate.',
        conversationStarter: 'Did you ever feel like this year is flying by at 2x speed? Science just confirmed that doomscrolling actually shrinks our brain\'s memory markers of time!',
        source: 'BBC Science',
        url: 'https://www.bbc.com'
      },
      {
        title: 'Major Flight Routes Are Being Rerouted Due to Solar Storm Radio Blackouts',
        summary: 'A series of massive solar flares from the sun disrupted high-frequency aviation satellites, forcing international airlines on polar routes to take long detours.',
        conversationStarter: 'Did you know the sun just had a temper tantrum and shot solar flares that messed up transatlantic airplane flight paths?',
        source: 'Reuters',
        url: 'https://www.reuters.com'
      },
      {
        title: 'A Remote Island in Japan is Paying Young People $10,000 to Move and Farm Seaweed',
        summary: 'To combat an aging population, a scenic island near Okinawa is offering free housing, high-speed fiber internet, and cash grants to anyone under 35 willing to relocate.',
        conversationStarter: 'Who is ready to quit their job? A gorgeous Japanese island is literally paying people $10,000 plus free rent just to move there and work remotely!',
        source: 'Japan Today',
        url: 'https://japantoday.com'
      }
    ],
    indonesiaNews: [
      {
        title: 'Kereta Cepat Whoosh Tambah Rute Baru & Tembus 5 Juta Penumpang',
        summary: 'Lonjakan minat liburan membuat antrean Whoosh Jakarta-Bandung membludak, dan rencana perpanjangan jalur langsung menuju Surabaya kini resmi mulai disurvei.',
        conversationStarter: 'Did you hear that Whoosh just hit 5 million riders and they are now officially plotting the direct track extension all the way to Surabaya?',
        source: 'Detik Travel',
        url: 'https://travel.detik.com'
      },
      {
        title: 'Fenomena "Coffeeshop Tanpa Barista" Pertama di Jakarta Bikin Heboh',
        summary: 'Kafe berbasis lengan robotik pintar di Jakarta Selatan menyajikan racikan kopi artisan dengan akurasi suhu 0.1 derajat tanpa ada satu pun pelayan manusia.',
        conversationStarter: 'Have you guys seen that new coffee spot in South Jakarta where you order on an app and a robot arm brews your latte with zero humans behind the bar?',
        source: 'Kompas Lifestyle',
        url: 'https://lifestyle.kompas.com'
      },
      {
        title: 'Aturan Baru Tilang Elektronik (ETLE) Drone Mulai Berpatroli di Jalan Tol',
        summary: 'Korlantas Polri memperluas pengawasan jalan tol menggunakan drone canggih yang bisa mendeteksi pengendara main HP atau ugal-ugalan dari ketinggian 50 meter.',
        conversationStarter: 'Careful on the highway this weekend—police drones are now flying 50 meters in the air capturing high-res photos of people texting while driving!',
        source: 'Tribun News',
        url: 'https://www.tribunnews.com'
      },
      {
        title: 'Kopi Specialty Indonesia Jadi Rebutan di Pameran Dunia Milan',
        summary: 'Biji kopi luwak liar dan Arabika Gayo berhasil menyabet penghargaan tertinggi di Milan Expo, membuat pesanan dari kafe-kafe mewah Eropa melonjak.',
        conversationStarter: 'Our local Gayo coffee just beat out hundreds of international roasters in Milan to take the gold trophy as the world’s most flavorful bean!',
        source: 'Antara News',
        url: 'https://www.antaranews.com'
      },
      {
        title: 'Rupiah Menguat Tajam Berkat Lonjakan Investasi Pabrik Baterai EV Global',
        summary: 'Dua raksasa otomotif dunia resmi memulai pembangunan pabrik sel baterai raksasa di Jawa Barat, menyuntikkan likuiditas miliaran dolar ke pasar domestik.',
        conversationStarter: 'Did you see the currency charts? Rupiah is flexing strong because global EV giants just poured billions into new West Java mega-factories!',
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
