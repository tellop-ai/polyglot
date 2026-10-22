/**
 * What the course's saved information may be, as small pure functions.
 *
 * The pages, the forms and the addresses all ask these, so a bound is written
 * once. Nothing here reads or saves anything. A refusal is a message key under
 * `learn.refused.*` in `lib/i18n/locales/`, never a sentence.
 */

import { canLearn, isCourse, isOwnLanguage, languageOf } from './languages.js';
import { isReadWith } from './voice.js';

/** Every refusal key this module and the addresses answer. */
export const REFUSED = Object.freeze({
  request: 'learn.refused.request',
  long: 'learn.refused.long',
  language: 'learn.refused.language',
  course: 'learn.refused.course',
  notStarted: 'learn.refused.notStarted',
  switched: 'learn.refused.switched',
  studyDays: 'learn.refused.studyDays',
  setting: 'learn.refused.setting',
  lesson: 'learn.refused.lesson',
  score: 'learn.refused.score',
  card: 'learn.refused.card',
  front: 'learn.refused.front',
  back: 'learn.refused.back',
  note: 'learn.refused.note',
  tooManyCards: 'learn.refused.tooManyCards',
  test: 'learn.refused.test',
  practice: 'learn.refused.practice',
  clock: 'learn.refused.clock',
  sounds: 'learn.refused.sounds',
});

/** The defaults of everything a person can set. No saved row means these. */
export const SETTING_DEFAULTS = Object.freeze({
  studyDays: Object.freeze([1, 2, 3, 4, 5]),
  lessonsPerDay: 1,
  cardsPerDay: 20,
  readAloud: true,
  voiceSpeed: 'normal',
  readWith: 'ai',
  speaking: true,
});

export const LESSONS_PER_DAY = Object.freeze([1, 2, 3]);
export const CARDS_PER_DAY = Object.freeze([10, 20, 30, 50]);
export const VOICE_SPEEDS = Object.freeze(['slow', 'normal']);

/** A person's own word: the lengths, in characters after trimming. */
export const OWN_CARD = Object.freeze({ front: 80, back: 120, note: 200 });

/** The most own words one course keeps. */
export const MAX_OWN_CARDS = 2000;

/** How a lesson's result may look. */
export const MAX_LESSON_TOTAL = 60;

/** The start levels a course can have, `''` meaning not chosen yet. */
export const START_LEVELS = Object.freeze(['a1', 'a2', 'beyond']);

/**
 * How long a text is, in code points.
 *
 * @param {string} value
 */
export function characterCount(value) {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

/**
 * Study days as kept: `"1,2,3,4,5"`.
 *
 * @param {readonly number[]} days
 */
export function studyDaysText(days) {
  return [...days].sort((a, b) => a - b).join(',');
}

/**
 * Study days read back from the saved text; the defaults when the text is not
 * a sound list.
 *
 * @param {unknown} text
 * @returns {number[]}
 */
export function readStudyDays(text) {
  if (typeof text !== 'string' || !/^[1-7](,[1-7]){0,6}$/u.test(text)) return [...SETTING_DEFAULTS.studyDays];
  const days = text.split(',').map(Number);
  if (new Set(days).size !== days.length) return [...SETTING_DEFAULTS.studyDays];
  return days.sort((a, b) => a - b);
}

/**
 * Why a list of study days cannot be kept, or `null`.
 *
 * @param {unknown} value
 */
export function studyDaysProblem(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) return REFUSED.studyDays;
  if (!value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)) return REFUSED.studyDays;
  if (new Set(value).size !== value.length) return REFUSED.studyDays;
  return null;
}

/**
 * The settings in a request, checked. Every field is optional; a field that is
 * present must be sound.
 *
 * @param {Record<string, unknown>} asked
 * @returns {{ ok: true, value: Record<string, unknown> } | { ok: false, problem: string }}
 */
