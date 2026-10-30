'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { t } from '../lib/i18n/index.js';
import { readingOutcome } from '../lib/learn/voice.js';

import { send } from './send.js';

/**
 * Reading aloud: with the AI voice, or with this Mac's own voices.
 *
 * The AI voice (the person's choice in Settings, and the first one) reads on a
 * press of Listen (a listening exercise reads its word once as it opens, which
 * the person asked for by starting it), through this app's sounds address, on
 * the person's AI allowance; each text is bought once and kept. Every page that
 * reads with it says so ({@link VoiceNote}), as an AI voice must be named.
 * When AI refuses (paused, used up, off), the page says why, reads with this
 * Mac's voice instead and does not ask AI again until the page is opened again.
 * A person who may not keep a new reading (a Viewer online: `newReadings`
 * false) still hears every reading kept before with the AI voice; a text not
 * kept yet is read by the device's own voice, quietly, and AI is never asked.
 *
 * The Mac's voice is the browser's own speech, made on this computer: no word
 * leaves it. When the page has no voice at all for the language, `canSay` is
 * false and no Listen button is drawn.
 */

/** Voices made for fun on a Mac, which no learner should hear as a model. */
const NOVELTY = new Set([
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar',
  'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical', 'Pipe Organ',
]);

/** The Mac's usual clear voice for each language, preferred when it is there. */
const PREFERRED = Object.freeze({
  'en-US': ['Samantha', 'Allison', 'Ava', 'Alex'],
  'en-GB': ['Daniel', 'Serena', 'Kate', 'Oliver'],
  'tr-TR': ['Yelda', 'Cem'],
  'es-ES': ['Mónica', 'Monica', 'Jorge'],
  'de-DE': ['Anna', 'Petra', 'Markus'],
  'fr-FR': ['Thomas', 'Amélie', 'Amelie', 'Audrey'],
  'it-IT': ['Alice', 'Federica', 'Luca'],
  'pt-BR': ['Luciana', 'Felipe'],
  'ja-JP': ['Kyoko', 'Otoya', 'O-ren'],
  'ko-KR': ['Yuna', 'Sora'],
  'zh-CN': ['Tingting', 'Ting-Ting', 'Lilian', 'Lili'],
});

function speech() {
  const synth = /** @type {any} */ (globalThis).speechSynthesis;
  return synth && typeof synth.speak === 'function' ? synth : null;
}

/** @param {unknown} lang */
function tagOf(lang) {
  return String(lang ?? '').replace('_', '-').toLowerCase();
}

/**
 * The best voice for a speech language, or `null`. Only a voice on this
 * device is chosen, so no word read aloud leaves it.
 *
 * @param {any[]} voices
 * @param {string} tag
 */
