/**
 * What every page reads first: who is using the app, today, the learner, their
 * own language, the language they learn and its course. Server code only. It
 * only reads: nothing is saved while a page opens.
 */

import { courseView } from '../course/index.js';
import { DataError } from '../data/index.js';
import { readCourseFor, readLearnerFor } from '../data/learn.js';
import { currentPerson } from '../data/person.js';
import { getLocale } from '../i18n/index.js';

import { dayOf } from './days.js';
import { LEARN_OWNER } from './owner.js';
import { canChange } from './roles.js';

/** @param {unknown} error */
export function problemOf(error) {
  return error instanceof DataError ? error.messageKey : 'error.storageUnreadable';
}

/**
 * Who is using the app, as the pages need it: their role and whether the
 * owner is looking at the app in a lower role (`preview`). When the host's
 * answer cannot be read, the role is a Viewer's (nothing that changes
 * anything is drawn) rather than a guess at the owner, and `problem` names
 * the failure, which the page shows first (`readState`).
 *
 * @returns {Promise<{ role: string, preview: boolean, problem: string }>}
 */
export async function readPerson() {
  try {
    const person = await currentPerson();
    return { role: person.role, preview: person.preview === true, problem: '' };
  } catch (error) {
    return { role: 'viewer', preview: false, problem: problemOf(error) };
  }
}

/**
 * @param {{ now?: () => Date }} [options]
 */
export async function readState(options = {}) {
  const today = dayOf(options.now?.() ?? new Date());
  // One call at a time: the person first, then the learner and the course.
  const person = await readPerson();
  // A person who cannot be read is shown as a learner who cannot be read is, and nothing more is read.
  if (person.problem !== '') return { today, person, learner: null, own: getLocale(), view: null, course: null, problem: person.problem };
  try {
    const learner = await readLearnerFor(LEARN_OWNER);
    if (learner === null) return { today, person, learner: null, own: getLocale(), view: null, course: null, problem: '' };
    const own = learner.ownLanguage === 'tr' || learner.ownLanguage === 'en' ? learner.ownLanguage : getLocale();
    const view = courseView(learner.course, own);
    const course = view === null ? null : await readCourseFor(LEARN_OWNER, learner.course);
    // Only a role that may change the settings is sent to Settings to choose another language.
    const notOffered = canChange(person.role) ? 'learn.notOffered' : 'learn.notOfferedView';
    return { today, person, learner, own, view, course, problem: view === null ? notOffered : '' };
  } catch (error) {
    return { today, person, learner: null, own: getLocale(), view: null, course: null, problem: problemOf(error) };
  }
}
