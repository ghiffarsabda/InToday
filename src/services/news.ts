export interface RawNewsItem {
  title: string;
  link: string;
  source: string;
  sourceUrl?: string;
}

export function parseRssFeed(xmlText: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];

    // Extract Title
    const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(itemContent);
    let title = titleMatch ? titleMatch[1].trim() : '';
    // Clean HTML entities if any
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    // Extract Link
    const linkMatch = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i.exec(itemContent);
    const link = linkMatch ? linkMatch[1].trim() : '';

    // Extract Source Name & URL
    const sourceMatch = /<source\s+url="([^"]*)"[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/i.exec(itemContent);
    let sourceName = sourceMatch ? sourceMatch[2].trim() : '';
    const sourceUrl = sourceMatch ? sourceMatch[1].trim() : '';

    // If sourceName is embedded at end of title (e.g. "Headline - Reuters")
    if (!sourceName && title.includes(' - ')) {
      const parts = title.split(' - ');
      sourceName = parts[parts.length - 1].trim();
      title = parts.slice(0, -1).join(' - ').trim();
    } else if (sourceName && title.endsWith(` - ${sourceName}`)) {
      title = title.slice(0, -(sourceName.length + 3)).trim();
    }

    if (title && (link || sourceName)) {
      items.push({
        title,
        link,
        source: sourceName || 'News Source',
        sourceUrl
      });
    }

    if (items.length >= 10) break;
  }

  return items;
}

export async function fetchLiveRssFeeds(): Promise<{
  globalNews: RawNewsItem[];
  indonesiaNews: RawNewsItem[];
}> {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const [globalRes, idRes] = await Promise.allSettled([
    fetch('https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en', {
      headers: { 'User-Agent': userAgent }
    }),
    fetch('https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id', {
      headers: { 'User-Agent': userAgent }
    })
  ]);

  let globalNews: RawNewsItem[] = [];
  let indonesiaNews: RawNewsItem[] = [];

  if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
    const text = await globalRes.value.text();
    globalNews = parseRssFeed(text);
  }

  if (idRes.status === 'fulfilled' && idRes.value.ok) {
    const text = await idRes.value.text();
    indonesiaNews = parseRssFeed(text);
  }

  return { globalNews, indonesiaNews };
}
