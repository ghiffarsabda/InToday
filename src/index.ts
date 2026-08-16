import { Env } from './types';
import { fetchDailyContent, GeneratedContent } from './services/facts';
import { sendDailyNewsletter } from './services/email';
import { renderNewsletterHtml } from './templates/newsletter';
import {
  getRecentTopics,
  getSubscribers,
  getSubscriberRecords,
  addSubscriber,
  removeSubscriber
} from './services/db';

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

          // Fetch dynamic subscriber list from D1 database
          const subscribers = await getSubscribers(env.DB);
          console.log(`[InToday Cron] Dispatching email to ${subscribers.length} subscribers...`);
          const result = await sendDailyNewsletter(env, content, subscribers);

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
   * Provides a web dashboard, live preview, subscriber manager, and history viewer.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const todayKey = new Date().toISOString().split('T')[0];

    // Security Verification (Active if ADMIN_KEY secret is configured)
    if (!checkAuth(request, env)) {
      if (path.startsWith('/api/') || (path === '/send' && request.method === 'POST')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized. Provide valid Authorization header, X-Admin-Key, or ?key=<ADMIN_KEY>.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (path === '/login' && request.method === 'POST') {
        try {
          const formData = await request.formData();
          const key = formData.get('key');
          if (key && key === env.ADMIN_KEY) {
            return new Response(null, {
              status: 302,
              headers: {
                'Location': '/',
                'Set-Cookie': `intoday_admin=${key}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
              }
            });
          }
          return renderLoginHtml('Invalid admin password. Please try again.');
        } catch (_) {}
      }

      return renderLoginHtml();
    }

    // Logout endpoint
    if (path === '/logout') {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': 'intoday_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        }
      });
    }

    // 1. Email HTML Preview (Forces fresh live AI generation)
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
        <div style="background: #161b22; color: #c9d1d9; padding: 12px 18px; border-bottom: 1px solid #30363d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2); flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <strong style="color: #f0f6fc; font-size: 13.5px;">InToday Newsletter Preview</strong>
            <span style="background: rgba(63, 185, 80, 0.2); color: #3fb950; padding: 3px 9px; border-radius: 12px; font-size: 11.5px; font-weight: 600;">
              ⚡ Live Generated (${content.facts.length} items)
            </span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <a href="/preview?t=${randomToken}" style="background: #238636; color: #ffffff; text-decoration: none; padding: 6px 13px; border-radius: 6px; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
              🔄 Generate New Facts
            </a>
            <button id="preview-send-btn" onclick="sendNewsletterFromPreview()" style="background: #1f6feb; color: #ffffff; border: none; cursor: pointer; padding: 6px 13px; border-radius: 6px; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
              🚀 Send Newsletter Now
            </button>
            <a href="/subscribers" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 6px 11px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">
              👥 Subscribers
            </a>
            <a href="/history" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 6px 11px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">
              🗄️ Topic History
            </a>
            <a href="/logout" style="background: #21262d; color: #8b949e; text-decoration: none; padding: 6px 10px; border-radius: 6px; font-size: 11.5px; border: 1px solid #30363d;">
              🔒 Sign Out
            </a>
            <a href="/" style="background: #21262d; color: #c9d1d9; text-decoration: none; padding: 6px 11px; border-radius: 6px; font-size: 12px; border: 1px solid #30363d;">
              ← Dashboard
            </a>
          </div>
        </div>

        <!-- Floating Send Feedback Modal -->
        <div id="preview-modal" style="display: none; position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); min-width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div id="pm-content" style="display: flex; align-items: center; gap: 10px; color: #f0f6fc; font-size: 13.5px;">
            <div style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #238636; border-radius: 50%; animation: spin 0.7s linear infinite;"></div>
            <span>Generating & dispatching newsletter...</span>
          </div>
        </div>

        <script>
          async function sendNewsletterFromPreview() {
            const btn = document.getElementById('preview-send-btn');
            const modal = document.getElementById('preview-modal');
            const content = document.getElementById('pm-content');

            btn.disabled = true;
            btn.textContent = '⏳ Dispatching...';
            modal.style.display = 'block';
            content.innerHTML = '<div style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #238636; border-radius: 50%; animation: spin 0.7s linear infinite;"></div> <span>Generating & dispatching via Resend...</span>';

            try {
              const res = await fetch('/send', {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'X-Admin-Key': '${env.ADMIN_KEY || ''}',
                  'Content-Type': 'application/json'
                }
              });
              const data = await res.json();
              if (data.success) {
                content.innerHTML = '<span style="color: #3fb950; font-weight: 600;">✓ Successfully sent to ' + (data.recipientsCount || 'all') + ' subscribers!</span>';
                setTimeout(() => { modal.style.display = 'none'; }, 4000);
              } else {
                content.innerHTML = '<span style="color: #f85149; font-weight: 600;">✗ Failed: ' + (data.error || JSON.stringify(data)) + '</span>';
              }
            } catch (err) {
              content.innerHTML = '<span style="color: #f85149; font-weight: 600;">✗ Error: ' + err.message + '</span>';
            } finally {
              btn.disabled = false;
              btn.textContent = '🚀 Send Newsletter Now';
            }
          }
        </script>`;

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
          All topics stored in SQLite. These topic titles are automatically excluded on future generations to prevent repetition.
        </div>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <span class="badge">${records.length} Recorded Topics</span>
        <a href="/subscribers" class="btn">👥 Subscribers</a>
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

    // 3. Subscriber Management Page (GET /subscribers)
    if (path === '/subscribers') {
      try {
        const subscribers = await getSubscriberRecords(env.DB);

        const rowsHtml = subscribers.length > 0 ? subscribers.map(s => `
          <tr style="border-bottom: 1px solid #30363d;" id="sub-row-${s.id}">
            <td style="padding: 12px 16px; font-size: 13.5px; font-weight: 500; color: #f0f6fc; font-family: monospace;">
              ${s.email}
            </td>
            <td style="padding: 12px 16px; font-size: 12.5px; color: #8b949e;">
              ${s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Active'}
            </td>
            <td style="padding: 12px 16px; text-align: right;">
              <button onclick="deleteEmail('${s.email}', ${s.id})" style="background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                ✕ Remove
              </button>
            </td>
          </tr>
        `).join('') : `
          <tr>
            <td colspan="3" style="padding: 24px; text-align: center; color: #8b949e;">
              No subscribers in database yet. Add one below!
            </td>
          </tr>
        `;

        const subscribersHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · Mailing List Manager</title>
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
      padding: 32px 16px;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .container { max-width: 720px; margin: 0 auto; }
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
    .btn {
      padding: 8px 14px;
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
      cursor: pointer;
    }
    .btn-primary {
      background: var(--accent);
      color: #ffffff;
      border-color: transparent;
    }
    .btn-primary:hover { background: var(--accent-hover); }
    .add-form {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .input-field {
      flex: 1;
      min-width: 240px;
      padding: 9px 14px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-bright);
      font-size: 14px;
      font-family: inherit;
      outline: none;
    }
    .input-field:focus { border-color: var(--link); }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background: #21262d;
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
    }
    #msg-box {
      margin-bottom: 16px;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>👥 Mailing List Subscribers</h1>
        <div style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
          Subscribers stored in Cloudflare D1 database. The newsletter dispatches to this list daily.
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <a href="/preview" class="btn btn-primary">✨ Open Preview</a>
        <a href="/" class="btn">← Dashboard</a>
      </div>
    </div>

    <div id="msg-box"></div>

    <form class="add-form" onsubmit="addEmail(event)">
      <input type="email" id="email-input" class="input-field" placeholder="Enter new subscriber email (e.g. friend@gmail.com)" required />
      <button type="submit" id="add-btn" class="btn btn-primary">➕ Add to Mailing List</button>
    </form>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Subscriber Email</th>
            <th>Joined</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody id="subscriber-tbody">
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function showMsg(text, isError = false) {
      const box = document.getElementById('msg-box');
      box.style.display = 'block';
      box.style.background = isError ? 'rgba(248, 81, 73, 0.15)' : 'rgba(46, 160, 67, 0.15)';
      box.style.color = isError ? '#f85149' : '#3fb950';
      box.style.border = isError ? '1px solid rgba(248, 81, 73, 0.3)' : '1px solid rgba(46, 160, 67, 0.3)';
      box.textContent = text;
      setTimeout(() => { box.style.display = 'none'; }, 4000);
    }

    async function addEmail(e) {
      e.preventDefault();
      const input = document.getElementById('email-input');
      const btn = document.getElementById('add-btn');
      const email = input.value.trim();
      if (!email) return;

      btn.disabled = true;
      btn.textContent = '⏳ Adding...';

      try {
        const res = await fetch('/api/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
          showMsg(data.message);
          input.value = '';
          setTimeout(() => location.reload(), 800);
        } else {
          showMsg(data.message || data.error, true);
        }
      } catch (err) {
        showMsg('Error: ' + err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = '➕ Add to Mailing List';
      }
    }

    async function deleteEmail(email, rowId) {
      if (!confirm('Remove ' + email + ' from your mailing list?')) return;

      try {
        const res = await fetch('/api/subscribers', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
          showMsg(data.message);
          const row = document.getElementById('sub-row-' + rowId);
          if (row) row.remove();
        } else {
          showMsg(data.message || data.error, true);
        }
      } catch (err) {
        showMsg('Error: ' + err.message, true);
      }
    }
  </script>
</body>
</html>`;

        return new Response(subscribersHtml, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
      } catch (err) {
        return new Response(
          `Error retrieving subscribers: ${err instanceof Error ? err.message : String(err)}`,
          { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
    }

    // 4. Subscriber JSON APIs (GET, POST, DELETE /api/subscribers)
    if (path === '/api/subscribers') {
      if (request.method === 'GET') {
        const subscribers = await getSubscribers(env.DB);
        return new Response(JSON.stringify({ success: true, count: subscribers.length, subscribers }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'POST') {
        try {
          const body: any = await request.json();
          const email = body?.email;
          if (!email) {
            return new Response(JSON.stringify({ success: false, message: 'Email is required.' }), {
              status: 400, headers: { 'Content-Type': 'application/json' }
            });
          }
          const result = await addSubscriber(env.DB, email);
          return new Response(JSON.stringify(result, null, 2), {
            status: result.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, message: err instanceof Error ? err.message : String(err) }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (request.method === 'DELETE') {
        try {
          const body: any = await request.json();
          const email = body?.email;
          if (!email) {
            return new Response(JSON.stringify({ success: false, message: 'Email is required.' }), {
              status: 400, headers: { 'Content-Type': 'application/json' }
            });
          }
          const result = await removeSubscriber(env.DB, email);
          return new Response(JSON.stringify(result, null, 2), {
            status: result.success ? 200 : 400,
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, message: err instanceof Error ? err.message : String(err) }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // 5. Fetch Facts JSON API (Always live)
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

    // 6. History JSON API (GET /api/history)
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

    // 7. Manual Email Trigger (POST /send)
    if (path === '/send' && request.method === 'POST') {
      try {
        console.log('[InToday Manual Trigger] Fetching live content...');
        const content = await fetchDailyContent(env);
        cachedContent = { dateKey: todayKey, content };

        const subscribers = await getSubscribers(env.DB);
        console.log(`[InToday Manual Trigger] Sending to ${subscribers.length} recipients...`);
        const result = await sendDailyNewsletter(env, content, subscribers);

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

    // 8. Management Dashboard (GET /)
    if (path === '/' || path === '') {
      const historyRecords = await getRecentTopics(env.DB, 5);
      const subscribers = await getSubscribers(env.DB);

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
    .progress-box {
      margin-top: 24px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      display: none;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .step-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 13px;
      color: var(--text-muted);
      transition: color 0.2s ease;
    }
    .step-active { color: #f0f6fc; font-weight: 500; }
    .step-done { color: #3fb950; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1>InToday Control Center</h1>
          <div class="subtitle">AI-powered daily newsletter briefing</div>
        </div>
        <a href="/logout" style="font-size: 12px; color: var(--text-muted); text-decoration: none; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px;">
          🔒 Sign Out
        </a>
      </div>

      <ul class="info-list">
        <li>
          <span class="label">Schedule</span>
          <span class="val">Daily at 06:00 WIB (23:00 UTC)</span>
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
          <span class="label">Active Subscribers</span>
          <span class="val">${subscribers.length} recipient(s): ${subscribers.join(', ')}</span>
        </li>
      </ul>

      <div class="btn-group">
        <a href="/preview" class="btn btn-primary">
          ✨ Open Live Preview
        </a>
        <a href="/subscribers" class="btn btn-secondary">
          👥 Manage Mailing List
        </a>
        <a href="/history" class="btn btn-secondary">
          🗄️ View Topic History
        </a>
        <button id="send-btn" class="btn btn-secondary" onclick="sendNow()">
          🚀 Send Newsletter Now
        </button>
      </div>

      <!-- Rich Live Progress Card -->
      <div id="progress-box" class="progress-box">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div id="p-spinner" class="spinner"></div>
            <strong id="p-status" style="color: #f0f6fc; font-size: 14px;">Dispatching Newsletter...</strong>
          </div>
          <span id="p-timer" style="font-family: monospace; font-size: 12px; color: #8b949e;">0.0s</span>
        </div>

        <div style="background: #21262d; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 16px;">
          <div id="p-bar" style="background: #238636; height: 100%; width: 20%; transition: width 0.3s ease;"></div>
        </div>

        <div id="steps-list" style="display: flex; flex-direction: column;">
          <div id="st-1" class="step-item step-active">⏳ 1. Checking Cloudflare D1 history for topic deduplication...</div>
          <div id="st-2" class="step-item">⏳ 2. Synthesizing 7 fresh micro-insights with Gemini 3.1 Flash-Lite...</div>
          <div id="st-3" class="step-item">⏳ 3. Saving generated insights to database history...</div>
          <div id="st-4" class="step-item">⏳ 4. Dispatching email to all subscribers via Resend...</div>
        </div>

        <div id="p-result" style="display: none; margin-top: 14px; padding: 12px; border-radius: 6px; font-size: 12px; font-family: monospace; white-space: pre-wrap;"></div>
      </div>
    </div>
  </div>

  <script>
    async function sendNow() {
      const btn = document.getElementById('send-btn');
      const box = document.getElementById('progress-box');
      const spinner = document.getElementById('p-spinner');
      const status = document.getElementById('p-status');
      const timer = document.getElementById('p-timer');
      const bar = document.getElementById('p-bar');
      const result = document.getElementById('p-result');

      const st1 = document.getElementById('st-1');
      const st2 = document.getElementById('st-2');
      const st3 = document.getElementById('st-3');
      const st4 = document.getElementById('st-4');

      btn.disabled = true;
      btn.textContent = '⏳ Dispatching...';
      box.style.display = 'block';
      result.style.display = 'none';

      // Reset step styles
      st1.className = 'step-item step-active';
      st1.textContent = '⏳ 1. Checking Cloudflare D1 history for topic deduplication...';
      st2.className = 'step-item';
      st2.textContent = '⏳ 2. Synthesizing 7 fresh micro-insights with Gemini 3.1 Flash-Lite...';
      st3.className = 'step-item';
      st3.textContent = '⏳ 3. Saving generated insights to database history...';
      st4.className = 'step-item';
      st4.textContent = '⏳ 4. Dispatching email to all subscribers via Resend...';

      bar.style.width = '25%';
      bar.style.background = '#238636';
      status.textContent = 'Generating live briefing...';

      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        timer.textContent = elapsed + 's';
        if (elapsed > 1.2 && elapsed < 3.5) {
          st1.className = 'step-item step-done';
          st1.textContent = '✓ 1. Checked Cloudflare D1 history (deduplication active)';
          st2.className = 'step-item step-active';
          bar.style.width = '60%';
        } else if (elapsed >= 3.5) {
          st2.className = 'step-item step-done';
          st2.textContent = '✓ 2. Synthesized 7 insights with Gemini 3.1 Flash-Lite';
          st3.className = 'step-item step-done';
          st3.textContent = '✓ 3. Saved new topics to SQLite memory';
          st4.className = 'step-item step-active';
          bar.style.width = '85%';
        }
      }, 100);

      try {
        console.log('[InToday] Initiating send request...');
        const res = await fetch('/send', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'X-Admin-Key': '${env.ADMIN_KEY || ''}',
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json();
        console.log('[InToday] Send response:', data);
        clearInterval(interval);

        if (data.success) {
          st4.className = 'step-item step-done';
          st4.textContent = '✓ 4. Dispatched to ' + (data.recipientsCount || 'all') + ' subscriber(s) via Resend';
          bar.style.width = '100%';
          spinner.style.display = 'none';
          status.textContent = '🎉 Successfully sent to all subscribers!';
          status.style.color = '#3fb950';

          result.style.display = 'block';
          result.style.background = 'rgba(46, 160, 67, 0.15)';
          result.style.color = '#3fb950';
          result.style.border = '1px solid rgba(46, 160, 67, 0.3)';
          result.textContent = '✓ Delivery Confirmation:\n' + JSON.stringify(data, null, 2);
        } else {
          clearInterval(interval);
          bar.style.background = '#f85149';
          spinner.style.display = 'none';
          status.textContent = '✗ Error dispatching newsletter';
          status.style.color = '#f85149';

          result.style.display = 'block';
          result.style.background = 'rgba(248, 81, 73, 0.15)';
          result.style.color = '#f85149';
          result.style.border = '1px solid rgba(248, 81, 73, 0.3)';
          result.textContent = '✗ Error Details:\n' + (data.error || JSON.stringify(data));
        }
      } catch (err) {
        clearInterval(interval);
        bar.style.background = '#f85149';
        spinner.style.display = 'none';
        status.textContent = '✗ Network error: ' + err.message;
        status.style.color = '#f85149';
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Send Newsletter Now';
      }
    }
  </script>
</body>
</html>`;

      return new Response(dashboardHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

function checkAuth(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.trim() === '') {
    return true; // Open access when ADMIN_KEY is not set
  }

  const url = new URL(request.url);
  const keyParam = url.searchParams.get('key') || url.searchParams.get('admin_key');
  if (keyParam && keyParam === env.ADMIN_KEY) return true;

  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === env.ADMIN_KEY) return true;
  }

  const customHeader = request.headers.get('X-Admin-Key');
  if (customHeader && customHeader === env.ADMIN_KEY) return true;

  const cookie = request.headers.get('Cookie');
  if (cookie && cookie.includes(`intoday_admin=${env.ADMIN_KEY}`)) return true;

  return false;
}

function renderLoginHtml(errorMsg?: string): Response {
  const errorHtml = errorMsg ? `
    <div style="background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.3); padding: 8px 12px; border-radius: 6px; font-size: 12.5px; margin-bottom: 16px;">
      ✗ ${errorMsg}
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InToday · Access Verification</title>
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
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .login-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 32px;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-bright);
      margin: 0 0 8px 0;
    }
    .desc {
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 20px;
    }
    .form-group { margin-bottom: 20px; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-bright);
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: var(--link); }
    button {
      width: 100%;
      padding: 10px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="login-card">
    <h1>🔒 InToday Security Gate</h1>
    <div class="desc">Enter your secret ADMIN_KEY to access this console.</div>
    ${errorHtml}
    <form method="POST" action="/login">
      <div class="form-group">
        <label for="key">Admin Secret Key</label>
        <input type="password" id="key" name="key" placeholder="Enter admin password" required autofocus />
      </div>
      <button type="submit">Verify & Access</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 401,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
