export interface RawNewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  snippet?: string;
}

export function parseRssFeed(xmlText: string, sourceName: string, prefix: string, limit = 12): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  let count = 1;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];

    // Extract Title
    const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(itemContent);
    let title = titleMatch ? titleMatch[1].trim() : '';
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

    // Extract Link (handle <link>...</link> or <link href="..." /> or <guid isPermaLink="true">...</guid>)
    let link = '';
    const linkMatch = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i.exec(itemContent);
    if (linkMatch && linkMatch[1].trim().startsWith('http')) {
      link = linkMatch[1].trim();
    } else {
      const guidMatch = /<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i.exec(itemContent);
      if (guidMatch && guidMatch[1].trim().startsWith('http')) {
        link = guidMatch[1].trim();
      }
    }

    // Extract Description / Snippet
    const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(itemContent);
    let snippet = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    if (snippet.length > 200) snippet = snippet.slice(0, 197) + '...';

    if (title && link) {
      items.push({
        id: `${prefix}${count}`,
        title,
        link,
        source: sourceName,
        snippet
      });
      count++;
    }

    if (items.length >= limit) break;
  }

  return items;
}

export async function fetchLiveRssFeeds(): Promise<{
  globalNews: RawNewsItem[];
  indonesiaNews: RawNewsItem[];
}> {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  const [guardianWorldRes, guardianTechRes, cnbcIdRes, antaraIdRes] = await Promise.allSettled([
    fetch('https://www.theguardian.com/world/rss', { headers: { 'User-Agent': userAgent } }),
    fetch('https://www.theguardian.com/technology/rss', { headers: { 'User-Agent': userAgent } }),
    fetch('https://www.cnbcindonesia.com/news/rss', { headers: { 'User-Agent': userAgent } }),
    fetch('https://www.antaranews.com/rss/terkini.xml', { headers: { 'User-Agent': userAgent } })
  ]);

  const globalNews: RawNewsItem[] = [];
  const indonesiaNews: RawNewsItem[] = [];

  // Parse Global Feeds
  if (guardianWorldRes.status === 'fulfilled' && guardianWorldRes.value.ok) {
    const text = await guardianWorldRes.value.text();
    globalNews.push(...parseRssFeed(text, 'The Guardian', 'GW', 8));
  }

  if (guardianTechRes.status === 'fulfilled' && guardianTechRes.value.ok) {
    const text = await guardianTechRes.value.text();
    globalNews.push(...parseRssFeed(text, 'The Guardian Tech', 'GT', 6));
  }

  // Parse Indonesia Feeds
  if (cnbcIdRes.status === 'fulfilled' && cnbcIdRes.value.ok) {
    const text = await cnbcIdRes.value.text();
    indonesiaNews.push(...parseRssFeed(text, 'CNBC Indonesia', 'ID_CNBC_', 8));
  }

  if (antaraIdRes.status === 'fulfilled' && antaraIdRes.value.ok) {
    const text = await antaraIdRes.value.text();
    indonesiaNews.push(...parseRssFeed(text, 'Antara News', 'ID_ANTARA_', 8));
  }

  return { globalNews, indonesiaNews };
}
