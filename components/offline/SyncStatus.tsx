'use client';

/**
 * Changes made offline, in one place (lib/offline/outbox.ts). A small pill says when something is
 * waiting to be sent, couldn't be sent, or the phone is offline; it opens the list, where each
 * change can be retried or discarded, and a note, care plan or programme edit that met another
 * change is reviewed side by side. Nothing leaves the list until the server has it or the person
 * discards it.
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
  type PlanConflict,
  type ProgramConflict,
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

/** Runs one of the review's choices, then closes the review (or says what went wrong). */
function useReviewAction(onDone: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  return { busy, error, act };
}

/** Saved version and the offline edit, side by side; only what differs (everything when nothing does). */
function CompareRows({ rows }: { rows: { label: string; saved: string; mine: string }[] }) {
  const differing = rows.filter((row) => row.saved !== row.mine);
  return (
    <div className="max-h-[50vh] space-y-3 overflow-y-auto">
      {(differing.length ? differing : rows).map((row) => (
        <div key={row.label} className="rounded-2xl border border-pt-line p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{row.label}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-pt-muted">Saved version</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-pt-ink">{row.saved || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-pt-muted">Your offline edit</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-pt-ink">{row.mine || '—'}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const text = (value: Value | undefined) => (typeof value === 'string' ? value.trim() : '');

function planGoalsText(goals: unknown): string {
  if (!Array.isArray(goals)) return '';
  return goals
    .map((goal) => {
      const g = (goal ?? {}) as { description?: unknown; targetValue?: unknown; timeline?: unknown };
      const detail = [g.targetValue, g.timeline].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(', ');
      return typeof g.description === 'string' && g.description.trim() ? `• ${g.description.trim()}${detail ? ` (${detail})` : ''}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function sessionsText(frequency: unknown, planned: unknown): string {
  return [typeof frequency === 'string' ? frequency.trim() : '', typeof planned === 'number' ? `${planned} sessions` : ''].filter(Boolean).join(' · ');
}

const dayText = (value: unknown) => (typeof value === 'number' ? format(value, 'd MMM yyyy') : '');

/** A care plan edited offline that met another change: keep mine (the saved one stays in the plan's history), or theirs. */
function PlanConflictReview({ item, onDone }: { item: OutboxItem; onDone: () => void }) {
  const { busy, error, act } = useReviewAction(onDone);
  const saved = item.conflict as PlanConflict;
  const gone = 'gone' in saved;
  const a = item.args;
  const rows = gone
    ? []
    : [
        { label: 'Title', saved: saved.title, mine: text(a.title) },
        { label: 'Goals', saved: planGoalsText(saved.goals), mine: planGoalsText(a.goals) },
        { label: 'Sessions', saved: sessionsText(saved.sessionFrequency, saved.plannedSessions), mine: sessionsText(a.sessionFrequency, a.plannedSessions) },
        { label: 'Review date', saved: dayText(saved.reviewDate), mine: dayText(a.reviewDate) },
        { label: 'Precautions', saved: saved.precautions ?? '', mine: text(a.precautions) },
        { label: 'Description', saved: saved.description ?? '', mine: text(a.description) },
      ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-pt-muted">
        {gone
          ? 'This care plan was closed or replaced after you edited it offline. Keep your changes to start a new plan with them, or discard them.'
          : 'This care plan was changed somewhere else after you edited it offline. Nothing has been overwritten: choose what to keep. Whichever you choose, the other stays in the plan’s history.'}
      </p>
      {rows.length ? <CompareRows rows={rows} /> : null}
      <ReviewError error={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="button"
          disabled={busy !== null}
          className={cn(primaryButtonClass, 'h-11 sm:flex-1')}
          onClick={() =>
            act('mine', () =>
              replaceInOutbox(item.id, { args: { ...item.args, expectedVersion: gone ? 0 : saved.version }, conflict: null, status: 'pending' })
            )
          }
        >
          {busy === 'mine' ? <Loader2 className="h-4 w-4 animate-spin" /> : gone ? 'Start a new plan with my changes' : 'Keep my changes'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} className="h-11 text-pt-muted sm:flex-1" onClick={() => act('theirs', () => removeFromOutbox(item.id))}>
          {gone ? 'Discard my changes' : 'Keep the saved version'}
        </Button>
      </div>
    </div>
  );
}

/** A home programme edited offline that met another change: keep mine, or theirs. */
function ProgramConflictReview({ item, onDone }: { item: OutboxItem; onDone: () => void }) {
  const { busy, error, act } = useReviewAction(onDone);
  const saved = item.conflict as ProgramConflict;
  const a = item.args;
  const mineItems = Array.isArray(item.meta.itemNames) ? (item.meta.itemNames as Value[]).filter((n): n is string => typeof n === 'string') : [];
  const goals = (list: unknown) => (Array.isArray(list) ? list.filter((g): g is string => typeof g === 'string' && g.trim() !== '').map((g) => `• ${g}`).join('\n') : '');
  const rows = [
    { label: 'Title', saved: saved.title, mine: text(a.title) },
    { label: 'Exercises and information', saved: saved.items.map((name, i) => `${i + 1}. ${name}`).join('\n'), mine: mineItems.map((name, i) => `${i + 1}. ${name}`).join('\n') },
    { label: 'Goals', saved: goals(saved.goals), mine: goals(a.goals) },
    { label: 'Note to the patient', saved: saved.note ?? '', mine: text(a.note) },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-pt-muted">
        This programme was changed somewhere else after you edited it offline{saved.status === 'archived' ? ', and it has been archived' : ''}. Nothing has been
        overwritten: choose what to keep. Patients’ exercise logs stay with their exercises either way.
      </p>
      <CompareRows rows={rows} />
      <ReviewError error={error} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="button"
          disabled={busy !== null}
          className={cn(primaryButtonClass, 'h-11 sm:flex-1')}
          onClick={() =>
            act('mine', () => replaceInOutbox(item.id, { args: { ...item.args, expectedUpdatedAt: saved.updatedAt }, conflict: null, status: 'pending' }))
          }
        >
          {busy === 'mine' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Keep my changes'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} className="h-11 text-pt-muted sm:flex-1" onClick={() => act('theirs', () => removeFromOutbox(item.id))}>
          Keep the saved version
        </Button>
      </div>
    </div>
  );
}

function ReviewError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-pt-rose-fg">
      {error}
    </p>
  ) : null;
}

function ConflictReview({ item, onDone }: { item: OutboxItem; onDone: () => void }) {
  if (item.kind === 'planSave') return <PlanConflictReview item={item} onDone={onDone} />;
  if (item.kind === 'programUpdate') return <ProgramConflictReview item={item} onDone={onDone} />;
  return <NoteConflictReview item={item} onDone={onDone} />;
}

function NoteConflictReview({ item, onDone }: { item: OutboxItem; onDone: () => void }) {
  const { busy, error, act } = useReviewAction(onDone);
  const saved = item.conflict as NoteConflict;
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
          problems ? 'border-pt-line bg-pt-surface text-pt-rose-fg' : 'border-pt-line bg-pt-primary text-pt-on-primary'
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
