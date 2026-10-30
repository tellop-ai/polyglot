'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Compass, Sprout } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { t } from '../lib/i18n/index.js';

import { send } from './send.js';

/**
 * Where a language's course starts: the level test, or the first lesson.
 * Pressing "Start from the first lesson" saves the start and opens lesson 1.
 * For a role that saves no progress (`keep` false: a Member or a Viewer) it
 * only opens lesson 1, as practice, and saves nothing.
 *
 * @param {{ locale: string, code: string, language: string, firstLesson: string, keep: boolean }} props
 */
export function StartLevel({ locale, code, language, firstLesson, keep }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function fromTheStart() {
    setBusy(true);
    setProblem('');
    const sent = await send('/api/course', 'POST', { course: code, start: 'a1' });
    if (!sent.ok || sent.value?.startLevel !== 'a1') {
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      setBusy(false);
      return;
    }
    router.push(`/lessons/${firstLesson}`);
  }

  return (
    <div className="grid max-w-4xl gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass aria-hidden="true" className="size-4 text-primary" />
            {t('learn.where.testTitle', locale)}
          </CardTitle>
          <CardDescription>{t('learn.where.testLead', locale, { language })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/level-test" className={buttonVariants({ variant: 'default' })}>
            {t('learn.where.testAction', locale)}
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sprout aria-hidden="true" className="size-4 text-primary" />
            {t('learn.where.beginTitle', locale)}
          </CardTitle>
          <CardDescription>{t('learn.where.beginLead', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          {keep ? (
            <Button type="button" variant="outline" disabled={busy} onClick={fromTheStart}>
              {busy ? t('learn.saving', locale) : t('learn.where.beginAction', locale)}
            </Button>
          ) : (
            <Link href={`/lessons/${firstLesson}`} className={buttonVariants({ variant: 'outline' })}>
              {t('learn.where.beginAction', locale)}
            </Link>
          )}
          {problem !== '' && (
            <Alert variant="destructive">
              <AlertDescription>{t(problem, locale)}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
