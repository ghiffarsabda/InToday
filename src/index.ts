import { Env } from './types';
import { RECIPIENT_EMAILS } from './config';
import { fetchDailyContent, getCuratedContentFallback, GeneratedContent } from './services/facts';
import { sendDailyNewsletter } from './services/email';
import { renderNewsletterHtml } from './templates/newsletter';

// In-memory cache for today's generated content to make subsequent requests instant
let cachedContent: { dateKey: string; content: GeneratedContent } | null = null;

export default {
  /**
   * Cron Trigger Handler
   * Executes automatically according to crons defined in wrangler.jsonc
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[InToday Cron] Triggered at ${new Date().toISOString()} (cron: ${event.cron})`);
    
    ctx.waitUntil(
      (async () => {
        try {
          console.log('[InToday Cron] Fetching daily fun facts and glossary...');
          const content = await fetchDailyContent(env);
          console.log(`[InToday Cron] Generated ${content.facts.length} facts and ${content.glossary.length} glossary terms.`);

          // Update cache
          const todayKey = new Date().toISOString().split('T')[0];
          cachedContent = { dateKey: todayKey, content };

          console.log(`[InToday Cron] Dispatching email to ${RECIPIENT_EMAILS.length} recipients...`);
          const result = await sendDailyNewsletter(env, content, RECIPIENT_EMAILS);

          if (result.success) {
            console.log('[InToday Cron] Email sent successfully:', JSON.stringify(result.data));
          } else {
            console.error('[InToday Cron] Failed to send email:', result.error);
          }
        } catch (error) {
          console.error('[InToday Cron] Unhandled error during scheduled execution:', error);
        }
      })()
    );
  },

  /**
   * HTTP Fetch Handler
   * Provides a web dashboard, fast HTML email preview, and manual dispatch endpoints.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const todayKey = new Date().toISOString().split('T')[0];

    // 1. Email HTML Preview (Instant by default, live AI generation with ?live=true)
    if (path === '/preview') {
      try {
        const isLiveRequested = url.searchParams.get('live') === 'true';
        let content: GeneratedContent;
        let isLiveGenerated = false;

        if (isLiveRequested) {
          content = await fetchDailyContent(env);
          cachedContent = { dateKey: todayKey, content };
          isLiveGenerated = true;
        } else if (cachedContent && cachedContent.dateKey === todayKey) {
          content = cachedContent.content;
          isLiveGenerated = true;
        } else {
          // Instant default preview with zero wait time
          content = getCuratedContentFallback();
        }

        const date = new Date();
        const formattedDate = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        let html = renderNewsletterHtml({
          date: todayKey,
          formattedDate,
          facts: content.facts,
          glossary: content.glossary
        });

        // Minimal sticky top banner for preview controls
        const toolbar = `
        <div style="background: #161b22; color: #c9d1d9; padding: 10px 16px; border-bottom: 1px solid #30363d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12.5px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1000;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: #f0f6fc;">InToday Email Preview:</strong>
            <span style="background: ${isLiveGenerated ? 'rgba(63, 185, 80, 0.2)' : 'rgba(210, 153, 34, 0.2)'}; color: ${isLiveGenerated ? '#3fb950' : '#d29922'}; padding: 2px 7px; border-radius: 12px; font-size: 11px; font-weight: 600;">
              ${isLiveGenerated ? '● Live AI Generated' : '○ Instant Sample Mode'}
            </span>
          </div>
          <div style="display: flex; gap: 10px;">
            ${!isLiveRequested ? '<a href="/preview?live=true" style="background: #238636; color: #ffffff; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;">⚡️ Generate Live with AI</a>' : '<a href="/preview" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">Switch to Instant Sample</a>'}
            <a href="/" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 5px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">← Dashboard</a>
          </div>
        </div>`;

        html = html.replace('<body', '<body style="margin:0;padding:0;"');
        html = html.replace(/(<body[^>]*>)/i, `$1${toolbar}`);

        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      } catch (err) {
        return new Response(`Error generating preview: ${err instanceof Error ? err.message : String(err)}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    // 2. Fetch Facts & News JSON API
    if (path === '/api/facts' || path === '/api/content') {
      try {
        const content = await fetchDailyContent(env);
        cachedContent = { dateKey: todayKey, content };
        return new Response(JSON.stringify({ success: true, content }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Manual Email Trigger (POST /send)
    if (path === '/send' && request.method === 'POST') {
      try {
        console.log('[InToday Manual Trigger] Fetching live content...');
        const content = await fetchDailyContent(env);
        cachedContent = { dateKey: todayKey, content };

        console.log('[InToday Manual Trigger] Sending email...');
        const result = await sendDailyNewsletter(env, content, RECIPIENT_EMAILS);

        return new Response(JSON.stringify(result, null, 2), {
          status: result.success ? 200 : 500,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }, null, 2),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Admin / Management Dashboard UI
    const hasOrcaKey = Boolean(env.ORCAROUTER_API_KEY && env.ORCAROUTER_API_KEY.length > 5);
    const hasResendKey = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.length > 5);

    const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · Newsletter Worker</title>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --heading: #f0f6fc;
      --accent: #2f81f7;
      --accent-hover: #58a6ff;
      --success: #3fb950;
      --warning: #d29922;
      --danger: #f85149;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 680px;
    }
    .header {
      margin-bottom: 28px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
    }
    .badge {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(47, 129, 247, 0.15);
      border: 1px solid rgba(47, 129, 247, 0.3);
      padding: 3px 8px;
      border-radius: 12px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 6px 0;
      color: var(--heading);
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    p.subtitle {
      margin: 0;
      color: #8b949e;
      font-size: 14px;
      line-height: 1.5;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--heading);
      margin-top: 0;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #21262d;
      font-size: 13px;
    }
    .status-row:last-child { border-bottom: none; }
    .status-tag {
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 600;
    }
    .status-ok { background: rgba(63, 185, 80, 0.15); color: var(--success); border: 1px solid rgba(63, 185, 80, 0.3); }
    .status-missing { background: rgba(248, 81, 73, 0.15); color: var(--danger); border: 1px solid rgba(248, 81, 73, 0.3); }
    .recipients-list {
      margin: 0;
      padding-left: 20px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #8b949e;
    }
    .recipients-list li { margin-bottom: 4px; }
    .button-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 24px;
    }
    .btn {
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
    }
    .btn-primary {
      background-color: var(--accent);
      color: #ffffff;
      border-color: rgba(240, 246, 252, 0.1);
      grid-column: span 2;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
    }
    .btn-primary:hover { background-color: var(--accent-hover); }
    .btn-secondary {
      background-color: #21262d;
      color: var(--heading);
      border-color: var(--border);
    }
    .btn-secondary:hover { background-color: #30363d; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #send-result {
      margin-top: 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      padding: 12px;
      border-radius: 6px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Cloudflare Worker</div>
      <h1>InToday Newsletter Engine</h1>
      <p class="subtitle">Automated daily live news + intellectual brief via OrcaRouter &amp; Resend</p>
    </div>

    <div class="card">
      <div class="card-title">System Environment & Secrets</div>
      <div class="status-row">
        <span>Live Web News Fetch</span>
        <span class="status-tag status-ok">Active ✓ (Global &amp; Indonesia)</span>
      </div>
      <div class="status-row">
        <span>OrcaRouter API Key</span>
        <span class="status-tag ${hasOrcaKey ? 'status-ok' : 'status-missing'}">${hasOrcaKey ? 'Configured ✓' : 'Missing'}</span>
      </div>
      <div class="status-row">
        <span>Model</span>
        <span style="font-family: var(--font-mono); font-size: 12px; color: #58a6ff;">${env.ORCAROUTER_MODEL || 'deepseek/deepseek-v4-flash-free'}</span>
      </div>
      <div class="status-row">
        <span>Resend API Key</span>
        <span class="status-tag ${hasResendKey ? 'status-ok' : 'status-missing'}">${hasResendKey ? 'Configured ✓' : 'Missing'}</span>
      </div>
      <div class="status-row">
        <span>Sender Address</span>
        <span style="font-family: var(--font-mono); font-size: 12px; color: #8b949e;">${env.FROM_EMAIL || 'onboarding@resend.dev'}</span>
      </div>
      <div class="status-row">
        <span>Cron Trigger</span>
        <span style="font-family: var(--font-mono); font-size: 12px; color: #8b949e;">0 8 * * * (Daily at 08:00 UTC)</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Subscribers (${RECIPIENT_EMAILS.length})</div>
      <ul class="recipients-list">
        ${RECIPIENT_EMAILS.map(e => `<li>${e}</li>`).join('')}
      </ul>
    </div>

    <div class="button-group">
      <a href="/preview" target="_blank" class="btn btn-secondary">
        ⚡️ Instant Preview (0s)
      </a>
      <a href="/preview?live=true" target="_blank" class="btn btn-secondary">
        🤖 Live AI &amp; Web News (5s)
      </a>
      <button id="send-btn" class="btn btn-primary" onclick="sendNow()">
        🚀 Send Daily Newsletter to Subscribers
      </button>
    </div>

    <pre id="send-result"></pre>
  </div>

  <script>
    async function sendNow() {
      const btn = document.getElementById('send-btn');
      const resultBox = document.getElementById('send-result');
      btn.disabled = true;
      btn.textContent = 'Fetching Live News & Dispatching...';
      resultBox.style.display = 'block';
      resultBox.style.background = '#21262d';
      resultBox.style.color = '#8b949e';
      resultBox.textContent = 'Scraping live global & Indonesian headlines, summarizing with AI, and dispatching via Resend...';

      try {
        const res = await fetch('/send', { method: 'POST' });
        const data = await res.json();
        if (res.ok && data.success) {
          resultBox.style.background = 'rgba(63, 185, 80, 0.15)';
          resultBox.style.color = '#3fb950';
          resultBox.style.border = '1px solid rgba(63, 185, 80, 0.3)';
          resultBox.textContent = '✓ Successfully sent to subscribers!\\n' + JSON.stringify(data, null, 2);
        } else {
          resultBox.style.background = 'rgba(248, 81, 73, 0.15)';
          resultBox.style.color = '#f85149';
          resultBox.style.border = '1px solid rgba(248, 81, 73, 0.3)';
          resultBox.textContent = '✗ Failed:\\n' + (data.error || JSON.stringify(data, null, 2));
        }
      } catch (err) {
        resultBox.style.background = 'rgba(248, 81, 73, 0.15)';
        resultBox.style.color = '#f85149';
        resultBox.style.border = '1px solid rgba(248, 81, 73, 0.3)';
        resultBox.textContent = '✗ Request error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Send Daily Newsletter to Subscribers';
      }
    }
  </script>
</body>
</html>`;

    return new Response(dashboardHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};