export function readSettings(asked) {
  const value = {};
  if (asked.studyDays !== undefined) {
    const problem = studyDaysProblem(asked.studyDays);
    if (problem !== null) return { ok: false, problem };
    value.studyDays = studyDaysText(/** @type {number[]} */ (asked.studyDays));
  }
  if (asked.lessonsPerDay !== undefined) {
    if (!LESSONS_PER_DAY.includes(/** @type {number} */ (asked.lessonsPerDay))) return { ok: false, problem: REFUSED.setting };
    value.lessonsPerDay = asked.lessonsPerDay;
  }
  if (asked.cardsPerDay !== undefined) {
    if (!CARDS_PER_DAY.includes(/** @type {number} */ (asked.cardsPerDay))) return { ok: false, problem: REFUSED.setting };
    value.cardsPerDay = asked.cardsPerDay;
  }
  if (asked.readAloud !== undefined) {
    if (typeof asked.readAloud !== 'boolean') return { ok: false, problem: REFUSED.setting };
    value.readAloud = asked.readAloud;
  }
  if (asked.voiceSpeed !== undefined) {
    if (!VOICE_SPEEDS.includes(/** @type {string} */ (asked.voiceSpeed))) return { ok: false, problem: REFUSED.setting };
    value.voiceSpeed = asked.voiceSpeed;
  }
  if (asked.readWith !== undefined) {
    if (!isReadWith(asked.readWith)) return { ok: false, problem: REFUSED.setting };
    value.readWith = asked.readWith;
  }
  if (asked.speaking !== undefined) {
    if (typeof asked.speaking !== 'boolean') return { ok: false, problem: REFUSED.setting };
    value.speaking = asked.speaking;
  }
  return { ok: true, value };
}

/**
 * Why a choice of own language and course cannot be kept, or `null`.
 *
 * @param {unknown} own
 * @param {unknown} course
 */
export function choiceProblem(own, course) {
  if (!isOwnLanguage(own)) return REFUSED.language;
  if (!isCourse(course) || !canLearn(own, course)) return REFUSED.course;
  return null;
}

/**
 * Why an accent cannot be kept for a course, or `null`.
 *
 * @param {string} course
 * @param {unknown} voice
 */
export function voiceProblem(course, voice) {
  const language = languageOf(course);
  if (language === null) return REFUSED.course;
  return typeof voice === 'string' && language.voices.includes(voice) ? null : REFUSED.setting;
}

/**
 * A person's own word, checked and trimmed.
 *
 * @param {{ front?: unknown, back?: unknown, note?: unknown }} asked
 * @returns {{ ok: true, value: { front: string, back: string, note: string } } | { ok: false, problem: string }}
 */
export function readOwnCard(asked) {
  const fields = { front: asked.front, back: asked.back, note: asked.note ?? '' };
  for (const name of /** @type {const} */ (['front', 'back', 'note'])) {
    if (typeof fields[name] !== 'string') return { ok: false, problem: REFUSED.request };
  }
  const front = String(fields.front).trim();
  const back = String(fields.back).trim();
  const note = String(fields.note).trim();
  const lines = new RegExp(`[\r\n${String.fromCodePoint(0x2028, 0x2029)}]`, 'u');
  if (front.length === 0 || characterCount(front) > OWN_CARD.front || lines.test(front)) return { ok: false, problem: REFUSED.front };
  if (back.length === 0 || characterCount(back) > OWN_CARD.back || lines.test(back)) return { ok: false, problem: REFUSED.back };
  if (characterCount(note) > OWN_CARD.note) return { ok: false, problem: REFUSED.note };
  return { ok: true, value: { front, back, note } };
}

/**
 * Why a lesson's result cannot be kept, or `null`. `expected` is how many
 * exercises the lesson has.
 *
 * @param {unknown} right
 * @param {unknown} total
 * @param {number} expected
 */
export function scoreProblem(right, total, expected) {
  if (!Number.isInteger(total) || total !== expected || expected < 1 || expected > MAX_LESSON_TOTAL) return REFUSED.score;
  if (!Number.isInteger(right) || /** @type {number} */ (right) < 0 || /** @type {number} */ (right) > /** @type {number} */ (total)) return REFUSED.score;
  return null;
}

/** A card's key for a lesson's word. @param {string} wordId */
export function wordCardKey(wordId) {
  return `w:${wordId}`;
}

const CARD_KEY = /^(?:w:[a-z][a-z0-9-]{1,39}|own:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;

/** @param {unknown} value */
export function isCardKey(value) {
  return typeof value === 'string' && CARD_KEY.test(value);
}

/** A lesson run's code: 32 lowercase hexadecimal digits, made by the lesson page. */
const ATTEMPT_KEY = /^[0-9a-f]{32}$/u;

/** @param {unknown} value */
export function isAttemptKey(value) {
  return typeof value === 'string' && ATTEMPT_KEY.test(value);
}
