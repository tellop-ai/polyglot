/**
 * The course's own rules, checked as plain functions: days and weeks, the
 * review ladder, answer matching, the saved bounds, the weekly plan, the level
 * test's count, a lesson's exercises and the AI practice requests. Each check
 * of a bound tests the bound itself and one value on each side of it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { judge } from '../lib/learn/answers.js';
import {
  MAX_LESSON_TOTAL,
  OWN_CARD,
  REFUSED,
  choiceProblem,
  isCardKey,
  readOwnCard,
  readSettings,
  readStudyDays,
  scoreProblem,
  studyDaysProblem,
  voiceProblem,
} from '../lib/learn/bounds.js';
import { addDays, isRealDay, weekdayOf, weekOf } from '../lib/learn/days.js';
import { builtRight, buildExercises, gapLine, lessonTotal } from '../lib/learn/exercises.js';
import { WAITS, afterAnswer, isKnownWell } from '../lib/learn/ladder.js';
import { canLearn, COURSES, voiceFor } from '../lib/learn/languages.js';
import { NOT_KNOWN, PASS_MARK, QUESTIONS_PER_BAND, scoreTest } from '../lib/learn/placement.js';
import { lessonOrder, weekPlan } from '../lib/learn/plan.js';
import { clipped, PRACTICE_LIMITS, readAnswer, readPractice } from '../lib/learn/practice.js';
import { isSeed, MAX_SEED, randomFrom, shuffled } from '../lib/learn/random.js';

/* ---------- days ---------- */

test('a study day is a real day from 2000 to 2199', () => {
  assert.equal(isRealDay('1999-12-31'), false);
  assert.equal(isRealDay('2000-01-01'), true);
  assert.equal(isRealDay('2199-12-31'), true);
  assert.equal(isRealDay('2200-01-01'), false);
  assert.equal(isRealDay('2028-02-29'), true);
  assert.equal(isRealDay('2026-02-29'), false);
  assert.equal(isRealDay('2026-13-01'), false);
  assert.equal(isRealDay('2026-1-01'), false);
});

