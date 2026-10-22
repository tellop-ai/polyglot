/**
 * Voice: the AI voice that reads aloud and keeps each reading, the person's
 * speech written down and checked against a lesson's sentence, and the two
 * voice settings. The rules are checked as plain functions; the addresses are
 * called with plain requests, with AI answering through the kit's helper
 * outside Tellop (each kind of call names its own model there, so the model
 * sent shows the kind asked). Each check of a bound tests the bound itself and
 * one value on each side of it.
 *
 * `APP_DATA_FILE` points at a temporary folder, as in `tests/data.test.mjs`.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, test } from 'node:test';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'polyglot-voice-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const { closeStorage } = await import('../lib/data/index.js');
const learn = await import('../lib/data/learn.js');
const { courseTexts, courseView, lessonOf } = await import('../lib/course/index.js');
const { REFUSED, readSettings } = await import('../lib/learn/bounds.js');
const { buildExercises } = await import('../lib/learn/exercises.js');
const { LEARN_OWNER } = await import('../lib/learn/owner.js');
const { AI_VOICE, VOICE_LIMITS, heardText, matchHeard, readSpokenText, spokenLanguage } = await import('../lib/learn/voice.js');
const choiceRoute = await import('../app/api/choice/route.js');
const courseRoute = await import('../app/api/course/route.js');
const filesRoute = await import('../app/api/files/route.js');
const settingsRoute = await import('../app/api/settings/route.js');
const soundsRoute = await import('../app/api/sounds/route.js');
const speechRoute = await import('../app/api/speech/route.js');

after(async () => {
  await closeStorage();
  process.chdir(startedIn);
  rmSync(scratch, { recursive: true, force: true });
});

before(async () => {
  const chosen = await choiceRoute.POST(request({ ownLanguage: 'tr', course: 'de' }));
  assert.equal(chosen.status, 200);
});

/** @param {unknown} body @param {{ method?: string }} [options] */
function request(body, options = {}) {
  return new Request('http://app.invalid/address', {
    method: options.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** @param {Record<string, string>} query @param {string} [method] */
const soundRequest = (query, method = 'GET') => new Request(`http://app.invalid/api/sounds?${new URLSearchParams(query)}`, { method });

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

const keyOf = (/** @type {string} */ text) => createHash('sha256').update(text, 'utf8').digest('hex');
/** An MP3's first bytes, as a kept file's kind is read from them. */
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64, ...new Array(64).fill(0)]);
/** A recording's first bytes: AAC in MP4. */
const CLIP = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, ...new Array(64).fill(0)]);

const AI_BASE = 'http://ai.test.invalid/v1';
const AI_SETTINGS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODEL_SPEECH', 'AI_MODEL_TRANSCRIBE'];

/**
 * Runs `check` with AI answering through `answer` outside Tellop, keeping each
 * call; the settings and `fetch` come back as they were. `null`: no AI set up.
 *
 * @param {((sent: { url: string, body: any, form: FormData | null }) => Response | Promise<Response>) | null} answer
 * @param {(calls: { url: string, body: any, form: FormData | null }[]) => Promise<void>} check
 */
