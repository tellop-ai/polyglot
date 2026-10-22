/**
 * A lesson's exercises, built from its words and sentences.
 *
 * Every lesson has the same plan: one exercise to recognise each word, one to
 * recall each word, and for each practice sentence one gap to fill and one
 * sentence to build. When speaking is on, the first sentence is said aloud in
 * place of its gap, which stays ready for "Skip speaking for now". So a lesson
 * of six words and two sentences always has sixteen exercises, whatever is
 * switched on, and the server can check a result's total. The order and the
 * wrong choices change with the seed.
 *
 * Nothing here reads or saves anything, and the page runs it in the browser.
 */

import { splitToken } from '../course/tokens.js';

import { pick, randomFrom, shuffled } from './random.js';

/**
 * @typedef {{ id: string, text: string, roman: string, ex: string, exRoman: string, meaning: string, exMeaning: string, note: string, also: string[] }} WordView
 * @typedef {{ id: string, text: string, roman: string, joiner: string, tokens: string[], tokenRoman: string[], gap: number, wrong: string[], wrongRoman: string[], orders?: number[][], meaning: string }} SentenceView
 * @typedef {{ id: string, words: WordView[], sentences: SentenceView[] }} LessonView
 * @typedef {{ key: string, text: string, roman: string }} Choice
 */

/**
 * How many exercises a lesson has.
 *
 * @param {{ words: readonly unknown[], sentences: readonly unknown[] }} lesson
 */
export function lessonTotal(lesson) {
  return lesson.words.length * 2 + lesson.sentences.length * 2;
}

/**
 * Four choices, the right one among three others, shuffled. Each choice's key
 * is its place before shuffling, so the right one's key is always `'0'`.
 *
 * @param {Choice} right
 * @param {Choice[]} others
 * @param {() => number} random
 */
function fourChoices(right, others, random) {
  const choices = [right, ...others].map((choice, at) => ({ ...choice, key: String(at) }));
  return shuffled(choices, random);
}

/**
 * Three other words from the pool whose shown side differs from the right one.
 *
 * @param {WordView} word
 * @param {readonly WordView[]} pool
 * @param {'text' | 'meaning'} side
 * @param {() => number} random
 */
function othersFor(word, pool, side, random) {
  const seen = new Set([word[side]]);
  const unique = [];
  for (const other of pool) {
    if (other.id === word.id || seen.has(other[side])) continue;
    seen.add(other[side]);
    unique.push(other);
  }
  return pick(unique, 3, random);
}

/**
 * A sentence's parts shown with its gap: the parts before, the gap's own marks
 * and the parts after.
 *
 * @param {SentenceView} sentence
 */
export function gapParts(sentence) {
  const { lead, core, trail } = splitToken(sentence.tokens[sentence.gap]);
  return {
    before: sentence.tokens.slice(0, sentence.gap),
    after: sentence.tokens.slice(sentence.gap + 1),
    lead,
    trail,
    core,
    romanBefore: sentence.tokenRoman.slice(0, sentence.gap),
    romanAfter: sentence.tokenRoman.slice(sentence.gap + 1),
  };
}

/**
 * A gap sentence as two lines of text around the blank: the words before it
 * (with the gap's opening mark) and after it (with its closing mark).
 *
 * @param {SentenceView} sentence
 * @param {readonly string[]} [tokens] the parts to show, the sentence's own by default (its sound in Latin letters works too)
 */
export function gapLine(sentence, tokens = sentence.tokens) {
  const joiner = tokens === sentence.tokens ? sentence.joiner : ' ';
  const { lead, trail } = splitToken(sentence.tokens[sentence.gap]);
  const shownGap = splitToken(tokens[sentence.gap] ?? '');
  const before = tokens.slice(0, sentence.gap).join(joiner);
  const after = tokens.slice(sentence.gap + 1).join(joiner);
  const open = tokens === sentence.tokens ? lead : shownGap.lead;
  const close = tokens === sentence.tokens ? trail : shownGap.trail;
  return {
    before: `${before}${before.length > 0 ? joiner : ''}${open}`,
    after: `${close}${after.length > 0 ? joiner : ''}${after}`,
  };
}

