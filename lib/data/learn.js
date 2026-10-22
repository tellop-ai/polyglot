/**
 * The course's saved information: the learner, each language they learn, the
 * results of their lessons, their study days and their word cards.
 *
 * Every read, save and delete names its owner, and every row of a course also
 * names the language learned. All of it goes through `modelAction` and
 * `modelBatch` from `./index.js`, never the generated client. A read never
 * creates a row: no learner row means "not started yet", and no course row
 * means "this language not started yet".
 *
 * Values are copied into plain objects before they leave this file, because the
 * records route used inside Tellop answers objects with no prototype.
 */

import { randomUUID } from 'node:crypto';

import { addDays } from '../learn/days.js';
import { afterAnswer, FIRST_STEP, KNOWN_STEP } from '../learn/ladder.js';
import { isAttemptKey, MAX_OWN_CARDS, REFUSED, readStudyDays, SETTING_DEFAULTS, wordCardKey } from '../learn/bounds.js';
import { isReadWith, VOICE_LIMITS } from '../learn/voice.js';

import { DataError, modelAction, modelBatch } from './index.js';

/** The most rows one list read takes. */
export const READ_LIMITS = Object.freeze({ courses: 10, results: 60, cards: 2400, due: 50 });

/**
 * @param {unknown} value
 * @returns {string}
 */
function requireOwner(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new DataError('error.ownerMissing');
  return value.trim();
}

/** @param {unknown} value */
function requireCourse(value) {
  if (typeof value !== 'string' || !/^[a-z]{2}$/u.test(value)) throw new DataError(REFUSED.course);
  return value;
}

/**
 * Runs one records call and turns an unexpected failure into words a person can
 * read. A `DataError` passes through as it is.
 *
 * @template T
 * @param {() => Promise<T>} work
 * @param {string} failureKey
 * @returns {Promise<T>}
 */
async function guarded(work, failureKey) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DataError) throw error;
    throw new DataError(failureKey);
  }
}

/** @param {unknown} row */
function isRow(row) {
  return row !== null && row !== undefined && typeof row === 'object';
}

/**
 * @param {any} row
 * @param {readonly string[]} texts
 * @param {readonly string[]} numbers
 * @param {readonly string[]} [flags]
 */
function plain(row, texts, numbers, flags = []) {
  if (!isRow(row)) throw new DataError('error.storageUnreadable');
  const view = {};
  for (const name of texts) {
    if (typeof row[name] !== 'string') throw new DataError('error.storageUnreadable');
    view[name] = row[name];
  }
  for (const name of numbers) {
    if (!Number.isInteger(row[name])) throw new DataError('error.storageUnreadable');
    view[name] = row[name];
  }
  for (const name of flags) {
    if (typeof row[name] !== 'boolean') throw new DataError('error.storageUnreadable');
    view[name] = row[name];
  }
  return view;
}

const LEARNER_TEXTS = Object.freeze(['ownLanguage', 'course', 'studyDays', 'voiceSpeed', 'createdAt', 'updatedAt']);
const LEARNER_NUMBERS = Object.freeze(['lessonsPerDay', 'cardsPerDay']);
const LEARNER_SELECT = Object.freeze(
  Object.fromEntries([...LEARNER_TEXTS, ...LEARNER_NUMBERS, 'readAloud', 'readWith', 'speaking'].map((name) => [name, true])),
);

/** @param {any} row */
function learnerView(row) {
  const view = /** @type {any} */ (plain(row, LEARNER_TEXTS, LEARNER_NUMBERS, ['readAloud']));
  return { ...view, studyDays: readStudyDays(view.studyDays), readWith: readWithOf(row.readWith), speaking: speakingOf(row.speaking) };
}

/** Who reads aloud; a learner saved before the choice existed has the AI voice. @param {unknown} value */
function readWithOf(value) {
  if (value === null || value === undefined) return SETTING_DEFAULTS.readWith;
  if (isReadWith(value)) return /** @type {string} */ (value);
  throw new DataError('error.storageUnreadable');
}

