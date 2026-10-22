'use client';

import { Check, X } from 'lucide-react';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/**
 * Four answers to pick from, one at a time. After Check, the right answer and
 * a wrong pick are marked, and the choice is closed.
 *
 * @param {{
 *   name: string,
 *   choices: { key: string, text: string, roman: string }[],
 *   value: string,
 *   onChange: (key: string) => void,
 *   answer: string,
 *   checked: boolean,
 *   lang: string,
 *   label: string,
 *   rightLabel: string,
 *   wrongLabel: string,
 * }} props
 */
export function ChoiceList({ name, choices, value, onChange, answer, checked, lang, label, rightLabel, wrongLabel }) {
  return (
    <RadioGroup
      aria-label={label}
      value={value === '' ? null : value}
      onValueChange={(next) => {
        if (!checked) onChange(String(next));
      }}
      disabled={checked}
      className="grid gap-2 sm:grid-cols-2"
    >
      {choices.map((choice) => {
        const id = `${name}-${choice.key}`;
        const state = !checked ? 'open' : choice.key === answer ? 'right' : choice.key === value ? 'wrong' : 'other';
        return (
          <label key={choice.key} htmlFor={id} className="choice" data-state={state} data-picked={choice.key === value ? 'yes' : 'no'}>
            <RadioGroupItem id={id} value={choice.key} />
            <span className="min-w-0 flex-1">
              <span lang={lang} className="block text-base">
                {choice.text}
              </span>
              {choice.roman !== '' && <span className="block text-sm text-muted-foreground">{choice.roman}</span>}
            </span>
            {state === 'right' && <Check aria-label={rightLabel} className="size-4 shrink-0 text-chart-5" />}
            {state === 'wrong' && <X aria-label={wrongLabel} className="size-4 shrink-0 text-destructive" />}
          </label>
        );
      })}
    </RadioGroup>
  );
}