async function withAI(answer, check) {
  const kept = Object.fromEntries(AI_SETTINGS.map((name) => [name, process.env[name]]));
  const realFetch = globalThis.fetch;
  /** @type {{ url: string, body: any, form: FormData | null }[]} */
  const calls = [];
  for (const name of AI_SETTINGS) delete process.env[name];
  if (answer !== null) {
    process.env.AI_BASE_URL = AI_BASE;
    process.env.AI_MODEL_SPEECH = 'model-for-speech';
    process.env.AI_MODEL_TRANSCRIBE = 'model-for-transcribe';
  }
  globalThis.fetch = async (url, init) => {
    const raw = init?.body;
    const form = raw instanceof FormData ? raw : null;
    const sent = { url: String(url), body: form === null ? JSON.parse(String(raw ?? 'null')) : null, form };
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

const speakAnswer = () => new Response(MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
/** @param {number} status @param {string} code */
const tellopRefusal = (status, code) => Response.json({ error: { type: 'tellop', code } }, { status });

const view = courseView('de', 'tr');
const firstLesson = view.lessons[0];

/* ---------- the rules ---------- */

test('a recording is written down in the language learned, named as the AI that writes it names it', () => {
  for (const code of ['en', 'tr', 'es', 'de', 'fr', 'it', 'pt', 'ja', 'ko', 'zh']) assert.equal(spokenLanguage(code), code);
  assert.equal(spokenLanguage('xx'), null);
  assert.equal(spokenLanguage(undefined), null);
});

test('a text read aloud is one line of at most 600 characters, with no control characters', () => {
  assert.equal(readSpokenText('x'.repeat(VOICE_LIMITS.text - 1)), 'x'.repeat(599));
  assert.equal(readSpokenText('x'.repeat(VOICE_LIMITS.text)), 'x'.repeat(600));
  assert.equal(readSpokenText('x'.repeat(VOICE_LIMITS.text + 1)), null);
  assert.equal(readSpokenText('  Guten\n Morgen \t'), 'Guten Morgen');
  assert.equal(readSpokenText(''), null);
  assert.equal(readSpokenText('   '), null);
  assert.equal(readSpokenText('Hallo\u0007'), null);
  assert.equal(readSpokenText('Hallo\u007f'), null);
  assert.equal(readSpokenText(5), null);
  assert.equal(heardText('y'.repeat(VOICE_LIMITS.heard + 1)).length, 600);
  assert.equal(heardText(' Hallo  Sam '), 'Hallo Sam');
  assert.equal(heardText(undefined), '');
});

test('a sentence counts as said when enough of its words are heard in its order: three quarters, or six tenths of the letters', () => {
  const eight = 'eins zwei drei vier fünf sechs sieben acht';
  assert.deepEqual(matchHeard(eight, eight, 'de'), { right: true, share: 1 });
  assert.equal(matchHeard(eight, 'Eins, zwei, drei, vier, fünf, sechs, sieben, acht!', 'de').right, true);
  assert.equal(matchHeard(eight, 'eins zwei drei vier funf sechs sieben acht', 'de').right, true);
  // Seven, six and five of the eight words.
  assert.equal(matchHeard(eight, 'eins zwei drei vier fünf sechs sieben', 'de').right, true);
  assert.equal(matchHeard(eight, 'eins zwei drei vier fünf sechs', 'de').right, true);
  assert.equal(matchHeard(eight, 'eins zwei drei vier fünf', 'de').right, false);
  // The same words in another order are not the sentence.
  assert.equal(matchHeard(eight, 'acht sieben sechs fünf vier drei zwei eins', 'de').right, false);
  // Saying much more than the sentence never makes it right.
  assert.equal(matchHeard('eins zwei drei', 'eins zwei drei vier fünf sechs', 'de').right, false);
  assert.deepEqual(matchHeard(eight, '', 'de'), { right: false, share: 0 });
  assert.deepEqual(matchHeard('!!', 'eins', 'de'), { right: false, share: 0 });
  // Letters, for Japanese and Chinese: seven, six and five of ten.
  const ten = 'あいうえおかきくけこ';
  assert.equal(matchHeard(ten, 'あいうえおかき', 'ja').right, true);
  assert.equal(matchHeard(ten, 'あいうえおか', 'ja').right, true);
  assert.equal(matchHeard(ten, 'あいうえお', 'ja').right, false);
  assert.equal(matchHeard(`${ten}。`, 'あいうえお かきくけこ', 'ja').right, true);
});

test('with speaking on, the first sentence is said aloud in place of its gap, and the gap stays ready for a skip', () => {
  const found = lessonOf(view, firstLesson.id);
  const plainRun = buildExercises(found.lesson, found.pool, { seed: 77, listen: true, typing: true });
  const spokenRun = buildExercises(found.lesson, found.pool, { seed: 77, listen: true, typing: true, speak: true });
  assert.equal(spokenRun.length, plainRun.length);
  const said = spokenRun.filter((exercise) => exercise.kind === 'say-sentence');
  assert.equal(said.length, 1);
  const at = spokenRun.indexOf(said[0]);
  assert.deepEqual(said[0].skipTo, plainRun[at]);
  assert.equal(plainRun[at].kind, 'fill-gap');
  assert.equal(said[0].sentence.id, found.lesson.sentences[0].id);
  assert.deepEqual(spokenRun.filter((exercise) => exercise !== said[0]), plainRun.filter((_, index) => index !== at));
  assert.equal(buildExercises(found.lesson, found.pool, { seed: 77, listen: true, typing: true, speak: false }).some((item) => item.kind === 'say-sentence'), false);
});

test('the voice settings take only their choices', () => {
  assert.deepEqual(readSettings({ readWith: 'ai' }), { ok: true, value: { readWith: 'ai' } });
  assert.deepEqual(readSettings({ readWith: 'mac' }), { ok: true, value: { readWith: 'mac' } });
  assert.deepEqual(readSettings({ readWith: 'robot' }), { ok: false, problem: REFUSED.setting });
  assert.deepEqual(readSettings({ readWith: true }), { ok: false, problem: REFUSED.setting });
  assert.deepEqual(readSettings({ speaking: false }), { ok: true, value: { speaking: false } });
  assert.deepEqual(readSettings({ speaking: 'yes' }), { ok: false, problem: REFUSED.setting });
});

test("the course's own texts are its words, their examples, its sentences and its tips' examples", () => {
  const texts = courseTexts(view);
  assert.ok(texts.has(firstLesson.words[0].text));
  assert.ok(texts.has(readSpokenText(firstLesson.words[0].ex)));
  assert.ok(texts.has(firstLesson.sentences[0].text));
  assert.ok(texts.has(view.units[0].tip.examples[0].text));
  assert.equal(texts.has('Ein Satz, den der Kurs nicht hat.'), false);
});

/* ---------- the records ---------- */

test('a learner saved before the voice settings has the AI voice and speaking on, and the settings save', async () => {
  const learner = await learn.readLearnerFor(LEARN_OWNER);
  assert.deepEqual([learner.readWith, learner.speaking], ['ai', true]);
  const saved = await answered(settingsRoute.POST(request({ course: 'de', readWith: 'mac', speaking: false })));
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.settings.readWith, saved.body.settings.speaking], ['mac', false]);
  await refusesWith(settingsRoute.POST(request({ course: 'de', readWith: 'robot' })), REFUSED.setting);
  await refusesWith(settingsRoute.POST(request({ course: 'de', speaking: 1 })), REFUSED.setting);
  const back = await answered(settingsRoute.POST(request({ course: 'de', readWith: 'ai', speaking: true })));
  assert.deepEqual([back.body.settings.readWith, back.body.settings.speaking], ['ai', true]);
});

test('a reading is kept once: a second save of the same text keeps the first, and a bad one is refused', async () => {
  const sound = { voice: AI_VOICE, textKey: keyOf('records one'), kind: 'other', soundFile: 'a'.repeat(64) };
  assert.equal(await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, sound.textKey), null);
  assert.deepEqual(await learn.saveSoundFor(LEARN_OWNER, 'de', sound), { textKey: sound.textKey, kind: 'other', soundFile: 'a'.repeat(64) });
  assert.deepEqual(await learn.saveSoundFor(LEARN_OWNER, 'de', { ...sound, soundFile: 'b'.repeat(64) }), { textKey: sound.textKey, kind: 'other', soundFile: 'a'.repeat(64) });
  assert.equal(await learn.readSoundFor(LEARN_OWNER, 'es', AI_VOICE, sound.textKey), null);
  for (const bad of [{ kind: 'mine' }, { soundFile: 'nope' }, { textKey: 'A'.repeat(64) }, { voice: 'Nova!' }]) {
    await assert.rejects(learn.saveSoundFor(LEARN_OWNER, 'de', { ...sound, textKey: keyOf(JSON.stringify(bad)), ...bad }), { messageKey: REFUSED.request });
  }
  await assert.rejects(learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, 'short'), { messageKey: REFUSED.request });
});

