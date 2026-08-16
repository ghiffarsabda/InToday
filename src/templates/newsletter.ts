import { NewsletterData } from '../types';

/**
 * Renders the newsletter as a clean, GitHub-flavored Markdown styled HTML email.
 */
export function renderNewsletterHtml(data: NewsletterData): string {
  const { formattedDate, facts } = data;

  const factsHtml = facts.map((fact, index) => {
    const isLast = index === facts.length - 1;
    return `
      <!-- Fact Section: ${fact.categoryLabel} -->
      <div style="margin-bottom: ${isLast ? '0' : '28px'};">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="display: inline-block; font-size: 11px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 12px; background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; margin-right: 8px;">
            ${fact.emoji} ${fact.categoryLabel}
          </span>
        </div>

        <h3 style="margin: 0 0 10px 0; font-size: 17px; font-weight: 600; line-height: 1.35; color: #1f2328;">
          ${fact.title}
        </h3>

        <!-- Core Fact Blockquote (GitHub Markdown Style) -->
        <div style="margin: 0 0 10px 0; padding: 10px 14px; background-color: #f6f8fa; border-left: 3.5px solid #0969da; border-radius: 0 6px 6px 0;">
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #24292f; font-weight: 500;">
            ${fact.fact}
          </p>
        </div>

        <!-- Detail / Context Paragraph -->
        <p style="margin: 0; font-size: 13.5px; line-height: 1.65; color: #57606a;">
          ${fact.detail}
        </p>

        ${!isLast ? '<hr style="border: 0; height: 1px; background-color: #d0d7de; margin: 24px 0 0 0;" />' : ''}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · ${formattedDate}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, h1, h2, h3, span { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f6f8fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #1f2328;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f6f8fa; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #d0d7de; border-radius: 8px; box-shadow: 0 1px 3px rgba(31, 35, 40, 0.04); overflow: hidden;">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 24px 28px 20px 28px; border-bottom: 1px solid #d0d7de; background-color: #ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #0969da; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">
                      ✦ DAILY INTELLECTUAL BRIEF
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #1f2328; letter-spacing: -0.3px;">
                      InToday
                    </h1>
                  </td>
                  <td align="right" style="vertical-align: bottom;">
                    <span style="display: inline-block; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #57606a; background-color: #f6f8fa; border: 1px solid #d0d7de; padding: 3px 8px; border-radius: 6px;">
                      ${formattedDate}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Intro Subtitle -->
          <tr>
            <td style="padding: 16px 28px; background-color: #fbfcfe; border-bottom: 1px solid #eaeef2;">
              <p style="margin: 0; font-size: 13px; color: #57606a; line-height: 1.5;">
                Curated micro-insights across everyday reality, economic systems, jurisprudence, and human psychology.
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 28px 28px;">
              ${factsHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 28px; background-color: #f6f8fa; border-top: 1px solid #d0d7de; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #57606a; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">
                Generated by InToday Worker · Powered by OrcaRouter & Resend
              </p>
              <p style="margin: 0; font-size: 11px; color: #8c959f;">
                Private automated edition · Sent to your personal subscriber list
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plaintext version for email clients that do not support HTML.
 */
export function renderNewsletterText(data: NewsletterData): string {
  const { formattedDate, facts } = data;

  let text = `===============================\n`;
  text += ` INTODAY · DAILY BRIEF\n`;
  text += ` ${formattedDate}\n`;
  text += `===============================\n\n`;

  for (const fact of facts) {
    text += `[${fact.emoji} ${fact.categoryLabel.toUpperCase()}]\n`;
    text += `${fact.title}\n`;
    text += `> ${fact.fact}\n\n`;
    text += `${fact.detail}\n`;
    text += `---------------------------------\n\n`;
  }

  text += `Generated by InToday Worker · Powered by OrcaRouter & Resend\n`;
  return text;
}
