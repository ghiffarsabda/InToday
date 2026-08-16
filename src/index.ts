import { Env } from './types';
import { RECIPIENT_EMAILS } from './config';
import { fetchDailyContent, GeneratedContent } from './services/facts';
import { sendDailyNewsletter } from './services/email';
import { renderNewsletterHtml } from './templates/newsletter';
import { getRecentTopics, HistoryRecord } from './services/db';

// In-memory cache for today's generated content
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
   * Provides a web dashboard, fast HTML email preview, topic history viewer, and manual dispatch endpoints.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const todayKey = new Date().toISOString().split('T')[0];

    // 1. Email HTML Preview (Always forces fresh live AI generation)
    if (path === '/preview') {
      try {
        const content = await fetchDailyContent(env);
        cachedContent = { dateKey: todayKey, content };

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

        const randomToken = Math.random().toString(36).substring(7);

        // Sticky top toolbar for preview controls
        const toolbar = `
        <div style="background: #161b22; color: #c9d1d9; padding: 12px 18px; border-bottom: 1px solid #30363d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <strong style="color: #f0f6fc; font-size: 13.5px;">InToday Newsletter Preview</strong>
            <span style="background: rgba(63, 185, 80, 0.2); color: #3fb950; padding: 3px 9px; border-radius: 12px; font-size: 11.5px; font-weight: 600;">
              ⚡ Live Generated (${content.facts.length} items)
            </span>
          </div>
          <div style="display: flex; gap: 10px;">
            <a href="/preview?t=${randomToken}" style="background: #238636; color: #ffffff; text-decoration: none; padding: 6px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
              🔄 Generate New Facts
            </a>
            <a href="/history" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">
              🗄️ Topic History
            </a>
            <a href="/" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">
              ← Dashboard
            </a>
          </div>
        </div>`;

        html = html.replace('<body', '<body style="margin:0;padding:0;"');
        html = html.replace(/(<body[^>]*>)/i, `$1${toolbar}`);

        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      } catch (err) {
        return new Response(
          `Error generating live preview: ${err instanceof Error ? err.message : String(err)}`,
          { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
    }

    // 2. Interactive Topic History Viewer (GET /history)
    if (path === '/history') {
      try {
        const records = await getRecentTopics(env.DB, 150);

        const categoryEmojis: Record<string, string> = {
          science: '🔬',
          economics: '📈',
          law: '⚖️',
          psychology: '🧠',
          history: '🏛️',
          islam: '🌙',
          health: '🩺'
        };

        const rowsHtml = records.length > 0 ? records.map(r => `
          <tr style="border-bottom: 1px solid #30363d;">
            <td style="padding: 12px 14px; font-size: 12px; color: #8b949e; white-space: nowrap; font-family: monospace;">${r.date || 'Today'}</td>
            <td style="padding: 12px 14px; font-size: 13px; font-weight: 600; white-space: nowrap;">
              <span style="background: rgba(110, 118, 129, 0.2); padding: 3px 8px; border-radius: 6px; color: #f0f6fc;">
                ${categoryEmojis[r.category] || '💡'} ${r.category.toUpperCase()}
              </span>
            </td>
            <td style="padding: 12px 14px; font-size: 13.5px; font-weight: 600; color: #58a6ff;">${r.title}</td>
            <td style="padding: 12px 14px; font-size: 13px; color: #c9d1d9; line-height: 1.5;">${r.fact}</td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="4" style="padding: 24px; text-align: center; color: #8b949e;">
              No history recorded in database yet. Generate a preview to populate!
            </td>
          </tr>
        `;

        const historyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · D1 Topic Memory History</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-bright: #f0f6fc;
      --text-muted: #8b949e;
      --accent: #238636;
      --link: #58a6ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 16px;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .container { max-width: 960px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
      gap: 12px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-bright);
      margin: 0;
    }
    .badge {
      background: rgba(56, 139, 253, 0.15);
      color: var(--link);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .btn {
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #21262d;
      color: var(--text-bright);
      border: 1px solid var(--border);
    }
    .btn-primary {
      background: var(--accent);
      color: #ffffff;
      border-color: transparent;
    }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background: #21262d;
      padding: 12px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>🗄️ Cloudflare D1 Topic Memory History</h1>
        <div style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
          All topics stored in SQLite. These topics are automatically excluded on future generations to prevent repetition.
        </div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span class="badge">${records.length} Recorded Topics</span>
        <a href="/preview" class="btn btn-primary">✨ Open Preview</a>
        <a href="/" class="btn">← Dashboard</a>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th style="width: 110px;">Date</th>
            <th style="width: 140px;">Category</th>
            <th style="width: 260px;">Title</th>
            <th>Insight / Fact Summary</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

        return new Response(historyHtml, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      } catch (err) {
        return new Response(
          `Error retrieving history: ${err instanceof Error ? err.message : String(err)}`,
          { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
    }

    // 3. Fetch Facts JSON API (Always live)
    if (path === '/api/facts' || path === '/api/content') {
      try {
        const content = await fetchDailyContent(env);
        cachedContent = { dateKey: todayKey, content };

        return new Response(JSON.stringify({ success: true, content }, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. History JSON API (GET /api/history)
    if (path === '/api/history') {
      try {
        const records = await getRecentTopics(env.DB, 200);
        return new Response(JSON.stringify({ success: true, count: records.length, records }, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Manual Email Trigger (POST /send)
    if (path === '/send' && request.method === 'POST') {
      try {
        console.log('[InToday Manual Trigger] Fetching live content...');
        const content = await fetchDailyContent(env);
        cachedContent = { dateKey: todayKey, content };

        console.log(`[InToday Manual Trigger] Sending to ${RECIPIENT_EMAILS.length} recipients...`);
        const result = await sendDailyNewsletter(env, content, RECIPIENT_EMAILS);

        return new Response(JSON.stringify(result, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 6. Management Dashboard (GET /)
    if (path === '/' || path === '') {
      const historyRecords = await getRecentTopics(env.DB, 5);

      const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · Management Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-bright: #f0f6fc;
      --text-muted: #8b949e;
      --accent: #238636;
      --accent-hover: #2ea043;
      --link: #58a6ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.5;
    }
    .container { max-width: 680px; margin: 0 auto; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-bright);
      margin: 0 0 8px 0;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 24px;
    }
    .btn-group {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: #21262d;
      color: var(--text-bright);
      border-color: var(--border);
    }
    .btn-secondary:hover { background: #30363d; }
    .info-list {
      list-style: none;
      padding: 0;
      margin: 16px 0;
    }
    .info-list li {
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
    }
    .info-list li:last-child { border-bottom: none; }
    .label { color: var(--text-muted); }
    .val { color: var(--text-bright); font-family: monospace; }
    #status-box {
      margin-top: 16px;
      padding: 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>InToday Control Center</h1>
      <div class="subtitle">AI-powered daily newsletter briefing</div>

      <ul class="info-list">
        <li>
          <span class="label">Schedule</span>
          <span class="val">Daily at 08:00 WIB (01:00 UTC)</span>
        </li>
        <li>
          <span class="label">AI Model</span>
          <span class="val">${env.GEMINI_MODEL || 'gemini-3.1-flash-lite'} (Google Gemini)</span>
        </li>
        <li>
          <span class="label">Database Memory</span>
          <span class="val">${historyRecords.length > 0 ? 'Active (Cloudflare D1 SQLite)' : 'Initializing...'}</span>
        </li>
        <li>
          <span class="label">Subscribers</span>
          <span class="val">${RECIPIENT_EMAILS.join(', ')}</span>
        </li>
      </ul>

      <div class="btn-group">
        <a href="/preview" class="btn btn-primary">
          ✨ Open Live Preview
        </a>
        <a href="/history" class="btn btn-secondary">
          🗄️ View Topic History
        </a>
        <button id="send-btn" class="btn btn-secondary" onclick="sendNow()">
          🚀 Send Newsletter Now
        </button>
      </div>

      <div id="status-box"></div>
    </div>
  </div>

  <script>
    async function sendNow() {
      const btn = document.getElementById('send-btn');
      const box = document.getElementById('status-box');
      btn.disabled = true;
      btn.textContent = '⏳ Dispatching...';
      box.style.display = 'block';
      box.style.background = '#21262d';
      box.style.color = '#c9d1d9';
      box.textContent = 'Generating live content with Gemini 3.1 Flash-Lite and dispatching via Resend...';

      try {
        const res = await fetch('/send', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          box.style.background = 'rgba(46, 160, 67, 0.15)';
          box.style.color = '#3fb950';
          box.textContent = '✓ Successfully dispatched to all subscribers!\n' + JSON.stringify(data, null, 2);
        } else {
          box.style.background = 'rgba(248, 81, 73, 0.15)';
          box.style.color = '#f85149';
          box.textContent = '✗ Error dispatching email:\n' + (data.error || JSON.stringify(data));
        }
      } catch (err) {
        box.style.background = 'rgba(248, 81, 73, 0.15)';
        box.style.color = '#f85149';
        box.textContent = '✗ Failed: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Send Newsletter Now';
      }
    }
  </script>
</body>
</html>`;

      return new Response(dashboardHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
