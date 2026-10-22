/**
 * The level test, made from the course itself.
 *
 * The test has a part for each level, A1 first: four "what does this word
 * mean?" questions and four "fill the gap" questions, picked at random from
 * that level's lessons. A part passes with 6 of its 8 right. When the A1 part
 * does not pass, the test ends there. The result only suggests where to start
 * in this course: A1, A2, or "this course may be easy for you" (`beyond`).
 *
 * The page gets the questions without their answers. The server makes the same
 * test again from the same seed to count the answers, so a result is always
 * counted here, never taken from the page.
 */

import { splitToken } from '../course/tokens.js';

import { gapLine, gapParts } from './exercises.js';
import { pick, randomFrom, shuffled } from './random.js';

export const BANDS = Object.freeze(['a1', 'a2']);
export const QUESTIONS_PER_BAND = 8;
export const PASS_MARK = 6;

/** The answer for "I don't know". */
export const NOT_KNOWN = -1;

/**
 * A meaning question's `prompt` is the word; a gap question's is the
 * sentence's meaning in the person's own language, because a wrong choice may
 * make another real sentence that only the meaning rules out. In the
 * languages written in other letters, `roman` is the word's sound in Latin
 * letters and `romanBefore`/`romanAfter` the sentence's around the gap (all
 * empty in the others).
 *
 * @typedef {{ kind: 'meaning' | 'gap', prompt: string, roman: string, before: string, after: string, romanBefore: string, romanAfter: string, choices: { text: string, roman: string }[], answer: number }} Question
 */

/**
 * The whole test, answers included (for the server only).
 *
 * @param {{ units: { level: string, lessons: { words: any[], sentences: any[] }[] }[] }} course a course view
 * @param {number} seed
 * @returns {{ level: string, questions: Question[] }[]}
 */
export function makeTest(course, seed) {
  const random = randomFrom(seed);
  const earlier = new Set();
  return BANDS.map((level) => {
    const lessons = course.units.filter((unit) => unit.level === level).flatMap((unit) => unit.lessons);
    const words = lessons.flatMap((lesson) => lesson.words).filter((word) => !earlier.has(word.text));
    for (const word of words) earlier.add(word.text);
    const sentences = lessons.flatMap((lesson) => lesson.sentences);
    const meaningQuestions = pick(words, QUESTIONS_PER_BAND / 2, random).map((word) => {
      const others = pick(
        words.filter((other) => other.meaning !== word.meaning),
        3,
        random,
      );
      const choices = shuffled(
        [{ text: word.meaning, roman: '', right: true }, ...others.map((other) => ({ text: other.meaning, roman: '', right: false }))],
        random,
      );
      return { kind: 'meaning', prompt: word.text, roman: word.roman, before: '', after: '', romanBefore: '', romanAfter: '', choices, answer: choices.findIndex((choice) => choice.right) };
    });
    const gapQuestions = pick(sentences, QUESTIONS_PER_BAND / 2, random).map((sentence) => {
      const sounds = sentence.tokenRoman.length === sentence.tokens.length;
      const choices = shuffled(
        [
          { text: gapParts(sentence).core, roman: sounds ? splitToken(sentence.tokenRoman[sentence.gap]).core : '', right: true },
          ...sentence.wrong.map((text, at) => ({ text, roman: sentence.wrongRoman[at] ?? '', right: false })),
        ],
        random,
      );
      const { before, after } = gapLine(sentence);
      const sound = sounds ? gapLine(sentence, sentence.tokenRoman) : { before: '', after: '' };
      return { kind: 'gap', prompt: sentence.meaning, roman: '', before, after, romanBefore: sound.before, romanAfter: sound.after, choices, answer: choices.findIndex((choice) => choice.right) };
    });
    const questions = shuffled([...meaningQuestions, ...gapQuestions], random).map((question) => ({
      ...question,
      choices: question.choices.map(({ text, roman }) => ({ text, roman })),
    }));
    return { level, questions };
  });
}

/**
 * The test as the page sees it: the same questions with no answers.
 *
 * @param {ReturnType<typeof makeTest>} test
 */
export function withoutAnswers(test) {
  return test.map(({ level, questions }) => ({ level, questions: questions.map(({ answer: _answer, ...rest }) => rest) }));
}

/**
 * Counts the answers given so far.
 *
 * `answers` holds one entry per question in the order asked: the chosen
 * choice's place, or {@link NOT_KNOWN}. Eight answers are the A1 part; sixteen
 * are both. A list of any other length, or sixteen after an A1 part that did
 * not pass, is refused with `null`.
 *
 * @param {ReturnType<typeof makeTest>} test
 * @param {unknown} answers
 * @returns {{ bands: { level: string, right: number, total: number }[], complete: boolean, start: string, right: number, total: number } | null}
 */
export function scoreTest(test, answers) {
  if (!Array.isArray(answers)) return null;
  if (answers.length !== QUESTIONS_PER_BAND && answers.length !== QUESTIONS_PER_BAND * 2) return null;
  if (!answers.every((answer) => Number.isInteger(answer) && answer >= NOT_KNOWN && answer <= 3)) return null;
  const bands = [];
  for (let band = 0; band * QUESTIONS_PER_BAND < answers.length; band += 1) {
    const questions = test[band].questions;
    const given = answers.slice(band * QUESTIONS_PER_BAND, (band + 1) * QUESTIONS_PER_BAND);
    const right = given.filter((answer, at) => answer === questions[at].answer).length;
    bands.push({ level: test[band].level, right, total: QUESTIONS_PER_BAND });
  }
  const passedA1 = bands[0].right >= PASS_MARK;
  if (!passedA1 && bands.length > 1) return null;
  const right = bands.reduce((sum, band) => sum + band.right, 0);
  const total = bands.reduce((sum, band) => sum + band.total, 0);
  if (!passedA1) return { bands, complete: true, start: 'a1', right, total };
  if (bands.length === 1) return { bands, complete: false, start: '', right, total };
  return { bands, complete: true, start: bands[1].right >= PASS_MARK ? 'beyond' : 'a2', right, total };
}
