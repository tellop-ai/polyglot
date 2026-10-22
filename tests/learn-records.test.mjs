/**
 * What the course saves, checked against a throwaway store.
 *
 * `APP_DATA_FILE` points at a temporary folder, as in `tests/data.test.mjs`,
 * so these checks never touch the store a person is using. Every save names
 * its owner and its language; these checks also ask another owner and
 * another language and expect to see nothing of the first.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'polyglot-checks-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const { DataError, closeStorage, modelAction } = await import('../lib/data/index.js');
const learn = await import('../lib/data/learn.js');
const { MAX_OWN_CARDS, REFUSED } = await import('../lib/learn/bounds.js');

after(async () => {
  await closeStorage();
  process.chdir(startedIn);
  rmSync(scratch, { recursive: true, force: true });
});

const ME = 'checks-me';
const OTHER = 'checks-other';
const TODAY = '2026-10-21';
let clock = 0;
/** A moment that moves on with every save, so each save's time is its own. */
const now = () => new Date(Date.UTC(2026, 9, 21, 9, 0, 0, clock++));
const WORDS = ['hello', 'good-morning', 'good-evening', 'how-are-you', 'i-am-fine', 'and-you'];
let runs = 0;
/** A new lesson run's code, as a lesson page makes one. */
const run = () => (runs++).toString(16).padStart(32, '0');

/** @param {Promise<unknown>} work @param {string} key */
async function refusesWith(work, key) {
  await assert.rejects(work, (error) => error instanceof DataError && error.messageKey === key);
}

test('nothing is there before the learner starts, and a read creates nothing', async () => {
  assert.equal(await learn.readLearnerFor(ME), null);
  assert.equal(await learn.readCourseFor(ME, 'de'), null);
  assert.deepEqual(await learn.readCoursesFor(ME), []);
  assert.equal(await learn.readLearnerFor(ME), null);
  assert.equal(await modelAction('Learner', 'count', {}), 0);
});

test('settings and starts are refused before the learner starts', async () => {
  await refusesWith(learn.saveSettingsFor(ME, { lessonsPerDay: 2 }, { now }), REFUSED.notStarted);
  await refusesWith(learn.saveStartFor(ME, 'de', { startLevel: 'a1' }, { now }), REFUSED.notStarted);
});

test('choosing languages starts the learner and the course, and a second language keeps the first', async () => {
  const learner = await learn.chooseCourseFor(ME, { ownLanguage: 'tr', course: 'de' }, { now });
  assert.equal(learner.ownLanguage, 'tr');
  assert.equal(learner.course, 'de');
  assert.deepEqual(learner.studyDays, [1, 2, 3, 4, 5]);
  assert.equal(learner.lessonsPerDay, 1);
  assert.equal(learner.cardsPerDay, 20);
  assert.equal(learner.readAloud, true);
  assert.equal((await learn.readCourseFor(ME, 'de')).startLevel, '');
  await learn.saveStartFor(ME, 'de', { startLevel: 'a2', testRight: 13, testTotal: 16 }, { now });
  await learn.chooseCourseFor(ME, { ownLanguage: 'tr', course: 'ja' }, { now });
  await learn.chooseCourseFor(ME, { ownLanguage: 'tr', course: 'de' }, { now });
  const de = await learn.readCourseFor(ME, 'de');
  assert.equal(de.startLevel, 'a2');
  assert.equal(de.testRight, 13);
  assert.deepEqual((await learn.readCoursesFor(ME)).map((row) => row.course).sort(), ['de', 'ja']);
  assert.equal(await learn.readLearnerFor(OTHER), null);
});

test('settings save only the fields sent', async () => {
  const saved = await learn.saveSettingsFor(ME, { studyDays: '1,3,5', lessonsPerDay: 2 }, { now });
  assert.deepEqual(saved.studyDays, [1, 3, 5]);
  assert.equal(saved.lessonsPerDay, 2);
  assert.equal(saved.cardsPerDay, 20);
  await learn.saveVoiceFor(ME, 'de', 'de-DE', { now });
  assert.equal((await learn.readCourseFor(ME, 'de')).voice, 'de-DE');
  await refusesWith(learn.saveVoiceFor(ME, 'fr', 'fr-FR', { now }), REFUSED.notStarted);
});

