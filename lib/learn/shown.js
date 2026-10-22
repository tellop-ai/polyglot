/**
 * Days and names as a person reads them, in their own language.
 *
 * Weekday and month names come from the date library's own English and Turkish
 * words, which the kit already carries; only the order of the parts is chosen
 * here. A language's name comes from the locale files.
 */

import { format } from 'date-fns';
import { enUS, tr } from 'date-fns/locale';

import { t } from '../i18n/index.js';

import { noonOf } from './days.js';

const DATE_LANGUAGES = Object.freeze({ en: enUS, tr });

/** @param {string} own */
function chosen(own) {
  return own === 'tr' ? 'tr' : 'en';
}

/**
 * "Mon" or "Pzt".
 *
 * @param {string} day a real day
 * @param {string} own
 */
export function weekdayShort(day, own) {
  return format(noonOf(day), 'EEE', { locale: DATE_LANGUAGES[chosen(own)] });
}

/**
 * "Monday" or "Pazartesi".
 *
 * @param {string} day a real day
 * @param {string} own
 */
export function weekdayLong(day, own) {
  return format(noonOf(day), 'EEEE', { locale: DATE_LANGUAGES[chosen(own)] });
}

/**
 * "21 October" or "21 Ekim".
 *
 * @param {string} day a real day
 * @param {string} own
 */
export function dayAndMonth(day, own) {
  return format(noonOf(day), chosen(own) === 'tr' ? 'd MMMM' : 'MMMM d', { locale: DATE_LANGUAGES[chosen(own)] });
}

/**
 * A day as a date, with its year only when it is not this year's.
 *
 * @param {string} day
 * @param {string} today
 * @param {string} own
 */
export function dateFrom(day, today, own) {
  if (day.slice(0, 4) === today.slice(0, 4)) return dayAndMonth(day, own);
  return format(noonOf(day), chosen(own) === 'tr' ? 'd MMMM yyyy' : 'MMMM d, yyyy', { locale: DATE_LANGUAGES[chosen(own)] });
}

/**
 * A weekday's name by its ISO number (Monday 1).
 *
 * @param {number} weekday
 * @param {string} own
 */
export function weekdayName(weekday, own) {
  // 2026-10-19 was a Monday.
  return weekdayLong(`2026-10-${String(18 + weekday).padStart(2, '0')}`, own);
}

/**
 * The language learned, named in the person's own language ("German", "Almanca").
 *
 * @param {string} code
 * @param {string} own
 */
export function languageName(code, own) {
  return t(`learn.lang.${code}`, own);
}

/**
 * The language's name in itself ("Deutsch").
 *
 * @param {string} code
 */
export function languageOwnName(code) {
  return t(`learn.ownName.${code}`, 'en');
}

/**
 * A level's name: "A1 · Beginner".
 *
 * @param {string} level `a1` or `a2`
 * @param {string} own
 */
export function levelName(level, own) {
  return t(level === 'a2' ? 'learn.level.a2' : 'learn.level.a1', own);
}
