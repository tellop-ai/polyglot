import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { t } from '../../lib/i18n/index.js';
import { voiceFor } from '../../lib/learn/languages.js';
import { SITUATIONS } from '../../lib/learn/practice.js';
import { canAdd } from '../../lib/learn/roles.js';
import { languageName } from '../../lib/learn/shown.js';
import { readState } from '../../lib/learn/state.js';

import { Frame } from '../frame.jsx';
import { PracticeTools } from '../practice-tools.jsx';

/**
 * Practice with AI. Nothing goes to AI when this page opens: each tool sends
 * only on a press, and nothing here is saved. Every role may use it; Speak
 * and the AI voice keep a recording or a reading, so a role that may add
 * nothing (a Viewer) has no Speak and hears the AI voice only where a reading
 * was kept before, the device's own voice elsewhere.
 */
export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  const state = await readState();
  const { own, learner, view, course } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (learner === null || view === null) {
    return (
      <Frame own={own} path="/practice" title={t('learn.menu.practice', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const language = languageName(view.code, own);
  return (
    <Frame own={own} path="/practice" title={t('learn.practice.title', own, { language })} description={t('learn.practice.lead', own)}>
      <PracticeTools
        own={own}
        code={view.code}
        language={language}
        situations={Object.keys(SITUATIONS).map((id) => ({ id, name: t(`learn.practice.situation.${id}`, own) }))}
        readAloud={learner.readAloud}
        readWith={learner.readWith}
        newReadings={canAdd(state.person.role)}
        speak={canAdd(state.person.role)}
        voice={voiceFor(view.code, course?.voice)}
        speed={learner.voiceSpeed}
      />
    </Frame>
  );
}
