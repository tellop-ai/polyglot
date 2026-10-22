/**
 * A practice sentence's part, split into its word and the marks around it.
 *
 * A gap blanks "Haus" and keeps the full stop of "Haus."; a Spanish "¿Cómo"
 * keeps its opening mark. Nothing here imports anything, so the page and the
 * course's checks split parts the same way.
 */

const LEAD = /^[¿¡"'«„“‘([「『]+/u;
const TRAIL = /[.,!?;:"'»”’)\]…。、！？，：；」』]+$/u;

/**
 * @param {string} token
 * @returns {{ lead: string, core: string, trail: string }}
 */
export function splitToken(token) {
  const lead = LEAD.exec(token)?.[0] ?? '';
  const rest = token.slice(lead.length);
  const trail = TRAIL.exec(rest)?.[0] ?? '';
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}
