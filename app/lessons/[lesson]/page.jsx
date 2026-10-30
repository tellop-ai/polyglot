import { randomInt } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { lessonOf } from '../../../lib/course/index.js';
import { t } from '../../../lib/i18n/index.js';
import { voiceFor } from '../../../lib/learn/languages.js';
import { MAX_SEED } from '../../../lib/learn/random.js';
import { canAdd, canChange, speakingFor } from '../../../lib/learn/roles.js';
import { readState } from '../../../lib/learn/state.js';

import { Frame } from '../../frame.jsx';
import { LessonPlayer } from '../../lesson-player.jsx';

/**
 * One lesson, played in the page. The page reads the lesson and the learner's
 * settings and hands them to the player; nothing is saved until the player
 * sends the finished result. A role that saves no progress (a Member or a
 * Viewer, `lib/learn/roles.js`) plays the lesson as practice: the player sends
 * nothing, and speaks and reads aloud only in ways that keep nothing the role
 * may not add.
 */
export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }) {
  const { lesson: id } = await params;
  const state = await readState();
  const { own, learner, view, course } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (learner === null || view === null) {
    return (
      <Frame own={own} path="/lessons" title={t('learn.menu.lessons', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const found = lessonOf(view, id);
  if (found === null) notFound();
  const { role } = state.person;
  return (
    <div data-tellop-app-marker="ok" lang={own} className="min-h-dvh bg-background text-foreground">
      <LessonPlayer
        own={own}
        code={view.code}
        letters={[...view.language.letters]}
        typing={!view.language.roman}
        readAloud={learner.readAloud}
        readWith={learner.readWith}
        newReadings={canAdd(role)}
        speaking={speakingFor(role, learner.speaking)}
        keep={canChange(role)}
        voice={voiceFor(view.code, course?.voice)}
        speed={learner.voiceSpeed}
        seed={randomInt(1, MAX_SEED)}
        lesson={found.lesson}
        pool={found.pool}
        tip={found.firstOfUnit ? found.unit.tip : null}
        unitTitle={t('learn.unitLine', own, { number: String(found.unit.number), unit: found.unit.title })}
        next={found.next?.id ?? null}
      />
    </div>
  );
}
