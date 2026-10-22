'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';

import { t } from '../lib/i18n/index.js';
import { TOP_STEP } from '../lib/learn/ladder.js';

import { send } from './send.js';

/**
 * Every card of the language being learned, to search, sort and remove. A
 * removal asks first; a lesson's word comes back when the lesson is done
 * again, and the question says so.
 *
 * @param {{ own: string, code: string, rows: any[] }} props
 */
export function CardList({ own, code, rows }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(/** @type {any} */ (null));
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'front',
        header: t('learn.cards.word', own),
        cell: ({ row }) => (
          <div className="max-w-64 min-w-0">
            <p lang={code} className="font-medium break-words">
              {row.original.front}
            </p>
            {row.original.roman !== '' && <p className="text-xs text-muted-foreground">{row.original.roman}</p>}
          </div>
        ),
      },
      {
        accessorKey: 'back',
        header: t('learn.cards.meaning', own),
        cell: ({ row }) => <p className="max-w-64 break-words">{row.original.back}</p>,
      },
      {
        accessorKey: 'step',
        header: t('learn.cards.step', own),
        cell: ({ row }) => t('learn.cards.stepOf', own, { step: String(row.original.step), top: String(TOP_STEP) }),
      },
      {
        accessorKey: 'dueDay',
        header: t('learn.cards.nextColumn', own),
        cell: ({ row }) => row.original.dueLabel,
      },
      {
        id: 'remove',
        header: '',
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('learn.cards.removeNamed', own, { word: row.original.front })}
            onClick={() => {
              setProblem('');
              setRemoving(row.original);
            }}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ),
      },
    ],
    [own, code],
  );

  async function remove() {
    if (removing === null) return;
    setBusy(true);
    setProblem('');
    const sent = await send('/api/cards', 'DELETE', { course: code, card: removing.card });
    setBusy(false);
    if (!sent.ok) {
      setProblem(sent.problem);
      return;
    }
    setRemoving(null);
    router.refresh();
  }

  return (
    <>
      <DataTable columns={columns} data={rows} locale={own} pageSize={20} emptyTitle={t('learn.cards.emptyTitle', own)} emptyDescription={t('learn.cards.emptyLead', own)} />
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setProblem('');
          }
        }}
      >
        <AlertDialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('learn.cards.removeTitle', own, { word: removing?.front ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t(removing?.own ? 'learn.cards.removeOwn' : 'learn.cards.removeLesson', own)}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{problem !== '' && <p className="text-sm text-destructive">{t(problem, own)}</p>}</div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('learn.cancel', own)}</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={remove}>
              {t('learn.cards.remove', own)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
