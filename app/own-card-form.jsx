'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { t } from '../lib/i18n/index.js';
import { OWN_CARD } from '../lib/learn/bounds.js';

import { send } from './send.js';

/**
 * Adds a person's own word to the cards of the language being learned. The
 * form keeps its words only while it is open: closing or saving forgets the
 * draft, and a failed save keeps the words on screen.
 *
 * @param {{ own: string, code: string }} props
 */
export function OwnCardForm({ own, code }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  function reset() {
    setFront('');
    setBack('');
    setNote('');
    setProblem('');
  }

  /** @param {React.FormEvent} event */
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setProblem('');
    const sent = await send('/api/cards', 'POST', { course: code, front, back, note });
    setBusy(false);
    if (!sent.ok || typeof sent.value?.card?.card !== 'string') {
      setProblem(sent.ok ? 'error.saveUnconfirmed' : sent.problem);
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Plus aria-hidden="true" />
        {t('learn.own.add', own)}
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <DialogHeader>
          <DialogTitle>{t('learn.own.title', own)}</DialogTitle>
          <DialogDescription>{t('learn.own.lead', own)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('learn.own.front', own)}
              <Input lang={code} value={front} maxLength={OWN_CARD.front} required onChange={(event) => setFront(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('learn.own.back', own)}
              <Input value={back} maxLength={OWN_CARD.back} required onChange={(event) => setBack(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t('learn.own.note', own)}
              <Textarea value={note} maxLength={OWN_CARD.note} rows={3} onChange={(event) => setNote(event.target.value)} />
            </label>
            {problem !== '' && <p className="text-sm text-destructive">{t(problem, own)}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || front.trim() === '' || back.trim() === ''}>
              {busy ? t('learn.saving', own) : t('learn.own.save', own)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
