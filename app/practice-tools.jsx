'use client';

import { useState } from 'react';
import { Check, MessageCircle, RotateCcw, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { t } from '../lib/i18n/index.js';
import { PRACTICE_LIMITS } from '../lib/learn/practice.js';

import { send } from './send.js';
import { SpeakButton, useCanRecord } from './speak-button.jsx';
import { ListenButton, SpeechProvider, VoiceNote } from './speech.jsx';

/**
 * The three AI tools: check a sentence, ask a question, talk in writing.
 *
 * Each sends only on its own press. An answer is shown as plain text and may
 * be wrong, which the page says. A refusal shows the kit's words next to the
 * button that asked, and the screen stays usable. Nothing is saved: leaving
 * the page forgets the talk. Speak writes down what the person says into the
 * box, which they read and send themselves. It keeps the recording until it
 * is written down, so it is drawn only for a role that may add one (`speak`).
 *
 * @param {{ own: string, code: string, language: string, situations: { id: string, name: string }[], readAloud: boolean, readWith: string, newReadings: boolean, voice: string, speed: string, speak: boolean }} props
 */
export function PracticeTools(props) {
  const { own } = props;
  return (
    <SpeechProvider tag={props.voice} speed={props.speed} enabled={props.readAloud} own={own} code={props.code} readWith={props.readWith} newReadings={props.newReadings}>
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('learn.practice.mayBeWrong', own)}</p>
        <VoiceNote own={own} />
        <Tabs defaultValue="check">
          <TabsList>
            <TabsTrigger value="check">{t('learn.practice.check', own)}</TabsTrigger>
            <TabsTrigger value="ask">{t('learn.practice.ask', own)}</TabsTrigger>
            <TabsTrigger value="talk">{t('learn.practice.talk', own)}</TabsTrigger>
          </TabsList>
          <TabsContent value="check">
            <CheckTool {...props} />
          </TabsContent>
          <TabsContent value="ask">
            <AskTool {...props} />
          </TabsContent>
          <TabsContent value="talk">
            <TalkTool {...props} />
          </TabsContent>
        </Tabs>
      </div>
    </SpeechProvider>
  );
}

/** @param {{ own: string, problem: string }} props */
function Problem({ own, problem }) {
  if (problem === '') return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(problem, own)}
    </p>
  );
}

