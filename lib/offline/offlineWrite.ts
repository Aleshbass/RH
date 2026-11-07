'use client';

/**
 * Saving that works without internet, for the changes in lib/offline/outbox.ts (exercise logs,
 * check-ins, clinical notes). Online it saves straight away as before, and the server's answer or
 * refusal comes back as usual. Offline, or with no answer in time, the change is kept on this
 * phone (encrypted) and sent when the connection is back: `{ queued: true }`.
 * Without offline use on this phone (not in the pilot, no PIN) it simply saves online.
 */
import { useCallback } from 'react';
import { useConvex } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { Value } from 'convex/values';
import { offlineModeOn } from '@/lib/pwa';
import { OUTBOX_FUNCTIONS, addToOutbox, newClientId, type OutboxKind } from './outbox';
import { kickSync, refusal, withTimeout } from './sync';
import { vaultOpenFor, vaultState } from './vault';

type Args = Record<string, Value>;
/** Mutation arguments as components build them (optional fields may be undefined) */
type Input = Record<string, Value | undefined>;
export type WriteResult<R> = { queued: false; result: R } | { queued: true };

/** Leaves out fields that aren't set (stored and sent the same way). */
const defined = (input: Input): Args =>
  Object.fromEntries(Object.entries(input).filter((entry): entry is [string, Value] => entry[1] !== undefined));

/** Online, an answer slower than this keeps the change on the phone instead (it still goes) */
const LIVE_TIMEOUT = 10_000;

export type WriteOptions = {
  /** How it's listed while waiting, e.g. "Clinical note · Ada Obi" (kept encrypted) */
  label: string;
  /** What it belongs to, so pages show it before it's sent (e.g. patientId, programId) */
  meta?: Args;
  /** Sent instead of `args` when saving straight away online (e.g. a note edit without its offline version check) */
  liveArgs?: Input;
};

/** True when changes can be kept on this phone (offline use on and the vault open). */
export function canKeepOffline(): boolean {
  return offlineModeOn() && vaultOpenFor(vaultState().userId);
}

export function useOfflineWrite<R = unknown>(kind: OutboxKind) {
  const convex = useConvex();
  return useCallback(
    async (args: Input, options: WriteOptions): Promise<WriteResult<R>> => {
      const id = newClientId();
      const createdAt = Date.now();
      // New records carry the phone's id (saved once) and when they were made; an edit carries
      // the version it started from instead (in `args`)
      const stamp = (a: Input): Args => defined(kind === 'noteUpdate' ? a : { ...a, clientId: id, occurredAt: createdAt });
      const ref = makeFunctionReference<'mutation', Args, R>(OUTBOX_FUNCTIONS[kind]);
      const live = stamp(options.liveArgs ?? args);
      const userId = vaultState().userId;

      if (!offlineModeOn() || !vaultOpenFor(userId)) {
        return { queued: false, result: await convex.mutation(ref, live) };
      }
      if (navigator.onLine && convex.connectionState().isWebSocketConnected) {
        try {
          return { queued: false, result: await withTimeout(convex.mutation(ref, live), LIVE_TIMEOUT) };
        } catch (error) {
          // Refused: say why, as before. No answer: keep it and send it later (saved once).
          if (refusal(error) !== undefined) throw error;
        }
      }
      await addToOutbox(userId, kind, { id, createdAt, args: stamp(args), label: options.label, meta: options.meta });
      kickSync();
      return { queued: true };
    },
    [convex, kind]
  );
}