test('a finished lesson saves its result once, its best score only rises, and its cards are made once', async () => {
  const done = (right) => learn.saveLessonFor(ME, 'de', { lesson: 'u01-1', attempt: run(), wordIds: WORDS, right, total: 16, today: TODAY }, { now });
  const first = await done(10);
  assert.deepEqual([first.bestRight, first.lastRight, first.times], [10, 10, 1]);
  const worse = await done(8);
  assert.deepEqual([worse.bestRight, worse.lastRight, worse.times], [10, 8, 2]);
  const better = await done(14);
  assert.deepEqual([better.bestRight, better.lastRight, better.times], [14, 14, 3]);
  const cards = await learn.readCardsFor(ME, 'de');
  assert.equal(cards.length, 6);
  assert.ok(cards.every((card) => card.step === 1 && card.dueDay === '2026-10-22'));
  const day = (await learn.readStudyDaysFor(ME, 'de', TODAY, TODAY)).get(TODAY);
  assert.equal(day.lessons, 3);
  assert.equal((await learn.readResultsFor(ME, 'ja')).length, 0);
  assert.equal((await learn.readResultsFor(OTHER, 'de')).length, 0);
});

test('a lesson done before a start was chosen starts the course at A1', async () => {
  assert.equal((await learn.readCourseFor(ME, 'ja')).startLevel, '');
  await learn.saveLessonFor(ME, 'ja', { lesson: 'u01-1', attempt: run(), wordIds: WORDS, right: 3, total: 16, today: TODAY }, { now });
  assert.equal((await learn.readCourseFor(ME, 'ja')).startLevel, 'a1');
  await learn.saveLessonFor(OTHER, 'es', { lesson: 'u01-1', attempt: run(), wordIds: WORDS, right: 3, total: 16, today: TODAY }, { now });
  assert.equal((await learn.readCourseFor(OTHER, 'es')).startLevel, 'a1');
});

test('a lesson run saved twice counts once and answers the result saved first; a new run counts again', async () => {
  const lessonsToday = async () => (await learn.readStudyDaysFor(ME, 'ja', TODAY, TODAY)).get(TODAY)?.lessons ?? 0;
  const runsOf = (lesson) => modelAction('LessonAttempt', 'count', { where: { ownerId: ME, course: 'ja', lesson } });
  const before = await lessonsToday();
  const once = { lesson: 'u02-1', attempt: run(), wordIds: WORDS, right: 9, total: 16, today: TODAY };
  const first = await learn.saveLessonFor(ME, 'ja', once, { now });
  assert.equal(first.times, 1);
  const again = await learn.saveLessonFor(ME, 'ja', once, { now });
  assert.deepEqual([again.times, again.lastRight, again.lastDoneAt], [1, 9, first.lastDoneAt]);
  // Two presses of one run at once count once too.
  const twice = { ...once, attempt: run(), right: 11 };
  const both = await Promise.all([learn.saveLessonFor(ME, 'ja', twice, { now }), learn.saveLessonFor(ME, 'ja', twice, { now })]);
  assert.deepEqual(both.map((saved) => saved.times), [2, 2]);
  assert.equal(await lessonsToday(), before + 2);
  const next = await learn.saveLessonFor(ME, 'ja', { ...once, attempt: run(), right: 7 }, { now });
  assert.deepEqual([next.times, next.lastRight, next.bestRight], [3, 7, 11]);
  assert.equal(await lessonsToday(), before + 3);
  // At most the last run of a lesson stays.
  assert.equal(await runsOf('u02-1'), 1);
});

