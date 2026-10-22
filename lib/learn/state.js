/**
 * What every page reads first: today, the learner, their own language, the
 * language they learn and its course. Server code only. It only reads:
 * nothing is saved while a page opens.
 */

import { courseView } from '../course/index.js';
import { DataError } from '../data/index.js';
import { readCourseFor, readLearnerFor } from '../data/learn.js';
import { getLocale } from '../i18n/index.js';

import { dayOf } from './days.js';
import { LEARN_OWNER } from './owner.js';

/** @param {unknown} error */
export function problemOf(error) {
  return error instanceof DataError ? error.messageKey : 'error.storageUnreadable';
}

/**
 * @param {{ now?: () => Date }} [options]
 */
export async function readState(options = {}) {
  const today = dayOf(options.now?.() ?? new Date());
  try {
    const learner = await readLearnerFor(LEARN_OWNER);
    if (learner === null) return { today, learner: null, own: getLocale(), view: null, course: null, problem: '' };
    const own = learner.ownLanguage === 'tr' || learner.ownLanguage === 'en' ? learner.ownLanguage : getLocale();
    const view = courseView(learner.course, own);
    const course = view === null ? null : await readCourseFor(LEARN_OWNER, learner.course);
    return { today, learner, own, view, course, problem: view === null ? 'learn.notOffered' : '' };
  } catch (error) {
    return { today, learner: null, own: getLocale(), view: null, course: null, problem: problemOf(error) };
  }
}
