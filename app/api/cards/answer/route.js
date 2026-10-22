import { answerCardFor } from '../../../../lib/data/learn.js';
import { isCardKey, REFUSED } from '../../../../lib/learn/bounds.js';
import { requireLearner, trustedToday } from '../../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../../lib/learn/reply.js';
import { readJsonBody } from '../../../../lib/learn/request.js';

/**
 * One review answer: `{ course, card, knew }`. The card moves on the review ladder and
 * today counts it. Only a card due today or earlier can be answered.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const { course, card, knew } = /** @type {{ course?: unknown, card?: unknown, knew?: unknown }} */ (body.value);
  if (!isCardKey(card)) return refused(REFUSED.card);
  if (typeof knew !== 'boolean') return refused(REFUSED.request);
  try {
    const learner = await requireLearner(course);
    return json({ answer: await answerCardFor(LEARN_OWNER, learner.course, { card: /** @type {string} */ (card), knew, today: trustedToday() }) });
  } catch (error) {
    return failed(error);
  }
}
