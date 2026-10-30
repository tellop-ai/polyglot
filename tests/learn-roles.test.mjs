/**
 * Who may press what: the owner and a Helper everything, a Member adds only,
 * a Viewer nothing (`lib/learn/roles.js`, `AGENTS.md` rule 1). The pages learn
 * the role from the host (`currentPerson()`), never from a request; a host
 * answer they cannot read draws a Viewer's page. A change the host refuses
 * shows "You cannot change this." And the AI voice never sells a reading to a
 * person who could not keep it.
 *
 * The host is a stand-in: its person door (and, for a refused change, its
 * records door) is set on `globalThis` for one check and removed after it.
 * `APP_DATA_FILE` points at a temporary folder, as in `tests/data.test.mjs`.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, afterEach, test } from 'node:test';

const projectRoot = path.join(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'polyglot-roles-'));
const startedIn = process.cwd();
process.chdir(projectRoot);
process.env.APP_DATA_FILE = path.join(scratch, 'app.db');

const { DataError, closeStorage, modelAction } = await import('../lib/data/index.js');
const learn = await import('../lib/data/learn.js');
const { courseView } = await import('../lib/course/index.js');
const { MESSAGES } = await import('../lib/i18n/index.js');
const { LEARN_OWNER } = await import('../lib/learn/owner.js');
const { failed } = await import('../lib/learn/reply.js');
const { canAdd, canChange, speakingFor } = await import('../lib/learn/roles.js');
const { readPerson, readState } = await import('../lib/learn/state.js');
const { AI_VOICE, readingOutcome } = await import('../lib/learn/voice.js');
const choiceRoute = await import('../app/api/choice/route.js');
const cardsRoute = await import('../app/api/cards/route.js');
const soundsRoute = await import('../app/api/sounds/route.js');

const PERSON = Symbol.for('tellop.person');
const ACTION = Symbol.for('tellop.internalRecordsAction');
const priorFlag = process.env.TELLOP_INTERNAL_RECORDS;

afterEach(() => {
  delete globalThis[PERSON];
  delete globalThis[ACTION];
  if (priorFlag === undefined) delete process.env.TELLOP_INTERNAL_RECORDS;
  else process.env.TELLOP_INTERNAL_RECORDS = priorFlag;
});

after(async () => {
  await closeStorage();
  process.chdir(startedIn);
  rmSync(scratch, { recursive: true, force: true });
});

/** A door id of the host's shape for someone other than the owner. */
const SOMEONE = 'p_abcdefghijklmnopqrstuv';

/** The host names this person for the next calls. @param {string} role @param {{ preview?: boolean }} [options] */
function hostSays(role, options = {}) {
  const answer = options.preview ? { id: 'owner', name: null, role, preview: true } : { id: role === 'owner' ? 'owner' : SOMEONE, name: null, role };
  globalThis[PERSON] = async () => answer;
}

