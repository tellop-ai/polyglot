/**
 * The addresses, sent hostile requests: each refuses in words a person can
 * read and saves nothing it should not.
 *
 * `APP_DATA_FILE` points at a temporary folder, as in `tests/data.test.mjs`,
 * so these checks never touch the store a person is using. The handlers are
 * called with plain requests, as the app's server calls them.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, test } from 'node:test';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'polyglot-routes-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const { closeStorage } = await import('../lib/data/index.js');
const learn = await import('../lib/data/learn.js');
const { REFUSED } = await import('../lib/learn/bounds.js');
const { LEARN_OWNER } = await import('../lib/learn/owner.js');
const { MAX_BODY_BYTES, readJsonBody } = await import('../lib/learn/request.js');
const choiceRoute = await import('../app/api/choice/route.js');
const courseRoute = await import('../app/api/course/route.js');
const lessonsRoute = await import('../app/api/lessons/route.js');
const cardsRoute = await import('../app/api/cards/route.js');
const answerRoute = await import('../app/api/cards/answer/route.js');
const levelTestRoute = await import('../app/api/level-test/route.js');
const settingsRoute = await import('../app/api/settings/route.js');
const practiceRoute = await import('../app/api/practice/route.js');

after(async () => {
  await closeStorage();
  process.chdir(startedIn);
  rmSync(scratch, { recursive: true, force: true });
});

let runs = 0;
/** A new lesson run's code, as a lesson page makes one. */
const run = () => (runs++).toString(16).padStart(32, '0');

/**
 * @param {unknown} body
 * @param {{ method?: string, type?: string, length?: string }} [options]
 */
