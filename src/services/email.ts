import { Resend } from 'resend';
import { Env, NewsletterData } from '../types';
import { GeneratedContent } from './facts';
import { renderNewsletterHtml, renderNewsletterText } from '../templates/newsletter';

export interface SendResult {
  success: boolean;
  recipientsCount: number;
  data?: any;
  error?: string;
}

export async function sendDailyNewsletter(
  env: Env,
  content: GeneratedContent,
  recipients: string[]
): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured in worker environment.');
  }

  if (!recipients || recipients.length === 0) {
    throw new Error('No recipient email addresses provided in config.');
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const fromEmail = env.FROM_EMAIL || 'InToday Newsletter <onboarding@resend.dev>';

  const date = new Date();
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const newsletterData: NewsletterData = {
    date: date.toISOString().split('T')[0],
    formattedDate,
    facts: content.facts,
    glossary: content.glossary
  };

  const html = renderNewsletterHtml(newsletterData);
  const text = renderNewsletterText(newsletterData);
  const subject = `InToday · Daily Briefing (${formattedDate})`;

  try {
    // 1. Try single batch delivery
    const batchResponse = await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject: subject,
      html: html,
      text: text
    });

    if (!batchResponse.error) {
      return {
        success: true,
        recipientsCount: recipients.length,
        data: batchResponse.data
      };
    }

    console.warn('[Resend Batch] Batch dispatch rejected:', batchResponse.error.message);
    console.log('[Resend Fallback] Attempting resilient individual delivery for verified recipients...');

    // 2. Resilient fallback: deliver to verified recipients individually
    const successfulSends: string[] = [];
    const failedSends: Array<{ email: string; reason: string }> = [];

    for (const email of recipients) {
      try {
        const indRes = await resend.emails.send({
          from: fromEmail,
          to: [email],
          subject: subject,
          html: html,
          text: text
        });

        if (!indRes.error) {
          successfulSends.push(email);
          console.log(`[Resend] ✓ Delivered successfully to: ${email}`);
        } else {
          failedSends.push({ email, reason: indRes.error.message });
          console.warn(`[Resend] ✗ Could not deliver to ${email}:`, indRes.error.message);
        }
      } catch (e: any) {
        failedSends.push({ email, reason: e?.message || String(e) });
      }
    }

    if (successfulSends.length > 0) {
      return {
        success: true,
        recipientsCount: successfulSends.length,
        data: {
          deliveredTo: successfulSends,
          failedDeliveries: failedSends,
          notice: failedSends.length > 0
            ? 'Resend sandbox mode delivered to account owner. To send to third-party emails, verify your domain at resend.com/domains and set FROM_EMAIL.'
            : undefined
        }
      };
    }

    return {
      success: false,
      recipientsCount: 0,
      error: batchResponse.error.message
    };
  } catch (err) {
    return {
      success: false,
      recipientsCount: 0,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