test('days move across months and years, and a week runs Monday to Sunday', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-21', 60), '2026-12-20');
  assert.equal(weekdayOf('2026-10-19'), 1);
  assert.equal(weekdayOf('2026-10-25'), 7);
  // A Sunday is the last day of its week; the Monday after starts the next one.
  assert.deepEqual(weekOf('2026-10-25'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(weekOf('2026-10-26')[0], '2026-10-26');
  assert.equal(weekOf('2026-10-19')[6], '2026-10-25');
});

/* ---------- the review ladder ---------- */

test('the ladder moves a card up on "I knew it" and back to step 1 on "I didn\'t know"', () => {
  assert.deepEqual(afterAnswer(1, false, '2026-10-21'), { step: 1, dueDay: '2026-10-22' });
  assert.deepEqual(afterAnswer(1, true, '2026-10-21'), { step: 2, dueDay: '2026-10-23' });
  assert.deepEqual(afterAnswer(6, true, '2026-10-21'), { step: 7, dueDay: addDays('2026-10-21', 60) });
  assert.deepEqual(afterAnswer(7, true, '2026-10-21'), { step: 7, dueDay: addDays('2026-10-21', 60) });
  assert.deepEqual(afterAnswer(7, false, '2026-10-21'), { step: 1, dueDay: '2026-10-22' });
  assert.equal(WAITS.length, 7);
  assert.equal(isKnownWell(4), false);
  assert.equal(isKnownWell(5), true);
  assert.equal(isKnownWell(6), true);
});

/* ---------- answers ---------- */

test('a typed answer ignores case, spaces, end marks and apostrophe shapes', () => {
  assert.equal(judge('  Das   HAUS. ', ['das Haus'], 'de'), 'right');
  assert.equal(judge('¿Cómo estás?', ['cómo estás'], 'es'), 'right');
  assert.equal(judge('l’eau', ["l'eau"], 'fr'), 'right');
  assert.equal(judge('', ['hello'], 'en'), 'wrong');
  assert.equal(judge('   ', ['hello'], 'en'), 'wrong');
  assert.equal(judge('helo', ['hello'], 'en'), 'wrong');
  assert.equal(judge('hi', ['hello', 'hi'], 'en'), 'right');
});

test('an answer right but for its accents counts, and says so', () => {
  assert.equal(judge('cafe', ['café'], 'fr'), 'accents');
  assert.equal(judge('kus', ['kuş'], 'tr'), 'accents');
  assert.equal(judge('kiz', ['kız'], 'tr'), 'accents');
  assert.equal(judge('strasse', ['Straße'], 'de'), 'accents');
  assert.equal(judge('İSTANBUL', ['istanbul'], 'tr'), 'right');
  // A Turkish keyboard's dotted capital in an English answer is still right.
  assert.equal(judge('İt', ['it'], 'en'), 'right');
});

test('a noun typed without its article counts and says so, and a wrong article does not', () => {
  assert.equal(judge('Name', ['der Name'], 'de'), 'article');
  assert.equal(judge('der Name', ['der Name'], 'de'), 'right');
  assert.equal(judge('die Name', ['der Name'], 'de'), 'wrong');
  assert.equal(judge('der', ['der Name'], 'de'), 'wrong');
  assert.equal(judge('Strasse', ['die Straße'], 'de'), 'article');
  assert.equal(judge('ami', ["l'ami"], 'fr'), 'article');
  assert.equal(judge('la ami', ["l'ami"], 'fr'), 'wrong');
  assert.equal(judge('casa', ['la casa'], 'es'), 'article');
  assert.equal(judge('el casa', ['la casa'], 'es'), 'wrong');
  assert.equal(judge('casa', ['casa'], 'es'), 'right');
  // English and Turkish have no article to leave out in this course.
  assert.equal(judge('house', ['the house'], 'en'), 'wrong');
});

test('German may be typed with ae, oe, ue and ss for its own letters', () => {
  assert.equal(judge('schoen', ['schön'], 'de'), 'accents');
  assert.equal(judge('Gruesse', ['Grüße'], 'de'), 'accents');
  assert.equal(judge('schoen', ['schön'], 'fr'), 'wrong');
  assert.equal(judge('schoenn', ['schön'], 'de'), 'wrong');
});

/* ---------- bounds ---------- */

test('study days: one to seven distinct weekdays', () => {
  assert.equal(studyDaysProblem([]), REFUSED.studyDays);
  assert.equal(studyDaysProblem([1]), null);
  assert.equal(studyDaysProblem([1, 2, 3, 4, 5, 6, 7]), null);
  assert.equal(studyDaysProblem([1, 1]), REFUSED.studyDays);
  assert.equal(studyDaysProblem([0]), REFUSED.studyDays);
  assert.equal(studyDaysProblem([8]), REFUSED.studyDays);
  assert.equal(studyDaysProblem([1.5]), REFUSED.studyDays);
  assert.equal(studyDaysProblem('1,2'), REFUSED.studyDays);
  assert.deepEqual(readStudyDays('5,1,3'), [1, 3, 5]);
  assert.deepEqual(readStudyDays('1,1'), [1, 2, 3, 4, 5]);
  assert.deepEqual(readStudyDays('nonsense'), [1, 2, 3, 4, 5]);
});

test('settings take only their listed choices', () => {
  assert.deepEqual(readSettings({ lessonsPerDay: 1 }), { ok: true, value: { lessonsPerDay: 1 } });
  assert.deepEqual(readSettings({ lessonsPerDay: 3 }), { ok: true, value: { lessonsPerDay: 3 } });
  assert.equal(readSettings({ lessonsPerDay: 0 }).ok, false);
  assert.equal(readSettings({ lessonsPerDay: 4 }).ok, false);
  assert.equal(readSettings({ cardsPerDay: 10 }).ok, true);
  assert.equal(readSettings({ cardsPerDay: 50 }).ok, true);
  assert.equal(readSettings({ cardsPerDay: 9 }).ok, false);
  assert.equal(readSettings({ cardsPerDay: 51 }).ok, false);
  assert.equal(readSettings({ readAloud: 'yes' }).ok, false);
  assert.equal(readSettings({ voiceSpeed: 'fast' }).ok, false);
  assert.deepEqual(readSettings({ studyDays: [3, 1] }), { ok: true, value: { studyDays: '1,3' } });
  assert.deepEqual(readSettings({}), { ok: true, value: {} });
});

test('a person learns any of the ten languages except their own', () => {
  assert.equal(COURSES.length, 10);
  assert.equal(canLearn('tr', 'en'), true);
  assert.equal(canLearn('en', 'tr'), true);
  assert.equal(canLearn('tr', 'tr'), false);
  assert.equal(canLearn('en', 'en'), false);
  assert.equal(canLearn('de', 'en'), false);
  assert.equal(canLearn('tr', 'xx'), false);
  assert.equal(choiceProblem('tr', 'ja'), null);
  assert.equal(choiceProblem('fr', 'ja'), REFUSED.language);
  assert.equal(choiceProblem('tr', 'tr'), REFUSED.course);
  assert.equal(voiceFor('en', 'en-GB'), 'en-GB');
  assert.equal(voiceFor('en', 'fr-FR'), 'en-US');
  assert.equal(voiceFor('de', ''), 'de-DE');
  assert.equal(voiceProblem('en', 'en-GB'), null);
  assert.equal(voiceProblem('de', 'en-GB'), REFUSED.setting);
});

test("a person's own word: its lengths and one line", () => {
  const word = (front, back, note = '') => readOwnCard({ front, back, note });
  assert.equal(word('', 'x').ok, false);
  assert.equal(word('a', 'x').ok, true);
  assert.equal(word('a'.repeat(OWN_CARD.front), 'x').ok, true);
  assert.equal(word('a'.repeat(OWN_CARD.front + 1), 'x').ok, false);
  assert.equal(word('a', 'b'.repeat(OWN_CARD.back)).ok, true);
  assert.equal(word('a', 'b'.repeat(OWN_CARD.back + 1)).ok, false);
  assert.equal(word('a', 'b', 'c'.repeat(OWN_CARD.note)).ok, true);
  assert.equal(word('a', 'b', 'c'.repeat(OWN_CARD.note + 1)).ok, false);
  assert.equal(word('two\nlines', 'b').ok, false);
  assert.equal(word('a', 'two\nlines').ok, false);
  assert.equal(word('a', 'b', 'a note\non two lines').ok, true);
  assert.deepEqual(word('  Hund  ', ' köpek ').value, { front: 'Hund', back: 'köpek', note: '' });
  assert.equal(readOwnCard({ front: 1, back: 'x' }).ok, false);
});

test('a lesson result must fit its lesson', () => {
  assert.equal(scoreProblem(0, 16, 16), null);
  assert.equal(scoreProblem(16, 16, 16), null);
  assert.equal(scoreProblem(-1, 16, 16), REFUSED.score);
  assert.equal(scoreProblem(17, 16, 16), REFUSED.score);
  assert.equal(scoreProblem(3, 15, 16), REFUSED.score);
  assert.equal(scoreProblem(0, 0, 0), REFUSED.score);
  assert.equal(scoreProblem(1, 1, 1), null);
  assert.equal(scoreProblem(1, MAX_LESSON_TOTAL, MAX_LESSON_TOTAL), null);
  assert.equal(scoreProblem(1, MAX_LESSON_TOTAL + 1, MAX_LESSON_TOTAL + 1), REFUSED.score);
  assert.equal(scoreProblem(1.5, 16, 16), REFUSED.score);
});

test('a card names a lesson word or an own word, and nothing else', () => {
  assert.equal(isCardKey('w:hello'), true);
  assert.equal(isCardKey('w:good-morning'), true);
  assert.equal(isCardKey('own:0b1e9f6a-3c2d-4e5f-8a9b-0c1d2e3f4a5b'), true);
  assert.equal(isCardKey('w:'), false);
  assert.equal(isCardKey('w:Hello'), false);
  assert.equal(isCardKey('own:nope'), false);
  assert.equal(isCardKey('x:hello'), false);
  assert.equal(isCardKey(7), false);
});

/* ---------- the weekly plan ---------- */

const LESSONS = ['u01-1', 'u01-2', 'u07-1', 'u07-2'].map((id) => ({ id, level: id.startsWith('u07') ? 'a2' : 'a1' }));

test('the plan starts from the start level and wraps to the lessons left before it', () => {
  assert.deepEqual(lessonOrder(LESSONS, 'a1'), ['u01-1', 'u01-2', 'u07-1', 'u07-2']);
  assert.deepEqual(lessonOrder(LESSONS, ''), ['u01-1', 'u01-2', 'u07-1', 'u07-2']);
  assert.deepEqual(lessonOrder(LESSONS, 'a2'), ['u07-1', 'u07-2', 'u01-1', 'u01-2']);
  assert.deepEqual(lessonOrder(LESSONS, 'beyond'), ['u07-1', 'u07-2', 'u01-1', 'u01-2']);
});

test("today's share shrinks as today's lessons are done, and a free day has none", () => {
  const order = ['a', 'b', 'c', 'd', 'e'];
  // 2026-10-21 is a Wednesday.
  const base = { today: '2026-10-21', studyDays: [1, 3, 5], lessonsPerDay: 2, order, done: new Set(), days: new Map() };
  const fresh = weekPlan(base);
  assert.deepEqual(fresh.todayLessons, ['a', 'b']);
  assert.equal(fresh.todayDone, false);
  assert.deepEqual(fresh.days.find((day) => day.day === '2026-10-23').lessons, ['c', 'd']);
  assert.equal(fresh.plannedCount, 3);
  const oneDone = weekPlan({ ...base, done: new Set(['a']), days: new Map([['2026-10-21', { lessons: 1, cards: 0 }]]) });
  assert.deepEqual(oneDone.todayLessons, ['b']);
  const twoDone = weekPlan({ ...base, done: new Set(['a', 'b']), days: new Map([['2026-10-21', { lessons: 2, cards: 0 }]]) });
  assert.deepEqual(twoDone.todayLessons, []);
  assert.equal(twoDone.todayDone, true);
  assert.equal(twoDone.next, 'c');
  assert.equal(twoDone.studiedPlanned, 1);
  const freeDay = weekPlan({ ...base, studyDays: [1, 5] });
  assert.equal(freeDay.todayPlanned, false);
  assert.deepEqual(freeDay.todayLessons, []);
  assert.equal(freeDay.todayDone, false);
  assert.equal(freeDay.next, 'a');
  const pastMonday = freeDay.days.find((day) => day.day === '2026-10-19');
  assert.equal(pastMonday.past, true);
  assert.deepEqual(pastMonday.lessons, []);
});

test('a day counts as studied with a lesson or a card, and a course with nothing left has no next lesson', () => {
  const plan = weekPlan({
    today: '2026-10-21',
    studyDays: [1, 2, 3],
    lessonsPerDay: 1,
    order: ['a'],
    done: new Set(['a']),
    days: new Map([
      ['2026-10-19', { lessons: 0, cards: 3 }],
      ['2026-10-20', { lessons: 0, cards: 0 }],
    ]),
  });
  assert.equal(plan.days[0].studied, true);
  assert.equal(plan.days[1].studied, false);
  assert.equal(plan.next, null);
});

/* ---------- the level test's count ---------- */

/** A test whose right answer is always choice 0. */
const TEST = [
  { level: 'a1', questions: Array.from({ length: QUESTIONS_PER_BAND }, () => ({ answer: 0 })) },
  { level: 'a2', questions: Array.from({ length: QUESTIONS_PER_BAND }, () => ({ answer: 0 })) },
];
/** @param {number} right */
const band = (right) => Array.from({ length: QUESTIONS_PER_BAND }, (_, at) => (at < right ? 0 : 1));

test('the A1 part passes at 6 of 8, and a part that does not pass ends the test', () => {
  assert.equal(PASS_MARK, 6);
  assert.deepEqual(scoreTest(TEST, band(5)), { bands: [{ level: 'a1', right: 5, total: 8 }], complete: true, start: 'a1', right: 5, total: 8 });
  assert.equal(scoreTest(TEST, band(6)).complete, false);
  assert.equal(scoreTest(TEST, band(7)).complete, false);
  assert.equal(scoreTest(TEST, [...band(5), ...band(8)]), null);
});

test('the A2 part decides between A2 and "this course may be easy"', () => {
  assert.equal(scoreTest(TEST, [...band(6), ...band(5)]).start, 'a2');
  assert.equal(scoreTest(TEST, [...band(6), ...band(6)]).start, 'beyond');
  assert.equal(scoreTest(TEST, [...band(8), ...band(7)]).start, 'beyond');
  const full = scoreTest(TEST, [...band(7), ...band(5)]);
  assert.equal(full.right, 12);
  assert.equal(full.total, 16);
});

test('"I don\'t know" counts as wrong, and an answer list of any other shape is refused', () => {
  const unknown = Array.from({ length: QUESTIONS_PER_BAND }, () => NOT_KNOWN);
  assert.equal(scoreTest(TEST, unknown).bands[0].right, 0);
  assert.equal(scoreTest(TEST, band(6).slice(0, 7)), null);
  assert.equal(scoreTest(TEST, [...band(6), 0]), null);
  assert.equal(scoreTest(TEST, [...band(6), ...band(6), 0]), null);
  assert.equal(scoreTest(TEST, [4, ...band(6).slice(1)]), null);
  assert.equal(scoreTest(TEST, [-2, ...band(6).slice(1)]), null);
  assert.equal(scoreTest(TEST, 'answers'), null);
});

test('a seed is a whole number from 1 to 2^31 - 1, and the same seed shuffles the same way', () => {
  assert.equal(isSeed(0), false);
  assert.equal(isSeed(1), true);
  assert.equal(isSeed(MAX_SEED), true);
  assert.equal(isSeed(MAX_SEED + 1), false);
  assert.equal(isSeed(2.5), false);
  assert.deepEqual(shuffled([1, 2, 3, 4, 5], randomFrom(42)), shuffled([1, 2, 3, 4, 5], randomFrom(42)));
});

/* ---------- a lesson's exercises ---------- */

const word = (id, text, meaning) => ({ id, text, roman: '', ex: `${text}!`, exRoman: '', meaning, exMeaning: `${meaning}!`, note: '', also: [] });
const LESSON = {
  id: 'u01-1',
  words: [word('a', 'eins', 'bir'), word('b', 'zwei', 'iki'), word('c', 'drei', 'üç'), word('d', 'vier', 'dört'), word('e', 'fünf', 'beş'), word('f', 'sechs', 'altı')],
  sentences: [
    { id: 'u01-1-a', text: 'Ich habe zwei Katzen.', roman: '', joiner: ' ', tokens: ['Ich', 'habe', 'zwei', 'Katzen.'], tokenRoman: [], gap: 3, wrong: ['Hunde', 'Autos', 'Häuser'], wrongRoman: [], meaning: 'İki kedim var.' },
    { id: 'u01-1-b', text: 'Er ist er.', roman: '', joiner: ' ', tokens: ['Er', 'ist', 'er.'], tokenRoman: [], gap: 1, wrong: ['bin', 'bist', 'sind'], wrongRoman: [], meaning: 'O, odur.' },
  ],
};
const POOL = [word('g', 'sieben', 'yedi'), word('h', 'acht', 'sekiz'), word('i', 'neun', 'dokuz')];

test('a lesson always has two exercises a word and two a sentence, whatever is switched on', () => {
  assert.equal(lessonTotal(LESSON), 16);
  for (const listen of [true, false]) {
    for (const typing of [true, false]) {
      const exercises = buildExercises(LESSON, POOL, { seed: 7, listen, typing });
      assert.equal(exercises.length, 16);
      assert.equal(new Set(exercises.map((item) => item.id)).size, 16);
      assert.equal(exercises.some((item) => item.kind === 'listen-choose'), listen);
      assert.equal(exercises.some((item) => item.kind === 'type-word'), typing);
    }
  }
});

test('every choice exercise has four different choices with the right one among them', () => {
  for (const exercise of buildExercises(LESSON, POOL, { seed: 11, listen: true, typing: false })) {
    if (exercise.choices === undefined) continue;
    assert.equal(exercise.choices.length, 4, exercise.id);
    assert.equal(new Set(exercise.choices.map((choice) => choice.text)).size, 4, exercise.id);
    assert.equal(exercise.choices.filter((choice) => choice.key === exercise.answer).length, 1, exercise.id);
  }
  const gap = buildExercises(LESSON, POOL, { seed: 3, listen: false, typing: false }).find((item) => item.id === 'gap:u01-1-a');
  assert.equal(gap.choices.find((choice) => choice.key === gap.answer).text, 'Katzen');
  assert.deepEqual(gapLine(LESSON.sentences[0]), { before: 'Ich habe zwei ', after: '.' });
});

test('a gap line joins its pieces as the language does, and their sound with spaces', () => {
  const sentence = { tokens: ['私は', '学生', 'です。'], tokenRoman: ['Watashi wa', 'gakusei', 'desu.'], joiner: '', gap: 1 };
  assert.deepEqual(gapLine(sentence), { before: '私は', after: 'です。' });
  assert.deepEqual(gapLine(sentence, sentence.tokenRoman), { before: 'Watashi wa ', after: ' desu.' });
});

test('a built sentence is right only in the right order, and equal words may swap', () => {
  assert.equal(builtRight(['Ich', 'habe', 'zwei', 'Katzen.'], LESSON.sentences[0].tokens), true);
  assert.equal(builtRight(['habe', 'Ich', 'zwei', 'Katzen.'], LESSON.sentences[0].tokens), false);
  assert.equal(builtRight(['Ich', 'habe', 'zwei'], LESSON.sentences[0].tokens), false);
  assert.equal(builtRight(['Er', 'ist', 'er.'], LESSON.sentences[1].tokens), true);
});

test('a built sentence is also right in another order its language names, and only in those', () => {
  const tokens = ['Deniz', 'her', 'gün', 'okula', 'gider.'];
  const orders = [[0, 3, 1, 2, 4]];
  assert.equal(builtRight(['Deniz', 'okula', 'her', 'gün', 'gider.'], tokens, orders), true);
  assert.equal(builtRight(['Deniz', 'okula', 'her', 'gün', 'gider.'], tokens), false);
  assert.equal(builtRight(tokens, tokens, orders), true);
  assert.equal(builtRight(['Deniz', 'her', 'okula', 'gün', 'gider.'], tokens, orders), false);
  assert.equal(builtRight(['Deniz', 'okula', 'her', 'gün'], tokens, orders), false);
});

/* ---------- practice with AI ---------- */

test('a practice request is checked before anything goes to AI', () => {
  assert.equal(readPractice({ tool: 'check', text: 'Ich bin Deniz.' }).ok, true);
  assert.equal(readPractice({ tool: 'check', text: '' }).ok, false);
  assert.equal(readPractice({ tool: 'check', text: 'a'.repeat(PRACTICE_LIMITS.text) }).ok, true);
  assert.equal(readPractice({ tool: 'check', text: 'a'.repeat(PRACTICE_LIMITS.text + 1) }).ok, false);
  assert.equal(readPractice({ tool: 'draw', text: 'x' }).ok, false);
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: '' }).ok, true);
  assert.equal(readPractice({ tool: 'talk', situation: 'moon', text: 'hi' }).ok, false);
  const turns = (count) => Array.from({ length: count }, (_, at) => ({ mine: at % 2 === 1, text: 'Hallo' }));
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: 'Ja', history: turns(PRACTICE_LIMITS.turns) }).ok, true);
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: 'Ja', history: turns(PRACTICE_LIMITS.turns + 1) }).ok, false);
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: '', history: turns(2) }).ok, false);
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: 'Ja', history: [{ mine: true, text: 'x'.repeat(PRACTICE_LIMITS.turnText + 1) }] }).ok, false);
});