export function bestVoice(voices, tag) {
  const want = tag.toLowerCase();
  const language = want.split('-')[0];
  const names = PREFERRED[tag] ?? [];
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const lang = tagOf(voice?.lang);
    const name = String(voice?.name ?? '');
    const base = name.replace(/\s*\(.*\)\s*$/u, '');
    if (lang.split('-')[0] !== language || NOVELTY.has(base)) continue;
    // A voice the browser fetches over the internet would send the words away.
    if (voice?.localService === false) continue;
    let score = 0;
    if (lang === want) score += 8;
    const preferred = names.indexOf(base);
    if (preferred >= 0) score += 4 + (names.length - preferred) / 10;
    if (/enhanced|premium|geliştirilmiş/iu.test(name)) score += 1;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

const SpeechContext = createContext({ canSay: false, say: (/** @type {string} */ _text) => {}, label: '', aiVoice: false, newReadings: true, notice: '' });

/**
 * Gives every Listen button inside it one voice for one language.
 *
 * @param {{ tag: string, speed: string, enabled: boolean, own: string, code?: string, readWith?: string, newReadings?: boolean, children: React.ReactNode }} props
 * `code` is the language learned, for the AI voice's address; `readWith` is `'ai'` or `'mac'`; `newReadings` is
 * whether this person may have the AI voice read a text not kept yet (false for a Viewer).
 */
export function SpeechProvider({ tag, speed, enabled, own, code, readWith = 'mac', newReadings = true, children }) {
  const [voices, setVoices] = useState(/** @type {any[]} */ ([]));
  const [aiRefused, setAiRefused] = useState(false);
  const [notice, setNotice] = useState('');
  const keys = useRef(/** @type {Map<string, string>} */ (new Map()));
  /** Texts this person may not have read by AI: the device reads them, without asking again. */
  const deviceOnly = useRef(/** @type {Set<string>} */ (new Set()));
  const asking = useRef(/** @type {Set<string>} */ (new Set()));
  const playing = useRef(/** @type {HTMLAudioElement | null} */ (null));
  useEffect(() => {
    const synth = speech();
    if (synth === null) return undefined;
    const load = () => {
      try {
        setVoices(Array.from(synth.getVoices() ?? []));
      } catch {
        setVoices([]);
      }
    };
    load();
    try {
      synth.addEventListener?.('voiceschanged', load);
    } catch {
      // No voice list to follow.
    }
    return () => {
      try {
        synth.removeEventListener?.('voiceschanged', load);
        synth.cancel();
      } catch {
        // Nothing was being said.
      }
    };
  }, []);
  useEffect(
    () => () => {
      playing.current?.pause();
      playing.current = null;
    },
    [],
  );
  const voice = useMemo(() => (enabled ? bestVoice(voices, tag) : null), [voices, tag, enabled]);
  const aiVoice = enabled && readWith === 'ai' && typeof code === 'string' && !aiRefused;

  const quiet = useCallback(() => {
    playing.current?.pause();
    playing.current = null;
    try {
      speech()?.cancel();
    } catch {
      // Nothing was being said.
    }
  }, []);

  const sayWithMac = useCallback(
    (/** @type {string} */ text) => {
      const synth = speech();
      const Utterance = /** @type {any} */ (globalThis).SpeechSynthesisUtterance;
      if (synth === null || typeof Utterance !== 'function' || voice === null) return;
      try {
        quiet();
        const utterance = new Utterance(text);
        utterance.lang = tag;
        utterance.voice = voice;
        utterance.rate = speed === 'slow' ? 0.7 : 0.95;
        synth.speak(utterance);
      } catch {
        // Speech failed this once; the words are still on the screen.
      }
    },
    [voice, tag, speed, quiet],
  );

  const sayWithAi = useCallback(
    async (/** @type {string} */ text) => {
      if (asking.current.has(text)) return;
      asking.current.add(text);
      try {
        let key = keys.current.get(text);
        if (key === undefined) {
          if (deviceOnly.current.has(text)) {
            sayWithMac(text);
            return;
          }
          const outcome = readingOutcome(await send('/api/sounds', 'POST', { course: code, text }));
          if ('quiet' in outcome) {
            // Not kept, and this person may not keep it: the device reads this one text, and nothing is said.
            deviceOnly.current.add(text);
            sayWithMac(text);
            return;
          }
          if ('problem' in outcome) {
            // A busy AI may answer the next press; anything else waits until the page is opened again.
            if (outcome.stop) setAiRefused(true);
            setNotice(outcome.problem);
            sayWithMac(text);
            return;
          }
          key = outcome.play;
          keys.current.set(text, key);
        }
        quiet();
        const audio = new Audio(`/api/sounds?course=${encodeURIComponent(String(code))}&sound=${encodeURIComponent(key)}`);
        audio.playbackRate = speed === 'slow' ? 0.8 : 1;
        playing.current = audio;
        await audio.play();
      } catch {
        sayWithMac(text);
      } finally {
        asking.current.delete(text);
      }
    },
    [code, speed, quiet, sayWithMac],
  );

  const say = useCallback(
    (/** @type {string} */ text) => {
      if (aiVoice) void sayWithAi(text);
      else sayWithMac(text);
    },
    [aiVoice, sayWithAi, sayWithMac],
  );
  // Without new readings, a text not kept yet is read by the device: a Listen button needs a device voice then.
  const aiReadsAll = aiVoice && newReadings;
  const value = useMemo(
    () => ({ canSay: aiReadsAll || voice !== null, say, label: t(aiReadsAll ? 'learn.listenAi' : 'learn.listen', own), aiVoice, newReadings, notice }),
    [aiReadsAll, aiVoice, newReadings, voice, say, own, notice],
  );
  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

/** The voice of the nearest {@link SpeechProvider}. */
export function useSpeech() {
  return useContext(SpeechContext);
}

/**
 * Listen: reads `text` aloud. Drawn only when a voice can read it.
 *
 * @param {{ text: string, size?: 'icon-sm' | 'icon' | 'icon-lg', className?: string }} props
 */
export function ListenButton({ text, size = 'icon-sm', className }) {
  const { canSay, say, label } = useSpeech();
  if (!canSay || text.length === 0) return null;
  return (
    <Button type="button" variant="ghost" size={size} aria-label={label} title={label} className={className} onClick={() => say(text)}>
      <Volume2 aria-hidden="true" />
    </Button>
  );
}

/**
 * The line that names the AI voice where it reads, or says why the device's
 * own voice reads instead.
 *
 * @param {{ own: string }} props
 */
export function VoiceNote({ own }) {
  const { aiVoice, newReadings, notice, canSay } = useSpeech();
  if (notice !== '') {
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {t(notice, own)}
        {canSay ? ` ${t('learn.voice.macInstead', own)}` : ''}
      </p>
    );
  }
  if (!aiVoice || !canSay) return null;
  return <p className="text-xs text-muted-foreground">{t(newReadings ? 'learn.voice.aiLabel' : 'learn.role.aiLabelSome', own)}</p>;
}