/** @param {Parameters<typeof PracticeTools>[0]} props */
function CheckTool({ own, code, language, speak }) {
  const recordable = useCanRecord() && speak;
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState(/** @type {any} */ (null));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function ask() {
    setBusy(true);
    setProblem('');
    const sent = await send('/api/practice', 'POST', { course: code, tool: 'check', text });
    setBusy(false);
    if (!sent.ok) {
      setProblem(sent.problem);
      return;
    }
    setAnswer(sent.value.answer);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('learn.practice.checkLabel', own, { language })}
          <Textarea lang={code} value={text} rows={3} maxLength={PRACTICE_LIMITS.text} onChange={(event) => setText(event.target.value)} />
        </label>
        {recordable && <SpeakButton own={own} code={code} disabled={busy} onHeard={(heard) => setText(heard.heard)} />}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy || text.trim() === ''} onClick={ask}>
            <Check aria-hidden="true" />
            {busy ? t('learn.practice.thinking', own) : t('learn.practice.checkAction', own)}
          </Button>
          <Problem own={own} problem={problem} />
        </div>
        {answer !== null && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted p-3" role="status">
            <Badge variant={answer.right ? 'default' : 'secondary'}>{answer.right ? t('learn.practice.looksRight', own) : t('learn.practice.corrected', own)}</Badge>
            <div className="flex items-start gap-2">
              <ListenButton text={answer.corrected} />
              <div className="min-w-0">
                <p lang={code} className="text-lg font-semibold break-words">
                  {answer.corrected}
                </p>
                {answer.roman !== '' && <p className="text-sm text-muted-foreground">{answer.roman}</p>}
              </div>
            </div>
            {answer.explanation !== '' && <p className="whitespace-pre-line">{answer.explanation}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** @param {Parameters<typeof PracticeTools>[0]} props */
function AskTool({ own, code, language }) {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function ask() {
    setBusy(true);
    setProblem('');
    const sent = await send('/api/practice', 'POST', { course: code, tool: 'ask', text });
    setBusy(false);
    if (!sent.ok) {
      setProblem(sent.problem);
      return;
    }
    setAnswer(String(sent.value.answer?.text ?? ''));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('learn.practice.askLabel', own, { language })}
          <Textarea value={text} rows={3} maxLength={PRACTICE_LIMITS.text} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={busy || text.trim() === ''} onClick={ask}>
            <MessageCircle aria-hidden="true" />
            {busy ? t('learn.practice.thinking', own) : t('learn.practice.askAction', own)}
          </Button>
          <Problem own={own} problem={problem} />
        </div>
        {answer !== '' && (
          <p className="rounded-lg bg-muted p-3 whitespace-pre-line" role="status">
            {answer}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** @param {Parameters<typeof PracticeTools>[0]} props */
function TalkTool({ own, code, language, situations, speak }) {
  const recordable = useCanRecord() && speak;
  const [situation, setSituation] = useState(situations[0]?.id ?? 'cafe');
  const [turns, setTurns] = useState(/** @type {{ mine: boolean, text: string, roman?: string, meaning?: string, tip?: string }[]} */ ([]));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  /** @param {string} line */
  async function say(line) {
    setBusy(true);
    setProblem('');
    const history = turns.slice(-PRACTICE_LIMITS.turns).map((turn) => ({ mine: turn.mine, text: turn.text }));
    const sent = await send('/api/practice', 'POST', { course: code, tool: 'talk', situation, text: line, history });
    setBusy(false);
    if (!sent.ok) {
      setProblem(sent.problem);
      return;
    }
    const reply = sent.value.answer;
    setTurns((before) => [
      ...before,
      ...(line === '' ? [] : [{ mine: true, text: line }]),
      { mine: false, text: reply.reply, roman: reply.roman, meaning: reply.meaning, tip: reply.tip },
    ]);
    setText('');
  }

  function again() {
    setTurns([]);
    setText('');
    setProblem('');
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('learn.practice.situation', own)}
            <NativeSelect value={situation} disabled={turns.length > 0 || busy} onChange={(event) => setSituation(event.target.value)}>
              {situations.map((item) => (
                <NativeSelectOption key={item.id} value={item.id}>
                  {item.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          {turns.length === 0 ? (
            <Button type="button" disabled={busy} onClick={() => say('')}>
              {busy ? t('learn.practice.thinking', own) : t('learn.practice.startTalk', own)}
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={again}>
              <RotateCcw aria-hidden="true" />
              {t('learn.practice.talkAgain', own)}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('learn.practice.notSaved', own)}</p>
        {turns.length > 0 && (
          <ol className="flex flex-col gap-2" aria-live="polite">
            {turns.map((turn, at) => (
              <li key={at} className="talk-turn" data-mine={turn.mine ? 'yes' : 'no'}>
                {turn.mine ? (
                  <p lang={code}>{turn.text}</p>
                ) : (
                  <div className="flex items-start gap-2">
                    <ListenButton text={turn.text} />
                    <div className="min-w-0">
                      <p lang={code} className="font-medium break-words">
                        {turn.text}
                      </p>
                      {turn.roman ? <p className="text-sm text-muted-foreground">{turn.roman}</p> : null}
                      {turn.meaning ? <p className="text-sm text-muted-foreground">{turn.meaning}</p> : null}
                      {turn.tip ? <p className="mt-1 text-sm">{t('learn.practice.tipLine', own, { tip: turn.tip })}</p> : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {turns.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('learn.practice.yourLine', own, { language })}
              <Textarea lang={code} value={text} rows={2} maxLength={PRACTICE_LIMITS.turnText} onChange={(event) => setText(event.target.value)} />
            </label>
            {recordable && <SpeakButton own={own} code={code} disabled={busy} onHeard={(heard) => setText(heard.heard)} />}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" disabled={busy || text.trim() === ''} onClick={() => say(text.trim())}>
                <Send aria-hidden="true" />
                {busy ? t('learn.practice.thinking', own) : t('learn.practice.send', own)}
              </Button>
              <Problem own={own} problem={problem} />
            </div>
          </div>
        )}
        {turns.length === 0 && <Problem own={own} problem={problem} />}
      </CardContent>
    </Card>
  );
}
