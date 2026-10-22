import { saveStartFor, startOverFor } from '../../../lib/data/learn.js';
import { REFUSED } from '../../../lib/learn/bounds.js';
import { requireLearner } from '../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * The language being learned.
 *
 *  - `POST { course, start: 'a1' }`: start from the first lesson, without
 *    the test.
 *  - `DELETE { course }`: start this language over. Its lesson results, cards
 *    and study days go, and it waits for a new start; the person's other
 *    languages stay.
 *
 * `course` is the language the page was for; a page left from before a switch
 * of language is refused.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const { course, start } = /** @type {{ course?: unknown, start?: unknown }} */ (body.value);
  if (start !== 'a1') return refused(REFUSED.request);
  try {
    const learner = await requireLearner(course);
    return json(await saveStartFor(LEARN_OWNER, learner.course, { startLevel: 'a1' }));
  } catch (error) {
    return failed(error);
  }
}

/** @param {Request} request */
export async function DELETE(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  try {
    const learner = await requireLearner(/** @type {{ course?: unknown }} */ (body.value).course);
    const { removed } = await startOverFor(LEARN_OWNER, learner.course);
    return json({ removed, course: learner.course });
  } catch (error) {
    return failed(error);
  }
}
