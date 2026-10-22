import { saveSettingsFor, saveVoiceFor } from '../../../lib/data/learn.js';
import { readSettings, voiceProblem } from '../../../lib/learn/bounds.js';
import { requireLearner } from '../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * The learner's settings: `{ course, studyDays?, lessonsPerDay?,
 * cardsPerDay?, readAloud?, voiceSpeed?, readWith?, speaking?, voice? }`. Only the fields sent
 * change. `voice` is the accent of the language being learned and belongs to
 * that language; `course` is the language the page was for, and a page left
 * from before a switch of language is refused.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const asked = /** @type {Record<string, unknown>} */ (body.value);
  const settings = readSettings(asked);
  if (!settings.ok) return refused(settings.problem);
  try {
    const learner = await requireLearner(asked.course);
    if (asked.voice !== undefined) {
      const problem = voiceProblem(learner.course, asked.voice);
      if (problem !== null) return refused(problem);
    }
    let saved = learner;
    if (Object.keys(settings.value).length > 0) saved = await saveSettingsFor(LEARN_OWNER, settings.value);
    const voice = asked.voice === undefined ? undefined : (await saveVoiceFor(LEARN_OWNER, learner.course, /** @type {string} */ (asked.voice))).voice;
    return json({
      settings: {
        studyDays: saved.studyDays,
        lessonsPerDay: saved.lessonsPerDay,
        cardsPerDay: saved.cardsPerDay,
        readAloud: saved.readAloud,
        voiceSpeed: saved.voiceSpeed,
        readWith: saved.readWith,
        speaking: saved.speaking,
        ...(voice === undefined ? {} : { voice }),
      },
    });
  } catch (error) {
    return failed(error);
  }
}
