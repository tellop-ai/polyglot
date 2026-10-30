import { ArrowLeft } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

import { readLearnerFor } from '../lib/data/learn.js';
import { BACK_TO_OWNER } from '../lib/data/person.js';
import { getLocale, t } from '../lib/i18n/index.js';
import { LEARN_OWNER } from '../lib/learn/owner.js';
import { readPerson } from '../lib/learn/state.js';

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

/**
 * Every page sits in this. While the app's owner looks at the app as a Member
 * or a Viewer (`preview`), a plain link on top of every page takes them back
 * to their own view (`AGENTS.md` rule 1).
 */
export default async function RootLayout({ children }) {
  const own = await ownLanguage();
  const { preview } = await readPerson();
  return (
    <html lang={own}>
      <body>
        {preview && (
          <div className="border-b border-border bg-muted">
            <div className="mx-auto flex w-full max-w-6xl px-4 py-1 sm:px-6">
              <a href={BACK_TO_OWNER} className={buttonVariants({ variant: 'link', size: 'sm' })}>
                <ArrowLeft aria-hidden="true" />
                {t('learn.role.backToOwn', own)}
              </a>
            </div>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
