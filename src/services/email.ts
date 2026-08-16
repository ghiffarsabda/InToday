import { Resend } from 'resend';
import { Env, NewsletterData } from '../types';
import { GeneratedContent } from './facts';
import { renderNewsletterHtml, renderNewsletterText } from '../templates/newsletter';
import { sendEmailViaGmailSmtp } from './smtp';

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
  if (!recipients || recipients.length === 0) {
    throw new Error('No recipient email addresses provided in config.');
  }

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

  // =========================================================================
  // 1. PRIMARY DISPATCH: Gmail SMTP (Sends directly from ghiffarsabda@gmail.com)
  // =========================================================================
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    console.log(`[Gmail SMTP] Dispatching newsletter to ${recipients.length} recipient(s) directly from ${env.GMAIL_USER}...`);
    const smtpRes = await sendEmailViaGmailSmtp(
      {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
        fromName: 'InToday Newsletter'
      },
      {
        to: recipients,
        subject,
        html,
        text
      }
    );

    if (smtpRes.success) {
      console.log(`[Gmail SMTP] ✓ Successfully dispatched to all ${recipients.length} subscriber(s)!`);
      return {
        success: true,
        recipientsCount: recipients.length,
        data: smtpRes.data
      };
    } else {
      console.warn(`[Gmail SMTP] ✗ Gmail SMTP dispatch failed:`, smtpRes.error);
      // If Gmail fails, we can fall back to Resend if configured
      if (!env.RESEND_API_KEY) {
        return {
          success: false,
          recipientsCount: 0,
          error: `Gmail SMTP Error: ${smtpRes.error}`
        };
      }
    }
  }

  // =========================================================================
  // 2. FALLBACK DISPATCH: Resend API
  // =========================================================================
  if (!env.RESEND_API_KEY) {
    throw new Error('Neither Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD) nor RESEND_API_KEY is configured.');
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const fromEmail = env.FROM_EMAIL || 'InToday Newsletter <onboarding@resend.dev>';

  try {
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

    // Resilient fallback: deliver to verified recipients individually
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
        } else {
          failedSends.push({ email, reason: indRes.error.message });
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
            ? 'Resend sandbox mode delivered to account owner. Set up GMAIL_USER + GMAIL_APP_PASSWORD for direct unrestricted sending.'
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
