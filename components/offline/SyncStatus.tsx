'use client';

/**
 * Changes made offline, in one place (lib/offline/outbox.ts). A small pill says when something is
 * waiting to be sent, couldn't be sent, or the phone is offline; it opens the list, where each
 * change can be retried or discarded, and a note edit that met another change is reviewed side
 * by side. Nothing leaves the list until the server has it or the person discards it.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import type { Value } from 'convex/values';
import { AlertTriangle, Loader2, RefreshCw, Trash2, UploadCloud, WifiOff } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui';
import { useOnline } from '@/lib/offline/session';
import {
  addToOutbox,
  newClientId,
  removeFromOutbox,
  replaceInOutbox,
  retryOutbox,
  useOutbox,
  type NoteConflict,
  type OutboxItem,
} from '@/lib/offline/outbox';
import { kickSync } from '@/lib/offline/sync';
import { vaultState } from '@/lib/offline/vault';
import { cn } from '@/lib/utils';

const NOTE_SECTIONS = [
  ['subjectiveAssessment', 'Subjective'],
  ['objectiveAssessment', 'Objective'],
  ['diagnosis', 'Assessment'],
  ['treatmentAdministered', 'Treatment'],
  ['planForNextSession', 'Plan'],
] as const;

function statusLine(item: OutboxItem, online: boolean): string {
  if (item.status === 'conflict') return 'Changed somewhere else while you were offline. Review both versions.';
  if (item.status === 'failed') return item.error ?? 'Couldn’t be sent.';
  if (!online) return 'Waiting for internet';
  if (item.nextTryAt > Date.now()) return `No answer yet. Trying again at ${format(item.nextTryAt, 'HH:mm')}`;
  return 'Sending…';
}

/** The note edit as a new note of its own (kept, so nothing written is lost). */
async function saveAsNewNote(item: OutboxItem) {
  const userId = vaultState().userId;
  const patientId = item.meta.patientId;
  if (!userId || typeof patientId !== 'string') throw new Error('This note’s patient is unknown.');
  const id = newClientId();
  const args: Record<string, Value> = { patientId, noteType: typeof item.args.noteType === 'string' ? item.args.noteType : 'treatment_note', clientId: id, occurredAt: item.createdAt };
  for (const [key] of NOTE_SECTIONS) {
    const text = item.args[key];
    if (typeof text === 'string' && text.trim()) args[key] = text;
  }
  if (Array.isArray(item.args.measures) && item.args.measures.length) args.measures = item.args.measures;
  await addToOutbox(userId, 'noteAdd', { id, createdAt: item.createdAt, args, label: item.label.replace(/^Note edit/, 'Clinical note'), meta: item.meta });
  await removeFromOutbox(item.id);
  kickSync();
}

