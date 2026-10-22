import { t } from '../../lib/i18n/index.js';
import { dateFrom } from '../../lib/learn/shown.js';

/**
 * A saved card as the page shows it: a lesson's word takes its words from the
 * course, the person's own word from what they typed. A lesson's word the
 * course no longer has is left out. Server code only.
 *
 * @param {{ card: string, front: string, back: string, note: string, step: number, dueDay: string }} card
 * @param {any} view the course view
 * @param {string} own
 * @param {string} today
 */
export function cardRow(card, view, own, today) {
  const isOwn = card.card.startsWith('own:');
  let front = card.front;
  let back = card.back;
  let roman = '';
  let note = card.note;
  let example = '';
  let exampleMeaning = '';
  if (!isOwn) {
    const word = view.words.get(card.card.slice(2));
    if (word === undefined) return null;
    front = word.text;
    back = word.meaning;
    roman = word.roman;
    note = word.note;
    example = word.ex;
    exampleMeaning = word.exMeaning;
  }
  return {
    card: card.card,
    own: isOwn,
    front,
    roman,
    back,
    note,
    example,
    exampleMeaning,
    step: card.step,
    dueDay: card.dueDay,
    dueLabel: card.dueDay <= today ? t('learn.cards.dueNow', own) : dateFrom(card.dueDay, today, own),
  };
}
