import { courseView } from '../../../lib/course/index.js';
import { saveStartFor } from '../../../lib/data/learn.js';
import { REFUSED } from '../../../lib/learn/bounds.js';
import { requireLearner } from '../../../lib/learn/learner.js';
import { makeTest, scoreTest } from '../../../lib/learn/placement.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { isSeed } from '../../../lib/learn/random.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * Counts a level test: `{ course, seed, answers, save?, start? }`.
 *
 * The test is made again here from its seed, so the count is always this
 * app's own. Without `save` it only answers the count (after the A1 part it
 * says whether the test goes on). With `save: true` on a finished test it
 * saves where the course starts: the suggested level, or the first lesson
 * when `start` is `'a1'`.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const { course, seed, answers, save, start } = /** @type {Record<string, unknown>} */ (body.value);
  if (!isSeed(seed)) return refused(REFUSED.test);
  if (save !== undefined && typeof save !== 'boolean') return refused(REFUSED.request);
  if (start !== undefined && start !== 'a1' && start !== 'suggested') return refused(REFUSED.request);
  try {
    const learner = await requireLearner(course);
    const view = courseView(learner.course, learner.ownLanguage);
    if (view === null) return refused(REFUSED.course);
    const result = scoreTest(makeTest(view, /** @type {number} */ (seed)), answers);
    if (result === null) return refused(REFUSED.test);
    if (save !== true) return json({ result });
    if (!result.complete) return refused(REFUSED.test);
    const startLevel = start === 'a1' ? 'a1' : result.start;
    const saved = await saveStartFor(LEARN_OWNER, learner.course, { startLevel, testRight: result.right, testTotal: result.total });
    return json({ result, startLevel: saved.startLevel });
  } catch (error) {
    return failed(error);
  }
}