/**
 * The lesson's exercises in the order they are done.
 *
 * @param {LessonView} lesson
 * @param {readonly WordView[]} pool other words of the same unit, for wrong choices
 * @param {{ seed: number, listen: boolean, typing: boolean, speak?: boolean }} options
 */
export function buildExercises(lesson, pool, options) {
  const random = randomFrom(options.seed);
  const everyone = [...lesson.words, ...pool];
  const recognise = lesson.words.map((word, at) => {
    if (options.listen && at % 2 === 1) {
      const others = othersFor(word, everyone, 'text', random).map((other) => ({ key: '', text: other.text, roman: other.roman }));
      return { kind: 'listen-choose', id: `listen:${word.id}`, word, say: word.text, choices: fourChoices({ key: '', text: word.text, roman: word.roman }, others, random), answer: '0' };
    }
    const others = othersFor(word, everyone, 'meaning', random).map((other) => ({ key: '', text: other.meaning, roman: '' }));
    return { kind: 'choose-meaning', id: `meaning:${word.id}`, word, say: word.text, choices: fourChoices({ key: '', text: word.meaning, roman: '' }, others, random), answer: '0' };
  });
  const recall = lesson.words.map((word, at) => {
    if (options.typing && at % 2 === 0) {
      return { kind: 'type-word', id: `type:${word.id}`, word, say: word.text, answers: [word.text, ...word.also] };
    }
    const others = othersFor(word, everyone, 'text', random).map((other) => ({ key: '', text: other.text, roman: other.roman }));
    return { kind: 'choose-word', id: `word:${word.id}`, word, say: word.text, choices: fourChoices({ key: '', text: word.text, roman: word.roman }, others, random), answer: '0' };
  });
  const gaps = lesson.sentences.map((sentence) => {
    const parts = gapParts(sentence);
    const others = sentence.wrong.map((text, at) => ({ key: '', text, roman: sentence.wrongRoman[at] ?? '' }));
    const romanGap = sentence.tokenRoman[sentence.gap] ?? '';
    return {
      kind: 'fill-gap',
      id: `gap:${sentence.id}`,
      sentence,
      parts,
      say: sentence.text,
      choices: shuffled([{ key: '0', text: parts.core, roman: splitToken(romanGap).core }, ...others.map((other, at) => ({ ...other, key: String(at + 1) }))], random),
      answer: '0',
    };
  });
  const spoken = gaps.map((gap, at) =>
    options.speak === true && at === 0 ? { kind: 'say-sentence', id: `say:${gap.sentence.id}`, sentence: gap.sentence, say: gap.sentence.text, skipTo: gap } : gap,
  );
  const builds = lesson.sentences.map((sentence) => ({
    kind: 'build-sentence',
    id: `build:${sentence.id}`,
    sentence,
    say: sentence.text,
    tiles: shuffled(sentence.tokens.map((text, at) => ({ key: String(at), text, roman: sentence.tokenRoman[at] ?? '' })), random),
    answer: sentence.tokens,
    orders: sentence.orders ?? [],
  }));
  return [...shuffled(recognise, random), ...shuffled(recall, random), ...spoken, ...builds];
}

/**
 * Whether the tiles pressed, in order, make the sentence, in its own order or
 * in one of the other orders its language file names as just as right. Two
 * tiles with the same words can stand in either place.
 *
 * @param {readonly string[]} pressed the pressed tiles' words
 * @param {readonly string[]} tokens the sentence's parts
 * @param {readonly (readonly number[])[]} [orders] other right orders, as the parts' places
 */
export function builtRight(pressed, tokens, orders = []) {
  if (pressed.length !== tokens.length) return false;
  const rightOnes = [tokens, ...orders.map((order) => order.map((at) => tokens[at]))];
  return rightOnes.some((right) => pressed.every((text, at) => text === right[at]));
}
