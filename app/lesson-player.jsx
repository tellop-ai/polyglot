'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, RotateCcw, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

import { t } from '../lib/i18n/index.js';
import { judge } from '../lib/learn/answers.js';
import { builtRight, buildExercises, gapLine } from '../lib/learn/exercises.js';

import { ChoiceList } from './choice-list.jsx';
import { send } from './send.js';
import { canRecord, SpeakButton } from './speak-button.jsx';
import { ListenButton, SpeechProvider, useSpeech, VoiceNote } from './speech.jsx';
import { TipText } from './tip-text.jsx';

/**
 * A new code for one run through a lesson's exercises. "Save again" sends the
 * same code, so the app counts the run once even when an earlier save landed
 * and only its reply was lost.
 */
function runCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The first line of the feedback, for each way an answer can compare. */
const VERDICT_WORDS = Object.freeze({
  right: 'learn.ex.right',
  accents: 'learn.ex.accents',
  article: 'learn.ex.article',
  wrong: 'learn.ex.wrong',
});

/**
 * One lesson, from its tip and new words to its exercises and result.
 *
 * Everything happens in the page until the last exercise is answered; only
 * then is the result sent, once. Leaving earlier saves nothing, and the page
 * asks first when something was answered. A wrong answer comes back once at
 * the end; the score counts first tries only.
 *
 * @param {{
 *   own: string, code: string, letters: string[], typing: boolean,
 *   readAloud: boolean, readWith: string, speaking: boolean, voice: string, speed: string, seed: number,
 *   lesson: any, pool: any[], tip: any, unitTitle: string, next: string | null,
 * }} props
 */
export function LessonPlayer(props) {
  return (
    <SpeechProvider tag={props.voice} speed={props.speed} enabled={props.readAloud} own={props.own} code={props.code} readWith={props.readWith}>
      <Player {...props} />
    </SpeechProvider>
  );
}

