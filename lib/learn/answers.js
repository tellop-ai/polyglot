/**
 * Whether a typed answer matches, as small pure functions.
 *
 * Capital letters, spaces at the ends or doubled, a full stop or question mark
 * at the end, Spanish opening marks and curly or straight apostrophes never
 * count. Accents are kinder: an answer right in every letter but its accents
 * (`cafe` for `café`, `kus` for `kuş`) counts as right, and the lesson shows the
 * right spelling, because many keyboards do not have those letters. German may
 * also be typed with its usual stand-ins (`schoen` for `schön`, `Strasse` for
 * `Straße`). A noun typed without its article (`Name` for `der Name`) counts
 * too, and the lesson shows it with the article; a wrong article does not.
 */

const APOSTROPHES = /[‘’ʼ`´]/gu;

/**
 * The articles each language writes before a noun in this course, as `tidy`
 * leaves them. One ending in an apostrophe joins its noun with no space.
 */
const ARTICLES = Object.freeze({
  de: Object.freeze(['der', 'die', 'das']),
  es: Object.freeze(['el', 'la', 'los', 'las']),
  fr: Object.freeze(['le', 'la', 'les', "l'"]),
  it: Object.freeze(['il', 'lo', 'la', 'i', 'gli', 'le', "l'"]),
  pt: Object.freeze(['o', 'a', 'os', 'as']),
});

/**
 * An answer as it is compared.
 *
 * @param {string} text
 * @param {string} code the language the answer is in
 */
export function tidy(text, code) {
  let value = text.normalize('NFC').replace(APOSTROPHES, "'");
  if (code !== 'tr') value = value.replace(/İ/gu, 'I').replace(/ı/gu, 'i');
  value = code === 'tr' ? value.toLocaleLowerCase('tr') : value.toLowerCase();
  return value
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[¿¡]+/u, '')
    .replace(/[.!?。！？]+$/u, '')
    .trim();
}

/**
 * An answer with its accents taken off.
 *
 * @param {string} text a tidied answer
 */
export function plain(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/gu, 'i')
    .replace(/ß/gu, 'ss')
    .replace(/œ/gu, 'oe')
    .replace(/æ/gu, 'ae');
}

/**
 * A German answer with its umlauts and sharp s written out (`schoen`,
 * `Strasse`), as people type them without those keys. Other languages have
 * no such spelling, so they answer `null`.
 *
 * @param {string} text a tidied answer
 * @param {string} code
 */
export function spelledOut(text, code) {
  if (code !== 'de') return null;
  return text.replace(/ä/gu, 'ae').replace(/ö/gu, 'oe').replace(/ü/gu, 'ue').replace(/ß/gu, 'ss');
}

/**
 * A tidied answer without the article it starts with, or `null` when it does
 * not start with one.
 *
 * @param {string} text a tidied answer
 * @param {string} code
 */
export function withoutArticle(text, code) {
  for (const article of ARTICLES[code] ?? []) {
    const joined = article.endsWith("'");
    const lead = joined ? article : `${article} `;
    if (text.startsWith(lead) && text.length > lead.length) return text.slice(lead.length).trim();
  }
  return null;
}

/**
 * How a typed answer compares with the right ones.
 *
 * @param {string} typed
 * @param {readonly string[]} answers the right answer first, then any others
 * @param {string} code
 * @returns {'right' | 'accents' | 'article' | 'wrong'}
 */
export function judge(typed, answers, code) {
  const mine = tidy(typed, code);
  if (mine.length === 0) return 'wrong';
  const right = answers.map((answer) => tidy(answer, code));
  if (right.includes(mine)) return 'right';
  const bare = plain(mine);
  /** @param {string} answer */
  const nearly = (answer) => plain(answer) === bare || spelledOut(answer, code) === mine;
  if (right.some(nearly)) return 'accents';
  if (withoutArticle(mine, code) !== null) return 'wrong';
  const nouns = right.map((answer) => withoutArticle(answer, code)).filter((noun) => noun !== null);
  if (nouns.some((noun) => noun === mine || nearly(noun))) return 'article';
  return 'wrong';
}