/** Whether lessons ask to say a sentence; a learner saved before the switch existed has it on. @param {unknown} value */
function speakingOf(value) {
  if (value === null || value === undefined) return SETTING_DEFAULTS.speaking;
  if (typeof value === 'boolean') return value;
  throw new DataError('error.storageUnreadable');
}

const COURSE_TEXTS = Object.freeze(['course', 'startLevel', 'testedAt', 'voice', 'startedAt', 'updatedAt']);
const COURSE_NUMBERS = Object.freeze(['testRight', 'testTotal']);
const COURSE_SELECT = Object.freeze(Object.fromEntries([...COURSE_TEXTS, ...COURSE_NUMBERS].map((name) => [name, true])));

/** @param {any} row */
function courseRowView(row) {
  return plain(row, COURSE_TEXTS, COURSE_NUMBERS);
}

const RESULT_TEXTS = Object.freeze(['lesson', 'firstDoneAt', 'lastDoneAt']);
const RESULT_NUMBERS = Object.freeze(['bestRight', 'lastRight', 'total', 'times']);
const RESULT_SELECT = Object.freeze(Object.fromEntries([...RESULT_TEXTS, ...RESULT_NUMBERS].map((name) => [name, true])));

const CARD_TEXTS = Object.freeze(['card', 'front', 'back', 'note', 'dueDay', 'lastSeenAt', 'addedAt', 'updatedAt']);
const CARD_NUMBERS = Object.freeze(['step', 'seen', 'knewTimes']);
const CARD_SELECT = Object.freeze(Object.fromEntries([...CARD_TEXTS, ...CARD_NUMBERS].map((name) => [name, true])));

/** @param {any} row */
function cardView(row) {
  return plain(row, CARD_TEXTS, CARD_NUMBERS);
}

/** @param {unknown} rows @param {(row: any) => any} view */
function listOf(rows, view) {
  if (!Array.isArray(rows)) throw new DataError('error.storageUnreadable');
  return rows.map(view);
}

/* ---------- reads ---------- */

/**
 * The learner, or `null` before they started.
 *
 * @param {unknown} ownerId
 */
export async function readLearnerFor(ownerId) {
  const owner = requireOwner(ownerId);
  const row = await guarded(
    () => modelAction('Learner', 'findUnique', { where: { ownerId: owner }, select: LEARNER_SELECT }),
    'error.storageUnreadable',
  );
  return isRow(row) ? learnerView(row) : null;
}

/**
 * One language's course row, or `null` when that language is not started.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 */
export async function readCourseFor(ownerId, course) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const row = await guarded(
    () => modelAction('Course', 'findFirst', { where: { ownerId: owner, course: code }, select: COURSE_SELECT }),
    'error.storageUnreadable',
  );
  return isRow(row) ? courseRowView(row) : null;
}

/**
 * Every language the learner has started.
 *
 * @param {unknown} ownerId
 */
export async function readCoursesFor(ownerId) {
  const owner = requireOwner(ownerId);
  const rows = await guarded(
    () => modelAction('Course', 'findMany', { where: { ownerId: owner }, orderBy: { startedAt: 'asc' }, take: READ_LIMITS.courses, select: COURSE_SELECT }),
    'error.storageUnreadable',
  );
  return listOf(rows, courseRowView);
}

/**
 * Every lesson result of one language.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 */
export async function readResultsFor(ownerId, course) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const rows = await guarded(
    () => modelAction('LessonResult', 'findMany', { where: { ownerId: owner, course: code }, take: READ_LIMITS.results, select: RESULT_SELECT }),
    'error.storageUnreadable',
  );
  return listOf(rows, (row) => plain(row, RESULT_TEXTS, RESULT_NUMBERS));
}

/**
 * The study days of one language between two days, both included.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {string} first
 * @param {string} last
 * @returns {Promise<Map<string, { lessons: number, cards: number, known: number }>>}
 */
