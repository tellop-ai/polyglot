'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { t } from '../lib/i18n/index.js';
import { NOT_KNOWN, QUESTIONS_PER_BAND } from '../lib/learn/placement.js';

import { ChoiceList } from './choice-list.jsx';
import { send } from './send.js';

/**
 * The level test, one question a screen with no going back. After the A1 part
 * the app counts it: a part under the pass mark ends the test. The result only
 * suggests where to start; "Start here" or "Start from the beginning instead"
 * saves the choice. Leaving midway saves nothing.
 *
 * @param {{ own: string, code: string, seed: number, bands: { level: string, questions: any[] }[] }} props
 */
export function LevelTest({ own, code, seed, bands }) {
  const router = useRouter();
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState(/** @type {number[]} */ ([]));
  const [picked, setPicked] = useState('');
  const [result, setResult] = useState(/** @type {any} */ (null));
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const band = Math.floor(answers.length / QUESTIONS_PER_BAND);
  const question = bands[band]?.questions[answers.length % QUESTIONS_PER_BAND];
  const asked = bands.length * QUESTIONS_PER_BAND;

  /** @param {number[]} given */
  async function count(given) {
    setBusy(true);
    setProblem('');
    const sent = await send('/api/level-test', 'POST', { course: code, seed, answers: given });
    setBusy(false);
    if (!sent.ok) {
      setProblem(sent.problem);
      return;
    }
    if (sent.value.result.complete) {
      setResult(sent.value.result);
      setPhase('result');
    }
  }

  /** @param {number} choice */
  function give(choice) {
    const given = [...answers, choice];
    setAnswers(given);
    setPicked('');
    if (given.length === QUESTIONS_PER_BAND || given.length === asked) void count(given);
  }

  /** @param {'suggested' | 'a1'} start */
  async function save(start) {
    setBusy(true);
    setProblem('');
    const sent = await send('/api/level-test', 'POST', { course: code, seed, answers, save: true, start });
    if (!sent.ok || typeof sent.value?.startLevel !== 'string') {
      setBusy(false);
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      return;
    }
    router.push('/');
    router.refresh();
  }

  if (phase === 'intro') {
    return (
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col gap-3">
          <p>{t('learn.test.lead', own)}</p>
          <p className="text-sm text-muted-foreground">{t('learn.test.notExam', own)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setPhase('questions')}>
              {t('learn.test.start', own)}
              <ArrowRight aria-hidden="true" />
            </Button>
            <Link href="/" className={buttonVariants({ variant: 'outline' })}>
              {t('learn.test.cancel', own)}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === 'result' && result !== null) {
    const suggestion = result.start === 'beyond' ? 'learn.test.beyond' : result.start === 'a2' ? 'learn.test.startA2' : 'learn.test.startA1';
    return (
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col gap-4">
          <p className="font-heading text-xl font-bold" role="status">
            {t(suggestion, own)}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {result.bands.map((item) => (
              <li key={item.level}>
                {t(item.level === 'a2' ? 'learn.test.bandA2' : 'learn.test.bandA1', own, { right: String(item.right), total: String(item.total) })}
              </li>
            ))}
          </ul>
          {problem !== '' && (
            <Alert variant="destructive">
              <AlertDescription>{t(problem, own)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => save('suggested')}>
              {t('learn.test.startHere', own)}
            </Button>
            {result.start !== 'a1' && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => save('a1')}>
                {t('learn.test.startBeginning', own)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (question === undefined || busy || problem !== '') {
    return (
      <div className="flex flex-col gap-3">
        <p role="status">{busy ? t('learn.test.counting', own) : ''}</p>
        {problem !== '' && (
          <Alert variant="destructive">
            <AlertDescription>{t(problem, own)}</AlertDescription>
          </Alert>
        )}
        {problem !== '' && (
          <div>
            <Button type="button" onClick={() => count(answers)}>
              {t('learn.test.tryAgain', own)}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const choices = question.choices.map((choice, at) => ({ key: String(at), text: choice.text, roman: choice.roman }));
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex flex-col gap-4">
        <Progress value={Math.round((answers.length / asked) * 100)} aria-label={t('learn.test.progress', own)} />
        <p className="text-sm text-muted-foreground">
          {t('learn.test.questionOf', own, { number: String(answers.length + 1), total: String(asked) })}
        </p>
        {question.kind === 'meaning' ? (
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('learn.test.whatMeans', own)}</p>
            <p lang={code} className="font-heading text-3xl font-bold break-words">
              {question.prompt}
            </p>
            {question.roman !== '' && <p className="text-muted-foreground">{question.roman}</p>}
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('learn.ex.fill-gap', own)}</p>
            <p lang={code} className="font-heading text-2xl font-bold break-words">
              {question.before}
              <span className="gap-blank" aria-hidden="true" />
              <span lang={own} className="sr-only">
                {t('learn.ex.gap', own)}
              </span>
              {question.after}
            </p>
            {(question.romanBefore !== '' || question.romanAfter !== '') && (
              <p className="text-sm text-muted-foreground">
                {question.romanBefore}
                <span className="gap-blank gap-blank-small" aria-hidden="true" />
                {question.romanAfter}
              </p>
            )}
            <p lang={own} className="text-sm text-muted-foreground">
              {question.prompt}
            </p>
          </div>
        )}
        <ChoiceList
          name={`q${answers.length}`}
          choices={choices}
          value={picked}
          onChange={setPicked}
          answer=""
          checked={false}
          lang={question.kind === 'meaning' ? own : code}
          label={t('learn.ex.choices', own)}
          rightLabel=""
          wrongLabel=""
        />
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => give(NOT_KNOWN)}>
            {t('learn.test.dontKnow', own)}
          </Button>
          <Button type="button" disabled={picked === ''} onClick={() => give(Number(picked))}>
            {t('learn.test.next', own)}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
