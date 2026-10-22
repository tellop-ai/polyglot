/**
 * The languages of this course, built in.
 *
 * A person's own language is one the app's screens are written in (Turkish or
 * English): the screens, the meanings and the tips come in it. The language
 * they learn is one of ten, never their own. Nothing here imports anything, so
 * the page and the server read the same table.
 *
 *  - `voices`: the speech languages the Mac's own voices are asked for, the
 *    first one by default. English offers two accents.
 *  - `joiner`: what stands between the parts of a practice sentence. Japanese
 *    and Chinese write a sentence with no spaces.
 *  - `roman`: the language is written in its own script, so every word and
 *    sentence also shows its sound in Latin letters, and nothing asks the
 *    person to type it.
 *  - `letters`: the letters a person may not have on their keyboard, offered
 *    as presses under a typing box.
 */

/** The languages the screens are written in. */
export const OWN_LANGUAGES = Object.freeze(['tr', 'en']);

/** @typedef {{ code: string, voices: readonly string[], joiner: string, roman: boolean, letters: readonly string[] }} Language */

/** @type {readonly Language[]} */
export const LANGUAGES = Object.freeze(
  [
    { code: 'en', voices: ['en-US', 'en-GB'], joiner: ' ', roman: false, letters: [] },
    { code: 'tr', voices: ['tr-TR'], joiner: ' ', roman: false, letters: ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü'] },
    { code: 'es', voices: ['es-ES'], joiner: ' ', roman: false, letters: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'] },
    { code: 'de', voices: ['de-DE'], joiner: ' ', roman: false, letters: ['ä', 'ö', 'ü', 'ß'] },
    { code: 'fr', voices: ['fr-FR'], joiner: ' ', roman: false, letters: ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ù', 'û', 'œ'] },
    { code: 'it', voices: ['it-IT'], joiner: ' ', roman: false, letters: ['à', 'è', 'é', 'ì', 'ò', 'ù'] },
    { code: 'pt', voices: ['pt-BR'], joiner: ' ', roman: false, letters: ['á', 'â', 'ã', 'à', 'ç', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú'] },
    { code: 'ja', voices: ['ja-JP'], joiner: '', roman: true, letters: [] },
    { code: 'ko', voices: ['ko-KR'], joiner: ' ', roman: true, letters: [] },
    { code: 'zh', voices: ['zh-CN'], joiner: '', roman: true, letters: [] },
  ].map((language) => Object.freeze({ ...language, voices: Object.freeze(language.voices), letters: Object.freeze(language.letters) })),
);

/** The language codes a person can learn, in the order the choice shows them. */
export const COURSES = Object.freeze(LANGUAGES.map((language) => language.code));

/**
 * @param {unknown} code
 * @returns {Language | null}
 */
export function languageOf(code) {
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

/** @param {unknown} code */
export function isOwnLanguage(code) {
  return typeof code === 'string' && OWN_LANGUAGES.includes(code);
}

/** @param {unknown} code */
export function isCourse(code) {
  return typeof code === 'string' && COURSES.includes(code);
}

/**
 * Whether a person whose own language is `own` can learn `course`: any of the
 * ten except their own.
 *
 * @param {unknown} own
 * @param {unknown} course
 */
export function canLearn(own, course) {
  return isOwnLanguage(own) && isCourse(course) && own !== course;
}

/**
 * The speech language for a course: the saved accent when the course offers
 * it, else the course's first.
 *
 * @param {string} course
 * @param {unknown} saved
 * @returns {string}
 */
export function voiceFor(course, saved) {
  const language = languageOf(course);
  if (language === null) return 'en-US';
  return typeof saved === 'string' && language.voices.includes(saved) ? saved : language.voices[0];
}