export async function readStudyDaysFor(ownerId, course, first, last) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const rows = await guarded(
    () => modelAction('StudyDay', 'findMany', {
      where: { ownerId: owner, course: code, day: { gte: first, lte: last } },
      orderBy: { day: 'asc' },
      take: 62,
      select: { day: true, lessons: true, cards: true, known: true },
    }),
    'error.storageUnreadable',
  );
  const days = new Map();
  for (const row of listOf(rows, (item) => plain(item, ['day'], ['lessons', 'cards', 'known']))) {
    days.set(row.day, { lessons: row.lessons, cards: row.cards, known: row.known });
  }
  return days;
}

/**
 * How many cards one language has: all of them, those known well and those
 * due by `today`.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {string} today
 */
export async function countCardsFor(ownerId, course, today) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const count = (where) =>
    guarded(() => modelAction('WordCard', 'count', { where: { ownerId: owner, course: code, ...where } }), 'error.storageUnreadable');
  const total = await count({});
  const known = await count({ step: { gte: KNOWN_STEP } });
  const due = await count({ dueDay: { lte: today } });
  for (const value of [total, known, due]) if (!Number.isInteger(value)) throw new DataError('error.storageUnreadable');
  return { total, known, due, learning: total - known };
}

/**
 * The cards due by `today`, the longest waiting first, at most `take`.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {string} today
 * @param {number} take
 */
export async function readDueCardsFor(ownerId, course, today, take) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const rows = await guarded(
    () => modelAction('WordCard', 'findMany', {
      where: { ownerId: owner, course: code, dueDay: { lte: today } },
      orderBy: [{ dueDay: 'asc' }, { step: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(take, READ_LIMITS.due)),
      select: CARD_SELECT,
    }),
    'error.storageUnreadable',
  );
  return listOf(rows, cardView);
}

/**
 * Every card of one language, the soonest due first.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 */
export async function readCardsFor(ownerId, course) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const rows = await guarded(
    () => modelAction('WordCard', 'findMany', {
      where: { ownerId: owner, course: code },
      orderBy: [{ dueDay: 'asc' }, { id: 'asc' }],
      take: READ_LIMITS.cards,
      select: CARD_SELECT,
    }),
    'error.storageUnreadable',
  );
  return listOf(rows, cardView);
}

/* ---------- saves ---------- */

/**
 * Starts the learner, or changes their own language and the language they
 * learn, in one step: the learner row and the course row (a course already
 * started keeps everything it had).
 *
 * @param {unknown} ownerId
 * @param {{ ownLanguage: string, course: string }} choice already checked
 * @param {{ now?: () => Date }} [options]
 */
export async function chooseCourseFor(ownerId, choice, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(choice.course);
  const at = (options.now?.() ?? new Date()).toISOString();
  const results = await guarded(
    () => modelBatch([
      {
        model: 'Learner',
        action: 'upsert',
        args: {
          where: { ownerId: owner },
          create: { ownerId: owner, ownLanguage: choice.ownLanguage, course: code, createdAt: at, updatedAt: at },
          update: { ownLanguage: choice.ownLanguage, course: code, updatedAt: at },
        },
      },
      {
        model: 'Course',
        action: 'upsert',
        args: {
          where: { ownerId_course: { ownerId: owner, course: code } },
          create: { ownerId: owner, course: code, startedAt: at, updatedAt: at },
          update: {},
        },
      },
      { model: 'Learner', action: 'findUnique', args: { where: { ownerId: owner }, select: LEARNER_SELECT } },
    ]),
    'error.saveFailed',
  );
  const learner = learnerView(results?.[2]);
  if (learner.ownLanguage !== choice.ownLanguage || learner.course !== code || learner.updatedAt !== at) throw new DataError('error.saveUnconfirmed');
  return learner;
}

/**
 * Saves where a language's course starts, and the level test's count when the
 * test chose it.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {{ startLevel: string, testRight?: number, testTotal?: number }} start already checked
 * @param {{ now?: () => Date }} [options]
 */
