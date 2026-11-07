'use client';

/**
 * Sends the changes waiting on this phone (lib/offline/outbox.ts), oldest first, once the phone is
 * online, the vault is open and the server has accepted the same person's sign-in. One tab sends
 * at a time (Web Locks). A change leaves the phone only when the server confirms it:
 * - no answer (no connection, server unreachable): tried again later, then marked failed after
 *   5 tries, never dropped;
 * - refused (e.g. the programme was archived): kept with the reason, to retry or discard;
 * - an offline note edit that met another change: kept for the person to review (NOTE_CHANGED).
 */
import { makeFunctionReference } from 'convex/server';
import type { ConvexReactClient } from 'convex/react';
import type { Value } from 'convex/values';
import { OUTBOX_FUNCTIONS, markOutbox, outboxItems, reloadOutbox, removeFromOutbox, replaceInOutbox, type NoteConflict, type OutboxItem } from './outbox';
import { subscribeVault, vaultOpenFor, vaultState } from './vault';

/** The Convex client, as far as sending needs it (lib/offline/convexClient.ts) */
export type SyncClient = Pick<ConvexReactClient, 'mutation'> & { signedInUser(): string | null };

/** Waits before trying again after no answer: 5 s, 30 s, 2 min, 10 min, then failed */
const RETRY_AFTER = [5_000, 30_000, 120_000, 600_000];
const MAX_TRIES = RETRY_AFTER.length + 1;
/** No answer in this long counts as no connection (the Convex client keeps the request and may still deliver it: the server saves it once) */
const SEND_TIMEOUT = 20_000;

let client: SyncClient | null = null;
let running = false;
let again = false;
let timer = 0;

/** No answer in time: rejects with a plain Error (not a server refusal). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('No answer from the server in time')), ms);
    promise.then(
      (value) => {
        window.clearTimeout(t);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(t);
        reject(error);
      }
    );
  });
}

/** The server's reason when it refused (ConvexError data), or undefined when there was no answer. */
export function refusal(error: unknown): unknown {
  if (error && typeof error === 'object' && 'data' in error && (error as { name?: string }).name === 'ConvexError') {
    return (error as { data: unknown }).data;
  }
  return undefined;
}

function refusalMessage(data: unknown): string {
  if (typeof data === 'string' && data) return data;
  if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') return (data as { message: string }).message;
  return 'The server couldn’t save this.';
}

function noteConflictOf(data: unknown): NoteConflict | null {
  if (!data || typeof data !== 'object' || (data as { code?: unknown }).code !== 'NOTE_CHANGED') return null;
  return ((data as { current?: NoteConflict }).current ?? null) as NoteConflict | null;
}

export function startOutboxSync(next: SyncClient) {
  const first = client === null;
  client = next;
  if (!first || typeof window === 'undefined') return;
  window.addEventListener('online', () => kickSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kickSync();
  });
  subscribeVault(() => kickSync());
  window.setInterval(() => kickSync(), 30_000);
  kickSync();
}

/** Sends soon (several triggers at once send once). */
export function kickSync() {
  if (typeof window === 'undefined' || !client) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow().catch(() => undefined), 300);
}

/** Sends what's waiting now. Resolves when this round is done. */
export async function syncNow(): Promise<void> {
  if (!client) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await oneTabAtATime(sendWaiting);
    } while (again);
  } finally {
    running = false;
  }
}

async function oneTabAtATime(run: () => Promise<void>) {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks?.request) return run();
  await locks.request('rehabify-outbox-sync', { ifAvailable: true }, async (lock) => {
    if (lock) await run();
  });
}

function ready(userId: string | null): userId is string {
  return Boolean(client && navigator.onLine && vaultOpenFor(userId) && client.signedInUser() === userId);
}

async function sendWaiting() {
  const userId = vaultState().userId;
  if (!ready(userId)) return;
  // Fresh from storage: another tab may have sent some
  await reloadOutbox();
  for (const item of outboxItems()) {
    if (item.status !== 'pending' || item.nextTryAt > Date.now()) continue;
    // Signed out or someone else signed in meanwhile: stop
    if (!ready(userId) || vaultState().userId !== userId) return;
    if ((await send(item)) === 'no answer') return;
  }
}

async function send(item: OutboxItem): Promise<'sent' | 'refused' | 'no answer'> {
  const ref = makeFunctionReference<'mutation', Record<string, Value>>(OUTBOX_FUNCTIONS[item.kind]);
  try {
    await withTimeout(client!.mutation(ref, item.args), SEND_TIMEOUT);
    await removeFromOutbox(item.id);
    return 'sent';
  } catch (error) {
    const data = refusal(error);
    if (data === undefined) {
      const attempts = item.attempts + 1;
      if (attempts >= MAX_TRIES) {
        await markOutbox(item.id, { status: 'failed', attempts, error: 'Couldn’t send this after several tries. Check your connection and try again.' });
      } else {
        await markOutbox(item.id, { attempts, nextTryAt: Date.now() + RETRY_AFTER[attempts - 1] });
      }
      return 'no answer';
    }
    const conflict = noteConflictOf(data);
    if (conflict) {
      await replaceInOutbox(item.id, { conflict, status: 'conflict' });
      return 'refused';
    }
    await markOutbox(item.id, { status: 'failed', error: refusalMessage(data) });
    return 'refused';
  }
}
