import { NewsletterData } from '../types';

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

/**
 * Renders the newsletter in clean GitHub README markdown style.
 * Layout:
 * 1. Header
 * 2. 7 Mind-Expanding & Actionable Insights:
 *    - 🔬 Science
 *    - 📈 Economics
 *    - ⚖️ Law & Governance
 *    - 🧠 Psychology
 *    - 🏛️ History
 *    - 🌙 Islam (Actionable spiritual advice)
 *    - 🩺 Health (Actionable wellness habit)
 * 3. Glossary (New words learned today)
 * 4. Footer
 */
export function renderNewsletterHtml(data: NewsletterData): string {
  const { formattedDate, facts, glossary } = data;

  // 1. Format Insights Section
  const factsHtml = facts.map((fact) => `
    <div style="margin-bottom: 26px;">
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
        <strong style="font-weight: 600; color: #0969da;">${fact.actionOrExampleLabel || '💡 Real-world case:'}</strong> ${fact.example}
      </div>
    </div>
  `).join('');

  // 2. Format Glossary Section
  const glossaryHtml = (glossary && glossary.length > 0) ? glossary.map(g => `
    <li style="margin-bottom: 8px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.5; color: #1f2328;">
      <strong style="font-weight: 600; color: #1f2328;">${g.term}:</strong> ${g.definition}
    </li>
  `).join('') : '<li style="color: #656d76; font-size: 14px;">No technical terms today!</li>';

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
    body, table, td, p, h1, h2, h3, blockquote, span, li, a {
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
        Your daily briefing: 7 mind-expanding micro-insights, actionable life advice, and new concepts in plain English.
      </p>
    </blockquote>

    <!-- 1. ## ✨ Daily Mind-Expanding & Actionable Insights -->
    <h2 style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 600; line-height: 1.25; color: #1f2328; margin: 32px 0 16px 0; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de;">
      ✨ Daily Micro-Insights &amp; Actions
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

    <!-- Footer -->
    <hr style="height: 1px; padding: 0; margin: 36px 0 16px 0; background-color: #d0d7de; border: 0;" />
    
    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 400; color: #656d76; font-family: ${FONT_STACK};">
      Generated by <strong style="font-weight: 600; color: #1f2328;">InToday</strong> &middot; Powered by Ghiffar Sabda's sheer fookin will.
    </p>
    <p style="margin: 0; font-size: 11px; font-weight: 400; color: #8c959f; font-family: ${FONT_STACK};">
      Private edition &middot; Sent to subscriber list
    </p>

  </div>

</body>
</html>`;
}

/**
 * Plaintext version for email clients that do not support HTML.
 */
export function renderNewsletterText(data: NewsletterData): string {
  const { formattedDate, facts, glossary } = data;

  let text = `# InToday · ${formattedDate}\n\n`;
  text += `> Your daily briefing: 7 mind-expanding micro-insights, actionable advice, and key concepts.\n\n`;

  // 1. Facts
  text += `## ✨ Daily Micro-Insights & Actions\n\n`;
  for (const fact of facts) {
    text += `### ${fact.emoji} ${fact.categoryLabel}: ${fact.title}\n\n`;
    text += `> ${fact.fact}\n\n`;
    text += `${fact.explanation}\n\n`;
    text += `${fact.actionOrExampleLabel || '💡 Real-world case:'} ${fact.example}\n\n`;
  }
  text += `---\n\n`;

  // 2. Glossary
  if (glossary && glossary.length > 0) {
    text += `## 📖 Glossary\n\n`;
    text += `New words learned today:\n`;
    for (const item of glossary) {
      text += `- **${item.term}**: ${item.definition}\n`;
    }
    text += `\n`;
  }

  text += `Generated by InToday · Powered by Ghiffar Sabda's sheer fookin will.\n`;
  return text;
}
