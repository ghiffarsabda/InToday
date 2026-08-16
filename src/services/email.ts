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
    globalNews: content.globalNews,
    indonesiaNews: content.indonesiaNews,
    facts: content.facts,
    glossary: content.glossary
  };

  const html = renderNewsletterHtml(newsletterData);
  const text = renderNewsletterText(newsletterData);
  const subject = `InToday · Daily Briefing (${formattedDate})`;

  try {
    const response = await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject: subject,
      html: html,
      text: text
    });

    if (response.error) {
      return {
        success: false,
        recipientsCount: recipients.length,
        error: response.error.message
      };
    }

    return {
      success: true,
      recipientsCount: recipients.length,
      data: response.data
    };
  } catch (err) {
    return {
      success: false,
      recipientsCount: recipients.length,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
