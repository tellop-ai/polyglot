/**
 * Civil days, as small pure functions.
 *
 * A study day is a day on this computer's own calendar, written `YYYY-MM-DD`:
 * it stays that day whatever the clock does. A week runs Monday to Sunday, and
 * a weekday is its ISO number, Monday 1 to Sunday 7. Nothing here imports
 * anything, so the page and the server count days the same way.
 */

const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** @param {number} value @param {number} width */
function padded(value, width) {
  return String(value).padStart(width, '0');
}

/** @param {number} year @param {number} month 1 to 12 */
function daysIn(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Whether a value is a real civil day written `YYYY-MM-DD`, from year 2000 to
 * 2199 (a study day outside that is a clock gone wrong).
 *
 * @param {unknown} value
 */
export function isRealDay(value) {
  const match = typeof value === 'string' ? DAY_SHAPE.exec(value) : null;
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 2000 && year <= 2199 && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
}

/**
 * The day a moment falls on in this computer's own time.
 *
 * @param {Date} moment
 */
export function dayOf(moment) {
  return `${padded(moment.getFullYear(), 4)}-${padded(moment.getMonth() + 1, 2)}-${padded(moment.getDate(), 2)}`;
}

/**
 * A civil day at noon in this computer's own time, so no clock change moves it.
 *
 * @param {string} day a real day
 */
export function noonOf(day) {
  const date = new Date(0);
  date.setFullYear(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  date.setHours(12, 0, 0, 0);
  return date;
}

/**
 * The day `count` days after `day` (before it when negative).
 *
 * @param {string} day a real day
 * @param {number} count a whole number
 */
export function addDays(day, count) {
  const date = noonOf(day);
  date.setDate(date.getDate() + count);
  return dayOf(date);
}

/**
 * The ISO weekday of a day: Monday 1 to Sunday 7.
 *
 * @param {string} day a real day
 */
export function weekdayOf(day) {
  const sunday0 = noonOf(day).getDay();
  return sunday0 === 0 ? 7 : sunday0;
}

/**
 * The seven days of the week a day is in, Monday first.
 *
 * @param {string} day a real day
 * @returns {string[]}
 */
export function weekOf(day) {
  const monday = addDays(day, 1 - weekdayOf(day));
  return Array.from({ length: 7 }, (_, at) => addDays(monday, at));
}
