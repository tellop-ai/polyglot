import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Lightbulb } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { readResultsFor } from '../../lib/data/learn.js';
import { t } from '../../lib/i18n/index.js';
import { LEARN_OWNER } from '../../lib/learn/owner.js';
import { lessonOrder } from '../../lib/learn/plan.js';
import { languageName, levelName } from '../../lib/learn/shown.js';
import { problemOf, readState } from '../../lib/learn/state.js';

import { Frame } from '../frame.jsx';
import { TipText } from '../tip-text.jsx';

/**
 * Every lesson of the language being learned: two levels, six units each, four
 * lessons a unit, each with its state. Every lesson opens; nothing is locked.
 * The page only reads.
 */
export const dynamic = 'force-dynamic';

export default async function LessonsPage() {
  const state = await readState();
  const { own, learner, view, course } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (view === null) {
    return (
      <Frame own={own} path="/lessons" title={t('learn.menu.lessons', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  let results;
  try {
    results = await readResultsFor(LEARN_OWNER, view.code);
  } catch (error) {
    return (
      <Frame own={own} path="/lessons" title={t('learn.menu.lessons', own)}>
        <Alert variant="destructive">
          <AlertDescription>{t(problemOf(error), own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const byLesson = new Map(results.map((result) => [result.lesson, result]));
  const order = lessonOrder(view.lessons, course?.startLevel ?? '');
  const next = order.find((id) => !byLesson.has(id)) ?? null;
  const language = languageName(view.code, own);

  return (
    <Frame
      own={own}
      path="/lessons"
      title={t('learn.lessons.title', own, { language })}
      description={t('learn.lessons.lead', own)}
      actions={
        <Link href="/level-test" className={buttonVariants({ variant: 'outline' })}>
          {t('learn.where.testAction', own)}
        </Link>
      }
    >
      <div className="flex flex-col gap-8">
        {['a1', 'a2'].map((level) => (
          <section key={level} className="flex flex-col gap-3" aria-labelledby={`level-${level}`}>
            <h2 id={`level-${level}`} className="font-heading text-lg font-bold">
              {levelName(level, own)}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {view.units
                .filter((unit) => unit.level === level)
                .map((unit) => (
                  <Card key={unit.id}>
                    <CardHeader>
                      <CardTitle>{t('learn.unitLine', own, { number: String(unit.number), unit: unit.title })}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <ol className="flex flex-col gap-2">
                        {unit.lessons.map((lesson) => {
                          const result = byLesson.get(lesson.id);
                          return (
                            <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 pl-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="font-medium">{t('learn.lessonLine', own, { number: String(lesson.number), lesson: lesson.title })}</span>
                                {result !== undefined ? (
                                  <Badge variant="secondary">
                                    <Check aria-hidden="true" />
                                    {t('learn.lessons.best', own, { right: String(result.bestRight), total: String(result.total) })}
                                  </Badge>
                                ) : lesson.id === next ? (
                                  <Badge>{t('learn.lessons.next', own)}</Badge>
                                ) : null}
                              </div>
                              <Link
                                href={`/lessons/${lesson.id}`}
                                className={buttonVariants({ variant: lesson.id === next ? 'default' : 'outline', size: 'sm' })}
                                aria-label={t('learn.lessons.openNamed', own, {
                                  action: result !== undefined ? t('learn.today.again', own) : t('learn.lessons.open', own),
                                  lesson: lesson.title,
                                })}
                              >
                                {result !== undefined ? t('learn.today.again', own) : t('learn.lessons.open', own)}
                              </Link>
                            </li>
                          );
                        })}
                      </ol>
                      <details className="rounded-lg bg-muted p-3">
                        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                          <Lightbulb aria-hidden="true" className="size-4 text-primary" />
                          {t('learn.lessons.tip', own, { tip: unit.tip.title })}
                        </summary>
                        <TipText tip={unit.tip} code={view.code} own={own} speak={false} />
                      </details>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </section>
        ))}
      </div>
    </Frame>
  );
}
