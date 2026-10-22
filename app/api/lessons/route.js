import { courseView, lessonOf } from '../../../lib/course/index.js';
import { saveLessonFor } from '../../../lib/data/learn.js';
import { isAttemptKey, REFUSED, scoreProblem } from '../../../lib/learn/bounds.js';
import { lessonTotal } from '../../../lib/learn/exercises.js';
import { requireLearner, trustedToday } from '../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * A finished lesson: `{ course, lesson, attempt, right, total }`. Saves its
 * result, counts today as a study day and adds its words to the word cards,
 * in one step. `attempt` is the code the lesson page made for this run, so
 * the same run sent twice counts once and answers the result saved first.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const { course, lesson, attempt, right, total } = /** @type {Record<string, unknown>} */ (body.value);
  if (!isAttemptKey(attempt)) return refused(REFUSED.request);
  try {
    const learner = await requireLearner(course);
    const today = trustedToday();
    const view = courseView(learner.course, learner.ownLanguage);
    if (view === null) return refused(REFUSED.course);
    const found = lessonOf(view, lesson);
    if (found === null) return refused(REFUSED.lesson);
    const problem = scoreProblem(right, total, lessonTotal(found.lesson));
    if (problem !== null) return refused(problem);
    const saved = await saveLessonFor(LEARN_OWNER, learner.course, {
      lesson: found.lesson.id,
      attempt: /** @type {string} */ (attempt),
      wordIds: found.lesson.words.map((word) => word.id),
      right: /** @type {number} */ (right),
      total: /** @type {number} */ (total),
      today,
    });
    return json({ result: { lesson: saved.lesson, bestRight: saved.bestRight, lastRight: saved.lastRight, total: saved.total, times: saved.times } });
  } catch (error) {
    return failed(error);
  }
}