function request(body, options = {}) {
  const headers = { 'content-type': options.type ?? 'application/json' };
  if (options.length !== undefined) headers['content-length'] = options.length;
  return new Request('http://app.invalid/address', { method: options.method ?? 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

/** @param {Promise<Response>} sent */
async function answered(sent) {
  const response = await sent;
  return { status: response.status, body: await response.json() };
}

/** @param {Promise<Response>} sent @param {string} problem */
async function refusesWith(sent, problem) {
  const { status, body } = await answered(sent);
  assert.equal(body.problem, problem);
  assert.ok(status >= 400, `${problem} answered ${status}`);
}

test('a request body is read only as JSON, and only up to 64 KiB', async () => {
  // `{"a":""}` is 8 bytes, so each body below is exactly `size` bytes.
  const sized = (size) => request(`{"a":"${'x'.repeat(size - 8)}"}`);
  assert.equal((await readJsonBody(sized(MAX_BODY_BYTES))).ok, true);
  assert.deepEqual(await readJsonBody(sized(MAX_BODY_BYTES + 1)), { ok: false, problem: REFUSED.long });
  assert.equal((await readJsonBody(request('{}', { length: String(MAX_BODY_BYTES) }))).ok, true);
  assert.deepEqual(await readJsonBody(request('{}', { length: String(MAX_BODY_BYTES + 1) })), { ok: false, problem: REFUSED.long });
  assert.deepEqual(await readJsonBody(request('{}', { length: 'many' })), { ok: false, problem: REFUSED.request });
  assert.deepEqual(await readJsonBody(request('{"a":1}', { type: 'text/plain' })), { ok: false, problem: REFUSED.request });
  assert.equal((await readJsonBody(request('{"a":1}', { type: 'application/json; charset=utf-8' }))).ok, true);
  assert.deepEqual(await readJsonBody(request('[1]')), { ok: false, problem: REFUSED.request });
  assert.deepEqual(await readJsonBody(request('null')), { ok: false, problem: REFUSED.request });
  assert.deepEqual(await readJsonBody(request('{"a":')), { ok: false, problem: REFUSED.request });
});

test('every save is refused before the person has chosen their languages', async () => {
  await refusesWith(lessonsRoute.POST(request({ course: 'de', lesson: 'u01-1', attempt: run(), right: 10, total: 16 })), REFUSED.notStarted);
  await refusesWith(courseRoute.POST(request({ course: 'de', start: 'a1' })), REFUSED.notStarted);
  await refusesWith(settingsRoute.POST(request({ course: 'de', lessonsPerDay: 2 })), REFUSED.notStarted);
  await refusesWith(choiceRoute.POST(request({ ownLanguage: 'tr', course: 'tr' })), REFUSED.course);
  await refusesWith(choiceRoute.POST(request({ ownLanguage: 'de', course: 'en' })), REFUSED.language);
  assert.equal(await learn.readLearnerFor(LEARN_OWNER), null);
  const { status } = await answered(choiceRoute.POST(request({ ownLanguage: 'tr', course: 'de' })));
  assert.equal(status, 200);
});

test('a page for another language, or one that names none, saves nothing', async () => {
  await refusesWith(lessonsRoute.POST(request({ course: 'es', lesson: 'u01-1', attempt: run(), right: 10, total: 16 })), REFUSED.switched);
  await refusesWith(lessonsRoute.POST(request({ lesson: 'u01-1', attempt: run(), right: 10, total: 16 })), REFUSED.switched);
  await refusesWith(cardsRoute.DELETE(request({ course: 'es', card: 'w:hello' }, { method: 'DELETE' })), REFUSED.switched);
  await refusesWith(cardsRoute.POST(request({ course: 'es', front: 'el perro', back: 'köpek' })), REFUSED.switched);
  await refusesWith(answerRoute.POST(request({ course: 'es', card: 'w:hello', knew: true })), REFUSED.switched);
  await refusesWith(courseRoute.DELETE(request({ course: 'es' }, { method: 'DELETE' })), REFUSED.switched);
  await refusesWith(levelTestRoute.POST(request({ course: 'es', seed: 5, answers: [] })), REFUSED.switched);
  await refusesWith(settingsRoute.POST(request({ course: 'es', voice: 'es-ES' })), REFUSED.switched);
  assert.deepEqual(await learn.readResultsFor(LEARN_OWNER, 'de'), []);
  assert.deepEqual(await learn.readResultsFor(LEARN_OWNER, 'es'), []);
});

test('a lesson result must name a real lesson and fit it exactly', async () => {
  const send = (body) => lessonsRoute.POST(request({ course: 'de', attempt: run(), ...body }));
  await refusesWith(send({ lesson: 'u13-1', right: 10, total: 16 }), REFUSED.lesson);
  await refusesWith(send({ lesson: { id: 'u01-1' }, right: 10, total: 16 }), REFUSED.lesson);
  await refusesWith(send({ lesson: 'u01-1', right: 10, total: 15 }), REFUSED.score);
  await refusesWith(send({ lesson: 'u01-1', right: 10, total: 17 }), REFUSED.score);
  await refusesWith(send({ lesson: 'u01-1', right: 17, total: 16 }), REFUSED.score);
  await refusesWith(send({ lesson: 'u01-1', right: -1, total: 16 }), REFUSED.score);
  await refusesWith(send({ lesson: 'u01-1', right: '16', total: 16 }), REFUSED.score);
  await refusesWith(send({ lesson: 'u01-1', right: 10.5, total: 16 }), REFUSED.score);
  assert.deepEqual(await learn.readResultsFor(LEARN_OWNER, 'de'), []);
  for (const right of [0, 16]) {
    const { status, body } = await answered(send({ lesson: 'u01-1', right, total: 16 }));
    assert.equal(status, 200);
    assert.equal(body.result.bestRight, right);
  }
  await refusesWith(send({ lesson: 'u01-2', attempt: undefined, right: 10, total: 16 }), REFUSED.request);
  await refusesWith(send({ lesson: 'u01-2', attempt: 'not-a-run-code', right: 10, total: 16 }), REFUSED.request);
  const once = { lesson: 'u01-2', attempt: run(), right: 10, total: 16 };
  const first = await answered(send(once));
  const again = await answered(send(once));
  assert.deepEqual([first.status, again.status, again.body.result.times], [200, 200, 1]);
});

test('a review answer and a card must have their own shapes', async () => {
  await refusesWith(answerRoute.POST(request({ course: 'de', card: 'w:hello', knew: 'yes' })), REFUSED.request);
  await refusesWith(answerRoute.POST(request({ course: 'de', card: 'x:hello', knew: true })), REFUSED.card);
  await refusesWith(answerRoute.POST(request({ course: 'de', card: 'w:hello', knew: true })), REFUSED.card);
  await refusesWith(cardsRoute.POST(request({ course: 'de', front: '', back: 'köpek' })), REFUSED.front);
  await refusesWith(cardsRoute.POST(request({ course: 'de', front: 'der Hund', back: 'a\nb' })), REFUSED.back);
  await refusesWith(cardsRoute.POST(request({ course: 'de', front: 5, back: 'köpek' })), REFUSED.request);
});

test('the level test is counted only from its own seed and a whole part of answers', async () => {
  const send = (body) => levelTestRoute.POST(request({ course: 'de', ...body }));
  await refusesWith(send({ seed: 0, answers: [] }), REFUSED.test);
  await refusesWith(send({ seed: 2147483648, answers: [] }), REFUSED.test);
  await refusesWith(send({ seed: 5, answers: [0, 0, 0, 0, 0, 0, 0] }), REFUSED.test);
  await refusesWith(send({ seed: 5, answers: [0, 0, 0, 0, 0, 0, 0, 0], save: 'yes' }), REFUSED.request);
  await refusesWith(send({ seed: 5, answers: [0, 0, 0, 0, 0, 0, 0, 0], start: 'a2' }), REFUSED.request);
  const counted = await answered(send({ seed: 5, answers: Array(8).fill(-1) }));
  assert.equal(counted.status, 200);
  assert.equal(counted.body.result.complete, true);
  assert.equal(counted.body.result.start, 'a1');
});

test('"Start over" and then either start works at once', async () => {
  const done = await answered(courseRoute.DELETE(request({ course: 'de' }, { method: 'DELETE' })));
  assert.equal(done.status, 200);
  assert.equal((await learn.readCourseFor(LEARN_OWNER, 'de')).startLevel, '');
  const first = await answered(courseRoute.POST(request({ course: 'de', start: 'a1' })));
  assert.deepEqual([first.status, first.body.startLevel], [200, 'a1']);
  await answered(courseRoute.DELETE(request({ course: 'de' }, { method: 'DELETE' })));
  const tested = await answered(levelTestRoute.POST(request({ course: 'de', seed: 5, answers: Array(8).fill(-1), save: true, start: 'suggested' })));
  assert.deepEqual([tested.status, tested.body.startLevel], [200, 'a1']);
  await refusesWith(courseRoute.POST(request({ course: 'de', start: 'a2' })), REFUSED.request);
});

test('settings take only their choices, and an accent only of the language learned', async () => {
  await refusesWith(settingsRoute.POST(request({ course: 'de', lessonsPerDay: 4 })), REFUSED.setting);
  await refusesWith(settingsRoute.POST(request({ course: 'de', studyDays: [] })), REFUSED.studyDays);
  const wrongAccent = await answered(settingsRoute.POST(request({ course: 'de', voice: 'fr-FR' })));
  assert.ok(wrongAccent.status >= 400);
  const saved = await answered(settingsRoute.POST(request({ course: 'de', lessonsPerDay: 3, voice: 'de-DE' })));
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.settings.lessonsPerDay, saved.body.settings.voice], [3, 'de-DE']);
});

/* ---------- practice with AI ---------- */

const AI_BASE = 'http://ai.test.invalid/v1';
const AI_SETTINGS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODEL_QUICK', 'AI_MODEL_STANDARD', 'AI_MODEL_BEST'];

/** @param {string} content */
const aiAnswer = (content) => Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] });

