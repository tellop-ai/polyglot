import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { CountsLine } from '@/components/ui/counts-line';

import { readCardsFor, readStudyDaysFor } from '../../lib/data/learn.js';
import { t } from '../../lib/i18n/index.js';
import { isKnownWell } from '../../lib/learn/ladder.js';
import { LEARN_OWNER } from '../../lib/learn/owner.js';
import { dayAndMonth, languageName } from '../../lib/learn/shown.js';
import { problemOf, readState } from '../../lib/learn/state.js';

import { CardList } from '../card-list.jsx';
import { Frame } from '../frame.jsx';
import { OwnCardForm } from '../own-card-form.jsx';

import { cardRow } from './rows.js';

/**
 * The word cards of the language being learned: what is due, what is known
 * well, the list of every card, and a form for the person's own words. The
 * page only reads.
 */
export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const state = await readState();
  const { own, learner, view, today } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (learner === null || view === null) {
    return (
      <Frame own={own} path="/cards" title={t('learn.menu.cards', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  let cards;
  let reviewedToday = 0;
  try {
    cards = await readCardsFor(LEARN_OWNER, view.code);
    reviewedToday = (await readStudyDaysFor(LEARN_OWNER, view.code, today, today)).get(today)?.cards ?? 0;
  } catch (error) {
    return (
      <Frame own={own} path="/cards" title={t('learn.menu.cards', own)}>
        <Alert variant="destructive">
          <AlertDescription>{t(problemOf(error), own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const rows = cards.map((card) => cardRow(card, view, own, today)).filter((row) => row !== null);
  const due = rows.filter((row) => row.dueDay <= today).length;
  const known = rows.filter((row) => isKnownWell(row.step)).length;
  const reviewLeft = Math.max(0, learner.cardsPerDay - reviewedToday);
  const dueNow = Math.min(due, reviewLeft);
  const nextDay = rows.filter((row) => row.dueDay > today).map((row) => row.dueDay).sort()[0];
  const nextCount = nextDay === undefined ? 0 : rows.filter((row) => row.dueDay === nextDay).length;

  return (
    <Frame
      own={own}
      path="/cards"
      title={t('learn.cards.title', own, { language: languageName(view.code, own) })}
      description={t('learn.cards.lead', own)}
      actions={<OwnCardForm own={own} code={view.code} />}
      counts={
        <CountsLine
          items={[
            { key: 'due', label: t('learn.cards.due', own), value: String(dueNow) },
            { key: 'learning', label: t('learn.cards.learning', own), value: String(rows.length - known) },
            { key: 'known', label: t('learn.counts.known', own), value: String(known) },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
          {dueNow > 0 ? (
            <>
              <p>{t(dueNow === 1 ? 'learn.today.reviewOne' : 'learn.today.review', own, { count: String(dueNow) })}</p>
              <Link href="/cards/review" className={buttonVariants({ variant: 'default' })}>
                {t('learn.today.reviewAction', own)}
              </Link>
            </>
          ) : (
            <p>
              {due > 0
                ? t('learn.cards.doneForToday', own)
                : nextDay === undefined
                  ? t('learn.cards.noneYet', own)
                  : t('learn.cards.nextReview', own, { day: dayAndMonth(nextDay, own), count: String(nextCount) })}
            </p>
          )}
          {rows.length > 0 && (
            <Link href="/cards/review?practice=1" className={buttonVariants({ variant: 'outline' })}>
              {t('learn.cards.practiseAnyway', own)}
            </Link>
          )}
        </div>
        <CardList own={own} code={view.code} rows={rows} />
      </div>
    </Frame>
  );
}
