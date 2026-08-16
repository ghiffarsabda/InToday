import { NewsletterData, NewsItem } from '../types';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

/**
 * Helper to render a group of news cards with sentiment headers.
 */
function renderNewsGroup(title: string, icon: string, items: NewsItem[]): string {
  if (!items || items.length === 0) return '';

  const cardsHtml = items.map((news) => `
    <div style="margin-bottom: 20px;">
      <h4 style="font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; line-height: 1.35; color: #1f2328; margin: 0 0 6px 0;">
        ${news.title}
      </h4>
      
      <p style="margin: 0 0 8px 0; font-family: ${FONT_STACK}; font-size: 14px; font-weight: 400; line-height: 1.6; color: #24292f;">
        ${news.summary}
      </p>

      <!-- How this affects you -->
      <div style="margin: 0 0 8px 0; padding: 8px 12px; background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; font-family: ${FONT_STACK}; font-size: 13px; line-height: 1.5; color: #24292f;">
        <strong style="font-weight: 600; color: #0969da;">🤔 How this affects you:</strong> ${news.takeaway}
      </div>

      <div style="font-family: ${FONT_STACK}; font-size: 12px; color: #656d76;">
        <em>Source:</em> <a href="${news.url || '#'}" target="_blank" style="color: #0969da; text-decoration: underline; font-weight: 500;">${news.source} &#8599;</a>
      </div>
    </div>
  `).join('');

  return `
    <div style="margin-bottom: 26px;">
      <h3 style="font-family: ${FONT_STACK}; font-size: 16.5px; font-weight: 600; line-height: 1.3; color: #1f2328; margin: 18px 0 12px 0;">
        ${icon} ${title}
      </h3>
      ${cardsHtml}
    </div>
  `;
}

/**
 * Renders the 6 news items grouped into Good (2), Bad (2), and WDYT (2).
 */
function renderCategorizedNewsSection(newsList: NewsItem[]): string {
  const goodNews = (newsList || []).filter(n => n.sentiment === 'good');
  const badNews = (newsList || []).filter(n => n.sentiment === 'bad');
  const wdytNews = (newsList || []).filter(n => n.sentiment === 'wdyt');

  // Fallback split if sentiments were loose
  const finalGood = goodNews.length > 0 ? goodNews : (newsList || []).slice(0, 2);
  const finalBad = badNews.length > 0 ? badNews : (newsList || []).slice(2, 4);
  const finalWdyt = wdytNews.length > 0 ? wdytNews : (newsList || []).slice(4, 6);

  let html = '';
  html += renderNewsGroup('The Good News', '🟢', finalGood);
  html += renderNewsGroup('The Bad News', '🔴', finalBad);
  html += renderNewsGroup('WDYT? (What Do You Think?)', '🟡', finalWdyt);
  return html;
}

/**
 * Renders the newsletter in clean GitHub README markdown style.
 * Layout Order:
 * 1. Header
 * 2. Fun Facts (General, Economics, Law, Psychology)
 * 3. Glossary (New words learned today)
 * 4. Indonesia News (2 Good, 2 Bad, 2 WDYT = 6 items)
 * 5. Global News (2 Good, 2 Bad, 2 WDYT = 6 items)
 * 6. Footer
 */
