/**
 * A small repeatable shuffle. The same seed always gives the same order, so a
 * level test can be checked on the server from the seed it was made with, and
 * the app's tests can name the order they expect. It is not for secrets.
 */

/** The largest seed, one below 2^31. */
export const MAX_SEED = 2147483647;

/** @param {unknown} value */
export function isSeed(value) {
  return Number.isInteger(value) && /** @type {number} */ (value) >= 1 && /** @type {number} */ (value) <= MAX_SEED;
}

/**
 * A function answering numbers from 0 (included) to 1 (not included).
 *
 * @param {number} seed
 * @returns {() => number}
 */
export function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A shuffled copy.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {() => number} random
 * @returns {T[]}
 */
export function shuffled(items, random) {
  const copy = [...items];
  for (let at = copy.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [copy[at], copy[other]] = [copy[other], copy[at]];
  }
  return copy;
}

/**
 * `count` items picked at random, in random order.
 *
 * @template T
 * @param {readonly T[]} items
 * @param {number} count
 * @param {() => number} random
 * @returns {T[]}
 */
export function pick(items, count, random) {
  return shuffled(items, random).slice(0, count);
}