/**
 * Runs `check` with AI answering through `answer`, as the kit's helper reaches
 * it outside Tellop: there each level names its own model, so the model sent
 * shows the level asked. Inside Tellop it is the same request with the level
 * as a header and no model, which the kit's own checks cover. Every call is
 * kept, and the settings and `fetch` come back as they were.
 *
 * @param {((sent: { url: string, body: any }) => Response | Promise<Response>) | null} answer `null`: no AI is set up
 * @param {(calls: { url: string, body: any }[]) => Promise<void>} check
 */
async function withAI(answer, check) {
  const kept = Object.fromEntries(AI_SETTINGS.map((name) => [name, process.env[name]]));
  const realFetch = globalThis.fetch;
  /** @type {{ url: string, body: any }[]} */
  const calls = [];
  for (const name of AI_SETTINGS) delete process.env[name];
  if (answer !== null) {
    process.env.AI_BASE_URL = AI_BASE;
    for (const level of ['QUICK', 'STANDARD', 'BEST']) process.env[`AI_MODEL_${level}`] = `model-for-${level.toLowerCase()}`;
  }
  globalThis.fetch = async (url, init) => {
    const sent = { url: String(url), body: JSON.parse(String(init?.body ?? 'null')) };
    calls.push(sent);
    if (answer === null) throw new TypeError('no AI is set up');
    return await answer(sent);
  };
  try {
    await check(calls);
  } finally {
    globalThis.fetch = realFetch;
    for (const name of AI_SETTINGS) {
      if (kept[name] === undefined) delete process.env[name];
      else process.env[name] = kept[name];
    }
  }
}