export function renderNewsletterHtml(data: NewsletterData): string {
  const { formattedDate, facts, glossary, indonesiaNews, globalNews } = data;

  // 1. Format Fun Facts Section
  const factsHtml = facts.map((fact) => `
    <div style="margin-bottom: 24px;">
      <h3 style="font-family: ${FONT_STACK}; font-size: 16px; font-weight: 600; line-height: 1.35; color: #1f2328; margin: 0 0 8px 0;">
        ${fact.emoji} ${fact.categoryLabel}: ${fact.title}
      </h3>

      <blockquote style="margin: 0 0 10px 0; padding: 0 1em; color: #1f2328; border-left: 0.25em solid #d0d7de; font-family: ${FONT_STACK}; font-size: 14.5px; font-weight: 500; line-height: 1.6;">
        <p style="margin: 0;">
          ${fact.fact}
        </p>
      </blockquote>

      <p style="margin: 0 0 10px 0; font-family: ${FONT_STACK}; font-size: 14px; font-weight: 400; line-height: 1.6; color: #1f2328;">
        ${fact.explanation}
      </p>

      <div style="margin: 0 0 12px 0; padding: 8px 12px; background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; font-family: ${FONT_STACK}; font-size: 13px; line-height: 1.5; color: #24292f;">
        <strong style="font-weight: 600; color: #0969da;">💡 Real-world case:</strong> ${fact.example}
      </div>
    </div>
  `).join('');

  // 2. Format Glossary Section
  const glossaryHtml = (glossary && glossary.length > 0) ? glossary.map(g => `
    <li style="margin-bottom: 8px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.5; color: #1f2328;">
      <strong style="font-weight: 600; color: #1f2328;">${g.term}:</strong> ${g.definition}
    </li>
  `).join('') : '<li style="color: #656d76; font-size: 14px;">No technical terms today!</li>';

  // 3. Format Indonesia News (6 items)
  const idNewsHtml = renderCategorizedNewsSection(indonesiaNews);

  // 4. Format Global News (6 items)
  const globalNewsHtml = renderCategorizedNewsSection(globalNews);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · ${formattedDate}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    body, table, td, p, h1, h2, h3, h4, blockquote, span, li, a {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #ffffff; color: #1f2328; font-family: ${FONT_STACK}; font-size: 14.5px; font-weight: 400; line-height: 1.6; -webkit-font-smoothing: antialiased;">
  
  <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff;">
    
    <!-- Header / H1 -->
    <h1 style="font-family: ${FONT_STACK}; font-size: 26px; font-weight: 600; line-height: 1.25; color: #1f2328; margin: 0 0 12px 0; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de;">
      InToday &middot; ${formattedDate}
    </h1>

    <blockquote style="margin: 0 0 24px 0; padding: 0 1em; color: #57606a; border-left: 0.25em solid #d0d7de; font-family: ${FONT_STACK}; font-size: 14px; font-weight: 400; line-height: 1.5;">
      <p style="margin: 0;">
        Your daily briefing: mind-expanding facts, key concepts, and 6 essential news stories (2 good, 2 bad, 2 WDYT).
      </p>
    </blockquote>

    <!-- 1. ## ✨ Daily Mind-Expanding Fun Facts -->
    <h2 style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 600; line-height: 1.25; color: #1f2328; margin: 32px 0 16px 0; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de;">
      ✨ Daily Mind-Expanding Facts
    </h2>
    ${factsHtml}

    <!-- 2. ## 📖 Glossary -->
    <h2 style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 600; line-height: 1.25; color: #1f2328; margin: 36px 0 14px 0; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de;">
      📖 Glossary
    </h2>

    <p style="margin: 0 0 10px 0; font-family: ${FONT_STACK}; font-size: 14.5px; font-weight: 600; color: #1f2328;">
      New words learned today:
    </p>

    <ul style="margin: 0 0 20px 0; padding-left: 24px;">
      ${glossaryHtml}
    </ul>

    <!-- 3. ## 🇮🇩 What's Buzzing in Indonesia (6 stories: 2 good, 2 bad, 2 WDYT) -->
    <h2 style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 600; line-height: 1.25; color: #1f2328; margin: 36px 0 16px 0; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de;">
      🇮🇩 What's Buzzing in Indonesia
    </h2>
    ${idNewsHtml}

    <!-- 4. ## 🌐 Global News You Can't Miss (6 stories: 2 good, 2 bad, 2 WDYT) -->
    <h2 style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 600; line-height: 1.25; color: #1f2328; margin: 36px 0 16px 0; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de;">
      🌐 Global News You Can't Miss
    </h2>
    ${globalNewsHtml}

    <!-- Footer -->
    <hr style="height: 1px; padding: 0; margin: 36px 0 16px 0; background-color: #d0d7de; border: 0;" />
    
    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 400; color: #656d76; font-family: ${FONT_STACK};">
      Generated by <strong style="font-weight: 600; color: #1f2328;">InToday</strong> &middot; Powered by OrcaRouter &amp; Resend
    </p>
    <p style="margin: 0; font-size: 11px; font-weight: 400; color: #8c959f; font-family: ${FONT_STACK};">
      Private edition &middot; Sent to subscriber list
    </p>

  </div>

</body>
</html>`;
}

function renderTextNewsGroup(title: string, icon: string, items: NewsItem[]): string {
  if (!items || items.length === 0) return '';
  let text = `### ${icon} ${title}\n\n`;
  for (const n of items) {
    text += `* ${n.title}\n`;
    text += `  ${n.summary}\n`;
    text += `  🤔 How this affects you: ${n.takeaway}\n`;
    text += `  Source: ${n.source} (${n.url || 'https://news.google.com'})\n\n`;
  }
  return text;
}

/**
 * Plaintext version for email clients that do not support HTML.
 */
export function renderNewsletterText(data: NewsletterData): string {
  const { formattedDate, facts, glossary, indonesiaNews, globalNews } = data;

  let text = `# InToday · ${formattedDate}\n\n`;
  text += `> Your daily briefing: mind-expanding facts, key concepts, and 6 essential news stories.\n\n`;

  // 1. Facts
  text += `## ✨ Daily Mind-Expanding Facts\n\n`;
  for (const fact of facts) {
    text += `### ${fact.emoji} ${fact.categoryLabel}: ${fact.title}\n\n`;
    text += `> ${fact.fact}\n\n`;
    text += `${fact.explanation}\n\n`;
    text += `💡 Real-world case: ${fact.example}\n\n`;
  }
  text += `---\n\n`;

  // 2. Glossary
  if (glossary && glossary.length > 0) {
    text += `## 📖 Glossary\n\n`;
    text += `New words learned today:\n`;
    for (const item of glossary) {
      text += `- **${item.term}**: ${item.definition}\n`;
    }
    text += `\n---\n\n`;
  }

  // 3. Indonesia News
  text += `## 🇮🇩 What's Buzzing in Indonesia\n\n`;
  text += renderTextNewsGroup('The Good News', '🟢', (indonesiaNews || []).filter(n => n.sentiment === 'good'));
  text += renderTextNewsGroup('The Bad News', '🔴', (indonesiaNews || []).filter(n => n.sentiment === 'bad'));
  text += renderTextNewsGroup('WDYT? (What Do You Think?)', '🟡', (indonesiaNews || []).filter(n => n.sentiment === 'wdyt'));
  text += `---\n\n`;

  // 4. Global News
  text += `## 🌐 Global News You Can't Miss\n\n`;
  text += renderTextNewsGroup('The Good News', '🟢', (globalNews || []).filter(n => n.sentiment === 'good'));
  text += renderTextNewsGroup('The Bad News', '🔴', (globalNews || []).filter(n => n.sentiment === 'bad'));
  text += renderTextNewsGroup('WDYT? (What Do You Think?)', '🟡', (globalNews || []).filter(n => n.sentiment === 'wdyt'));
  text += `---\n\n`;

  text += `Generated by InToday · Powered by OrcaRouter & Resend\n`;
  return text;
}