/** @param {unknown} body */
function request(body) {
  return new Request('http://app.invalid/address', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** @param {Promise<Response>} sent */
async function answered(sent) {
  const response = await sent;
  return { status: response.status, body: await response.json() };
}

/* ---------- the rule ---------- */

test("each role's presses: the owner and a Helper everything, a Member adds only, a Viewer nothing", () => {
  const rows = [
    ['owner', true, true],
    ['helper', true, true],
    ['member', true, false],
    ['viewer', false, false],
  ];
  for (const [role, adds, changes] of rows) {
    assert.equal(canAdd(role), adds, `${role} adds`);
    assert.equal(canChange(role), changes, `${role} changes`);
  }
  // A role the host never names may do nothing.
  for (const role of ['', 'Owner', 'admin', undefined, null, ['owner']]) {
    assert.equal(canAdd(role), false, String(role));
    assert.equal(canChange(role), false, String(role));
  }
});

test("a Viewer is never asked to speak; the others keep the learner's choice", () => {
  for (const role of ['owner', 'helper', 'member']) {
    assert.equal(speakingFor(role, true), true, role);
    assert.equal(speakingFor(role, false), false, role);
  }
  assert.equal(speakingFor('viewer', true), false);
  assert.equal(speakingFor('viewer', false), false);
  assert.equal(speakingFor('someone', true), false);
});

test("a Listen press plays a kept reading, reads quietly with the device's voice where this person may not keep one, and names any other refusal", () => {
  const key = 'a'.repeat(64);
  assert.deepEqual(readingOutcome({ ok: true, value: { sound: key } }), { play: key });
  // A reading this person may not keep (a Viewer's new text): the device reads that one text, and nothing is said.
  assert.deepEqual(readingOutcome({ ok: false, problem: 'error.cannotChange' }), { quiet: true });
  // A busy AI may answer the next press; any other refusal waits until the page opens again.
  assert.deepEqual(readingOutcome({ ok: false, problem: 'ai.busy' }), { problem: 'ai.busy', stop: false });
  assert.deepEqual(readingOutcome({ ok: false, problem: 'ai.allowance' }), { problem: 'ai.allowance', stop: true });
  assert.deepEqual(readingOutcome({ ok: false, problem: 'learn.voice.notKept' }), { problem: 'learn.voice.notKept', stop: true });
  // A request that never answered, or answered no reading, is not a failed save: the AI voice was not available.
  assert.deepEqual(readingOutcome({ ok: false, problem: 'error.saveUnconfirmed' }), { problem: 'ai.unavailable', stop: true });
  assert.deepEqual(readingOutcome({ ok: true, value: {} }), { problem: 'ai.unavailable', stop: true });
  assert.deepEqual(readingOutcome({ ok: true, value: { sound: 7 } }), { problem: 'ai.unavailable', stop: true });
});

/* ---------- who the pages draw for ---------- */

test('the pages learn the role from the host, and a host answer they cannot read draws a Viewer\'s page', async () => {
  // Outside Tellop the one person is the owner.
  assert.deepEqual(await readPerson(), { role: 'owner', preview: false, problem: '' });
  for (const role of ['owner', 'helper', 'member', 'viewer']) {
    hostSays(role);
    assert.deepEqual(await readPerson(), { role, preview: false, problem: '' }, role);
  }
  // The owner looking as a Member or a Viewer: that role, and the way back drawn.
  hostSays('member', { preview: true });
  assert.deepEqual(await readPerson(), { role: 'member', preview: true, problem: '' });
  hostSays('viewer', { preview: true });
  assert.deepEqual(await readPerson(), { role: 'viewer', preview: true, problem: '' });
  // A door that fails, or answers another shape, is never read as the owner, and the page says it could not read it.
  const unread = { role: 'viewer', preview: false, problem: 'error.storageUnreadable' };
  globalThis[PERSON] = async () => { throw new Error('door down'); };
  assert.deepEqual(await readPerson(), unread);
  globalThis[PERSON] = async () => ({ id: 'owner', role: 'owner' });
  assert.deepEqual(await readPerson(), unread);
  globalThis[PERSON] = async () => ({ id: SOMEONE, name: null, role: 'owner' });
  assert.deepEqual(await readPerson(), unread);
});

test('a page whose person cannot be read shows that first, as a failed learner read is shown, and reads nothing more', async () => {
  const chosen = await choiceRoute.POST(request({ ownLanguage: 'tr', course: 'de' }));
  assert.equal(chosen.status, 200);
  try {
    hostSays('owner');
    const read = await readState();
    assert.deepEqual([read.problem, read.learner?.course, read.person.role], ['', 'de', 'owner']);
    globalThis[PERSON] = async () => { throw new Error('door down'); };
    const state = await readState();
    assert.equal(state.problem, 'error.storageUnreadable');
    assert.equal(state.learner, null);
    assert.equal(state.view, null);
    assert.deepEqual(state.person, { role: 'viewer', preview: false, problem: 'error.storageUnreadable' });
    for (const language of ['en', 'tr']) assert.equal(typeof MESSAGES[language]['error.storageUnreadable'], 'string');
  } finally {
    await modelAction('Learner', 'deleteMany', { where: { ownerId: LEARN_OWNER } });
  }
});

test('a language that cannot open sends only a role that may change the settings to Settings', async () => {
  const at = new Date().toISOString();
  // A learner whose language learned is their own language: no course view.
  await modelAction('Learner', 'create', { data: { ownerId: LEARN_OWNER, ownLanguage: 'tr', course: 'tr', createdAt: at, updatedAt: at } });
  try {
    for (const [role, problem] of [['owner', 'learn.notOffered'], ['helper', 'learn.notOffered'], ['member', 'learn.notOfferedView'], ['viewer', 'learn.notOfferedView']]) {
      hostSays(role);
      const state = await readState();
      assert.equal(state.view, null, role);
      assert.equal(state.person.role, role);
      assert.equal(state.problem, problem, role);
    }
  } finally {
    await modelAction('Learner', 'deleteMany', { where: { ownerId: LEARN_OWNER } });
  }
  for (const language of ['en', 'tr']) assert.equal(typeof MESSAGES[language]['learn.notOfferedView'], 'string');
});

/* ---------- a refused change ---------- */

test('a change the host refuses this person answers "You cannot change this." with 403, never "could not save"', async () => {
  const refusal = await answered(Promise.resolve(failed(new DataError('error.cannotChange'))));
  assert.deepEqual([refusal.status, refusal.body], [403, { problem: 'error.cannotChange' }]);
  assert.equal((await answered(Promise.resolve(failed(new DataError('error.saveUnconfirmed'))))).status, 503);
  assert.equal((await answered(Promise.resolve(failed(new DataError('error.saveFailed'))))).status, 400);
  assert.equal((await answered(Promise.resolve(failed(new DataError('constructor'))))).status, 400);
  assert.equal(MESSAGES.en['error.cannotChange'], 'You cannot change this.');
  assert.equal(MESSAGES.tr['error.cannotChange'], 'Bunu değiştiremezsiniz.');

  // Online, a Viewer's own word: the host reads the learner, then refuses the save.
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  hostSays('viewer');
  const at = new Date().toISOString();
  const learner = {
    ownLanguage: 'tr', course: 'de', studyDays: '1,2,3,4,5', voiceSpeed: 'normal', createdAt: at, updatedAt: at,
    lessonsPerDay: 1, cardsPerDay: 20, readAloud: true, readWith: 'ai', speaking: true,
  };
  const writes = [];
  globalThis[ACTION] = async (steps) => {
    if (steps.some((step) => !['findUnique', 'findFirst', 'findMany', 'count'].includes(step.action))) {
      writes.push(...steps);
      throw new Error('records-forbidden');
    }
    return steps.map((step) => (step.model === 'Learner' ? learner : step.action === 'count' ? 0 : null));
  };
  const added = await answered(cardsRoute.POST(request({ course: 'de', front: 'der Hund', back: 'köpek', note: '' })));
  assert.deepEqual([added.status, added.body], [403, { problem: 'error.cannotChange' }]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].model, 'WordCard');
});

/* ---------- the AI voice ---------- */

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x64, ...new Array(64).fill(0)]);
const AI_SETTINGS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_MODEL_SPEECH'];

