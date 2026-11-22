'use client';

/**
 * Saves never wait forever for a connection that isn't there. Without internet, a save is refused
 * on the phone straight away, before anything is sent, with a plain message (lib/offline/convexClient.ts).
 * Nothing is half-sent, so nothing saves later by surprise. Changes that can be kept on the phone
 * (lib/offline/offlineWrite.ts) never get here offline: they're kept and sent later instead.
 */
import { ConvexError } from 'convex/values';

export const OFFLINE_SAVE_MESSAGE = 'You’re offline, so this wasn’t saved. Try again when you’re back online.';

/**
 * Refused on the phone because there's no connection. A ConvexError with a plain-text message, so
 * screens show it like any other refusal; `offline` tells the outbox to keep it and try again later.
 */
export class OfflineSaveError extends ConvexError<string> {
  readonly offline = true;

  constructor() {
    super(OFFLINE_SAVE_MESSAGE);
  }
}

export function isOfflineSaveError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { offline?: unknown }).offline === true);
}

/** The phone says it has no network at all. */
export function phoneOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
