import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { courseReady } from '../../lib/course/index.js';
import { readCoursesFor } from '../../lib/data/learn.js';
import { t } from '../../lib/i18n/index.js';
import { COURSES, languageOf, voiceFor } from '../../lib/learn/languages.js';
import { LEARN_OWNER } from '../../lib/learn/owner.js';
import { canAdd, canChange, speakingFor } from '../../lib/learn/roles.js';
import { languageName, weekdayName } from '../../lib/learn/shown.js';
import { problemOf, readState } from '../../lib/learn/state.js';

import { Frame } from '../frame.jsx';
import { SettingsForm, SettingsView } from '../settings-form.jsx';

/**
 * Settings: the person's own language and the language they learn, the weekly
 * plan, reading aloud, the level test again, and starting a language over.
 * The page only reads; each change is saved by its own press. They are the
 * app's own settings, so only the owner and a Helper change them; a Member or
 * a Viewer sees them in words (`lib/learn/roles.js`).
 */
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const state = await readState();
  const { own, learner, view, course } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (learner === null) {
    return (
      <Frame own={own} path="/settings" title={t('learn.menu.settings', own)}>
        <Alert variant="destructive">
          <AlertDescription>{t(state.problem, own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const { role } = state.person;
  if (!canChange(role)) {
    const code = learner.course;
    return (
      <Frame own={own} path="/settings" title={t('learn.settings.title', own)}>
        <SettingsView
          own={own}
          course={code}
          languageNow={languageName(code, own)}
          days={learner.studyDays.map((day) => weekdayName(day, own))}
          settings={{
            lessonsPerDay: learner.lessonsPerDay,
            cardsPerDay: learner.cardsPerDay,
            readAloud: learner.readAloud,
            voiceSpeed: learner.voiceSpeed,
            readWith: learner.readWith,
            speaking: speakingFor(role, learner.speaking),
            voice: voiceFor(code, course?.voice),
          }}
          voices={[...(languageOf(code)?.voices ?? [])]}
          sample={view?.lessons[0]?.words[0]?.ex ?? ''}
          startLevel={course?.startLevel ?? ''}
          newReadings={canAdd(role)}
        />
      </Frame>
    );
  }
  let started = [];
  try {
    started = (await readCoursesFor(LEARN_OWNER)).map((row) => row.course);
  } catch (error) {
    return (
      <Frame own={own} path="/settings" title={t('learn.menu.settings', own)}>
        <Alert variant="destructive">
          <AlertDescription>{t(problemOf(error), own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const code = learner.course;
  const voices = languageOf(code)?.voices ?? [];
  return (
    <Frame own={own} path="/settings" title={t('learn.settings.title', own)}>
      <SettingsForm
        key={`${own}:${code}`}
        own={own}
        course={code}
        courses={COURSES.filter((item) => courseReady(item)).map((item) => ({ code: item, name: languageName(item, own), started: started.includes(item) }))}
        weekdays={[1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, name: weekdayName(day, own) }))}
        settings={{
          studyDays: learner.studyDays,
          lessonsPerDay: learner.lessonsPerDay,
          cardsPerDay: learner.cardsPerDay,
          readAloud: learner.readAloud,
          voiceSpeed: learner.voiceSpeed,
          readWith: learner.readWith,
          speaking: learner.speaking,
          voice: voiceFor(code, course?.voice),
        }}
        voices={[...voices]}
        sample={view?.lessons[0]?.words[0]?.ex ?? ''}
        startLevel={course?.startLevel ?? ''}
        languageNow={languageName(code, own)}
      />
    </Frame>
  );
}
