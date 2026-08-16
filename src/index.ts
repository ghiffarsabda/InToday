import { Env } from './types';
import { RECIPIENT_EMAILS } from './config';
import { fetchDailyFacts } from './services/facts';
import { sendDailyNewsletter } from './services/email';
import { renderNewsletterHtml } from './templates/newsletter';

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
          console.log('[InToday Cron] Fetching daily facts from OrcaRouter...');
          const facts = await fetchDailyFacts(env);
          console.log(`[InToday Cron] Generated ${facts.length} facts successfully.`);

          console.log(`[InToday Cron] Dispatching email to ${RECIPIENT_EMAILS.length} recipients...`);
          const result = await sendDailyNewsletter(env, facts, RECIPIENT_EMAILS);

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
   * Provides a web dashboard, HTML email live preview, and manual dispatch endpoints.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. Live Email HTML Preview
    if (path === '/preview') {
      try {
        let facts;
        if (env.ORCAROUTER_API_KEY) {
          try {
            facts = await fetchDailyFacts(env);
          } catch (e) {
            console.warn('Could not fetch live facts, using sample facts for preview:', e);
            facts = getSampleFacts();
          }
        } else {
          facts = getSampleFacts();
        }

        const date = new Date();
        const formattedDate = date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        const html = renderNewsletterHtml({
          date: date.toISOString().split('T')[0],
          formattedDate,
          facts
        });

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

    // 2. Fetch Facts JSON API
    if (path === '/api/facts') {
      try {
        const facts = await fetchDailyFacts(env);
        return new Response(JSON.stringify({ success: true, facts }, null, 2), {
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
        console.log('[InToday Manual Trigger] Fetching facts...');
        const facts = await fetchDailyFacts(env);
        console.log('[InToday Manual Trigger] Sending email...');
        const result = await sendDailyNewsletter(env, facts, RECIPIENT_EMAILS);

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
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
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
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .btn {
      flex: 1;
      padding: 10px 16px;
      font-size: 13.5px;
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
      <p class="subtitle">Automated daily intellectual brief via OrcaRouter + Resend</p>
    </div>

    <div class="card">
      <div class="card-title">System Environment & Secrets</div>
      <div class="status-row">
        <span>OrcaRouter API Key</span>
        <span class="status-tag ${hasOrcaKey ? 'status-ok' : 'status-missing'}">${hasOrcaKey ? 'Configured ✓' : 'Missing'}</span>
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
        <span style="font-family: var(--font-mono); font-size: 12px; color: #8b949e;">0 8 * * * (Daily)</span>
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
        👀 Preview Today's Email
      </a>
      <button id="send-btn" class="btn btn-primary" onclick="sendNow()">
        🚀 Send Test Newsletter
      </button>
    </div>

    <pre id="send-result"></pre>
  </div>

  <script>
    async function sendNow() {
      const btn = document.getElementById('send-btn');
      const resultBox = document.getElementById('send-result');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      resultBox.style.display = 'block';
      resultBox.style.background = '#21262d';
      resultBox.style.color = '#8b949e';
      resultBox.textContent = 'Triggering AI fact generation and Resend email dispatch...';

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
        btn.textContent = '🚀 Send Test Newsletter';
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

/**
 * Fallback sample facts for instant preview when API keys are not yet configured.
 */
function getSampleFacts() {
  return [
    {
      category: 'general' as const,
      categoryLabel: 'Anything & Everything',
      emoji: '🌍',
      title: 'Trees Communicate via Fungal Internet',
      fact: 'Trees in a forest communicate and share nutrients through an underground mycorrhizal network often called the "Wood Wide Web".',
      detail: 'Older "mother trees" use this fungal lattice to actively nourish younger saplings that receive less sunlight, and can even send chemical distress signals when attacked by pests.'
    },
    {
      category: 'economics' as const,
      categoryLabel: 'Economics',
      emoji: '📈',
      title: 'The Cobra Effect and Perverse Incentives',
      fact: 'When British authorities in colonial Delhi offered a bounty for dead cobras to eradicate them, citizens simply began breeding cobras to collect the reward.',
      detail: 'When the government realized this and canceled the program, breeders released their worthless snakes into the city, leaving Delhi with more cobras than when they started.'
    },
    {
      category: 'law' as const,
      categoryLabel: 'Law & Governance',
      emoji: '⚖️',
      title: 'The Medieval Legal Trial of Animals',
      fact: 'From the 13th to 18th centuries in Europe, animals accused of crimes were given formal court trials complete with defense lawyers and sworn witnesses.',
      detail: 'In 1457 in Savigny, France, a pig was formally tried and convicted of murder with defense counsel present, while its piglets were acquitted due to lack of evidence.'
    },
    {
      category: 'psychology' as const,
      categoryLabel: 'Psychology',
      emoji: '🧠',
      title: 'The Pratfall Effect and Perceived Likability',
      fact: 'Competent individuals become significantly more likable when they make an occasional clumsy mistake, known as the Pratfall Effect.',
      detail: 'First documented by Elliot Aronson in 1966, the blunder humanizes high achievers and breaks barriers—though if someone is already perceived as mediocre, mistakes merely lower their appeal.'
    }
  ];
}
