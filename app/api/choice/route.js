import { courseReady } from '../../../lib/course/index.js';
import { chooseCourseFor } from '../../../lib/data/learn.js';
import { choiceProblem, REFUSED } from '../../../lib/learn/bounds.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * The person's own language and the language they learn: `{ ownLanguage, course }`.
 * The first press starts the learner; a later one changes either choice. A
 * language started before keeps everything it had.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const { ownLanguage, course } = /** @type {{ ownLanguage?: unknown, course?: unknown }} */ (body.value);
  const problem = choiceProblem(ownLanguage, course);
  if (problem !== null) return refused(problem);
  if (!courseReady(/** @type {string} */ (course))) return refused(REFUSED.course);
  try {
    const learner = await chooseCourseFor(LEARN_OWNER, { ownLanguage: /** @type {string} */ (ownLanguage), course: /** @type {string} */ (course) });
    return json({ learner: { ownLanguage: learner.ownLanguage, course: learner.course } });
  } catch (error) {
    return failed(error);
  }
}