function ConflictReview({ item, onDone }: { item: OutboxItem; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = item.conflict as NoteConflict;
  const act = async (key: string, run: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await run();
      kickSync();
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const differing = NOTE_SECTIONS.filter(([key]) => (saved[key] ?? '') !== ((item.args[key] as string | undefined) ?? ''));

  return (
    <div className="space-y-4">
      <p className="text-sm text-pt-muted">
        This note was changed somewhere else after you edited it offline. Nothing has been overwritten: choose what to keep.
      </p>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto">
        {(differing.length ? differing : NOTE_SECTIONS).map(([key, label]) => (
          <div key={key} className="rounded-2xl border border-pt-line p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{label}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-pt-muted">Saved version</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-pt-ink">{saved[key] || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-pt-muted">Your offline edit</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-pt-ink">{(item.args[key] as string | undefined) || '—'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-pt-rose-fg">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="button"
          disabled={busy !== null}
          className={cn(primaryButtonClass, 'h-11 sm:flex-1')}
          onClick={() =>
            act('mine', () =>
              // The saved version stays in the note's history (every earlier wording is kept)
              replaceInOutbox(item.id, { args: { ...item.args, expectedVersion: saved.version }, conflict: null, status: 'pending' })
            )
          }
        >
          {busy === 'mine' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Keep my edit'}
        </Button>
        <Button type="button" disabled={busy !== null} className={cn(secondaryButtonClass, 'h-11 sm:flex-1')} onClick={() => act('new', () => saveAsNewNote(item))}>
          {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save mine as a new note'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} className="h-11 text-pt-muted sm:flex-1" onClick={() => act('theirs', () => removeFromOutbox(item.id))}>
          Keep the saved version
        </Button>
      </div>
    </div>
  );
}

function ChangeRow({ item, online, onReview }: { item: OutboxItem; online: boolean; onReview: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const problem = item.status !== 'pending';
  const noteEdit = item.kind === 'noteUpdate';
  return (
    <li className="rounded-2xl border border-pt-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-pt-ink">{item.label}</p>
          <p className="text-xs text-pt-muted">{format(item.createdAt, 'EEE d MMM, HH:mm')}</p>
          <p className={cn('mt-1 text-xs', problem ? 'text-pt-rose-fg' : 'text-pt-muted')}>{statusLine(item, online)}</p>
        </div>
        {problem ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pt-rose-fg" /> : null}
      </div>
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="w-full text-xs text-pt-ink">Discard this change? It hasn’t been saved anywhere else.</p>
          <Button type="button" size="sm" variant="destructive" className="h-9" onClick={() => void removeFromOutbox(item.id)}>
            Discard
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === 'conflict' ? (
            <Button type="button" size="sm" className={cn(primaryButtonClass, 'h-9')} onClick={onReview}>
              Review
            </Button>
          ) : null}
          {item.status === 'failed' ? (
            <Button
              type="button"
              size="sm"
              className={cn(secondaryButtonClass, 'h-9 gap-1.5')}
              onClick={() => void retryOutbox(item.id).then(() => kickSync())}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          ) : null}
          {item.status === 'failed' && noteEdit ? (
            <Button type="button" size="sm" className={cn(secondaryButtonClass, 'h-9')} onClick={() => void saveAsNewNote(item)}>
              Save as a new note
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="h-9 gap-1.5 text-pt-muted" onClick={() => setConfirming(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </Button>
        </div>
      )}
    </li>
  );
}

export function SyncStatus() {
  const items = useOutbox();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewing = items.find((item) => item.id === reviewingId && item.status === 'conflict') ?? null;
  const problems = items.filter((item) => item.status !== 'pending').length;
  const waiting = items.length - problems;

  if (online && items.length === 0) return null;

  const pill = !online
    ? items.length
      ? `Offline · ${items.length} waiting to send`
      : 'Offline · changes are saved on this phone'
    : problems
      ? `${problems} ${problems === 1 ? 'change' : 'changes'} couldn’t be sent`
      : `Sending ${waiting} ${waiting === 1 ? 'change' : 'changes'}…`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-live="polite"
        className={cn(
          'fixed left-1/2 z-[45] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg',
          'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6',
          problems ? 'border-pt-line bg-pt-surface text-pt-rose-fg' : 'border-pt-line bg-pt-ink text-pt-on-ink'
        )}
      >
        {!online ? (
          <WifiOff className="h-4 w-4 shrink-0" />
        ) : problems ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : (
          <UploadCloud className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{pill}</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setReviewingId(null);
        }}
      >
        <DialogContent className="max-w-lg rounded-3xl border-pt-line bg-pt-surface">
          <DialogTitle className="text-pt-ink">{reviewing ? 'Review your offline edit' : 'Saved on this phone'}</DialogTitle>
          <DialogDescription className="text-pt-muted">
            {reviewing
              ? reviewing.label
              : online
                ? 'Changes you made offline go out on their own. Anything that couldn’t be sent stays here until you try again or discard it.'
                : 'You’re offline. What you save is kept on this phone, encrypted, and sent when you’re back online.'}
          </DialogDescription>
          {reviewing ? (
            <ConflictReview item={reviewing} onDone={() => setReviewingId(null)} />
          ) : items.length === 0 ? (
            <p className="text-sm text-pt-muted">Nothing is waiting to be sent.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
              {items.map((item) => (
                <ChangeRow key={item.id} item={item} online={online} onReview={() => setReviewingId(item.id)} />
              ))}
            </ul>
          )}
          {!reviewing && online && waiting > 0 ? (
            <Button
              type="button"
              className={cn(secondaryButtonClass, 'h-11 w-full gap-2')}
              // Also the ones waiting a while before trying again
              onClick={() =>
                void Promise.all(items.filter((item) => item.status === 'pending').map((item) => retryOutbox(item.id))).then(() => kickSync())
              }
            >
              <RefreshCw className="h-4 w-4" />
              Send now
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