test("a talk reply is cut to fit the talk's history, and a turn at the limit is taken", () => {
  const most = PRACTICE_LIMITS.turnText;
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: 'Ja', history: [{ mine: false, text: 'x'.repeat(most) }] }).ok, true);
  const exact = 'a'.repeat(most);
  assert.equal(clipped(exact, most), exact);
  const long = readAnswer('talk', JSON.stringify({ reply: 'Wort '.repeat(200) })).reply;
  assert.ok([...long].length <= most);
  assert.ok(long.endsWith('…'));
  assert.equal(readPractice({ tool: 'talk', situation: 'cafe', text: 'Ja', history: [{ mine: false, text: long }] }).ok, true);
  assert.equal([...clipped('字'.repeat(most + 1), most)].length, most);
});

test("AI's answer is read back only in the shape each tool expects", () => {
  assert.deepEqual(readAnswer('check', '{"right":false,"corrected":"Ich bin Deniz.","roman":"","explanation":"Büyük harf."}'), {
    right: false,
    corrected: 'Ich bin Deniz.',
    roman: '',
    explanation: 'Büyük harf.',
  });
  assert.equal(readAnswer('check', '```json\n{"right":true,"corrected":"Ja."}\n```').right, true);
  assert.equal(readAnswer('check', '{"corrected":"Ja."}'), null);
  assert.equal(readAnswer('check', 'not json'), null);
  assert.equal(readAnswer('talk', '{"reply":"Hallo!","meaning":"Merhaba!"}').reply, 'Hallo!');
  assert.equal(readAnswer('talk', '{"reply":""}'), null);
  assert.deepEqual(readAnswer('ask', '  Ein Wort.  '), { text: 'Ein Wort.' });
  assert.equal(readAnswer('ask', '   '), null);
});
