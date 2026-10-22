/**
 * The course's content: the core and every language's file pass their checks,
 * every course builds from either own language, every lesson's exercises build,
 * and every word key the screens build from a name exists in both languages.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { checkBase, checkLanguage, SHAPE } from '../lib/course/check.js';
import { courseProblems, courseView, lessonOf } from '../lib/course/index.js';
import { MESSAGES } from '../lib/i18n/index.js';
import { buildExercises, lessonTotal } from '../lib/learn/exercises.js';
import { makeTest, scoreTest, withoutAnswers } from '../lib/learn/placement.js';
import { COURSES, LANGUAGES, OWN_LANGUAGES } from '../lib/learn/languages.js';
import { SITUATIONS } from '../lib/learn/practice.js';

const folder = path.join(import.meta.dirname, '..', 'lib', 'course');
/** @param {string} name */
const read = (name) => readFileSync(path.join(folder, `${name}.json`));

test('the core has twelve units of four lessons, six words and two sentences each', () => {
  const base = JSON.parse(read('base').toString('utf8'));
  assert.deepEqual(checkBase(base), []);
  assert.equal(base.units.length, SHAPE.units);
  const lessons = base.units.flatMap((unit) => unit.lessons);
  assert.equal(lessons.length, 48);
  assert.equal(lessons.flatMap((lesson) => lesson.words).length, 288);
  assert.equal(lessons.flatMap((lesson) => lesson.sentences).length, 96);
});

test('every language file passes its checks', () => {
  const base = JSON.parse(read('base').toString('utf8'));
  for (const code of COURSES) {
    const bytes = read(code);
    assert.equal(bytes.includes(0), false, `${code} holds a NUL byte`);
    assert.deepEqual(checkLanguage(base, code, JSON.parse(bytes.toString('utf8'))), [], code);
    assert.deepEqual(courseProblems(code), [], code);
  }
});

test('the checks refuse a damaged language file', () => {
  const base = JSON.parse(read('base').toString('utf8'));
  const de = JSON.parse(read('de').toString('utf8'));
  const firstWord = base.units[0].lessons[0].words[0].id;
  const firstSentence = base.units[0].lessons[0].sentences[0].id;
  const missingWord = structuredClone(de);
  delete missingWord.words[firstWord];
  assert.ok(checkLanguage(base, 'de', missingWord).some((line) => line.includes(firstWord)));
  const badGap = structuredClone(de);
  badGap.sentences[firstSentence].gap = 99;
  assert.ok(checkLanguage(base, 'de', badGap).some((line) => line.includes('gap')));
  const sameChoice = structuredClone(de);
  const sentence = sameChoice.sentences[firstSentence];
  sentence.wrong[0] = sentence.tokens[sentence.gap].replace(/[.,!?;:]+$/u, '');
  assert.ok(checkLanguage(base, 'de', sameChoice).some((line) => line.includes('repeats the answer')));
  const orders = (value) => {
    const changed = structuredClone(de);
    changed.sentences[firstSentence].orders = value;
    return checkLanguage(base, 'de', changed).filter((line) => line.includes('orders'));
  };
  const size = de.sentences[firstSentence].tokens.length;
  const own = Array.from({ length: size }, (_, at) => at);
  const swapped = [own[1], own[0], ...own.slice(2)];
  assert.deepEqual(orders([swapped]), []);
  assert.equal(orders([own]).length, 1, 'the sentence\'s own order');
  assert.equal(orders([swapped, swapped]).length, 1, 'an order twice');
  assert.equal(orders([own.slice(1)]).length, 1, 'a part left out');
  assert.equal(orders([[...swapped.slice(1), 0, 0].slice(0, size)]).length, 1, 'a part twice');
  assert.equal(orders([swapped.map(String)]).length, 1, 'places as words');
  assert.equal(orders([]).length, 1, 'an empty list');
  assert.equal(orders([swapped, [...swapped].reverse(), [...own].reverse(), [own[0], own[2], own[1], ...own.slice(3)]]).length, 1, 'four orders');
  const enBroken = structuredClone(JSON.parse(read('en').toString('utf8')));
  enBroken.sentences[firstSentence].tokens.push('extra');
  assert.ok(checkLanguage(base, 'en', enBroken).some((line) => line.includes('tokens make')));
  const ja = JSON.parse(read('ja').toString('utf8'));
  delete ja.words[firstWord].roman;
  assert.ok(checkLanguage(base, 'ja', ja).some((line) => line.includes('roman is missing')));
});