export async function saveStartFor(ownerId, course, start, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const at = (options.now?.() ?? new Date()).toISOString();
  const data = { startLevel: start.startLevel, updatedAt: at };
  if (start.testTotal !== undefined) Object.assign(data, { testRight: start.testRight, testTotal: start.testTotal, testedAt: at });
  const result = await guarded(() => modelAction('Course', 'updateMany', { where: { ownerId: owner, course: code }, data }), 'error.saveFailed');
  const count = Number(result?.count);
  if (count === 0) throw new DataError(REFUSED.notStarted);
  if (count !== 1) throw new DataError('error.saveUnconfirmed');
  return { startLevel: start.startLevel };
}

/**
 * Saves the learner's settings (only the fields given).
 *
 * @param {unknown} ownerId
 * @param {Record<string, unknown>} settings already checked
 * @param {{ now?: () => Date }} [options]
 */
export async function saveSettingsFor(ownerId, settings, options = {}) {
  const owner = requireOwner(ownerId);
  const at = (options.now?.() ?? new Date()).toISOString();
  const result = await guarded(
    () => modelBatch([
      { model: 'Learner', action: 'updateMany', args: { where: { ownerId: owner }, data: { ...settings, updatedAt: at } } },
      { model: 'Learner', action: 'findUnique', args: { where: { ownerId: owner }, select: LEARNER_SELECT } },
    ]),
    'error.saveFailed',
  );
  const count = Number(result?.[0]?.count);
  if (count === 0) throw new DataError(REFUSED.notStarted);
  if (count !== 1) throw new DataError('error.saveUnconfirmed');
  const learner = learnerView(result?.[1]);
  if (learner.updatedAt !== at) throw new DataError('error.saveUnconfirmed');
  return learner;
}

/**
 * Saves a course's accent.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {string} voice already checked
 * @param {{ now?: () => Date }} [options]
 */
export async function saveVoiceFor(ownerId, course, voice, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const at = (options.now?.() ?? new Date()).toISOString();
  const result = await guarded(
    () => modelAction('Course', 'updateMany', { where: { ownerId: owner, course: code }, data: { voice, updatedAt: at } }),
    'error.saveFailed',
  );
  const count = Number(result?.count);
  if (count === 0) throw new DataError(REFUSED.notStarted);
  if (count !== 1) throw new DataError('error.saveUnconfirmed');
  return { voice };
}

/**
 * Saves a finished lesson in one step: its result (the best score only ever
 * rises), today's study day, and a card for each of its words. A word that
 * already has a card keeps it as it is, so doing a lesson again never resets
 * a card. A course with no start yet starts at A1.
 *
 * Each run of a lesson is saved once. The step first adds the run's code
 * (`attempt`, made by the lesson page) as a row that can exist only once, and
 * drops the lesson's earlier run, so at most one row a lesson stays. When the
 * same run is sent again (its reply was lost, then "Save again", or two
 * presses at once), that row refuses the whole step, nothing is counted a
 * second time, and the answer is the result saved the first time.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {{ lesson: string, attempt: string, wordIds: readonly string[], right: number, total: number, today: string }} done already checked
 * @param {{ now?: () => Date }} [options]
 */
