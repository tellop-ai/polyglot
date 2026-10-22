/**
 * What every press checks before it saves. Server code only.
 */

import { DataError } from '../data/index.js';
import { readLearnerFor } from '../data/learn.js';

import { REFUSED } from './bounds.js';
import { dayOf, isRealDay } from './days.js';
import { LEARN_OWNER } from './owner.js';

/**
 * The learner as a press needs them: saved, and still learning the language
 * the page that sent the press was for. A page left open in another window
 * after a switch of language is refused, so it can never save into, or remove
 * from, the language the person switched to.
 *
 * @param {unknown} course the language the page was for, as the press sent it
 */
export async function requireLearner(course) {
  const learner = await readLearnerFor(LEARN_OWNER);
  if (learner === null) throw new DataError(REFUSED.notStarted);
  if (typeof course !== 'string' || course !== learner.course) throw new DataError(REFUSED.switched);
  return learner;
}

/**
 * Today on this device, refused when the clock is far outside any real study
 * day, so a wrong date never lands in the study days.
 *
 * @param {Date} [now]
 */
export function trustedToday(now = new Date()) {
  const today = dayOf(now);
  if (!isRealDay(today)) throw new DataError(REFUSED.clock);
  return today;
}
