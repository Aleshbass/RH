'use client';

/**
 * Changes made on this phone wait here, encrypted, until the server confirms them
 * (lib/offline/sync.ts sends them). Each carries an id from the phone, so a change sent twice
 * (after a lost answer) is saved once, and the time it was made. Nothing is dropped quietly: a
 * change the server refuses stays here with the reason until the person retries or discards it.
 */
import { useSyncExternalStore } from 'react';
import type { Value } from 'convex/values';
import { randomBytes } from './crypto';
import { offlineDb, type OutboxRow, type OutboxStatus } from './db';
import { openFor, sealFor, subscribeVault, vaultOpenFor, vaultState } from './vault';

export type OutboxKind = 'exerciseLog' | 'programTick' | 'programFinish' | 'checkIn' | 'noteAdd' | 'noteUpdate';

/** The Convex mutation each kind of change goes to. */
export const OUTBOX_FUNCTIONS: Record<OutboxKind, string> = {
  exerciseLog: 'exercisePrograms:logExercise',
  // An education or activity item ticked off, and "Done for today" (both saved once per day)
  programTick: 'exercisePrograms:markItemDone',
  programFinish: 'exercisePrograms:finishProgramToday',
  checkIn: 'physioCare:submitCheckIn',
  noteAdd: 'physioCare:addClinicalNote',
  noteUpdate: 'physioCare:updateClinicalNote',
};

/** The note as saved on the server, when an offline edit met another change (NOTE_CHANGED). */
export type NoteConflict = {
  version: number;
  noteType: string | null;
  subjectiveAssessment: string | null;
  objectiveAssessment: string | null;
  treatmentAdministered: string | null;
  planForNextSession: string | null;
  diagnosis: string | null;
};

type Args = Record<string, Value>;

/** The encrypted part: the change, how it's listed ("Clinical note · Ada Obi") and what it's for. */
type Payload = {
  args: Args;
  label: string;
  /** e.g. the patient or programme, so their pages show it before it's sent */
  meta: Args;
  conflict?: NoteConflict;
};

export type OutboxItem = Payload & {
  id: string;
  kind: OutboxKind;
  createdAt: number;
  status: OutboxStatus;
  attempts: number;
  nextTryAt: number;
  error?: string;
};

const EMPTY: OutboxItem[] = [];
let items: OutboxItem[] = EMPTY;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('rehabify-outbox');

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes waiting on this phone for the person whose vault is open, oldest first. */
export function outboxItems(): OutboxItem[] {
  return items;
}

export function useOutbox(): OutboxItem[] {
  return useSyncExternalStore(subscribeOutbox, () => items, () => EMPTY);
}

const recordKey = (id: string) => `outbox:${id}`;

/** A random id for a change (the server accepts 8-64 URL-safe characters). */
export function newClientId(): string {
  return btoa(String.fromCharCode(...randomBytes(16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reads the list again from storage (after a change here or in another tab). */
export async function reloadOutbox() {
  const userId = vaultState().userId;
  const db = offlineDb();
  if (!db || !vaultOpenFor(userId)) return;
  const rows = await db.outbox.where('[userId+createdAt]').between([userId, 0], [userId, Infinity]).toArray();
  const next: OutboxItem[] = [];
  for (const row of rows) {
    try {
      const payload = (await openFor(userId, recordKey(row.id), row)) as unknown as Payload;
      next.push({ ...payload, id: row.id, kind: row.kind as OutboxKind, createdAt: row.createdAt, status: row.status, attempts: row.attempts, nextTryAt: row.nextTryAt, error: row.error });
    } catch {
      // Can't be opened (it shouldn't happen): left in storage, never dropped quietly
    }
  }
  if (vaultState().userId !== userId || !vaultOpenFor(userId)) return;
  loadedFor = userId;
  items = next;
  emit();
}

function changed() {
  channel?.postMessage('changed');
  return reloadOutbox();
}

channel?.addEventListener('message', () => void reloadOutbox().catch(() => undefined));

subscribeVault(() => {
  const vault = vaultState();
  if (vault.status === 'unlocked' && vault.userId) {
    if (loadedFor !== vault.userId) void reloadOutbox().catch(() => undefined);
    return;
  }
  loadedFor = null;
  if (items !== EMPTY) {
    items = EMPTY;
    emit();
  }
});

/** Keeps a change on this phone until the server confirms it. The person's vault must be open. */
export async function addToOutbox(
  userId: string,
  kind: OutboxKind,
  change: { id: string; createdAt: number; args: Args; label: string; meta?: Args }
) {
  const db = offlineDb();
  if (!db || !vaultOpenFor(userId)) throw new Error('Offline saving is locked. Unlock it with your PIN.');
  const payload: Payload = { args: change.args, label: change.label, meta: change.meta ?? {} };
  const sealed = await sealFor(userId, recordKey(change.id), payload as unknown as Value);
  await db.outbox.put({
    id: change.id,
    userId,
    kind,
    createdAt: change.createdAt,
    status: 'pending',
    attempts: 0,
    nextTryAt: 0,
    ...sealed,
  });
  await changed();
}

/** Changes what a waiting change will send (an offline edit made again before it went). */
export async function replaceInOutbox(
  id: string,
  update: { args?: Args; label?: string; conflict?: NoteConflict | null; status?: OutboxStatus }
) {
  const db = offlineDb();
  const userId = vaultState().userId;
  const row = await db?.outbox.get(id);
  if (!db || !row || !vaultOpenFor(userId) || row.userId !== userId) throw new Error('This change is no longer waiting.');
  const payload = (await openFor(userId, recordKey(id), row)) as unknown as Payload;
  const next: Payload = {
    ...payload,
    args: update.args ?? payload.args,
    label: update.label ?? payload.label,
    conflict: update.conflict === null ? undefined : (update.conflict ?? payload.conflict),
  };
  if (next.conflict === undefined) delete next.conflict;
  const sealed = await sealFor(userId, recordKey(id), next as unknown as Value);
  await db.outbox.put({
    ...row,
    ...sealed,
    status: update.status ?? row.status,
    ...(update.status === 'pending' ? { attempts: 0, nextTryAt: 0, error: undefined } : {}),
  });
  await changed();
}

/** Records how sending went (sync.ts). */
export async function markOutbox(id: string, patch: Partial<Pick<OutboxRow, 'status' | 'attempts' | 'nextTryAt' | 'error'>>) {
  await offlineDb()?.outbox.update(id, patch);
  await changed();
}

/** The server has it (or the person discarded it). */
export async function removeFromOutbox(id: string) {
  await offlineDb()?.outbox.delete(id);
  await changed();
}

/** Try a failed change again. */
export async function retryOutbox(id: string) {
  await markOutbox(id, { status: 'pending', attempts: 0, nextTryAt: 0, error: undefined });
}

/** How many changes this person has waiting on this phone (readable while locked: no contents). */
export async function unsentCount(userId: string): Promise<number> {
  return (await offlineDb()?.outbox.where('userId').equals(userId).count()) ?? 0;
}
