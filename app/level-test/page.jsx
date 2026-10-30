import { randomInt } from 'node:crypto';

import { redirect } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';

import { t } from '../../lib/i18n/index.js';
import { makeTest, withoutAnswers } from '../../lib/learn/placement.js';
import { MAX_SEED } from '../../lib/learn/random.js';
import { canChange } from '../../lib/learn/roles.js';
import { languageName } from '../../lib/learn/shown.js';
import { readState } from '../../lib/learn/state.js';

import { Frame } from '../frame.jsx';
import { LevelTest } from '../level-test.jsx';

/**
 * The level test for the language being learned. The page makes a new test
 * from a new seed each time it opens and hands it over without its answers;
 * nothing is saved until the person chooses where to start. A role that saves
 * no progress (a Member or a Viewer) takes it as practice and saves nothing.
 */
export const dynamic = 'force-dynamic';

export default async function LevelTestPage() {
  const state = await readState();
  const { own, learner, view } = state;
  if (learner === null && state.problem === '') redirect('/');
  if (view === null) {
    return (
      <Frame own={own} path="/" title={t('learn.test.title', own)}>
        <Alert>
          <AlertDescription>{t(state.problem || 'learn.notOffered', own)}</AlertDescription>
        </Alert>
      </Frame>
    );
  }
  const seed = randomInt(1, MAX_SEED);
  const language = languageName(view.code, own);
  return (
    <Frame own={own} path="/" title={t('learn.test.title', own)} description={t('learn.test.forLanguage', own, { language })}>
      <LevelTest own={own} code={view.code} seed={seed} bands={withoutAnswers(makeTest(view, seed))} keep={canChange(state.person.role)} />
    </Frame>
  );
}
