/**
 * How this app's addresses answer.
 *
 * **Sharing with other websites is off, and it is off by omission.** No answer
 * carries `Access-Control-Allow-Origin`, so a browser refuses to hand this
 * app's answers to a page on another site. Refusals travel as message keys,
 * never as sentences: the words are chosen in the reader's language where they
 * are shown.
 */

import { DataError } from '../data/index.js';

import { REFUSED } from './bounds.js';

/**
 * @param {unknown} body
 * @param {number} [status]
 */
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/** @param {string} problem */
export function refused(problem) {
  return json({ problem }, problem === REFUSED.long ? 413 : 400);
}

/** How a refusal answers, by its message key; any other is 400. */
const STATUS = Object.freeze({ 'error.saveUnconfirmed': 503, 'error.cannotChange': 403 });

/**
 * A refused press: its own words, such as "You cannot change this." when the
 * host refused this person the change (`error.cannotChange`), never a generic
 * failure.
 *
 * @param {unknown} error
 */
export function failed(error) {
  if (error instanceof DataError) return json({ problem: error.messageKey }, Object.hasOwn(STATUS, error.messageKey) ? STATUS[error.messageKey] : 400);
  return json({ problem: 'error.saveFailed' }, 500);
}