/** Runs `check` with AI reading aloud outside Tellop, counting the calls. @param {(calls: string[]) => Promise<void>} check */
async function withVoice(check) {
  const kept = Object.fromEntries(AI_SETTINGS.map((name) => [name, process.env[name]]));
  const realFetch = globalThis.fetch;
  const calls = [];
  for (const name of AI_SETTINGS) delete process.env[name];
  process.env.AI_BASE_URL = 'http://ai.test.invalid/v1';
  process.env.AI_MODEL_SPEECH = 'model-for-speech';
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(MP3, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
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

test('a Viewer is never sold a reading it could not keep, and still hears one kept; a Member and the owner keep theirs', async () => {
  const chosen = await choiceRoute.POST(request({ ownLanguage: 'tr', course: 'de' }));
  assert.equal(chosen.status, 200);
  const words = courseView('de', 'tr').lessons[0].words;
  const [first, second] = [words[0].text, words[1].text];
  const key = async (text) => (await import('node:crypto')).createHash('sha256').update(text, 'utf8').digest('hex');
  await withVoice(async (calls) => {
    hostSays('viewer');
    const refused = await answered(soundsRoute.POST(request({ course: 'de', text: first })));
    assert.deepEqual([refused.status, refused.body, calls.length], [403, { problem: 'error.cannotChange' }, 0]);
    assert.equal(await learn.readSoundFor(LEARN_OWNER, 'de', AI_VOICE, await key(first)), null);

    hostSays('member');
    const bought = await answered(soundsRoute.POST(request({ course: 'de', text: first })));
    assert.deepEqual([bought.status, bought.body, calls.length], [200, { sound: await key(first) }, 1]);

    hostSays('viewer');
    const kept = await answered(soundsRoute.POST(request({ course: 'de', text: first })));
    assert.deepEqual([kept.status, kept.body, calls.length], [200, { sound: await key(first) }, 1]);

    delete globalThis[PERSON];
    const owner = await answered(soundsRoute.POST(request({ course: 'de', text: second })));
    assert.deepEqual([owner.status, owner.body, calls.length], [200, { sound: await key(second) }, 2]);
  });
});
