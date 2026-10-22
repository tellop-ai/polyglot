import { AiProblem, askAI } from '../../../lib/ai.js';
import { courseView } from '../../../lib/course/index.js';
import { readCourseFor, readResultsFor } from '../../../lib/data/learn.js';
import { requireLearner } from '../../../lib/learn/learner.js';
import { LEARN_OWNER } from '../../../lib/learn/owner.js';
import { practiceMessages, readAnswer, readPractice } from '../../../lib/learn/practice.js';
import { failed, json, refused } from '../../../lib/learn/reply.js';
import { readJsonBody } from '../../../lib/learn/request.js';

/**
 * Practice with AI: `{ course, tool, text, situation?, history? }`, sent by a
 * press. `course` is the language the page was for.
 *
 * AI is asked at the `standard` level through the kit's helper, on the
 * person's allowance inside Tellop. Its answer is a proposal and nothing here
 * is saved. A refusal from AI comes back as the kit's own words for it. AI
 * answers at A2 once the person started at A2 or beyond, or has done every A1
 * lesson; otherwise at A1.
 */
export const dynamic = 'force-dynamic';

/** @param {Request} request */
export async function POST(request) {
  const body = await readJsonBody(request);
  if (!body.ok) return refused(body.problem);
  const practice = readPractice(/** @type {Record<string, unknown>} */ (body.value));
  if (!practice.ok) return refused(practice.problem);
  let learner;
  let level = 'a1';
  try {
    learner = await requireLearner(/** @type {{ course?: unknown }} */ (body.value).course);
    const course = await readCourseFor(LEARN_OWNER, learner.course);
    if (course !== null && (course.startLevel === 'a2' || course.startLevel === 'beyond')) {
      level = 'a2';
    } else {
      const view = courseView(learner.course, learner.ownLanguage);
      const done = new Set((await readResultsFor(LEARN_OWNER, learner.course)).map((result) => result.lesson));
      if (view !== null && view.lessons.filter((lesson) => lesson.level === 'a1').every((lesson) => done.has(lesson.id))) level = 'a2';
    }
  } catch (error) {
    return failed(error);
  }
  const asked = practiceMessages(practice.value, { course: learner.course, own: learner.ownLanguage, level });
  try {
    const answer = await askAI({
      level: 'standard',
      messages: asked.messages,
      max_tokens: 500,
      temperature: 0.4,
      ...(asked.json ? { response_format: { type: 'json_object' } } : {}),
    });
    const read = readAnswer(practice.value.tool, answer.text);
    if (read === null) return json({ problem: 'learn.practice.unreadable' }, 502);
    return json({ answer: read });
  } catch (error) {
    if (error instanceof AiProblem) return json({ problem: error.wordsKey, retry: error.state === 'busy' }, 503);
    return json({ problem: 'ai.unavailable' }, 503);
  }
}
