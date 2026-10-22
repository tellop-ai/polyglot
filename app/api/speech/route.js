import { AiProblem, transcribe } from '../../../lib/ai.js';
import { courseView, lessonOf } from '../../../lib/course/index.js';
import { REFUSED } from '../../../lib/learn/bounds.js';
import { requireLearner } from '../../../lib/learn/learner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';
import { heardText, matchHeard, spokenLanguage } from '../../../lib/learn/voice.js';

/**
 * What the person said, written down: `{ course, file, lesson?, sentence? }`,
 * sent after their Stop press, once the page kept the recording (`sendFile`,
 * kit rule 6c). AI writes it down in the language learned, through the kit's
 * helper on the person's allowance inside Tellop. For a sentence of a lesson
 * the answer is `{ heard, right }`, compared here with the sentence itself
 * (never with words the page sends); otherwise `{ heard }`, which the page
 * puts in its box and never sends on its own. Nothing is saved here.
 */
export const dynamic = 'force-dynamic';

const DIGEST = /^[0-9a-f]{64}$/u;

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const asked = /** @type {{ course?: unknown, file?: unknown, lesson?: unknown, sentence?: unknown }} */ (body.value);
  if (typeof asked.file !== 'string' || !DIGEST.test(asked.file)) return refused(REFUSED.request);
  if ((asked.lesson === undefined) !== (asked.sentence === undefined)) return refused(REFUSED.request);
  let learner;
  let expected = null;
  try {
    learner = await requireLearner(asked.course);
    if (asked.lesson !== undefined) {
      const view = courseView(learner.course, learner.ownLanguage);
      const found = view === null ? null : lessonOf(view, asked.lesson);
      const sentence = found?.lesson.sentences.find((item) => item.id === asked.sentence);
      if (sentence === undefined) return refused(REFUSED.lesson);
      expected = sentence.text;
    }
  } catch (error) {
    return failed(error);
  }
  let written;
  try {
    written = await transcribe({ file: asked.file, language: spokenLanguage(learner.course) });
  } catch (error) {
    if (error instanceof AiProblem) return json({ problem: error.wordsKey, retry: error.state === 'busy' }, 503);
    return json({ problem: 'ai.unavailable' }, 503);
  }
  const heard = heardText(written?.text);
  if (expected === null) return json({ heard });
  return json({ heard, right: matchHeard(expected, heard, learner.course).right });
}