test('every course builds from each own language it can be learned from, and its lessons and test build', () => {
  for (const code of COURSES) {
    for (const own of OWN_LANGUAGES) {
      const view = courseView(code, own);
      if (code === own) {
        assert.equal(view, null, `${code} from ${own}`);
        continue;
      }
      assert.notEqual(view, null, `${code} from ${own}`);
      assert.equal(view.lessons.length, 48);
      for (const lesson of view.lessons) {
        const found = lessonOf(view, lesson.id);
        const exercises = buildExercises(found.lesson, found.pool, { seed: 5, listen: true, typing: !view.language.roman });
        assert.equal(exercises.length, lessonTotal(found.lesson), `${code} ${lesson.id}`);
        for (const exercise of exercises) {
          if (exercise.choices === undefined) continue;
          assert.equal(new Set(exercise.choices.map((choice) => choice.text)).size, 4, `${code} ${own} ${exercise.id}`);
        }
        for (const word of lesson.words) {
          assert.ok(word.text.length > 0 && word.meaning.length > 0 && word.ex.length > 0 && word.exMeaning.length > 0, `${code} ${word.id}`);
        }
      }
      const test = makeTest(view, 99);
      assert.equal(withoutAnswers(test)[0].questions.some((question) => 'answer' in question), false);
      const allRight = test.flatMap((part) => part.questions.map((question) => question.answer));
      assert.equal(scoreTest(test, allRight).start, 'beyond', `${code} from ${own}`);
      for (const part of test) for (const question of part.questions) assert.equal(new Set(question.choices.map((choice) => choice.text)).size, 4, `${code} test`);
    }
  }
});

test('a lesson the course does not have is not found', () => {
  const view = courseView('de', 'tr');
  assert.equal(lessonOf(view, 'u13-1'), null);
  assert.equal(lessonOf(view, 'u01-5'), null);
  assert.notEqual(lessonOf(view, 'u12-4'), null);
  assert.equal(lessonOf(view, 'u12-4').next, null);
  assert.equal(lessonOf(view, 'u01-4').next.id, 'u02-1');
});

test('every word key the screens build from a name exists in both languages', () => {
  const keys = [
    ...COURSES.flatMap((code) => [`learn.lang.${code}`, `learn.ownName.${code}`]),
    ...['choose-meaning', 'listen-choose', 'choose-word', 'type-word', 'fill-gap', 'build-sentence'].map((kind) => `learn.ex.${kind}`),
    ...Object.keys(SITUATIONS).map((id) => `learn.practice.situation.${id}`),
    ...LANGUAGES.filter((language) => language.voices.length > 1).flatMap((language) => language.voices.map((voice) => `learn.accent.${voice}`)),
    'learn.settings.speed.slow',
    'learn.settings.speed.normal',
  ];
  for (const key of keys) {
    for (const locale of ['en', 'tr']) assert.ok(typeof MESSAGES[locale][key] === 'string' && MESSAGES[locale][key].length > 0, `${locale} ${key}`);
  }
});

test('the content uses none of the words a public copy refuses, and only the invented names', () => {
  const refused = /\bfounder\b|\bledger\s+(?:decision|amendment|\d)|\bdecision\s+\d{1,3}\b|\bplan task\b|freelingo/iu;
  for (const name of ['base', ...COURSES]) {
    const text = read(name).toString('utf8');
    assert.equal(refused.test(text), false, name);
    assert.equal(/[<>]/u.test(text), false, `${name} holds markup marks`);
  }
});
