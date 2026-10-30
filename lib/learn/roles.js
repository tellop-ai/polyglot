/**
 * What each person may press, by the role the host names (`AGENTS.md` rule 1,
 * `currentPerson()` in `lib/data/person.js`). One place for the rule, so every
 * page draws the same controls for the same role.
 *
 * Polyglot keeps one learner's progress, which everyone the owner lets in
 * shares. Online the host refuses every write by a Viewer, and a Member's
 * change or removal of a row the Member did not add; this app cannot tell
 * which rows a Member added. So:
 *
 *  - the owner and a Helper press everything, as on the Mac;
 *  - a Member may add (their own word card, a reading the AI voice keeps, a
 *    recording kept to be written down), but saves no progress (a lesson's
 *    result, a review answer, a start level) and changes no setting, because
 *    each of those changes rows someone else added;
 *  - a Viewer adds, changes and removes nothing: lessons, reviews and the
 *    level test are practice that saves nothing, and the AI voice plays only
 *    readings kept before (each new reading is a kept record), the device's
 *    own voice reading the rest.
 *
 * An unknown role may do nothing. Pure: no store, no host.
 */

/** May this role add a new record? @param {unknown} role */
export function canAdd(role) {
  return role === 'owner' || role === 'helper' || role === 'member';
}

/** May this role change or remove a record someone else added, or a shared setting? @param {unknown} role */
export function canChange(role) {
  return role === 'owner' || role === 'helper';
}

/**
 * Whether lessons ask this role to say a sentence aloud: a recording is kept
 * before it is written down, so only a role that may add one is asked.
 *
 * @param {unknown} role
 * @param {boolean} speaking the learner's saved choice
 */
export function speakingFor(role, speaking) {
  return canAdd(role) && speaking === true;
}