export async function saveLessonFor(ownerId, course, done, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  if (done.wordIds.length < 1 || done.wordIds.length > 10) throw new DataError(REFUSED.lesson);
  if (!isAttemptKey(done.attempt)) throw new DataError(REFUSED.request);
  const at = (options.now?.() ?? new Date()).toISOString();
  const due = addDays(done.today, 1);
  const key = { ownerId: owner, course: code, lesson: done.lesson };
  const steps = [
    { model: 'LessonAttempt', action: 'create', args: { data: { ...key, attempt: done.attempt, savedAt: at } } },
    { model: 'LessonAttempt', action: 'deleteMany', args: { where: { ...key, attempt: { not: done.attempt } } } },
    // A lesson done before a start was chosen starts the course at A1.
    {
      model: 'Course',
      action: 'upsert',
      args: {
        where: { ownerId_course: { ownerId: owner, course: code } },
        create: { ownerId: owner, course: code, startLevel: 'a1', startedAt: at, updatedAt: at },
        update: {},
      },
    },
    { model: 'Course', action: 'updateMany', args: { where: { ownerId: owner, course: code, startLevel: '' }, data: { startLevel: 'a1', updatedAt: at } } },
    {
      model: 'LessonResult',
      action: 'upsert',
      args: {
        where: { ownerId_course_lesson: key },
        create: { ...key, bestRight: done.right, lastRight: done.right, total: done.total, times: 1, firstDoneAt: at, lastDoneAt: at },
        update: { lastRight: done.right, total: done.total, times: { increment: 1 }, lastDoneAt: at },
      },
    },
    { model: 'LessonResult', action: 'updateMany', args: { where: { ...key, bestRight: { lt: done.right } }, data: { bestRight: done.right } } },
    {
      model: 'StudyDay',
      action: 'upsert',
      args: {
        where: { ownerId_course_day: { ownerId: owner, course: code, day: done.today } },
        create: { ownerId: owner, course: code, day: done.today, lessons: 1 },
        update: { lessons: { increment: 1 } },
      },
    },
    ...done.wordIds.map((wordId) => ({
      model: 'WordCard',
      action: 'upsert',
      args: {
        where: { ownerId_course_card: { ownerId: owner, course: code, card: wordCardKey(wordId) } },
        create: { ownerId: owner, course: code, card: wordCardKey(wordId), step: FIRST_STEP, dueDay: due, addedAt: at, updatedAt: at },
        update: {},
      },
    })),
    { model: 'LessonResult', action: 'findUnique', args: { where: { ownerId_course_lesson: key }, select: RESULT_SELECT } },
  ];
  let results;
  try {
    results = await modelBatch(steps);
  } catch (error) {
    return savedBefore(owner, code, done, error);
  }
  const saved = plain(results?.[steps.length - 1], RESULT_TEXTS, RESULT_NUMBERS);
  if (saved.lesson !== done.lesson || saved.lastDoneAt !== at || saved.lastRight !== done.right || saved.bestRight < done.right) {
    throw new DataError('error.saveUnconfirmed');
  }
  return saved;
}

/**
 * After a lesson's step was refused: the result saved by this same run
 * before, or the refusal itself when this run was never saved. A run's code
 * sent for another lesson is refused.
 *
 * @param {string} owner
 * @param {string} code
 * @param {{ lesson: string, attempt: string }} done
 * @param {unknown} error what refused the step
 */
async function savedBefore(owner, code, done, error) {
  const earlier = await guarded(
    () => modelAction('LessonAttempt', 'findFirst', { where: { ownerId: owner, course: code, attempt: done.attempt }, select: { lesson: true } }),
    'error.storageUnreadable',
  );
  if (!isRow(earlier)) throw error instanceof DataError ? error : new DataError('error.saveFailed');
  if (earlier.lesson !== done.lesson) throw new DataError(REFUSED.request);
  const row = await guarded(
    () => modelAction('LessonResult', 'findUnique', { where: { ownerId_course_lesson: { ownerId: owner, course: code, lesson: done.lesson } }, select: RESULT_SELECT }),
    'error.storageUnreadable',
  );
  if (!isRow(row)) throw new DataError('error.saveUnconfirmed');
  return plain(row, RESULT_TEXTS, RESULT_NUMBERS);
}

/**
 * Saves one review answer: the card moves on the ladder and today's study day
 * counts it. The card is changed only if it still stands where it was read, so
 * two answers at once cannot both move it.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {{ card: string, knew: boolean, today: string }} answer already checked
 * @param {{ now?: () => Date }} [options]
 */
