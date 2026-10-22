/**
 * What the course's content files must be, checked as small pure functions.
 *
 * The course is content written into this app: `base.json` holds the twelve
 * units, their 48 lessons, 288 words and 96 practice sentences in English and
 * Turkish, and one file per language holds that language's words, sentences
 * and tips. These checks run when the course loads and in the app's own tests,
 * so a damaged or half-written file is refused with the place it went wrong
 * rather than shown as a broken lesson.
 *
 * Each check answers a list of problems, each one a plain line naming the
 * place (`u03-2 words[4] tr`). An empty list means the file is sound.
 */

import { languageOf, OWN_LANGUAGES } from '../learn/languages.js';

import { splitToken } from './tokens.js';

/** The course's fixed shape. */
export const SHAPE = Object.freeze({ units: 12, lessonsPerUnit: 4, wordsPerLesson: 6, sentencesPerLesson: 2 });

/** The longest texts, in characters. */
export const LIMITS = Object.freeze({
  unitTitle: 60,
  lessonTitle: 40,
  baseWordEn: 40,
  baseWordTr: 60,
  baseExample: 70,
  baseSentence: 60,
  hint: 140,
  word: 60,
  example: 120,
  roman: 160,
  orders: 3,
  note: 160,
  tipTitle: 60,
  tipBody: 900,
  tokens: 16,
});

const WORD_ID = /^[a-z][a-z0-9-]{1,39}$/u;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/u;

/** The levels, by unit number. */
export function levelOfUnit(number) {
  return number <= 6 ? 'a1' : 'a2';
}

/**
 * The languages a course explains itself in: the person's own language, which
 * is never the language they learn.
 *
 * @param {string} course
 * @returns {string[]}
 */
export function meaningLanguages(course) {
  return OWN_LANGUAGES.filter((own) => own !== course);
}

/** @param {string} text */
function sameKey(text) {
  return text.normalize('NFC').toLocaleLowerCase('tr').replace(/\s+/gu, ' ').trim();
}