/** @param {Record<string, unknown>} body */
const practice = (body) => practiceRoute.POST(request({ course: 'de', ...body }));

test('each AI tool sends one request at the standard level and shows what came back', async () => {
  const replies = {
    check: JSON.stringify({ right: false, corrected: 'Ich bin müde.', roman: '', explanation: '"müde" yazılır.' }),
    ask: '"der" eril isimler içindir: der Hund (köpek).',
    talk: '```json\n{"reply":"Hallo! Was möchten Sie trinken?","roman":"","meaning":"Merhaba! Ne içmek istersiniz?","tip":""}\n```',
  };
  await withAI(({ body }) => aiAnswer(replies[/JSON object: \{"right"/u.test(body.messages[0].content) ? 'check' : /\{"reply"/u.test(body.messages[0].content) ? 'talk' : 'ask']), async (calls) => {
    const checked = await answered(practice({ tool: 'check', text: 'Ich bin mude.' }));
    assert.deepEqual([checked.status, checked.body.answer], [200, { right: false, corrected: 'Ich bin müde.', roman: '', explanation: '"müde" yazılır.' }]);
    const asked = await answered(practice({ tool: 'ask', text: 'der ne zaman?' }));
    assert.deepEqual([asked.status, asked.body.answer], [200, { text: replies.ask }]);
    const opened = await answered(practice({ tool: 'talk', situation: 'cafe', text: '' }));
    assert.deepEqual([opened.status, opened.body.answer.reply, opened.body.answer.meaning], [200, 'Hallo! Was möchten Sie trinken?', 'Merhaba! Ne içmek istersiniz?']);
    const next = await answered(practice({ tool: 'talk', situation: 'cafe', text: 'Einen Tee, bitte.', history: [{ mine: false, text: opened.body.answer.reply }] }));
    assert.equal(next.status, 200);

    assert.equal(calls.length, 4, 'one AI request for each press');
    for (const { url, body } of calls) {
      assert.equal(url, `${AI_BASE}/chat/completions`);
      assert.equal(body.model, 'model-for-standard');
      assert.deepEqual([body.stream, body.max_tokens], [false, 500]);
      assert.match(body.messages[0].content, /German/u);
      assert.match(body.messages[0].content, /own language is Turkish/u);
      assert.match(body.messages[0].content, /A1 \(beginner\)/u);
    }
    assert.deepEqual(calls.map(({ body }) => body.response_format?.type ?? 'text'), ['json_object', 'text', 'json_object', 'json_object']);
    assert.deepEqual(calls[0].body.messages.at(-1), { role: 'user', content: 'Ich bin mude.' });
    assert.deepEqual(calls[2].body.messages.at(-1), { role: 'user', content: '(Start the talk with your first line.)' });
    assert.deepEqual(calls[3].body.messages.slice(1).map((message) => message.role), ['assistant', 'user']);
  });
});

test('a refused or failed AI call shows the words for it, in both languages, and an unreadable answer says so', async () => {
  const en = JSON.parse(readFileSync(path.join(projectRoot, 'lib/i18n/locales/en.json'), 'utf8'));
  const tr = JSON.parse(readFileSync(path.join(projectRoot, 'lib/i18n/locales/tr.json'), 'utf8'));
  const cases = [
    [402, 'meter-exhausted', 'ai.allowance'],
    [409, 'notice-shown', 'ai.needsPermission'],
    [409, 'open-tellop', 'ai.openTellop'],
    [429, 'app-busy', 'ai.busy'],
    [401, 'not-signed-in', 'ai.signedOut'],
    [409, 'paused-by-guard', 'ai.paused'],
    [503, 'app-ai-off', 'ai.appAiOff'],
    [503, 'offline', 'ai.offline'],
    [503, 'something-new', 'ai.unavailable'],
  ];
  for (const [status, code, words] of cases) {
    await withAI(() => Response.json({ error: { type: 'tellop', code } }, { status }), async (calls) => {
      const sent = await answered(practice({ tool: 'ask', text: 'der ne zaman?' }));
      assert.deepEqual([sent.status, sent.body.problem, sent.body.retry, calls.length], [503, words, code === 'app-busy', 1], code);
    });
    assert.ok(typeof en[words] === 'string' && typeof tr[words] === 'string', `${words} has words in both languages`);
  }
  await withAI(() => { throw new TypeError('connection reset'); }, async () => {
    assert.equal((await answered(practice({ tool: 'ask', text: 'der ne zaman?' }))).body.problem, 'ai.unavailable');
  });
  await withAI(() => aiAnswer('not a JSON object'), async () => {
    const sent = await answered(practice({ tool: 'check', text: 'Ich bin mude.' }));
    assert.deepEqual([sent.status, sent.body.problem], [502, 'learn.practice.unreadable']);
  });
  assert.ok(typeof en['learn.practice.unreadable'] === 'string' && typeof tr['learn.practice.unreadable'] === 'string');
  // Outside Tellop with no AI set up: the page says AI is not available, and nothing is sent.
  await withAI(null, async (calls) => {
    assert.equal((await answered(practice({ tool: 'check', text: 'Ich bin mude.' }))).body.problem, 'ai.unavailable');
    assert.equal(calls.length, 0);
  });
});

test('a practice request that is not one of the three tools, or not for this language, never reaches AI', async () => {
  await withAI(() => aiAnswer('{}'), async (calls) => {
    await refusesWith(practice({ tool: 'translate', text: 'Hund' }), REFUSED.practice);
    await refusesWith(practice({ tool: 'check', text: '' }), REFUSED.practice);
    await refusesWith(practice({ tool: 'check', text: 'x'.repeat(501) }), REFUSED.practice);
    await refusesWith(practice({ tool: 'talk', situation: 'bank', text: '' }), REFUSED.practice);
    const turns = Array.from({ length: 13 }, (_, at) => ({ mine: at % 2 === 1, text: 'Hallo' }));
    await refusesWith(practice({ tool: 'talk', situation: 'cafe', text: 'Hallo', history: turns }), REFUSED.practice);
    await refusesWith(practiceRoute.POST(request({ course: 'es', tool: 'ask', text: '¿qué?' })), REFUSED.switched);
    await refusesWith(practiceRoute.POST(request({ tool: 'ask', text: 'der?' })), REFUSED.switched);
    assert.equal(calls.length, 0);
  });
});
