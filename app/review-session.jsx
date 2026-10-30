'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, RotateCcw } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { t } from '../lib/i18n/index.js';
import { REFUSED } from '../lib/learn/bounds.js';

import { send } from './send.js';
import { ListenButton, SpeechProvider, VoiceNote } from './speech.jsx';

/**
 * A review, one card at a time: the word, then its meaning on a press, then
 * "I didn't know" or "I knew it". Each answer is saved at once (except in
 * practice, which saves nothing). A card not known comes back once at the end,
 * as practice only. A card that is no longer due when its answer arrives was
 * answered already (in another window, or by a save whose reply was lost), so
 * the review moves on past it. With `keep` false (a role that saves no
 * progress) no answer is sent either, as in practice.
 *
 * @param {{ own: string, code: string, cards: any[], practice: boolean, keep: boolean, readAloud: boolean, readWith: string, newReadings: boolean, voice: string, speed: string }} props
 */
export function ReviewSession(props) {
  return (
    <SpeechProvider tag={props.voice} speed={props.speed} enabled={props.readAloud} own={props.own} code={props.code} readWith={props.readWith} newReadings={props.newReadings}>
      <Session {...props} />
    </SpeechProvider>
  );
}

/** @param {Parameters<typeof ReviewSession>[0]} props */
function Session({ own, code, cards, practice, keep }) {
  const [queue, setQueue] = useState(() => cards.map((card) => ({ ...card, again: false })));
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [tally, setTally] = useState({ seen: 0, knew: 0 });
  const word = useRef(/** @type {HTMLParagraphElement | null} */ (null));

  useEffect(() => {
    if (at > 0) word.current?.focus();
  }, [at]);

  if (cards.length === 0) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col items-start gap-3">
          <p>{t('learn.review.nothing', own)}</p>
          <Link href="/cards" className={buttonVariants({ variant: 'outline' })}>
            {t('learn.review.backCards', own)}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const card = queue[at];
  if (card === undefined) {
    return (
      <Card className="max-w-2xl">
        <CardContent className="flex flex-col items-start gap-3">
          <p className="font-heading text-xl font-bold" role="status">
            {t('learn.review.done', own)}
          </p>
          <p>{t('learn.review.tally', own, { seen: String(tally.seen), knew: String(tally.knew) })}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={buttonVariants({ variant: 'default' })}>
              {t('learn.lesson.backToday', own)}
            </Link>
            <Link href="/cards" className={buttonVariants({ variant: 'outline' })}>
              {t('learn.review.backCards', own)}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  /** @param {boolean} knew */
  async function answer(knew) {
    setProblem('');
    if (keep && !practice && !card.again) {
      setBusy(true);
      const sent = await send('/api/cards/answer', 'POST', { course: code, card: card.card, knew });
      setBusy(false);
      if (!sent.ok && sent.problem === REFUSED.card) {
        setShown(false);
        setAt(at + 1);
        return;
      }
      if (!sent.ok || sent.value?.answer?.card !== card.card) {
        setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
        return;
      }
    }
    if (!card.again) setTally((before) => ({ seen: before.seen + 1, knew: before.knew + (knew ? 1 : 0) }));
    if (!knew && !card.again) setQueue((before) => [...before, { ...card, again: true }]);
    setShown(false);
    setAt(at + 1);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <VoiceNote own={own} />
      <Progress value={Math.round((at / queue.length) * 100)} aria-label={t('learn.review.progress', own)} />
      <Card>
        <CardContent className="flex flex-col gap-4">
          {card.again && <p className="text-sm text-muted-foreground">{t('learn.ex.again', own)}</p>}
          <div className="flex items-start gap-2">
            <ListenButton text={card.front} size="icon" />
            <div className="min-w-0">
              <p ref={word} tabIndex={-1} lang={code} className="font-heading text-3xl font-bold break-words outline-none">
                {card.front}
              </p>
              {card.roman !== '' && <p className="text-muted-foreground">{card.roman}</p>}
            </div>
          </div>
          {!shown ? (
            <div>
              <Button type="button" variant="secondary" onClick={() => setShown(true)}>
                <Eye aria-hidden="true" />
                {t('learn.review.show', own)}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                <p className="text-lg font-semibold">{card.back}</p>
                {card.note !== '' && <p className="text-sm">{card.note}</p>}
                {card.example !== '' && (
                  <div className="flex items-start gap-2">
                    <ListenButton text={card.example} />
                    <div className="min-w-0">
                      <p lang={code}>{card.example}</p>
                      <p className="text-sm text-muted-foreground">{card.exampleMeaning}</p>
                    </div>
                  </div>
                )}
              </div>
              {problem !== '' && (
                <Alert variant="destructive">
                  <AlertDescription>{t(problem, own)}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => answer(false)}>
                  <RotateCcw aria-hidden="true" />
                  {t('learn.review.didntKnow', own)}
                </Button>
                <Button type="button" disabled={busy} onClick={() => answer(true)}>
                  {t('learn.review.knew', own)}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
