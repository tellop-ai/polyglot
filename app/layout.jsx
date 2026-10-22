import { readLearnerFor } from '../lib/data/learn.js';
import { getLocale, t } from '../lib/i18n/index.js';
import { LEARN_OWNER } from '../lib/learn/owner.js';

import './globals.css';

/**
 * The person's own language once they chose it, else the app's language. The
 * window's title and the page's language follow it, as every screen does.
 * It only reads; a store that cannot be read falls back to the app's language.
 */
async function ownLanguage() {
  try {
    const learner = await readLearnerFor(LEARN_OWNER);
    if (learner?.ownLanguage === 'tr' || learner?.ownLanguage === 'en') return learner.ownLanguage;
  } catch {
    // The page itself shows why the store cannot be read.
  }
  return getLocale();
}

export async function generateMetadata() {
  return { title: t('app.title', await ownLanguage()) };
}

export default async function RootLayout({ children }) {
  return (
    <html lang={await ownLanguage()}>
      <body>{children}</body>
    </html>
  );
}
