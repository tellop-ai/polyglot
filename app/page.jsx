import Link from 'next/link';
import { BookOpen, CalendarCheck, Check, Languages, Layers } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CountsLine } from '@/components/ui/counts-line';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

import { courseReady } from '../lib/course/index.js';
import { countCardsFor, readResultsFor, readStudyDaysFor } from '../lib/data/learn.js';
import { t } from '../lib/i18n/index.js';
import { weekOf } from '../lib/learn/days.js';
import { COURSES } from '../lib/learn/languages.js';
import { LEARN_OWNER } from '../lib/learn/owner.js';
import { lessonOrder, weekPlan } from '../lib/learn/plan.js';
import { canChange } from '../lib/learn/roles.js';
import { dayAndMonth, languageName, levelName, weekdayShort } from '../lib/learn/shown.js';
import { problemOf, readState } from '../lib/learn/state.js';
import { cn } from '../lib/utils.js';

import { Frame } from './frame.jsx';
import { StartChoice } from './start-choice.jsx';
import { StartLevel } from './start-level.jsx';

/**
 * Today: this week's plan, today's lesson and the cards to review.
 *
 * Before the person has started, it is the first choice: their own language
 * and the language to learn. A language started but not yet placed asks where
 * to start. The page only reads; nothing is saved while it opens.
 *
 * Those two choices are the app's own settings, so only the owner and a Helper
 * make them (`lib/learn/roles.js`). Before they did, a Member or a Viewer sees
 * that nothing is here yet; a course not yet placed opens its first lesson
 * for them as practice, saving no start.
 */
export const dynamic = 'force-dynamic';

/** About how long a lesson takes, in minutes. */
const LESSON_MINUTES = 8;