/* ---------- the AI voice's address ---------- */

test("a course word is read by the AI voice once, kept, and played from its owner's row", async () => {
  const word = firstLesson.words[0].text;
  await withAI(speakAnswer, async (calls) => {
    const first = await answered(soundsRoute.POST(request({ course: 'de', text: word })));
    assert.deepEqual([first.status, first.body], [200, { sound: keyOf(word) }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${AI_BASE}/audio/speech`);
    assert.deepEqual(calls[0].body, { input: word, voice: AI_VOICE, response_format: 'mp3', model: 'model-for-speech' });
    const again = await answered(soundsRoute.POST(request({ course: 'de', text: ` ${word}\n` })));
    assert.deepEqual([again.status, again.body, calls.length], [200, { sound: keyOf(word) }, 1]);
  });
  const row = await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, keyOf(word));
  assert.equal(row.kind, 'course');
  const played = await soundsRoute.GET(soundRequest({ course: 'de', sound: keyOf(word) }));
  assert.equal(played.status, 200);
  assert.equal(played.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(new Uint8Array(await played.arrayBuffer()), MP3);
  assert.equal((await soundsRoute.HEAD(soundRequest({ course: 'de', sound: keyOf(word) }, 'HEAD'))).status, 200);
});

test('texts that are not the course\'s own are kept up to 1,000 for a language; the course\'s own never count', async () => {
  const soundFile = (await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, keyOf(firstLesson.words[0].text))).soundFile;
  const others = Number(await countOthers());
  for (let at = others; at < VOICE_LIMITS.practiceSounds - 1; at += 1) {
    await learn.saveSoundFor(LEARN_OWNER, 'de', { voice: AI_VOICE, textKey: keyOf(`filler ${at}`), kind: 'other', soundFile });
  }
  assert.equal(await countOthers(), 999);
  await withAI(speakAnswer, async (calls) => {
    const last = await answered(soundsRoute.POST(request({ course: 'de', text: 'Hallo! Was möchten Sie trinken?' })));
    assert.deepEqual([last.status, calls.length], [200, 1]);
    assert.equal((await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, keyOf('Hallo! Was möchten Sie trinken?'))).kind, 'other');
    assert.equal(await countOthers(), 1000);
    const over = await answered(soundsRoute.POST(request({ course: 'de', text: 'Einen Tee, bitte.' })));
    assert.deepEqual([over.status, over.body.problem, calls.length], [409, REFUSED.sounds, 1]);
    const kept = await answered(soundsRoute.POST(request({ course: 'de', text: 'Hallo! Was möchten Sie trinken?' })));
    assert.deepEqual([kept.status, calls.length], [200, 1]);
    const own = await answered(soundsRoute.POST(request({ course: 'de', text: firstLesson.sentences[0].text })));
    assert.deepEqual([own.status, calls.length], [200, 2]);
  });
});

async function countOthers() {
  const { modelAction } = await import('../lib/data/index.js');
  return await modelAction('SpokenSound', 'count', { where: { ownerId: LEARN_OWNER, course: 'de', kind: 'other' } });
}

test('a refused or failed reading shows the words for it and keeps nothing', async () => {
  const text = firstLesson.words[1].text;
  const cases = [
    [402, 'meter-exhausted', 'ai.allowance'],
    [409, 'notice-shown', 'ai.needsPermission'],
    [429, 'app-busy', 'ai.busy'],
    [503, 'app-ai-off', 'ai.appAiOff'],
    [503, 'voice-unavailable', 'ai.unavailable'],
  ];
  for (const [status, code, words] of cases) {
    await withAI(() => tellopRefusal(status, code), async (calls) => {
      const sent = await answered(soundsRoute.POST(request({ course: 'de', text })));
      assert.deepEqual([sent.status, sent.body.problem, sent.body.retry, calls.length], [503, words, code === 'app-busy', 1], code);
    });
  }
  await withAI(() => { throw new TypeError('connection reset'); }, async () => {
    assert.equal((await answered(soundsRoute.POST(request({ course: 'de', text })))).body.problem, 'ai.unavailable');
  });
  await withAI(null, async (calls) => {
    assert.equal((await answered(soundsRoute.POST(request({ course: 'de', text })))).body.problem, 'ai.unavailable');
    assert.equal(calls.length, 0);
  });
  assert.equal(await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, keyOf(text)), null);
  await refusesWith(soundsRoute.GET(soundRequest({ course: 'de', sound: keyOf(text) })), REFUSED.request);
});

test('a reading AI made but Polyglot could not keep says so in both languages, and keeps nothing', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(process.env.APP_DATA_FILE);
  db.exec("CREATE TRIGGER refuse_sounds BEFORE INSERT ON spoken_sounds BEGIN SELECT RAISE(ABORT, 'refused'); END;");
  const text = firstLesson.words[2].text;
  try {
    await withAI(speakAnswer, async (calls) => {
      const sent = await answered(soundsRoute.POST(request({ course: 'de', text })));
      assert.deepEqual([sent.status, sent.body.problem, calls.length], [500, 'learn.voice.notKept', 1]);
    });
  } finally {
    db.exec('DROP TRIGGER refuse_sounds');
    db.close();
  }
  assert.equal(await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, keyOf(text)), null);
  for (const language of ['en', 'tr']) {
    const words = JSON.parse(readFileSync(path.join(projectRoot, `lib/i18n/locales/${language}.json`), 'utf8'));
    for (const key of ['learn.voice.notKept', 'learn.voice.macInstead', 'learn.voice.aiLabel', 'learn.refused.sounds']) assert.equal(typeof words[key], 'string', `${language} ${key}`);
  }
});

test('a reading that is not one text of the page\'s language never reaches AI', async () => {
  await withAI(speakAnswer, async (calls) => {
    await refusesWith(soundsRoute.POST(request({ course: 'de', text: 'x'.repeat(601) })), REFUSED.request);
    await refusesWith(soundsRoute.POST(request({ course: 'de', text: '' })), REFUSED.request);
    await refusesWith(soundsRoute.POST(request({ course: 'de', text: 'Hallo\u0007' })), REFUSED.request);
    await refusesWith(soundsRoute.POST(request({ course: 'de', text: ['Hallo'] })), REFUSED.request);
    await refusesWith(soundsRoute.POST(request({ course: 'es', text: 'Hola' })), REFUSED.switched);
    await refusesWith(soundsRoute.POST(request({ text: 'Hallo' })), REFUSED.switched);
    await refusesWith(soundsRoute.GET(soundRequest({ course: 'de', sound: 'xyz' })), REFUSED.request);
    await refusesWith(soundsRoute.GET(soundRequest({ course: 'es', sound: keyOf(firstLesson.words[0].text) })), REFUSED.switched);
    assert.equal(calls.length, 0);
  });
});

test('starting a language over keeps its readings', async () => {
  const done = await answered(courseRoute.DELETE(request({ course: 'de' }, { method: 'DELETE' })));
  assert.equal(done.status, 200);
  assert.notEqual(await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, keyOf(firstLesson.words[0].text)), null);
});

/* ---------- what the person said ---------- */

async function keptClip() {
  const kept = await filesRoute.POST(new Request('http://app.invalid/api/files', { method: 'POST', body: CLIP }));
  assert.equal(kept.status, 201);
  return (await kept.json()).file;
}

test('what a person said is written down, and a lesson sentence is checked here against the sentence itself', async () => {
  const file = await keptClip();
  const sentence = firstLesson.sentences[0];
  let heard = sentence.text;
  await withAI(() => Response.json({ text: heard }), async (calls) => {
    const right = await answered(speechRoute.POST(request({ course: 'de', file, lesson: firstLesson.id, sentence: sentence.id })));
    assert.deepEqual([right.status, right.body], [200, { heard: sentence.text, right: true }]);
    assert.equal(calls[0].url, `${AI_BASE}/audio/transcriptions`);
    assert.equal(calls[0].form.get('model'), 'model-for-transcribe');
    // The recording is written down in the language learned, so a learner's accent is not taken for their own language.
    assert.equal(calls[0].form.get('language'), 'de');
    assert.deepEqual(new Uint8Array(await calls[0].form.get('file').arrayBuffer()), CLIP);
    heard = 'Gute Nacht, Mia und Leo.';
    const wrong = await answered(speechRoute.POST(request({ course: 'de', file, lesson: firstLesson.id, sentence: sentence.id })));
    assert.deepEqual([wrong.status, wrong.body], [200, { heard, right: false }]);
    const free = await answered(speechRoute.POST(request({ course: 'de', file })));
    assert.deepEqual([free.status, free.body], [200, { heard }]);
    heard = `  ${'z'.repeat(700)}  `;
    assert.equal((await answered(speechRoute.POST(request({ course: 'de', file })))).body.heard.length, 600);
    assert.equal(calls.length, 4);
  });
  await withAI(() => tellopRefusal(402, 'meter-exhausted'), async () => {
    const sent = await answered(speechRoute.POST(request({ course: 'de', file })));
    assert.deepEqual([sent.status, sent.body.problem], [503, 'ai.allowance']);
  });
  await withAI(() => tellopRefusal(422, 'clip-unmeasured'), async () => {
    assert.equal((await answered(speechRoute.POST(request({ course: 'de', file })))).body.problem, 'ai.clipUnreadable');
  });
});

test('a recording request must name a kept recording and a real sentence of a lesson', async () => {
  const file = await keptClip();
  const other = view.lessons[1];
  await withAI(() => Response.json({ text: 'Hallo' }), async (calls) => {
    await refusesWith(speechRoute.POST(request({ course: 'de', file: 'nope' })), REFUSED.request);
    await refusesWith(speechRoute.POST(request({ course: 'de', file: file.toUpperCase() })), REFUSED.request);
    await refusesWith(speechRoute.POST(request({ course: 'de', file, lesson: firstLesson.id })), REFUSED.request);
    await refusesWith(speechRoute.POST(request({ course: 'de', file, sentence: firstLesson.sentences[0].id })), REFUSED.request);
    await refusesWith(speechRoute.POST(request({ course: 'de', file, lesson: firstLesson.id, sentence: other.sentences[0].id })), REFUSED.lesson);
    await refusesWith(speechRoute.POST(request({ course: 'de', file, lesson: 'u99-9', sentence: 'u99-9-a' })), REFUSED.lesson);
    await refusesWith(speechRoute.POST(request({ course: 'es', file })), REFUSED.switched);
    assert.equal(calls.length, 0);
  });
});