test('a lesson run code must have its shape and belong to its own lesson', async () => {
  const used = run();
  await learn.saveLessonFor(ME, 'ja', { lesson: 'u02-2', attempt: used, wordIds: WORDS, right: 5, total: 16, today: TODAY }, { now });
  await refusesWith(learn.saveLessonFor(ME, 'ja', { lesson: 'u02-3', attempt: used, wordIds: WORDS, right: 5, total: 16, today: TODAY }, { now }), REFUSED.request);
  assert.equal((await learn.readResultsFor(ME, 'ja')).some((result) => result.lesson === 'u02-3'), false);
  for (const attempt of ['', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32), 7, undefined]) {
    await refusesWith(learn.saveLessonFor(ME, 'ja', { lesson: 'u02-4', attempt, wordIds: WORDS, right: 5, total: 16, today: TODAY }, { now }), REFUSED.request);
  }
  assert.equal((await learn.readResultsFor(ME, 'ja')).some((result) => result.lesson === 'u02-4'), false);
  // The same code in another language is another run.
  const elsewhere = await learn.saveLessonFor(ME, 'de', { lesson: 'u02-2', attempt: used, wordIds: WORDS, right: 5, total: 16, today: TODAY }, { now });
  assert.equal(elsewhere.times, 1);
});

test('a review answer moves a due card, counts today, and is refused for a card not due', async () => {
  await refusesWith(learn.answerCardFor(ME, 'de', { card: 'w:hello', knew: true, today: TODAY }), REFUSED.card);
  const tomorrow = '2026-10-22';
  const knew = await learn.answerCardFor(ME, 'de', { card: 'w:hello', knew: true, today: tomorrow }, { now });
  assert.deepEqual(knew, { card: 'w:hello', step: 2, dueDay: '2026-10-24' });
  const missed = await learn.answerCardFor(ME, 'de', { card: 'w:good-morning', knew: false, today: tomorrow }, { now });
  assert.deepEqual(missed, { card: 'w:good-morning', step: 1, dueDay: '2026-10-23' });
  const day = (await learn.readStudyDaysFor(ME, 'de', tomorrow, tomorrow)).get(tomorrow);
  assert.deepEqual(day, { lessons: 0, cards: 2, known: 1 });
  await refusesWith(learn.answerCardFor(ME, 'de', { card: 'w:hello', knew: true, today: tomorrow }), REFUSED.card);
  await refusesWith(learn.answerCardFor(OTHER, 'de', { card: 'w:how-are-you', knew: true, today: tomorrow }), REFUSED.card);
  const counts = await learn.countCardsFor(ME, 'de', tomorrow);
  assert.deepEqual(counts, { total: 6, known: 0, due: 4, learning: 6 });
  assert.equal((await learn.readDueCardsFor(ME, 'de', tomorrow, 2)).length, 2);
});

test('redoing a lesson leaves a moved card where it is', async () => {
  await learn.saveLessonFor(ME, 'de', { lesson: 'u01-1', attempt: run(), wordIds: WORDS, right: 16, total: 16, today: '2026-10-22' }, { now });
  const hello = (await learn.readCardsFor(ME, 'de')).find((card) => card.card === 'w:hello');
  assert.deepEqual([hello.step, hello.dueDay], [2, '2026-10-24']);
});

