/**
 * The weekly plan, worked out from what is saved. Nothing about the plan is
 * saved itself: it is the person's study days, their lessons a day and the
 * lessons not done yet, laid over this week.
 *
 *  - The lessons come in course order from the start level. A person who
 *    starts at A2 meets the A2 lessons first, then any A1 lesson not done.
 *  - Today's share is the lessons a day less the lessons already done today,
 *    so finishing today's lesson finishes today's plan.
 *  - A coming study day gets the next lessons, a day's share each.
 *  - A past day shows whether the person studied: any lesson or any card.
 */

import { weekdayOf, weekOf } from './days.js';

/**
 * The course's lessons in the order the plan offers them.
 *
 * @param {readonly { id: string, level: string }[]} lessons every lesson in course order
 * @param {string} startLevel `a1`, `a2`, `beyond` or `''`
 * @returns {string[]}
 */
export function lessonOrder(lessons, startLevel) {
  const from = startLevel === 'a2' || startLevel === 'beyond' ? lessons.findIndex((lesson) => lesson.level === 'a2') : 0;
  const at = Math.max(from, 0);
  return [...lessons.slice(at), ...lessons.slice(0, at)].map((lesson) => lesson.id);
}

/**
 * @typedef {{ day: string, weekday: number, planned: boolean, today: boolean, past: boolean, studied: boolean, lessons: string[] }} PlanDay
 */

/**
 * This week's plan.
 *
 * @param {{
 *   today: string,
 *   studyDays: readonly number[],
 *   lessonsPerDay: number,
 *   order: readonly string[],
 *   done: ReadonlySet<string>,
 *   days: ReadonlyMap<string, { lessons: number, cards: number }>,
 * }} facts
 */
export function weekPlan(facts) {
  const queue = facts.order.filter((id) => !facts.done.has(id));
  const next = queue[0] ?? null;
  const doneToday = facts.days.get(facts.today)?.lessons ?? 0;
  const todayPlanned = facts.studyDays.includes(weekdayOf(facts.today));
  const todayLeft = todayPlanned ? Math.max(0, facts.lessonsPerDay - doneToday) : 0;
  /** @type {PlanDay[]} */
  const days = weekOf(facts.today).map((day) => {
    const weekday = weekdayOf(day);
    const planned = facts.studyDays.includes(weekday);
    const today = day === facts.today;
    const past = day < facts.today;
    const row = facts.days.get(day);
    const studied = row !== undefined && (row.lessons > 0 || row.cards > 0);
    let lessons = [];
    if (today) lessons = queue.splice(0, todayLeft);
    else if (!past && planned) lessons = queue.splice(0, facts.lessonsPerDay);
    return { day, weekday, planned, today, past, studied, lessons };
  });
  const plannedCount = days.filter((day) => day.planned).length;
  const studiedPlanned = days.filter((day) => day.planned && day.studied).length;
  const todayDay = days.find((day) => day.today);
  return {
    days,
    plannedCount,
    studiedPlanned,
    todayPlanned,
    todayLessons: todayDay?.lessons ?? [],
    todayDone: todayPlanned && todayLeft === 0,
    next,
  };
}
