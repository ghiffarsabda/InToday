/**
 * List of hardcoded recipient email addresses.
 * Add or edit your private subscriber list here.
 */
export const RECIPIENT_EMAILS: string[] = [
  'ghiffarsabda@gmail.com'
];

/**
 * Newsletter metadata configuration
 */
export const NEWSLETTER_CONFIG = {
  title: 'InToday',
  tagline: 'Your daily dose of curiosity across economics, law, psychology, and the world.',
  categories: [
    {
      id: 'general',
      label: 'Anything & Everything',
      emoji: '🌍',
      prompt: 'one fascinating, non-obvious fun fact about science, history, nature, or anything interesting'
    },
    {
      id: 'economics',
      label: 'Economics',
      emoji: '📈',
      prompt: 'one surprising, insightful fun fact or concept in economics, market dynamics, behavioral incentives, or financial history'
    },
    {
      id: 'law',
      label: 'Law & Governance',
      emoji: '⚖️',
      prompt: 'one intriguing legal precedent, bizarre law, historical constitutional quirk, or legal paradox'
    },
    {
      id: 'psychology',
      label: 'Psychology',
      emoji: '🧠',
      prompt: 'one compelling psychological phenomenon, cognitive bias, behavioral experiment, or brain quirk'
    }
  ] as const
};
