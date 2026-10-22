'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { t } from '../lib/i18n/index.js';
import { OWN_LANGUAGES } from '../lib/learn/languages.js';

import { send } from './send.js';

/**
 * The first choice: the person's own language, then the language to learn.
 *
 * The screens switch to the own language as soon as it is pressed, before
 * anything is saved. Nothing is saved until Start is pressed; then the learner
 * and the chosen language's course are saved in one step. Only languages
 * whose course passes its checks are offered (`courses`, from the server).
 *
 * @param {{ locale: string, courses: string[] }} props
 */
export function StartChoice({ locale, courses }) {
  const router = useRouter();
  const [own, setOwn] = useState(locale === 'tr' ? 'tr' : 'en');
  const [course, setCourse] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const choices = courses.filter((code) => code !== own);

  /** @param {string} next */
  function chooseOwn(next) {
    setOwn(next);
    if (course === next) setCourse('');
    setProblem('');
  }

  async function start() {
    if (course === '') return;
    setBusy(true);
    setProblem('');
    const sent = await send('/api/choice', 'POST', { ownLanguage: own, course });
    if (!sent.ok || sent.value?.learner?.course !== course) {
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4" lang={own}>
      <Card>
        <CardHeader>
          <CardTitle>{t('learn.start.ownQuestion', 'en')} · {t('learn.start.ownQuestion', 'tr')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {OWN_LANGUAGES.map((code) => (
            <Button
              key={code}
              type="button"
              lang={code}
              variant={own === code ? 'default' : 'outline'}
              aria-pressed={own === code}
              onClick={() => chooseOwn(code)}
            >
              {t(`learn.ownName.${code}`, code)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.start.learnQuestion', own)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {choices.map((code) => (
              <Button
                key={code}
                type="button"
                size="lg"
                variant={course === code ? 'default' : 'outline'}
                aria-pressed={course === code}
                className="justify-start"
                onClick={() => {
                  setCourse(code);
                  setProblem('');
                }}
              >
                <span lang={code} className="font-semibold">{t(`learn.ownName.${code}`, own)}</span>
                <span className={course === code ? '' : 'text-muted-foreground'}>{t(`learn.lang.${code}`, own)}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {problem !== '' && (
        <Alert variant="destructive">
          <AlertDescription>{t(problem, own)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" disabled={course === '' || busy} onClick={start}>
          {busy ? t('learn.saving', own) : t('learn.start.action', own)}
        </Button>
        <p className="text-sm text-muted-foreground">{course === '' ? t('learn.start.pickFirst', own) : t('learn.start.later', own)}</p>
      </div>
    </div>
  );
}