export async function answerCardFor(ownerId, course, answer, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const read = await guarded(
    () => modelAction('WordCard', 'findFirst', { where: { ownerId: owner, course: code, card: answer.card }, select: CARD_SELECT }),
    'error.storageUnreadable',
  );
  if (!isRow(read)) throw new DataError(REFUSED.card);
  const card = cardView(read);
  if (card.dueDay > answer.today) throw new DataError(REFUSED.card);
  const next = afterAnswer(card.step, answer.knew, answer.today);
  const at = (options.now?.() ?? new Date()).toISOString();
  const data = { step: next.step, dueDay: next.dueDay, seen: { increment: 1 }, lastSeenAt: at, updatedAt: at };
  if (answer.knew) Object.assign(data, { knewTimes: { increment: 1 } });
  // The card moves only from the step and day just read, so two answers to
  // one card at once move it once; today counts the answer only after that.
  const moved = await guarded(
    () => modelAction('WordCard', 'updateMany', {
      where: { ownerId: owner, course: code, card: answer.card, step: card.step, dueDay: card.dueDay },
      data,
    }),
    'error.saveFailed',
  );
  if (Number(moved?.count) !== 1) throw new DataError('error.saveUnconfirmed');
  await guarded(
    () => modelAction('StudyDay', 'upsert', {
      where: { ownerId_course_day: { ownerId: owner, course: code, day: answer.today } },
      create: { ownerId: owner, course: code, day: answer.today, cards: 1, known: answer.knew ? 1 : 0 },
      update: answer.knew ? { cards: { increment: 1 }, known: { increment: 1 } } : { cards: { increment: 1 } },
    }),
    'error.saveFailed',
  );
  return { card: answer.card, step: next.step, dueDay: next.dueDay };
}

/**
 * Adds a person's own word to a language's cards, due today.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {{ front: string, back: string, note: string, today: string }} word already checked
 * @param {{ now?: () => Date, id?: () => string }} [options]
 */
export async function addOwnCardFor(ownerId, course, word, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const own = await guarded(
    () => modelAction('WordCard', 'count', { where: { ownerId: owner, course: code, card: { startsWith: 'own:' } } }),
    'error.storageUnreadable',
  );
  if (!Number.isInteger(own)) throw new DataError('error.storageUnreadable');
  if (own >= MAX_OWN_CARDS) throw new DataError(REFUSED.tooManyCards);
  const at = (options.now?.() ?? new Date()).toISOString();
  const card = `own:${(options.id ?? randomUUID)()}`;
  const row = await guarded(
    () => modelAction('WordCard', 'create', {
      data: { ownerId: owner, course: code, card, front: word.front, back: word.back, note: word.note, step: FIRST_STEP, dueDay: word.today, addedAt: at, updatedAt: at },
      select: CARD_SELECT,
    }),
    'error.saveFailed',
  );
  const saved = cardView(row);
  if (saved.card !== card || saved.front !== word.front || saved.back !== word.back || saved.note !== word.note) throw new DataError('error.saveUnconfirmed');
  return saved;
}

/**
 * Removes one card. A card that is not there is "already gone", not an error.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {string} card already checked
 */
export async function removeCardFor(ownerId, course, card) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const result = await guarded(() => modelAction('WordCard', 'deleteMany', { where: { ownerId: owner, course: code, card } }), 'error.saveFailed');
  const count = Number(result?.count);
  if (count === 1) return { removed: true };
  if (count === 0) return { removed: false };
  throw new DataError('error.saveUnconfirmed');
}

/**
 * Starts one language over: its lesson results and runs, cards and study days go, and
 * its course waits for a new start (the level test or the first lesson), in
 * one step. The course row itself stays, with its accent, so a start saved
 * right after finds it. The learner and every other language stay.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {{ now?: () => Date }} [options]
 */
export async function startOverFor(ownerId, course, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const at = (options.now?.() ?? new Date()).toISOString();
  const where = { ownerId: owner, course: code };
  if ((await readCourseFor(owner, code)) === null) throw new DataError(REFUSED.notStarted);
  const results = await guarded(
    () => modelBatch([
      { model: 'LessonResult', action: 'deleteMany', args: { where } },
      { model: 'LessonAttempt', action: 'deleteMany', args: { where } },
      { model: 'WordCard', action: 'deleteMany', args: { where } },
      { model: 'StudyDay', action: 'deleteMany', args: { where } },
      {
        model: 'Course',
        action: 'updateMany',
        args: { where, data: { startLevel: '', testRight: 0, testTotal: 0, testedAt: '', startedAt: at, updatedAt: at } },
      },
    ]),
    'error.saveFailed',
  );
  if (!Array.isArray(results) || results.length !== 5 || !results.every((result) => Number.isInteger(Number(result?.count)))) {
    throw new DataError('error.saveUnconfirmed');
  }
  const count = Number(results[4].count);
  if (count === 0) throw new DataError(REFUSED.notStarted);
  if (count !== 1) throw new DataError('error.saveUnconfirmed');
  return { removed: results.slice(0, 4).some((result) => Number(result.count) > 0) };
}