export default async function Page() {
  const state = await readState();
  const { own, learner, view, course, today } = state;
  const keep = canChange(state.person.role);

  if (learner === null) {
    if (state.problem !== '') {
      return (
        <Frame own={own} menu={false} title={t('app.title', own)}>
          <Alert variant="destructive">
            <AlertDescription>{t(state.problem, own)}</AlertDescription>
          </Alert>
        </Frame>
      );
    }
    if (!keep) {
      return (
        <Frame own={own} menu={false} title={t('app.title', own)}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Languages aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t('learn.role.nothingYet', own)}</EmptyTitle>
              <EmptyDescription>{t('learn.role.notStarted', own)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Frame>
      );
    }
    return (
      <Frame own={own} menu={false} title={t('learn.start.title', own)} description={t('learn.start.lead', own)}>
        <StartChoice locale={own} courses={COURSES.filter((code) => courseReady(code))} />
      </Frame>
    );
  }

  if (view === null) {
    return (
      <Frame own={own} path="/" title={t('learn.menu.today', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
        {keep && (
          <Link href="/settings" className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}>
            {t('learn.menu.settings', own)}
          </Link>
        )}
      </Frame>
    );
  }

  const language = languageName(view.code, own);

  if (course === null || course.startLevel === '') {
    return (
      <Frame own={own} path="/" title={t('learn.today.title', own)} description={t('learn.today.learning', own, { language })}>
        <StartLevel locale={own} code={view.code} language={language} firstLesson={view.lessons[0].id} keep={keep} />
      </Frame>
    );
  }

  let facts;
  try {
    const week = weekOf(today);
    const results = await readResultsFor(LEARN_OWNER, view.code);
    const days = await readStudyDaysFor(LEARN_OWNER, view.code, week[0], week[6]);
    const cards = await countCardsFor(LEARN_OWNER, view.code, today);
    facts = { results, days, cards };
  } catch (error) {
    return (
      <Frame own={own} path="/" title={t('learn.today.title', own)}>
        <Alert variant="destructive">
          <AlertDescription>{t(problemOf(error), own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }

  const done = new Set(facts.results.map((result) => result.lesson));
  const plan = weekPlan({
    today,
    studyDays: learner.studyDays,
    lessonsPerDay: learner.lessonsPerDay,
    order: lessonOrder(view.lessons, course.startLevel),
    done,
    days: facts.days,
  });
  const reviewedToday = facts.days.get(today)?.cards ?? 0;
  const reviewLeft = Math.max(0, learner.cardsPerDay - reviewedToday);
  const dueNow = Math.min(facts.cards.due, reviewLeft);
  const lessonById = new Map(view.lessons.map((lesson) => [lesson.id, lesson]));
  const unitById = new Map(view.units.map((unit) => [unit.id, unit]));
  const nextLesson = plan.next === null ? null : lessonById.get(plan.next);
  const shownLevel = nextLesson?.level ?? 'a2';
  const doneCount = view.lessons.filter((lesson) => done.has(lesson.id)).length;

  /** @param {any} lesson @param {boolean} first */
  const lessonRow = (lesson, first) => (
    <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{t('learn.unitLine', own, { number: String(lesson.unitNumber), unit: unitById.get(lesson.unit).title })}</p>
        <p className="font-medium">{t('learn.lessonLine', own, { number: String(lesson.number), lesson: lesson.title })}</p>
        <p className="text-xs text-muted-foreground">
          {t('learn.today.lessonFacts', own, { words: String(lesson.words.length), minutes: String(LESSON_MINUTES) })}
        </p>
      </div>
      <Link href={`/lessons/${lesson.id}`} className={buttonVariants({ variant: first ? 'default' : 'outline' })}>
        {done.has(lesson.id) ? t('learn.today.again', own) : t('learn.today.startLesson', own)}
      </Link>
    </li>
  );

  return (
    <Frame
      own={own}
      path="/"
      title={t('learn.today.title', own)}
      description={`${t('learn.today.learning', own, { language })} · ${levelName(shownLevel, own)}`}
      counts={
        <CountsLine
          items={[
            { key: 'lessons', label: t('learn.counts.lessons', own), value: t('learn.counts.ofTotal', own, { done: String(doneCount), total: String(view.lessons.length) }) },
            { key: 'cards', label: t('learn.counts.cards', own), value: String(facts.cards.total) },
            { key: 'known', label: t('learn.counts.known', own), value: String(facts.cards.known) },
          ]}
        />
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen aria-hidden="true" className="size-4 text-primary" />
              {t('learn.today.todayTitle', own)}
            </CardTitle>
            <CardDescription>{dayAndMonth(today, own)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {plan.todayLessons.length > 0 ? (
              <ul className="flex flex-col gap-2">{plan.todayLessons.map((id, at) => lessonRow(lessonById.get(id), at === 0))}</ul>
            ) : nextLesson === null ? (
              <p>{t('learn.today.allDone', own)}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p>{plan.todayDone ? t('learn.today.planDone', own) : t('learn.today.freeDay', own)}</p>
                <ul className="flex flex-col gap-2">{lessonRow(nextLesson, false)}</ul>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted p-3">
              <p className="flex items-center gap-2">
                <Layers aria-hidden="true" className="size-4 text-primary" />
                {dueNow > 0 ? t(dueNow === 1 ? 'learn.today.reviewOne' : 'learn.today.review', own, { count: String(dueNow) }) : t('learn.today.noReview', own)}
              </p>
              {dueNow > 0 && (
                <Link href="/cards/review" className={buttonVariants({ variant: 'default' })}>
                  {t('learn.today.reviewAction', own)}
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck aria-hidden="true" className="size-4 text-primary" />
              {t('learn.week.title', own)}
            </CardTitle>
            <CardDescription>
              {t('learn.week.progress', own, { studied: String(plan.studiedPlanned), planned: String(plan.plannedCount) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="week-strip">
              {plan.days.map((day) => (
                <li
                  key={day.day}
                  className="week-day"
                  data-planned={day.planned ? 'yes' : 'no'}
                  data-studied={day.studied ? 'yes' : 'no'}
                  data-today={day.today ? 'yes' : 'no'}
                >
                  <span className="sr-only">
                    {t(day.studied ? 'learn.week.dayStudied' : day.planned ? 'learn.week.dayPlanned' : 'learn.week.dayFree', own, {
                      day: `${weekdayShort(day.day, own)} ${dayAndMonth(day.day, own)}${day.today ? ` ${t('learn.week.isToday', own)}` : ''}`,
                    })}
                  </span>
                  <span className="week-day-name" aria-hidden="true">
                    {weekdayShort(day.day, own)}
                  </span>
                  <span className="week-day-mark rounded-full" aria-hidden="true">
                    {day.studied ? <Check className="size-4" /> : null}
                  </span>
                </li>
              ))}
            </ol>
            <ul className="flex flex-col gap-1 text-sm">
              {plan.days
                .filter((day) => !day.past && !day.today && day.lessons.length > 0)
                .slice(0, 3)
                .map((day) => (
                  <li key={day.day} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{weekdayShort(day.day, own)}</span>
                    <span className="text-muted-foreground">
                      {day.lessons.map((id) => t('learn.week.lessonShort', own, { unit: String(lessonById.get(id).unitNumber), lesson: String(lessonById.get(id).number) })).join(', ')}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t('learn.week.noReminder', own)}</p>
          </CardContent>
        </Card>
      </div>
    </Frame>
  );
}