/** @param {unknown} value @param {number} most */
function goodText(value, most) {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim() && value.length <= most && !CONTROL.test(value);
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {object} value @param {readonly string[]} allowed */
function strangeKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

/**
 * @param {string[]} problems
 * @param {string} place
 * @param {unknown} value
 * @param {readonly string[]} languages
 * @param {number} most
 */
function needPair(problems, place, value, languages, most) {
  if (!isRecord(value)) {
    problems.push(`${place} is missing`);
    return;
  }
  for (const key of strangeKeys(value, languages)) problems.push(`${place} has an unknown language ${key}`);
  for (const language of languages) {
    if (!goodText(value[language], most)) problems.push(`${place} ${language} is empty, too long or untidy`);
  }
}

/**
 * Checks `base.json`.
 *
 * @param {unknown} base
 * @returns {string[]}
 */
export function checkBase(base) {
  const problems = [];
  if (!isRecord(base) || base.format !== 1 || !Array.isArray(base.units)) return ['base is not a course core of format 1'];
  for (const key of strangeKeys(base, ['format', 'units'])) problems.push(`base has an unknown key ${key}`);
  if (base.units.length !== SHAPE.units) problems.push(`base has ${base.units.length} units, not ${SHAPE.units}`);
  const wordIds = new Set();
  const seen = { a1: { en: new Map(), tr: new Map() }, a2: { en: new Map(), tr: new Map() } };
  base.units.forEach((unit, at) => {
    const number = at + 1;
    const unitId = `u${String(number).padStart(2, '0')}`;
    if (!isRecord(unit) || unit.id !== unitId) {
      problems.push(`unit ${number} is not ${unitId}`);
      return;
    }
    for (const key of strangeKeys(unit, ['id', 'level', 'title', 'lessons'])) problems.push(`${unitId} has an unknown key ${key}`);
    const level = levelOfUnit(number);
    if (unit.level !== level) problems.push(`${unitId} level is not ${level}`);
    needPair(problems, `${unitId} title`, unit.title, OWN_LANGUAGES, LIMITS.unitTitle);
    if (!Array.isArray(unit.lessons) || unit.lessons.length !== SHAPE.lessonsPerUnit) {
      problems.push(`${unitId} does not have ${SHAPE.lessonsPerUnit} lessons`);
      return;
    }
    unit.lessons.forEach((lesson, place) => {
      const lessonId = `${unitId}-${place + 1}`;
      if (!isRecord(lesson) || lesson.id !== lessonId) {
        problems.push(`${unitId} lesson ${place + 1} is not ${lessonId}`);
        return;
      }
      for (const key of strangeKeys(lesson, ['id', 'title', 'words', 'sentences'])) problems.push(`${lessonId} has an unknown key ${key}`);
      needPair(problems, `${lessonId} title`, lesson.title, OWN_LANGUAGES, LIMITS.lessonTitle);
      if (!Array.isArray(lesson.words) || lesson.words.length !== SHAPE.wordsPerLesson) {
        problems.push(`${lessonId} does not have ${SHAPE.wordsPerLesson} words`);
      } else {
        lesson.words.forEach((word, index) => {
          const where = `${lessonId} words[${index}]`;
          if (!isRecord(word)) {
            problems.push(`${where} is not a word`);
            return;
          }
          for (const key of strangeKeys(word, ['id', 'en', 'tr', 'ex', 'hint'])) problems.push(`${where} has an unknown key ${key}`);
          if (typeof word.id !== 'string' || !WORD_ID.test(word.id)) problems.push(`${where} id is not a word id`);
          else if (wordIds.has(word.id)) problems.push(`${where} id ${word.id} is used twice`);
          else wordIds.add(word.id);
          if (!goodText(word.en, LIMITS.baseWordEn)) problems.push(`${where} en is empty, too long or untidy`);
          if (!goodText(word.tr, LIMITS.baseWordTr)) problems.push(`${where} tr is empty, too long or untidy`);
          needPair(problems, `${where} ex`, word.ex, OWN_LANGUAGES, LIMITS.baseExample);
          if (word.hint !== undefined && !goodText(word.hint, LIMITS.hint)) problems.push(`${where} hint is empty or too long`);
          for (const language of OWN_LANGUAGES) {
            if (typeof word[language] !== 'string') continue;
            const key = sameKey(word[language]);
            const earlier = seen[level][language].get(key);
            if (earlier !== undefined) problems.push(`${where} ${language} "${word[language]}" repeats ${earlier} in ${level}`);
            else seen[level][language].set(key, word.id);
          }
        });
      }
      if (!Array.isArray(lesson.sentences) || lesson.sentences.length !== SHAPE.sentencesPerLesson) {
        problems.push(`${lessonId} does not have ${SHAPE.sentencesPerLesson} sentences`);
      } else {
        lesson.sentences.forEach((sentence, index) => {
          const sentenceId = `${lessonId}-${'ab'[index]}`;
          if (!isRecord(sentence) || sentence.id !== sentenceId) {
            problems.push(`${lessonId} sentence ${index + 1} is not ${sentenceId}`);
            return;
          }
          for (const key of strangeKeys(sentence, ['id', 'en', 'tr'])) problems.push(`${sentenceId} has an unknown key ${key}`);
          for (const language of OWN_LANGUAGES) {
            if (!goodText(sentence[language], LIMITS.baseSentence)) problems.push(`${sentenceId} ${language} is empty, too long or untidy`);
          }
        });
      }
    });
  });
  return problems;
}

/**
 * Every word and sentence of the core, with its level and unit.
 *
 * @param {any} base a core that passed {@link checkBase}
 */
export function walkBase(base) {
  const words = [];
  const sentences = [];
  for (const unit of base.units) {
    for (const lesson of unit.lessons) {
      for (const word of lesson.words) words.push({ unit: unit.id, level: unit.level, lesson: lesson.id, word });
      for (const sentence of lesson.sentences) sentences.push({ unit: unit.id, level: unit.level, lesson: lesson.id, sentence });
    }
  }
  return { words, sentences };
}

/**
 * Checks one language's file against a sound core.
 *
 * @param {any} base a core that passed {@link checkBase}
 * @param {string} code
 * @param {unknown} data
 * @returns {string[]}
 */
export function checkLanguage(base, code, data) {
  const language = languageOf(code);
  if (language === null) return [`${code} is not a course language`];
  if (!isRecord(data) || data.format !== 1 || data.language !== code) return [`${code} is not a language file of format 1 for ${code}`];
  const problems = [];
  const meanings = meaningLanguages(code);
  const fromCore = code === 'en' || code === 'tr';
  for (const key of strangeKeys(data, ['format', 'language', 'words', 'sentences', 'tips'])) problems.push(`${code} has an unknown key ${key}`);
  const { words, sentences } = walkBase(base);
  const words_ = isRecord(data.words) ? data.words : fromCore && data.words === undefined ? {} : null;
  if (words_ === null) problems.push(`${code} words are missing`);
  const known = new Set(words.map((item) => item.word.id));
  const texts = { a1: new Map(), a2: new Map() };
  for (const id of Object.keys(words_ ?? {})) if (!known.has(id)) problems.push(`${code} words.${id} is not a word of the course`);
  for (const { level, word } of words) {
    const where = `${code} words.${word.id}`;
    const entry = words_?.[word.id];
    let text = fromCore ? word[code] : undefined;
    if (entry === undefined) {
      if (!fromCore) problems.push(`${where} is missing`);
    } else if (!isRecord(entry)) {
      problems.push(`${where} is not a word`);
    } else {
      const allowed = fromCore ? ['also', 'note'] : ['text', 'ex', 'roman', 'exRoman', 'also', 'note'];
      for (const key of strangeKeys(entry, allowed)) problems.push(`${where} has an unknown key ${key}`);
      if (!fromCore) {
        text = entry.text;
        if (!goodText(entry.text, LIMITS.word)) problems.push(`${where} text is empty, too long or untidy`);
        if (!goodText(entry.ex, LIMITS.example)) problems.push(`${where} ex is empty, too long or untidy`);
        if (language.roman) {
          if (!goodText(entry.roman, LIMITS.roman)) problems.push(`${where} roman is missing`);
          if (!goodText(entry.exRoman, LIMITS.roman)) problems.push(`${where} exRoman is missing`);
        } else if (entry.roman !== undefined || entry.exRoman !== undefined) {
          problems.push(`${where} has a roman form, which ${code} does not use`);
        }
      }
      if (entry.also !== undefined) {
        if (language.roman) problems.push(`${where} also: ${code} is never typed`);
        else if (!Array.isArray(entry.also) || entry.also.length === 0 || entry.also.length > 4 || !entry.also.every((item) => goodText(item, LIMITS.word))) {
          problems.push(`${where} also is not a short list of answers`);
        }
      }
      if (entry.note !== undefined) needPair(problems, `${where} note`, entry.note, meanings, LIMITS.note);
    }
    if (typeof text === 'string') {
      const key = sameKey(text);
      const earlier = texts[level].get(key);
      if (earlier !== undefined) problems.push(`${where} "${text}" repeats ${earlier} in ${level}`);
      else texts[level].set(key, word.id);
    }
  }
  if (!isRecord(data.sentences)) {
    problems.push(`${code} sentences are missing`);
  } else {
    const ids = new Set(sentences.map((item) => item.sentence.id));
    for (const id of Object.keys(data.sentences)) if (!ids.has(id)) problems.push(`${code} sentences.${id} is not a sentence of the course`);
    for (const { sentence } of sentences) problems.push(...checkSentence(code, language, sentence, data.sentences[sentence.id]));
  }
  if (!isRecord(data.tips)) {
    problems.push(`${code} tips are missing`);
  } else {
    const units = new Set(base.units.map((unit) => unit.id));
    for (const id of Object.keys(data.tips)) if (!units.has(id)) problems.push(`${code} tips.${id} is not a unit`);
    for (const unit of base.units) {
      const where = `${code} tips.${unit.id}`;
      const tip = data.tips[unit.id];
      if (!isRecord(tip)) {
        problems.push(`${where} is missing`);
        continue;
      }
      for (const key of strangeKeys(tip, ['title', 'body', 'examples'])) problems.push(`${where} has an unknown key ${key}`);
      needPair(problems, `${where} title`, tip.title, meanings, LIMITS.tipTitle);
      needPair(problems, `${where} body`, tip.body, meanings, LIMITS.tipBody);
      if (!Array.isArray(tip.examples) || tip.examples.length < 2 || tip.examples.length > 3) {
        problems.push(`${where} needs two or three examples`);
        continue;
      }
      tip.examples.forEach((example, index) => {
        const at = `${where} examples[${index}]`;
        if (!isRecord(example)) {
          problems.push(`${at} is not an example`);
          return;
        }
        const allowed = ['text', ...meanings, ...(language.roman ? ['roman'] : [])];
        for (const key of strangeKeys(example, allowed)) problems.push(`${at} has an unknown key ${key}`);
        if (!goodText(example.text, LIMITS.example)) problems.push(`${at} text is empty, too long or untidy`);
        if (language.roman && !goodText(example.roman, LIMITS.roman)) problems.push(`${at} roman is missing`);
        for (const own of meanings) if (!goodText(example[own], LIMITS.example)) problems.push(`${at} ${own} is empty, too long or untidy`);
      });
    }
  }
  return problems;
}

/**
 * Other orders of a sentence's parts that are just as right, each a list of
 * the parts' places (`[0, 3, 1, 2, 4]`): one to three, each every part once and
 * none the sentence's own order.
 *
 * @param {string} where
 * @param {unknown} orders
 * @param {string[]} tokens
 * @returns {string[]}
 */
function ordersProblems(where, orders, tokens) {
  if (!Array.isArray(orders) || orders.length === 0 || orders.length > LIMITS.orders) return [`${where} orders is not one to ${LIMITS.orders} orders`];
  const problems = [];
  const seen = new Set([tokens.map((_, at) => at).join(',')]);
  for (const order of orders) {
    const places = Array.isArray(order) ? [...order].sort((a, b) => a - b) : [];
    if (!Array.isArray(order) || order.length !== tokens.length || !places.every((place, at) => place === at)) {
      problems.push(`${where} orders holds one that is not every part once`);
      continue;
    }
    const key = order.join(',');
    if (seen.has(key)) problems.push(`${where} orders repeats the sentence's order or another one`);
    seen.add(key);
  }
  return problems;
}

/**
 * @param {string} code
 * @param {import('../learn/languages.js').Language} language
 * @param {any} sentence the core's sentence
 * @param {unknown} entry
 * @returns {string[]}
 */
function checkSentence(code, language, sentence, entry) {
  const where = `${code} sentences.${sentence.id}`;
  if (!isRecord(entry)) return [`${where} is missing`];
  const problems = [];
  const allowed = ['tokens', 'gap', 'wrong', 'orders', ...(language.roman ? ['roman', 'tokenRoman', 'wrongRoman'] : [])];
  for (const key of strangeKeys(entry, allowed)) problems.push(`${where} has an unknown key ${key}`);
  const tokens = entry.tokens;
  if (!Array.isArray(tokens) || tokens.length < 2 || tokens.length > LIMITS.tokens || !tokens.every((token) => goodText(token, LIMITS.word) && !/\s/u.test(token))) {
    problems.push(`${where} tokens are not two to ${LIMITS.tokens} parts without spaces`);
    return problems;
  }
  const joined = tokens.join(language.joiner);
  if ((code === 'en' || code === 'tr') && joined !== sentence[code]) problems.push(`${where} tokens make "${joined}", not "${sentence[code]}"`);
  if (joined.length > LIMITS.example) problems.push(`${where} is too long`);
  if (!Number.isInteger(entry.gap) || entry.gap < 0 || entry.gap >= tokens.length) {
    problems.push(`${where} gap is not one of its parts`);
    return problems;
  }
  const core = splitToken(tokens[entry.gap]).core;
  if (core.length === 0) problems.push(`${where} gap is only marks`);
  const wrong = entry.wrong;
  if (!Array.isArray(wrong) || wrong.length !== 3 || !wrong.every((item) => goodText(item, LIMITS.word))) {
    problems.push(`${where} wrong is not three choices`);
  } else {
    const keys = new Set([sameKey(core)]);
    for (const item of wrong) {
      if (splitToken(item).core !== item) problems.push(`${where} wrong "${item}" carries marks`);
      const key = sameKey(item);
      if (keys.has(key)) problems.push(`${where} wrong "${item}" repeats the answer or another choice`);
      keys.add(key);
    }
  }
  if (entry.orders !== undefined) problems.push(...ordersProblems(where, entry.orders, tokens));
  if (language.roman) {
    if (!goodText(entry.roman, LIMITS.roman)) problems.push(`${where} roman is missing`);
    if (!Array.isArray(entry.tokenRoman) || entry.tokenRoman.length !== tokens.length || !entry.tokenRoman.every((item) => goodText(item, LIMITS.roman))) {
      problems.push(`${where} tokenRoman does not match its parts`);
    }
    if (!Array.isArray(entry.wrongRoman) || entry.wrongRoman.length !== 3 || !entry.wrongRoman.every((item) => goodText(item, LIMITS.roman))) {
      problems.push(`${where} wrongRoman does not match its choices`);
    }
  }
  return problems;
}
