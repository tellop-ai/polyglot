'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { t } from '../lib/i18n/index.js';
import { VOICE_LIMITS } from '../lib/learn/voice.js';
import { RECORDING_BITS_PER_SECOND, recordingType } from '../lib/recording.js';
import { sendFile } from '../lib/send-file.js';

import { send } from './send.js';

/**
 * Whether this page can record at all: a microphone the page may ask for, and
 * a recording type Tellop can read. Without Tellop's Devices switch on for
 * this app, the page has no microphone to ask for.
 */
export function canRecord() {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && recordingType() !== undefined;
}

/**
 * `canRecord()` for drawing: false on the server and in the first draw, so the
 * page drawn on the server and in the browser match, then the browser's answer.
 */
export function useCanRecord() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    setCan(canRecord());
  }, []);
  return can;
}

/**
 * Speak: records what the person says between their Speak and Stop presses
 * (at most `VOICE_LIMITS.recordSeconds`), keeps the recording (kit rule 6c)
 * and has it written down in the language learned. Nothing is recorded before
 * the press or after Stop, and what was heard is handed to `onHeard`, which
 * never sends anything on its own. For a lesson's sentence (`lesson` and
 * `sentence`), the answer also says whether it was that sentence.
 *
 * @param {{
 *   own: string, code: string, lesson?: string, sentence?: string, disabled?: boolean,
 *   onHeard: (heard: { heard: string, right?: boolean }) => void,
 * }} props
 */
export function SpeakButton({ own, code, lesson, sentence, disabled = false, onHeard }) {
  const [state, setState] = useState(/** @type {'idle' | 'starting' | 'recording' | 'writing'} */ ('idle'));
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState('');
  const recorder = useRef(/** @type {MediaRecorder | null} */ (null));
  const stream = useRef(/** @type {MediaStream | null} */ (null));
  const timer = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const live = useRef(true);

  function release() {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
  }

  useEffect(
    () => () => {
      live.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
    },
    [],
  );

  /** @param {Blob} clip */
  async function writeDown(clip) {
    setState('writing');
    let kept;
    try {
      kept = await sendFile(clip);
    } catch (error) {
      if (!live.current) return;
      setProblem(typeof error?.messageKey === 'string' ? error.messageKey : 'error.fileNotKept');
      setState('idle');
      return;
    }
    // A page that has gone (Skip, another page) sends nothing on: writing down would cost and show nothing.
    if (!live.current) return;
    const sent = await send('/api/speech', 'POST', { course: code, file: kept.file, ...(lesson === undefined ? {} : { lesson, sentence }) });
    if (!live.current) return;
    setState('idle');
    if (!sent.ok || typeof sent.value?.heard !== 'string') {
      setProblem(sent.ok ? 'ai.unavailable' : sent.problem.startsWith('error.') ? 'ai.unavailable' : sent.problem);
      return;
    }
    if (sent.value.heard === '') {
      setProblem('learn.speak.nothingHeard');
      return;
    }
    onHeard(sent.value);
  }

  async function start() {
    setProblem('');
    const type = recordingType();
    if (!canRecord() || type === undefined) {
      setProblem('learn.speak.noMicrophone');
      return;
    }
    setState('starting');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (!live.current) return;
      setProblem(error?.name === 'NotAllowedError' ? 'learn.speak.notAllowed' : 'learn.speak.noMicrophone');
      setState('idle');
      return;
    }
    if (!live.current) {
      release();
      return;
    }
    /** @type {Blob[]} */
    const parts = [];
    // A recording that failed is never written down or counted, even though the recorder still stops after it.
    let failed = false;
    let made;
    try {
      made = new MediaRecorder(stream.current, { mimeType: type, audioBitsPerSecond: RECORDING_BITS_PER_SECOND });
    } catch {
      release();
      setProblem('learn.speak.cannotRecord');
      setState('idle');
      return;
    }
    made.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data);
    };
    made.onerror = () => {
      failed = true;
      release();
      if (live.current) {
        setProblem('learn.speak.cannotRecord');
        setState('idle');
      }
    };
    made.onstop = () => {
      release();
      recorder.current = null;
      if (!live.current || failed) return;
      const clip = new Blob(parts, { type });
      if (clip.size === 0) {
        setProblem('learn.speak.nothingHeard');
        setState('idle');
        return;
      }
      void writeDown(clip);
    };
    recorder.current = made;
    try {
      made.start();
    } catch {
      // The recorder could not start (the encoder refused this microphone): let go of the microphone at once.
      recorder.current = null;
      release();
      setProblem('learn.speak.cannotRecord');
      setState('idle');
      return;
    }
    setSeconds(0);
    setState('recording');
    const began = Date.now();
    timer.current = setInterval(() => {
      const passed = Math.floor((Date.now() - began) / 1000);
      setSeconds(passed);
      if (passed >= VOICE_LIMITS.recordSeconds && recorder.current?.state === 'recording') recorder.current.stop();
    }, 250);
  }

  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  const shown = `0:${String(Math.min(seconds, VOICE_LIMITS.recordSeconds)).padStart(2, '0')}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        {state === 'recording' ? (
          <Button type="button" variant="destructive" onClick={stop}>
            <Square aria-hidden="true" />
            {t('learn.speak.stop', own)}
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled={disabled || state !== 'idle'} onClick={() => void start()}>
            <Mic aria-hidden="true" />
            {t(state === 'writing' ? 'learn.speak.writing' : 'learn.speak.start', own)}
          </Button>
        )}
        {state === 'recording' && (
          <span role="status" className="text-sm text-muted-foreground">
            {t('learn.speak.recording', own, { time: shown })}
          </span>
        )}
      </div>
      {problem !== '' && (
        <p role="alert" className="text-sm text-destructive">
          {t(problem, own)}
        </p>
      )}
    </div>
  );
}