/* ---------- the AI voice's kept readings ---------- */

/** A text's SHA-256, as a reading is kept by. */
const TEXT_KEY = /^[0-9a-f]{64}$/u;
/** What a kept reading is of: the course's own words, or anything else read aloud (AI answers, own cards). */
const SOUND_KINDS = Object.freeze(['course', 'other']);
const SOUND_SELECT = Object.freeze({ textKey: true, kind: true, soundFile: true });

/** @param {unknown} voice @param {unknown} textKey */
function requireSoundKey(voice, textKey) {
  if (typeof voice !== 'string' || !/^[a-z]{1,16}$/u.test(voice) || typeof textKey !== 'string' || !TEXT_KEY.test(textKey)) {
    throw new DataError(REFUSED.request);
  }
}

/**
 * The AI voice's kept reading of one text, or `null` when it was never read.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {unknown} voice
 * @param {unknown} textKey the text's SHA-256
 */
export async function readSoundFor(ownerId, course, voice, textKey) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  requireSoundKey(voice, textKey);
  const key = { ownerId: owner, course: code, voice: /** @type {string} */ (voice), textKey: /** @type {string} */ (textKey) };
  const row = await guarded(
    () => modelAction('SpokenSound', 'findUnique', { where: { ownerId_course_voice_textKey: key }, select: SOUND_SELECT }),
    'error.storageUnreadable',
  );
  if (row === null || row === undefined) return null;
  return plain(row, ['textKey', 'kind', 'soundFile'], []);
}

/**
 * Whether one more reading of a text that is not the course's own may be
 * kept for this language: at most `VOICE_LIMITS.practiceSounds`, so what the
 * AI voice keeps stays bounded.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 */
export async function roomForSoundFor(ownerId, course) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  const count = await guarded(
    () => modelAction('SpokenSound', 'count', { where: { ownerId: owner, course: code, kind: 'other' } }),
    'error.storageUnreadable',
  );
  if (!Number.isInteger(count)) throw new DataError('error.storageUnreadable');
  return count < VOICE_LIMITS.practiceSounds;
}

/**
 * Keeps the AI voice's reading of one text. A reading of the same text kept
 * first (two presses at once) stays, and is the answer.
 *
 * @param {unknown} ownerId
 * @param {unknown} course
 * @param {{ voice: string, textKey: string, kind: string, soundFile: string }} sound
 * @param {{ now?: () => Date }} [options]
 */
export async function saveSoundFor(ownerId, course, sound, options = {}) {
  const owner = requireOwner(ownerId);
  const code = requireCourse(course);
  requireSoundKey(sound.voice, sound.textKey);
  if (!SOUND_KINDS.includes(sound.kind) || typeof sound.soundFile !== 'string' || !TEXT_KEY.test(sound.soundFile)) {
    throw new DataError(REFUSED.request);
  }
  const at = (options.now?.() ?? new Date()).toISOString();
  const data = { ownerId: owner, course: code, voice: sound.voice, textKey: sound.textKey, kind: sound.kind, soundFile: sound.soundFile, savedAt: at };
  try {
    await modelAction('SpokenSound', 'create', { data });
  } catch (error) {
    const earlier = await readSoundFor(owner, code, sound.voice, sound.textKey);
    if (earlier !== null) return earlier;
    throw error instanceof DataError ? error : new DataError('error.saveFailed');
  }
  return { textKey: sound.textKey, kind: sound.kind, soundFile: sound.soundFile };
}
