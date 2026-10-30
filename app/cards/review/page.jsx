import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { readCardsFor, readDueCardsFor, readStudyDaysFor } from '../../../lib/data/learn.js';
import { t } from '../../../lib/i18n/index.js';
import { voiceFor } from '../../../lib/learn/languages.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { pick } from '../../../lib/learn/random.js';
import { canAdd, canChange } from '../../../lib/learn/roles.js';
import { problemOf, readState } from '../../../lib/learn/state.js';

import { Frame } from '../../frame.jsx';
import { ReviewSession } from '../../review-session.jsx';
import { cardRow } from '../rows.js';

/**
 * A review of the cards due today, at most the day's number less those
 * already reviewed today. With `?practice=1` it is ten cards at random that
 * change no schedule. The page only reads. A role that saves no progress (a
 * Member or a Viewer, `lib/learn/roles.js`) reviews the same cards as
 * practice: no answer is sent, and the page says so.
 */
export const dynamic = 'force-dynamic';

/** How many cards "Practise anyway" shows. */
const PRACTICE_CARDS = 10;

export default async function ReviewPage({ searchParams }) {
  const practice = (await searchParams)?.practice === '1';
  const state = await readState();
  const { own, learner, view, course, today } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (learner === null || view === null) {
    return (
      <Frame own={own} path="/cards" title={t('learn.review.title', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  let rows;
  try {
    if (practice) {
      const all = await readCardsFor(LEARN_OWNER, view.code);
      rows = pick(all, PRACTICE_CARDS, Math.random);
    } else {
      const reviewed = (await readStudyDaysFor(LEARN_OWNER, view.code, today, today)).get(today)?.cards ?? 0;
      const left = Math.max(0, learner.cardsPerDay - reviewed);
      rows = left === 0 ? [] : await readDueCardsFor(LEARN_OWNER, view.code, today, left);
    }
  } catch (error) {
    return (
      <Frame own={own} path="/cards" title={t('learn.review.title', own)}>
        <Alert variant="destructive">
          <AlertDescription>{t(problemOf(error), own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const cards = rows.map((card) => cardRow(card, view, own, today)).filter((row) => row !== null);
  const { role } = state.person;
  const keep = canChange(role);
  const lead = practice ? t('learn.review.practiceLead', own) : keep ? undefined : t('learn.role.practiceOnly', own);
  return (
    <Frame own={own} path="/cards" title={t(practice ? 'learn.review.practiceTitle' : 'learn.review.title', own)} description={lead}>
      <ReviewSession
        own={own}
        code={view.code}
        cards={cards}
        practice={practice}
        keep={keep}
        readAloud={learner.readAloud}
        readWith={learner.readWith}
        newReadings={canAdd(role)}
        voice={voiceFor(view.code, course?.voice)}
        speed={learner.voiceSpeed}
      />
    </Frame>
  );
}
