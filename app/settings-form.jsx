'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';

import { t } from '../lib/i18n/index.js';
import { CARDS_PER_DAY, LESSONS_PER_DAY, VOICE_SPEEDS } from '../lib/learn/bounds.js';
import { OWN_LANGUAGES } from '../lib/learn/languages.js';
import { READ_WITH } from '../lib/learn/voice.js';

import { send } from './send.js';
import { ListenButton, SpeechProvider, useSpeech, VoiceNote } from './speech.jsx';

/**
 * The settings, each saved by its own press. What is on screen changes only
 * after the app confirms the save; a refusal shows its words and leaves the
 * saved value in place.
 *
 * @param {{
 *   own: string,
 *   course: string,
 *   courses: { code: string, name: string, started: boolean }[],
 *   weekdays: { day: number, name: string }[],
 *   settings: { studyDays: number[], lessonsPerDay: number, cardsPerDay: number, readAloud: boolean, voiceSpeed: string, readWith: string, speaking: boolean, voice: string },
 *   voices: string[],
 *   sample: string,
 *   startLevel: string,
 *   languageNow: string,
 * }} props
 */
export function SettingsForm({ own, course, courses, weekdays, settings, voices, sample, startLevel, languageNow }) {
  const router = useRouter();
  const [saved, setSaved] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [startOver, setStartOver] = useState(false);

  /** @param {Record<string, unknown>} change */
  async function save(change) {
    setBusy(true);
    setProblem('');
    setNotice('');
    const sent = await send('/api/settings', 'POST', { ...change, course });
    setBusy(false);
    if (!sent.ok || sent.value?.settings === undefined) {
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      return;
    }
    setSaved((before) => ({ ...before, ...sent.value.settings }));
    setNotice('learn.settings.saved');
  }

  /** @param {{ ownLanguage: string, course: string }} choice */
  async function choose(choice) {
    setBusy(true);
    setProblem('');
    setNotice('');
    const sent = await send('/api/choice', 'POST', choice);
    if (!sent.ok || sent.value?.learner?.course !== choice.course) {
      setBusy(false);
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  async function wipe() {
    setBusy(true);
    setProblem('');
    const sent = await send('/api/course', 'DELETE', { course });
    if (!sent.ok) {
      setBusy(false);
      setProblem(sent.problem);
      return;
    }
    setStartOver(false);
    router.push('/');
    router.refresh();
  }

  /** @param {number} day */
  function toggleDay(day) {
    const next = saved.studyDays.includes(day) ? saved.studyDays.filter((item) => item !== day) : [...saved.studyDays, day].sort((a, b) => a - b);
    void save({ studyDays: next });
  }

  const onlyDay = saved.studyDays.length === 1 ? saved.studyDays[0] : null;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {(problem !== '' || notice !== '') && (
        <Alert variant={problem !== '' ? 'destructive' : 'default'} role="status">
          <AlertDescription>{t(problem !== '' ? problem : notice, own)}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.languages', own)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('learn.settings.myLanguage', own)}</p>
            <div className="flex flex-wrap gap-2">
              {OWN_LANGUAGES.map((code) => (
                <Button
                  key={code}
                  type="button"
                  lang={code}
                  variant={own === code ? 'default' : 'outline'}
                  aria-pressed={own === code}
                  disabled={busy || code === course}
                  onClick={() => {
                    if (code !== own) void choose({ ownLanguage: code, course });
                  }}
                >
                  {t(`learn.ownName.${code}`, code)}
                </Button>
              ))}
            </div>
            {OWN_LANGUAGES.includes(course) && <p className="text-xs text-muted-foreground">{t('learn.settings.ownIsCourse', own, { language: languageNow })}</p>}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('learn.settings.learning', own)}
            <NativeSelect value={course} disabled={busy} onChange={(event) => choose({ ownLanguage: own, course: event.target.value })}>
              {courses
                .filter((item) => item.code !== own)
                .map((item) => (
                  <NativeSelectOption key={item.code} value={item.code}>
                    {item.started && item.code !== course ? t('learn.settings.started', own, { language: item.name }) : item.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          <p className="text-xs text-muted-foreground">{t('learn.settings.eachOwnProgress', own)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.plan', own)}</CardTitle>
          <CardDescription>{t('learn.settings.planLead', own)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t('learn.settings.studyDays', own)}</p>
            <div className="flex flex-wrap gap-2">
              {weekdays.map(({ day, name }) => (
                <Button
                  key={day}
                  type="button"
                  variant={saved.studyDays.includes(day) ? 'default' : 'outline'}
                  aria-pressed={saved.studyDays.includes(day)}
                  disabled={busy || onlyDay === day}
                  onClick={() => toggleDay(day)}
                >
                  {name}
                </Button>
              ))}
            </div>
            {onlyDay !== null && <p className="text-xs text-muted-foreground">{t('learn.settings.oneDayLeft', own)}</p>}
          </div>
          <Choices
            label={t('learn.settings.lessonsPerDay', own)}
            options={LESSONS_PER_DAY.map((value) => ({ value, name: String(value) }))}
            value={saved.lessonsPerDay}
            disabled={busy}
            onPick={(value) => save({ lessonsPerDay: value })}
          />
          <Choices
            label={t('learn.settings.cardsPerDay', own)}
            options={CARDS_PER_DAY.map((value) => ({ value, name: String(value) }))}
            value={saved.cardsPerDay}
            disabled={busy}
            onPick={(value) => save({ cardsPerDay: value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.voice', own)}</CardTitle>
          <CardDescription>{t('learn.settings.voiceLead', own)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={saved.readAloud} disabled={busy} onCheckedChange={(checked) => save({ readAloud: checked })} />
            {t('learn.settings.readAloud', own)}
          </label>
          {saved.readAloud && (
            <>
              <Choices
                label={t('learn.settings.readWith', own)}
                options={READ_WITH.map((value) => ({ value, name: t(`learn.settings.readWith.${value}`, own) }))}
                value={saved.readWith}
                disabled={busy}
                onPick={(value) => save({ readWith: value })}
              />
              <p className="text-xs text-muted-foreground">{t(`learn.settings.readWithLead.${saved.readWith}`, own)}</p>
              <Choices
                label={t('learn.settings.speed', own)}
                options={VOICE_SPEEDS.map((value) => ({ value, name: t(`learn.settings.speed.${value}`, own) }))}
                value={saved.voiceSpeed}
                disabled={busy}
                onPick={(value) => save({ voiceSpeed: value })}
              />
              {voices.length > 1 && (
                <Choices
                  label={t('learn.settings.accent', own)}
                  options={voices.map((value) => ({ value, name: t(`learn.accent.${value}`, own) }))}
                  value={saved.voice}
                  disabled={busy}
                  onPick={(value) => save({ voice: value })}
                />
              )}
              {sample !== '' && (
                <SpeechProvider key={saved.readWith} tag={saved.voice} speed={saved.voiceSpeed} enabled own={own} code={course} readWith={saved.readWith}>
                  <TryVoice own={own} sample={sample} />
                  <VoiceNote own={own} />
                </SpeechProvider>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.speaking', own)}</CardTitle>
          <CardDescription>{t('learn.settings.speakingLead', own)}</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={saved.speaking} disabled={busy} onCheckedChange={(checked) => save({ speaking: checked })} />
            {t('learn.settings.speakingSwitch', own)}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.level', own)}</CardTitle>
          <CardDescription>
            {startLevel === ''
              ? t('learn.settings.levelNone', own)
              : t('learn.settings.levelNow', own, { level: t(startLevel === 'a1' ? 'learn.level.a1' : startLevel === 'a2' ? 'learn.level.a2' : 'learn.level.beyond', own) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/level-test" className={buttonVariants({ variant: 'outline' })}>
            {t('learn.settings.testAgain', own)}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.startOver', own, { language: languageNow })}</CardTitle>
          <CardDescription>{t('learn.settings.startOverLead', own)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => setStartOver(true)}>
            {t('learn.settings.startOverAction', own)}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={startOver} onOpenChange={setStartOver}>
        <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('learn.settings.startOverTitle', own, { language: languageNow })}</AlertDialogTitle>
            <AlertDialogDescription>{t('learn.settings.startOverWarn', own)}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto" />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('learn.cancel', own)}</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={wipe}>
              {t('learn.settings.startOverConfirm', own)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * @template T
 * @param {{ label: string, options: { value: T, name: string }[], value: T, disabled: boolean, onPick: (value: T) => void }} props
 */
function Choices({ label, options, value, disabled, onPick }) {
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={String(option.value)}
            type="button"
            variant={option.value === value ? 'default' : 'outline'}
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => {
              if (option.value !== value) onPick(option.value);
            }}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** @param {{ own: string, sample: string }} props */
function TryVoice({ own, sample }) {
  const { canSay } = useSpeech();
  if (!canSay) return <p className="text-sm text-muted-foreground">{t('learn.settings.noVoice', own)}</p>;
  return (
    <div className="flex items-center gap-2 text-sm">
      <ListenButton text={sample} />
      <span>{t('learn.settings.tryVoice', own)}</span>
    </div>
  );
}

/**
 * The settings as a person who may not change them sees them (a Member or a
 * Viewer, `lib/learn/roles.js`): the same values in words, with no control
 * that saves, and a line saying they cannot change them. Such a person is
 * online, on any device, and not the learner, so no label names them as
 * "you". Trying the voice stays: it only plays, and
 * a Viewer (`newReadings` false) hears the AI voice only for a reading kept
 * before.
 *
 * @param {{
 *   own: string,
 *   course: string,
 *   languageNow: string,
 *   days: string[],
 *   settings: { lessonsPerDay: number, cardsPerDay: number, readAloud: boolean, voiceSpeed: string, readWith: string, speaking: boolean, voice: string },
 *   voices: string[],
 *   sample: string,
 *   startLevel: string,
 *   newReadings: boolean,
 * }} props
 */
export function SettingsView({ own, course, languageNow, days, settings, voices, sample, startLevel, newReadings }) {
  const onOff = (/** @type {boolean} */ value) => t(value ? 'learn.settings.isOn' : 'learn.settings.isOff', own);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Alert role="status">
        <AlertDescription>{t('learn.role.settingsView', own)}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.languages', own)}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            rows={[
              [t('learn.role.ownLanguage', own), t(`learn.ownName.${own}`, own)],
              [t('learn.role.learning', own), languageNow],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.plan', own)}</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            rows={[
              [t('learn.settings.studyDays', own), days.join(', ')],
              [t('learn.settings.lessonsPerDay', own), String(settings.lessonsPerDay)],
              [t('learn.settings.cardsPerDay', own), String(settings.cardsPerDay)],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.settings.voice', own)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Facts
            rows={[
              [t('learn.settings.readAloud', own), onOff(settings.readAloud)],
              ...(settings.readAloud
                ? [
                    [t('learn.settings.readWith', own), t(`learn.settings.readWith.${settings.readWith}`, own)],
                    [t('learn.settings.speed', own), t(`learn.settings.speed.${settings.voiceSpeed}`, own)],
                    ...(voices.length > 1 ? [[t('learn.settings.accent', own), t(`learn.accent.${settings.voice}`, own)]] : []),
                  ]
                : []),
              [t('learn.role.speaking', own), onOff(settings.speaking)],
            ]}
          />
          {settings.readAloud && sample !== '' && (
            <SpeechProvider tag={settings.voice} speed={settings.voiceSpeed} enabled own={own} code={course} readWith={settings.readWith} newReadings={newReadings}>
              <TryVoice own={own} sample={sample} />
              <VoiceNote own={own} />
            </SpeechProvider>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('learn.role.level', own)}</CardTitle>
          <CardDescription>
            {startLevel === ''
              ? t('learn.role.levelNone', own)
              : t('learn.role.levelNow', own, { level: t(startLevel === 'a1' ? 'learn.level.a1' : startLevel === 'a2' ? 'learn.level.a2' : 'learn.level.beyond', own) })}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

/** A setting's name beside its value, one row each. @param {{ rows: string[][] }} props */
function Facts({ rows }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="font-medium">{name}</dt>
          <dd className="text-muted-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
