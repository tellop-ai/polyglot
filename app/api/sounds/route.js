import { createHash } from 'node:crypto';

import { AiProblem, speak } from '../../../lib/ai.js';
import { courseTexts, courseView } from '../../../lib/course/index.js';
import { DataError } from '../../../lib/data/index.js';
import { fileResponse } from '../../../lib/data/files.js';
import { readSoundFor, roomForSoundFor, saveSoundFor } from '../../../lib/data/learn.js';
import { currentPerson } from '../../../lib/data/person.js';
import { REFUSED } from '../../../lib/learn/bounds.js';
import { requireLearner } from '../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';
import { canAdd } from '../../../lib/learn/roles.js';
import { AI_VOICE, readSpokenText } from '../../../lib/learn/voice.js';

/**
 * The AI voice, on the person's AI allowance inside Tellop.
 *
 * POST `{ course, text }`, sent by a press on Listen (or a listening exercise
 * opening): the text is read aloud once by AI through the kit's helper and the
 * reading kept, then the answer is `{ sound }`, the text's key. A text read
 * before is never bought again. The course's own words and sentences are kept
 * without a count; anything else (an AI practice answer, a person's own card)
 * at most `VOICE_LIMITS.practiceSounds` for each language. A refusal from AI
 * answers the kit's words for it, and the page then reads with this Mac's
 * voice; nothing is retried here. A reading is a new record, so a person who
 * may add none (a Viewer online) is never sold one: a text not kept yet
 * answers "You cannot change this." before AI is asked, and a kept one still
 * plays. The page then reads that one text with the device's own voice,
 * quietly (`readingOutcome` in `lib/learn/voice.js`).
 *
 * GET `?course=..&sound=..` plays a kept reading, after its owner's row is read
 * (kit rule 1a). `course` is the language the page was for, as everywhere.
 */
export const dynamic = 'force-dynamic';

/** @param {string} text */
function keyOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const asked = /** @type {{ course?: unknown, text?: unknown }} */ (body.value);
  const text = readSpokenText(asked.text);
  if (text === null) return refused(REFUSED.request);
  const textKey = keyOf(text);
  let learner;
  let kind;
  try {
    learner = await requireLearner(asked.course);
    if ((await readSoundFor(LEARN_OWNER, learner.course, AI_VOICE, textKey)) !== null) return json({ sound: textKey });
    const view = courseView(learner.course, learner.ownLanguage);
    // Asked only when AI would be: one who may add no record could not keep what AI read.
    if (!canAdd((await currentPerson()).role)) return json({ problem: 'error.cannotChange' }, 403);
    kind = view !== null && courseTexts(view).has(text) ? 'course' : 'other';
    if (kind === 'other' && !(await roomForSoundFor(LEARN_OWNER, learner.course))) return json({ problem: REFUSED.sounds }, 409);
  } catch (error) {
    return failed(error);
  }
  let spoken;
  try {
    spoken = await speak({ text, voice: AI_VOICE });
  } catch (error) {
    if (error instanceof AiProblem) return json({ problem: error.wordsKey, retry: error.state === 'busy' }, 503);
    return json({ problem: 'ai.unavailable' }, 503);
  }
  try {
    await saveSoundFor(LEARN_OWNER, learner.course, { voice: AI_VOICE, textKey, kind, soundFile: spoken.file });
    return json({ sound: textKey });
  } catch (error) {
    // The host refused this person the keep: its own words.
    if (error instanceof DataError && error.messageKey === 'error.cannotChange') return failed(error);
    // AI read it and it was paid for, but it could not be kept: say so, rather than that AI is not available.
    return json({ problem: 'learn.voice.notKept' }, 500);
  }
}

/** @param {Request} request */
export async function GET(request) {
  const url = new URL(request.url);
  try {
    const learner = await requireLearner(url.searchParams.get('course'));
    const sound = await readSoundFor(LEARN_OWNER, learner.course, AI_VOICE, url.searchParams.get('sound'));
    if (sound === null) return json({ problem: REFUSED.request }, 404);
    return await fileResponse(sound.soundFile, request);
  } catch (error) {
    return failed(error);
  }
}

/** @param {Request} request */
export async function HEAD(request) {
  return GET(request);
}
