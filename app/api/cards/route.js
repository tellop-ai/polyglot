import { addOwnCardFor, removeCardFor } from '../../../lib/data/learn.js';
import { isCardKey, readOwnCard, REFUSED } from '../../../lib/learn/bounds.js';
import { requireLearner, trustedToday } from '../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * The word cards of the language being learned.
 *
 *  - `POST { course, front, back, note }`: adds the person's own word, due
 *    today.
 *  - `DELETE { course, card }`: removes one card. One that is not there
 *    answers "already gone", not an error.
 *
 * `course` is the language the page was for; a page left from before a switch
 * of language is refused, so it never touches the other language's cards.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const word = readOwnCard(/** @type {Record<string, unknown>} */ (body.value));
  if (!word.ok) return refused(word.problem);
  try {
    const learner = await requireLearner(/** @type {{ course?: unknown }} */ (body.value).course);
    const card = await addOwnCardFor(LEARN_OWNER, learner.course, { ...word.value, today: trustedToday() });
    return json({ card: { card: card.card, front: card.front, back: card.back, note: card.note } });
  } catch (error) {
    return failed(error);
  }
}

/** @param {Request} request */
export async function DELETE(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const { course, card } = /** @type {{ course?: unknown, card?: unknown }} */ (body.value);
  if (!isCardKey(card)) return refused(REFUSED.card);
  try {
    const learner = await requireLearner(course);
    const { removed } = await removeCardFor(LEARN_OWNER, learner.course, /** @type {string} */ (card));
    return json(removed ? { removed: true } : { removed: false, notice: 'learn.cards.alreadyGone' });
  } catch (error) {
    return failed(error);
  }
}
