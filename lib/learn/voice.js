/**
 * Voice: the AI voice that reads aloud, and what a person says, written down.
 *
 * The AI voice reads the course's own words and sentences and the AI practice
 * answers, each on a press (a listening exercise reads its word as it opens,
 * which the person asked for by starting it). Each reading is bought once and
 * kept, so the same words are never paid for twice. What a person says is
 * recorded only between their Speak and Stop presses, written down in the
 * language they learn, and compared with the sentence shown. Pure functions
 * only; the addresses read and save.
 */

import { plain, tidy } from './answers.js';

/** The AI voice: one voice for every language, as Tellop's own read-aloud uses. */
export const AI_VOICE = 'nova';

/** Who reads aloud: the AI voice on the person's AI allowance, or this Mac's own voice. */
export const READ_WITH = Object.freeze(['ai', 'mac']);

export const VOICE_LIMITS = Object.freeze({
  /** The longest text read aloud, in characters: a talk reply's limit. */
  text: 600,
  /** The most AI practice answers kept read aloud for each language; the course's own texts are not counted. */
  practiceSounds: 1000,
  /** The longest text written down from a recording that is kept, in characters. */
  heard: 600,
  /** The longest recording, in seconds; a sentence takes a few. */
  recordSeconds: 30,
});

/** The language a recording is in, as the AI that writes it down names it. */
const SPOKEN = Object.freeze({ en: 'en', tr: 'tr', es: 'es', de: 'de', fr: 'fr', it: 'it', pt: 'pt', ja: 'ja', ko: 'ko', zh: 'zh' });

/** Languages written without spaces between words: compared letter by letter. */
const BY_LETTER = new Set(['ja', 'zh']);

/** How much of the sentence must be heard for it to count: kinder where the writing itself may differ. */
const ENOUGH = Object.freeze({ word: 0.75, letter: 0.6 });

/**
 * The language code sent with a recording of `course`, or `null` for a course
 * this app does not teach.
 *
 * @param {unknown} course
 */
export function spokenLanguage(course) {
  return typeof course === 'string' && Object.hasOwn(SPOKEN, course) ? SPOKEN[course] : null;
}

/**
 * A text to read aloud, made one line, or `null` when it is empty, too long
 * or carries control characters.
 *
 * @param {unknown} value
 */
export function readSpokenText(value) {
  if (typeof value !== 'string') return null;
  // Control characters other than line breaks and tabs never belong in a reading.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return null;
  const text = value.replace(/\s+/gu, ' ').trim();
  if (text.length === 0 || [...text].length > VOICE_LIMITS.text) return null;
  return text;
}

/** @param {unknown} value */
export function isReadWith(value) {
  return typeof value === 'string' && READ_WITH.includes(value);
}

/**
 * What was heard, cut to the kept length.
 *
 * @param {unknown} value
 */
export function heardText(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/gu, ' ').trim();
  const letters = [...text];
  return letters.length <= VOICE_LIMITS.heard ? text : letters.slice(0, VOICE_LIMITS.heard).join('');
}

/**
 * The pieces a sentence is compared in: its words, or its letters for a
 * language written without spaces. Capitals, accents, apostrophes and marks
 * never count.
 *
 * @param {string} text
 * @param {string} course
 */
function piecesOf(text, course) {
  const bare = plain(tidy(text, course)).replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (bare.length === 0) return [];
  return BY_LETTER.has(course) ? [...bare.replace(/ /gu, '')] : bare.split(' ');
}

/** The length of the longest run of pieces both have in the same order. @param {string[]} a @param {string[]} b */
function sharedInOrder(a, b) {
  let row = new Array(b.length + 1).fill(0);
  for (const piece of a) {
    const next = [0];
    for (let at = 0; at < b.length; at += 1) next.push(piece === b[at] ? row[at] + 1 : Math.max(row[at + 1], next[at]));
    row = next;
  }
  return row[b.length];
}

/**
 * Whether what was heard says the sentence shown: enough of its words (or
 * letters, for Japanese and Chinese) heard in its order. The AI that writes a
 * recording down may spell a word another right way, so a near sentence
 * counts; the person always sees what was heard.
 *
 * @param {string} expected the sentence shown
 * @param {string} heard what was written down
 * @param {string} course the language learned
 * @returns {{ right: boolean, share: number }}
 */
export function matchHeard(expected, heard, course) {
  const want = piecesOf(expected, course);
  const got = piecesOf(heard, course);
  if (want.length === 0 || got.length === 0) return { right: false, share: 0 };
  // Saying more than the sentence never makes it right: the share is of the longer side.
  const share = sharedInOrder(want, got) / Math.max(want.length, got.length);
  return { right: share >= (BY_LETTER.has(course) ? ENOUGH.letter : ENOUGH.word), share };
}

/**
 * What a Listen press does with the sounds address's answer (`app/speech.jsx`):
 *
 *  - `{ play }`: the kept reading's key, played with the AI voice;
 *  - `{ quiet }`: this person may not keep a new reading (`error.cannotChange`,
 *    such as a Viewer's text nobody had read aloud yet; AI was never asked), so
 *    the device's own voice reads that one text and the page says nothing;
 *  - `{ problem, stop }`: the words for why the AI voice did not read, while
 *    the device's voice reads instead; `stop` keeps the page from asking AI
 *    again until it is opened again (a busy AI may answer the next press).
 *    A request that never answered is not a save that failed: the AI voice was
 *    not available.
 *
 * @param {{ ok: true, value: any } | { ok: false, problem: string }} sent
 * @returns {{ play: string } | { quiet: true } | { problem: string, stop: boolean }}
 */
export function readingOutcome(sent) {
  if (sent.ok && typeof sent.value?.sound === 'string') return { play: sent.value.sound };
  const said = sent.ok ? 'ai.unavailable' : sent.problem;
  if (said === 'error.cannotChange') return { quiet: true };
  const problem = said.startsWith('error.') ? 'ai.unavailable' : said;
  return { problem, stop: problem !== 'ai.busy' };
}