/** @param {Parameters<typeof LessonPlayer>[0]} props */
function Player({ own, code, letters, typing, speaking, seed, lesson, pool, tip, unitTitle, next }) {
  const { canSay } = useSpeech();
  const [phase, setPhase] = useState(tip ? 'tip' : 'words');
  const [wordAt, setWordAt] = useState(0);
  const [queue, setQueue] = useState(/** @type {any[]} */ ([]));
  const [at, setAt] = useState(0);
  const [firstTry, setFirstTry] = useState(/** @type {Record<string, boolean>} */ ({}));
  const [feedback, setFeedback] = useState(/** @type {null | { verdict: string, chosen: string }} */ (null));
  const [saved, setSaved] = useState(/** @type {null | { bestRight: number, total: number }} */ (null));
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const retried = useRef(new Set());
  const attempt = useRef('');

  const words = lesson.words;
  const answeredAny = Object.keys(firstTry).length > 0;
  const total = words.length * 2 + lesson.sentences.length * 2;
  const right = Object.values(firstTry).filter(Boolean).length;

  function startPractice() {
    attempt.current = runCode();
    const built = buildExercises(lesson, pool, { seed, listen: canSay, typing, speak: speaking && canRecord() });
    setQueue(built);
    setAt(0);
    setFeedback(null);
    setPhase('practice');
  }

  /** @param {'right' | 'accents' | 'article' | 'wrong'} verdict @param {string} chosen */
  function answer(verdict, chosen) {
    const exercise = queue[at];
    if (!Object.hasOwn(firstTry, exercise.id)) setFirstTry((before) => ({ ...before, [exercise.id]: verdict !== 'wrong' }));
    if (verdict === 'wrong' && !retried.current.has(exercise.id)) {
      retried.current.add(exercise.id);
      setQueue((before) => [...before, { ...exercise, retry: true }]);
    }
    setFeedback({ verdict, chosen });
  }

  /** "Skip speaking for now": the sentence's gap takes the spoken sentence's place, and its count. */
  function skipSpeaking() {
    setQueue((before) => before.map((item, index) => (index === at && item.skipTo !== undefined ? { ...item.skipTo, id: item.id, retry: item.retry } : item)));
    setFeedback(null);
  }

  async function finish() {
    setBusy(true);
    setProblem('');
    setPhase('saving');
    const sent = await send('/api/lessons', 'POST', { course: code, lesson: lesson.id, attempt: attempt.current, right, total });
    setBusy(false);
    if (!sent.ok || sent.value?.result?.lesson !== lesson.id) {
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      setPhase('unsaved');
      return;
    }
    setSaved({ bestRight: sent.value.result.bestRight, total: sent.value.result.total });
    setPhase('result');
  }

  function goOn() {
    if (at + 1 < queue.length) {
      setAt(at + 1);
      setFeedback(null);
    } else {
      void finish();
    }
  }

  const steps = phase === 'tip' ? 0 : phase === 'words' ? wordAt + 1 : phase === 'practice' ? words.length + Math.min(at, total) : words.length + total;
  const progress = Math.round((steps / (words.length + total)) * 100);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <CloseLesson own={own} ask={answeredAny && phase !== 'result'} />
        <Progress value={progress} aria-label={t('learn.lesson.progress', own)} className="flex-1" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{unitTitle}</p>
        <h1 className="font-heading text-xl font-bold">{lesson.title}</h1>
        <VoiceNote own={own} />
      </div>

      {phase === 'tip' && (
        <Card>
          <CardContent>
            <h2 className="font-heading text-lg font-bold">{tip.title}</h2>
            <TipText tip={tip} code={code} own={own} />
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setPhase('words')}>
                {t('learn.lesson.toWords', own)}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'words' && (
        <WordStep
          own={own}
          code={code}
          word={words[wordAt]}
          place={t('learn.lesson.wordOf', own, { number: String(wordAt + 1), total: String(words.length) })}
          onBack={wordAt > 0 ? () => setWordAt(wordAt - 1) : null}
          onNext={() => (wordAt + 1 < words.length ? setWordAt(wordAt + 1) : startPractice())}
          last={wordAt + 1 === words.length}
        />
      )}

      {phase === 'practice' && queue[at] !== undefined && (
        <Exercise
          key={`${queue[at].id}:${queue[at].kind}:${at}`}
          own={own}
          code={code}
          lessonId={lesson.id}
          letters={letters}
          exercise={queue[at]}
          feedback={feedback}
          onAnswer={answer}
          onContinue={goOn}
          onSkip={skipSpeaking}
        />
      )}

      {phase === 'saving' && <p role="status">{t('learn.saving', own)}</p>}

      {phase === 'unsaved' && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-lg font-semibold">{t('learn.lesson.score', own, { right: String(right), total: String(total) })}</p>
            <Alert variant="destructive">
              <AlertDescription>{t(problem, own)}</AlertDescription>
            </Alert>
            <Button type="button" disabled={busy} onClick={finish}>
              <RotateCcw aria-hidden="true" />
              {t('learn.lesson.saveAgain', own)}
            </Button>
          </CardContent>
        </Card>
      )}

      {phase === 'result' && saved !== null && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div role="status">
              <p className="font-heading text-2xl font-bold">{t('learn.lesson.done', own)}</p>
              <p className="text-lg">{t('learn.lesson.score', own, { right: String(right), total: String(total) })}</p>
              {saved.bestRight > right && (
                <p className="text-sm text-muted-foreground">{t('learn.lesson.best', own, { right: String(saved.bestRight), total: String(saved.total) })}</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t('learn.lesson.addedCards', own)}</p>
              <ul className="flex flex-wrap gap-2">
                {words.map((word) => (
                  <li key={word.id} lang={code} className="rounded-lg bg-muted px-3 py-1">
                    {word.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              {next !== null && (
                <Link href={`/lessons/${next}`} className={buttonVariants({ variant: 'default' })}>
                  {t('learn.lesson.next', own)}
                  <ArrowRight aria-hidden="true" />
                </Link>
              )}
              <Link href="/" className={buttonVariants({ variant: 'outline' })}>
                {t('learn.lesson.backToday', own)}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** @param {{ own: string, ask: boolean }} props */
function CloseLesson({ own, ask }) {
  const [open, setOpen] = useState(false);
  if (!ask) {
    return (
      <Link href="/lessons" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label={t('learn.lesson.close', own)}>
        <X aria-hidden="true" />
      </Link>
    );
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" size="icon" aria-label={t('learn.lesson.close', own)} onClick={() => setOpen(true)}>
        <X aria-hidden="true" />
      </Button>
      <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('learn.lesson.leaveTitle', own)}</AlertDialogTitle>
          <AlertDialogDescription>{t('learn.lesson.leaveLead', own)}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto" />
        <AlertDialogFooter>
          <AlertDialogCancel>{t('learn.lesson.stay', own)}</AlertDialogCancel>
          <AlertDialogAction onClick={() => window.location.assign('/lessons')}>{t('learn.lesson.leave', own)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * @param {{ own: string, code: string, word: any, place: string, onBack: null | (() => void), onNext: () => void, last: boolean }} props
 */
function WordStep({ own, code, word, place, onBack, onNext, last }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{place}</p>
        <div className="flex items-start gap-2">
          <ListenButton text={word.text} size="icon" />
          <div className="min-w-0">
            <p lang={code} className="font-heading text-3xl font-bold break-words">
              {word.text}
            </p>
            {word.roman !== '' && <p className="text-muted-foreground">{word.roman}</p>}
            <p lang={own} className="mt-1 text-lg">
              {word.meaning}
            </p>
          </div>
        </div>
        {word.note !== '' && (
          <p lang={own} className="rounded-lg bg-muted p-3 text-sm">
            {word.note}
          </p>
        )}
        <div className="flex items-start gap-2 rounded-lg border border-border p-3">
          <ListenButton text={word.ex} />
          <div className="min-w-0">
            <p lang={code} className="font-medium">
              {word.ex}
            </p>
            {word.exRoman !== '' && <p className="text-sm text-muted-foreground">{word.exRoman}</p>}
            <p lang={own} className="text-sm text-muted-foreground">
              {word.exMeaning}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {onBack !== null ? (
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft aria-hidden="true" />
              {t('learn.lesson.back', own)}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={onNext}>
            {last ? t('learn.lesson.toPractice', own) : t('learn.lesson.nextWord', own)}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One exercise and, once answered, its feedback.
 *
 * @param {{ own: string, code: string, lessonId: string, letters: string[], exercise: any, feedback: null | { verdict: string, chosen: string }, onAnswer: (verdict: 'right' | 'accents' | 'article' | 'wrong', chosen: string) => void, onContinue: () => void, onSkip: () => void }} props
 */
function Exercise({ own, code, lessonId, letters, exercise, feedback, onAnswer, onContinue, onSkip }) {
  const { say, canSay } = useSpeech();
  const [picked, setPicked] = useState('');
  const [typed, setTyped] = useState('');
  const [built, setBuilt] = useState(/** @type {string[]} */ ([]));
  const typedBox = useRef(/** @type {HTMLInputElement | null} */ (null));
  const checked = feedback !== null;
  const spokeOnce = useRef(false);
  const heading = useRef(/** @type {HTMLParagraphElement | null} */ (null));

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    if (exercise.kind === 'listen-choose' && canSay && !spokeOnce.current) {
      spokeOnce.current = true;
      say(exercise.say);
    }
  }, [exercise, canSay, say]);

  const tilesLeft = useMemo(() => (exercise.tiles ?? []).filter((tile) => !built.includes(tile.key)), [exercise, built]);

  function check() {
    if (exercise.kind === 'type-word') {
      onAnswer(judge(typed, exercise.answers, code), typed);
    } else if (exercise.kind === 'build-sentence') {
      const pressed = built.map((key) => exercise.tiles.find((tile) => tile.key === key).text);
      onAnswer(builtRight(pressed, exercise.answer, exercise.orders) ? 'right' : 'wrong', pressed.join(exercise.sentence.joiner));
    } else {
      onAnswer(picked === exercise.answer ? 'right' : 'wrong', picked);
    }
  }

  /** @param {string} letter */
  function addLetter(letter) {
    const box = typedBox.current;
    const start = box?.selectionStart ?? typed.length;
    const end = box?.selectionEnd ?? typed.length;
    const value = typed.slice(0, start) + letter + typed.slice(end);
    setTyped(value);
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(start + letter.length, start + letter.length);
    });
  }

  const ready =
    exercise.kind === 'type-word' ? typed.trim().length > 0 : exercise.kind === 'build-sentence' ? built.length === exercise.tiles.length : picked !== '';
  const listLabels = { label: t('learn.ex.choices', own), rightLabel: t('learn.ex.rightMark', own), wrongLabel: t('learn.ex.wrongMark', own) };
  const rightText = rightAnswerOf(exercise);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p ref={heading} tabIndex={-1} className="text-sm font-medium text-muted-foreground outline-none">
          {t(`learn.ex.${exercise.kind}`, own)}
          {exercise.retry ? ` · ${t('learn.ex.again', own)}` : ''}
        </p>

        {exercise.kind === 'choose-meaning' && (
          <>
            <BigWord code={code} text={exercise.word.text} roman={exercise.word.roman} />
            <ChoiceList name={exercise.id} choices={exercise.choices} value={picked} onChange={setPicked} answer={exercise.answer} checked={checked} lang={own} {...listLabels} />
          </>
        )}

        {exercise.kind === 'listen-choose' && (
          <>
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" size="lg" onClick={() => say(exercise.say)}>
                {t('learn.ex.listenAgain', own)}
              </Button>
            </div>
            <ChoiceList name={exercise.id} choices={exercise.choices} value={picked} onChange={setPicked} answer={exercise.answer} checked={checked} lang={code} {...listLabels} />
          </>
        )}

        {exercise.kind === 'choose-word' && (
          <>
            <p lang={own} className="font-heading text-2xl font-bold">
              {exercise.word.meaning}
            </p>
            <ChoiceList name={exercise.id} choices={exercise.choices} value={picked} onChange={setPicked} answer={exercise.answer} checked={checked} lang={code} {...listLabels} />
          </>
        )}

        {exercise.kind === 'type-word' && (
          <>
            <p lang={own} className="font-heading text-2xl font-bold">
              {exercise.word.meaning}
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('learn.ex.typeLabel', own)}
              <Input
                ref={typedBox}
                lang={code}
                value={typed}
                disabled={checked}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={80}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && ready && !checked) {
                    event.preventDefault();
                    check();
                  }
                }}
              />
            </label>
            {letters.length > 0 && !checked && (
              <div className="flex flex-wrap gap-1" aria-label={t('learn.ex.letters', own)}>
                {letters.map((letter) => (
                  <Button key={letter} type="button" variant="outline" size="sm" lang={code} onClick={() => addLetter(letter)}>
                    {letter}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}

        {exercise.kind === 'fill-gap' && (
          <>
            <GapSentence code={code} own={own} sentence={exercise.sentence} />
            <p lang={own} className="text-sm text-muted-foreground">
              {exercise.sentence.meaning}
            </p>
            <ChoiceList name={exercise.id} choices={exercise.choices} value={picked} onChange={setPicked} answer={exercise.answer} checked={checked} lang={code} {...listLabels} />
          </>
        )}

        {exercise.kind === 'say-sentence' && (
          <>
            <div className="flex items-start gap-2">
              <ListenButton text={exercise.say} size="icon" />
              <div className="min-w-0">
                <p lang={code} className="font-heading text-2xl font-bold break-words">
                  {exercise.sentence.text}
                </p>
                {exercise.sentence.roman !== '' && <p className="text-sm text-muted-foreground">{exercise.sentence.roman}</p>}
                <p lang={own} className="text-sm text-muted-foreground">
                  {exercise.sentence.meaning}
                </p>
              </div>
            </div>
            {!checked && (
              <div className="flex flex-col items-start gap-2">
                <SpeakButton
                  own={own}
                  code={code}
                  lesson={lessonId}
                  sentence={exercise.sentence.id}
                  onHeard={(heard) => onAnswer(heard.right === true ? 'right' : 'wrong', heard.heard)}
                />
                <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
                  {t('learn.ex.skipSpeaking', own)}
                </Button>
              </div>
            )}
          </>
        )}

        {exercise.kind === 'build-sentence' && (
          <>
            <p lang={own} className="font-heading text-xl font-bold">
              {exercise.sentence.meaning}
            </p>
            <div className="build-line" aria-label={t('learn.ex.yourSentence', own)}>
              {built.length === 0 && <span className="text-sm text-muted-foreground">{t('learn.ex.pressTiles', own)}</span>}
              {built.map((key) => {
                const tile = exercise.tiles.find((item) => item.key === key);
                return (
                  <Button key={key} type="button" variant="secondary" disabled={checked} lang={code} onClick={() => setBuilt(built.filter((item) => item !== key))}>
                    {tile.text}
                  </Button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {tilesLeft.map((tile) => (
                <Button key={tile.key} type="button" variant="outline" disabled={checked} lang={code} onClick={() => setBuilt([...built, tile.key])}>
                  {tile.text}
                </Button>
              ))}
            </div>
            {!checked && built.length > 0 && (
              <div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setBuilt([])}>
                  <RotateCcw aria-hidden="true" />
                  {t('learn.ex.clear', own)}
                </Button>
              </div>
            )}
          </>
        )}

        {!checked && exercise.kind === 'say-sentence' ? null : !checked ? (
          <div className="flex justify-end">
            <Button type="button" disabled={!ready} onClick={check}>
              {t('learn.ex.check', own)}
            </Button>
          </div>
        ) : (
          <div className="feedback" data-verdict={feedback.verdict} role="status">
            <p className="font-semibold">
              {t(exercise.kind === 'say-sentence' && feedback.verdict === 'wrong' ? 'learn.ex.notThatSentence' : VERDICT_WORDS[feedback.verdict] ?? 'learn.ex.wrong', own)}
            </p>
            {exercise.kind === 'say-sentence' && (
              <p className="text-sm">
                {t('learn.ex.heard', own)} <span lang={code}>{feedback.chosen}</span>
              </p>
            )}
            {feedback.verdict !== 'right' && (
              <div className="flex items-start gap-2">
                <ListenButton text={exercise.say} />
                <div className="min-w-0">
                  <p lang={code} className="text-lg font-semibold">
                    {rightText.text}
                  </p>
                  {rightText.roman !== '' && <p className="text-sm text-muted-foreground">{rightText.roman}</p>}
                  {rightText.meaning !== '' && (
                    <p lang={own} className="text-sm text-muted-foreground">
                      {rightText.meaning}
                    </p>
                  )}
                </div>
              </div>
            )}
            {feedback.verdict === 'right' && exercise.kind !== 'listen-choose' && <ListenButton text={exercise.say} />}
            <div className="flex justify-end">
              <Button type="button" onClick={onContinue} autoFocus>
                {t('learn.ex.continue', own)}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** What the feedback shows as the right answer. @param {any} exercise */
function rightAnswerOf(exercise) {
  if (exercise.word !== undefined) return { text: exercise.word.text, roman: exercise.word.roman, meaning: exercise.word.meaning };
  return { text: exercise.sentence.text, roman: exercise.sentence.roman, meaning: exercise.sentence.meaning };
}

/** @param {{ code: string, text: string, roman: string }} props */
function BigWord({ code, text, roman }) {
  return (
    <div className="flex items-start gap-2">
      <ListenButton text={text} size="icon" />
      <div className="min-w-0">
        <p lang={code} className="font-heading text-3xl font-bold break-words">
          {text}
        </p>
        {roman !== '' && <p className="text-muted-foreground">{roman}</p>}
      </div>
    </div>
  );
}

/** @param {{ code: string, own: string, sentence: any }} props */
function GapSentence({ code, own, sentence }) {
  const line = gapLine(sentence);
  const roman = sentence.tokenRoman.length === sentence.tokens.length ? gapLine(sentence, sentence.tokenRoman) : null;
  return (
    <div>
      <p lang={code} className="font-heading text-2xl font-bold break-words">
        {line.before}
        <span className="gap-blank" aria-hidden="true" />
        <span lang={own} className="sr-only">
          {t('learn.ex.gap', own)}
        </span>
        {line.after}
      </p>
      {roman !== null && (
        <p className="text-sm text-muted-foreground">
          {roman.before}
          <span className="gap-blank gap-blank-small" aria-hidden="true" />
          {roman.after}
        </p>
      )}
    </div>
  );
}
