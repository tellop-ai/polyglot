/**
 * The course, as the pages read it.
 *
 * The content is written into this app: `base.json` (the units, lessons,
 * words and sentences in English and Turkish) and one file per language. A
 * course is one language to learn, seen from the person's own language: its
 * words and sentences in the language learned, their meanings and its tips in
 * the person's own. A language whose file fails its checks is not offered,
 * and the app's tests keep every language passing.
 *
 * Server code only: the pages pass a lesson's view to the browser, never this
 * module.
 */

import { languageOf } from '../learn/languages.js';
import { readSpokenText } from '../learn/voice.js';

import base from './base.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };
import ja from './ja.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };
import pt from './pt.json' with { type: 'json' };
import tr from './tr.json' with { type: 'json' };
import zh from './zh.json' with { type: 'json' };
import { checkBase, checkLanguage } from './check.js';

/** @type {Readonly<Record<string, any>>} */
const FILES = Object.freeze({ en, tr, es, de, fr, it, pt, ja, ko, zh });

const BASE_PROBLEMS = Object.freeze(checkBase(base));

/** @type {Map<string, readonly string[]>} */
const PROBLEMS = new Map();

/**
 * What is wrong with a language's content; empty when it is sound.
 *
 * @param {string} code
 * @returns {readonly string[]}
 */
export function courseProblems(code) {
  if (BASE_PROBLEMS.length > 0) return BASE_PROBLEMS;
  if (!Object.hasOwn(FILES, code)) return [`${code} has no content`];
  let found = PROBLEMS.get(code);
  if (found === undefined) {
    found = Object.freeze(checkLanguage(base, code, FILES[code]));
    PROBLEMS.set(code, found);
  }
  return found;
}

/** @param {string} code */
export function courseReady(code) {
  return courseProblems(code).length === 0;
}

/**
 * @param {string} code
 * @param {string} own
 * @param {any} word the core's word
 * @param {any} entry the language file's word, or `{}`
 */
function wordView(code, own, word, entry) {
  const fromCore = code === 'en' || code === 'tr';
  return Object.freeze({
    id: word.id,
    text: fromCore ? word[code] : entry.text,
    roman: entry.roman ?? '',
    ex: fromCore ? word.ex[code] : entry.ex,
    exRoman: entry.exRoman ?? '',
    meaning: word[own],
    exMeaning: word.ex[own],
    note: entry.note?.[own] ?? '',
    also: Object.freeze([...(entry.also ?? [])]),
  });
}

/**
 * @param {string} own
 * @param {any} sentence the core's sentence
 * @param {any} entry the language file's sentence
 * @param {string} joiner
 */
function sentenceView(own, sentence, entry, joiner) {
  return Object.freeze({
    id: sentence.id,
    text: entry.tokens.join(joiner),
    roman: entry.roman ?? '',
    joiner,
    tokens: Object.freeze([...entry.tokens]),
    tokenRoman: Object.freeze([...(entry.tokenRoman ?? [])]),
    gap: entry.gap,
    wrong: Object.freeze([...entry.wrong]),
    wrongRoman: Object.freeze([...(entry.wrongRoman ?? [])]),
    orders: Object.freeze((entry.orders ?? []).map((order) => Object.freeze([...order]))),
    meaning: sentence[own],
  });
}

/** @param {string} own @param {any} tip */
function tipView(own, tip) {
  return Object.freeze({
    title: tip.title[own],
    body: tip.body[own],
    examples: Object.freeze(tip.examples.map((example) => Object.freeze({ text: example.text, roman: example.roman ?? '', meaning: example[own] }))),
  });
}

/** @type {Map<string, any>} */
const VIEWS = new Map();

/**
 * A course as the person sees it, or `null` when that course cannot be
 * offered (their own language, or content that fails its checks).
 *
 * @param {string} code the language learned
 * @param {string} own the person's own language
 */
export function courseView(code, own) {
  const language = languageOf(code);
  if (language === null || code === own || (own !== 'tr' && own !== 'en') || !courseReady(code)) return null;
  const key = `${code}:${own}`;
  const cached = VIEWS.get(key);
  if (cached !== undefined) return cached;
  const data = FILES[code];
  const units = base.units.map((unit, unitAt) =>
    Object.freeze({
      id: unit.id,
      number: unitAt + 1,
      level: unit.level,
      title: unit.title[own],
      tip: tipView(own, data.tips[unit.id]),
      lessons: Object.freeze(
        unit.lessons.map((lesson, lessonAt) =>
          Object.freeze({
            id: lesson.id,
            unit: unit.id,
            unitNumber: unitAt + 1,
            number: lessonAt + 1,
            level: unit.level,
            title: lesson.title[own],
            words: Object.freeze(lesson.words.map((word) => wordView(code, own, word, data.words?.[word.id] ?? {}))),
            sentences: Object.freeze(lesson.sentences.map((sentence) => sentenceView(own, sentence, data.sentences[sentence.id], language.joiner))),
          }),
        ),
      ),
    }),
  );
  const lessons = units.flatMap((unit) => unit.lessons);
  const words = new Map(lessons.flatMap((lesson) => lesson.words.map((word) => [word.id, word])));
  const view = Object.freeze({ code, own, language, units: Object.freeze(units), lessons: Object.freeze(lessons), words });
  VIEWS.set(key, view);
  return view;
}

/** @type {WeakMap<object, Set<string>>} */
const TEXTS = new WeakMap();

/**
 * Every text of a course that is read aloud as the course's own: its words,
 * their examples, its sentences and its tips' examples, each made one line as
 * a reading is (`readSpokenText`).
 *
 * @param {NonNullable<ReturnType<typeof courseView>>} view
 */
export function courseTexts(view) {
  const cached = TEXTS.get(view);
  if (cached !== undefined) return cached;
  const texts = new Set();
  /** @param {unknown} text */
  const add = (text) => {
    const line = readSpokenText(text);
    if (line !== null) texts.add(line);
  };
  for (const unit of view.units) {
    for (const example of unit.tip.examples) add(example.text);
    for (const lesson of unit.lessons) {
      for (const word of lesson.words) {
        add(word.text);
        add(word.ex);
      }
      for (const sentence of lesson.sentences) add(sentence.text);
    }
  }
  TEXTS.set(view, texts);
  return texts;
}

/**
 * One lesson of a course with its unit and the unit's other words, or `null`.
 *
 * @param {NonNullable<ReturnType<typeof courseView>>} view
 * @param {unknown} lessonId
 */
export function lessonOf(view, lessonId) {
  const lesson = view.lessons.find((item) => item.id === lessonId);
  if (lesson === undefined) return null;
  const unit = view.units.find((item) => item.id === lesson.unit);
  const pool = unit.lessons.filter((item) => item.id !== lesson.id).flatMap((item) => item.words);
  const at = view.lessons.indexOf(lesson);
  return { lesson, unit, pool, next: view.lessons[at + 1] ?? null, firstOfUnit: lesson.number === 1 };
}
