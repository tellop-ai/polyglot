/**
 * The review ladder for word cards, built in.
 *
 * A card stands on a step from 1 to 7. Each step has a wait: how many days
 * pass before the card comes back. "I knew it" moves the card one step up (the
 * top step stays the top) and sets its next day by the new step's wait. "I
 * didn't know" puts it back on step 1, so it comes back the next day. A card is
 * "known well" from step 5 on, when it waits two weeks or more.
 */

import { addDays } from './days.js';

/** The days a card waits on each step, step 1 first. */
export const WAITS = Object.freeze([1, 2, 4, 7, 15, 30, 60]);

export const FIRST_STEP = 1;
export const TOP_STEP = WAITS.length;

/** The first step at which a card counts as known well. */
export const KNOWN_STEP = 5;

/** @param {unknown} step */
export function isStep(step) {
  return Number.isInteger(step) && /** @type {number} */ (step) >= FIRST_STEP && /** @type {number} */ (step) <= TOP_STEP;
}

/**
 * Where a card goes after an answer.
 *
 * @param {number} step the card's step now, 1 to 7
 * @param {boolean} knew
 * @param {string} today a real day
 * @returns {{ step: number, dueDay: string }}
 */
export function afterAnswer(step, knew, today) {
  const next = knew ? Math.min(Math.max(step, FIRST_STEP) + 1, TOP_STEP) : FIRST_STEP;
  return { step: next, dueDay: addDays(today, WAITS[next - 1]) };
}

/** @param {number} step */
export function isKnownWell(step) {
  return step >= KNOWN_STEP;
}