test("a person's own words: added due today, removed by their owner only, at most 2,000", async () => {
  const added = await learn.addOwnCardFor(ME, 'de', { front: 'der Hund', back: 'köpek', note: '', today: TODAY }, { now });
  assert.match(added.card, /^own:/u);
  assert.equal(added.dueDay, TODAY);
  assert.deepEqual(await learn.removeCardFor(OTHER, 'de', added.card), { removed: false });
  assert.deepEqual(await learn.removeCardFor(ME, 'ja', added.card), { removed: false });
  assert.deepEqual(await learn.removeCardFor(ME, 'de', added.card), { removed: true });
  assert.deepEqual(await learn.removeCardFor(ME, 'de', added.card), { removed: false });

  const many = Array.from({ length: MAX_OWN_CARDS - 1 }, (_, at) => ({
    ownerId: ME, course: 'fr', card: `own:00000000-0000-4000-8000-${String(at).padStart(12, '0')}`, front: 'mot', back: 'kelime', dueDay: TODAY, addedAt: TODAY, updatedAt: TODAY,
  }));
  await modelAction('WordCard', 'createMany', { data: many });
  const last = await learn.addOwnCardFor(ME, 'fr', { front: 'le dernier', back: 'son', note: '', today: TODAY }, { now });
  assert.match(last.card, /^own:/u);
  await refusesWith(learn.addOwnCardFor(ME, 'fr', { front: 'un de trop', back: 'fazla', note: '', today: TODAY }, { now }), REFUSED.tooManyCards);
  const elsewhere = await learn.addOwnCardFor(ME, 'it', { front: 'il cane', back: 'köpek', note: '', today: TODAY }, { now });
  assert.match(elsewhere.card, /^own:/u);
});

test('starting a language over removes only that language of that learner, and a new start works at once', async () => {
  const before = (await learn.readCardsFor(ME, 'ja')).length;
  assert.ok(before > 0);
  const result = await learn.startOverFor(ME, 'de', { now });
  assert.deepEqual(result, { removed: true });
  const course = await learn.readCourseFor(ME, 'de');
  assert.equal(course.startLevel, '');
  assert.equal(course.testTotal, 0);
  assert.equal(course.voice, 'de-DE');
  assert.equal((await learn.readCardsFor(ME, 'de')).length, 0);
  assert.equal((await learn.readResultsFor(ME, 'de')).length, 0);
  assert.equal((await learn.readStudyDaysFor(ME, 'de', '2026-10-01', '2026-10-31')).size, 0);
  assert.equal(await modelAction('LessonAttempt', 'count', { where: { ownerId: ME, course: 'de' } }), 0);
  assert.ok((await modelAction('LessonAttempt', 'count', { where: { ownerId: ME, course: 'ja' } })) > 0);
  assert.equal((await learn.readCardsFor(ME, 'ja')).length, before);
  assert.notEqual(await learn.readLearnerFor(ME), null);
  assert.equal((await learn.readCardsFor(OTHER, 'es')).length, 6);
  assert.deepEqual(await learn.saveStartFor(ME, 'de', { startLevel: 'a1' }, { now }), { startLevel: 'a1' });
  await learn.saveVoiceFor(ME, 'de', 'de-DE', { now });
  assert.deepEqual(await learn.startOverFor(ME, 'de', { now }), { removed: false });
  // A language this learner never started is refused, and its own words stay.
  const fr = (await learn.readCardsFor(ME, 'fr')).length;
  await refusesWith(learn.startOverFor(ME, 'fr', { now }), REFUSED.notStarted);
  assert.equal((await learn.readCardsFor(ME, 'fr')).length, fr);
});

test('two answers to one card at once move it once', async () => {
  const day = '2026-10-30';
  const due = (await learn.readDueCardsFor(ME, 'ja', day, 1))[0];
  const answers = await Promise.allSettled([
    learn.answerCardFor(ME, 'ja', { card: due.card, knew: true, today: day }, { now }),
    learn.answerCardFor(ME, 'ja', { card: due.card, knew: true, today: day }, { now }),
  ]);
  const moved = answers.filter((answer) => answer.status === 'fulfilled');
  assert.equal(moved.length, 1);
  const refusedOne = answers.find((answer) => answer.status === 'rejected');
  assert.ok(['error.saveUnconfirmed', REFUSED.card].includes(refusedOne.reason.messageKey));
  const card = (await learn.readCardsFor(ME, 'ja')).find((row) => row.card === due.card);
  assert.equal(card.step, 2);
});

test('a read or a save with no owner is refused in words a person can read', async () => {
  await refusesWith(learn.readLearnerFor(''), 'error.ownerMissing');
  await refusesWith(learn.readCardsFor('  ', 'de'), 'error.ownerMissing');
  await refusesWith(learn.readCardsFor(ME, 'German'), REFUSED.course);
});
