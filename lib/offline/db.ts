/**
 * The phone's offline store (IndexedDB via Dexie). Holds only encrypted data (lib/offline/crypto.ts)
 * and the locked data keys; nothing in here is readable without the person's PIN or device secret.
 */
import Dexie, { type Table } from 'dexie';

/** One person's locked data key on this phone. */
export type VaultRow = {
  userId: string;
  deviceId: string;
  pinSalt: Uint8Array<ArrayBuffer>;
  pinIterations: number;
  wrappedByPin: ArrayBuffer;
  deviceSalt: Uint8Array<ArrayBuffer>;
  wrappedByDevice: ArrayBuffer;
  /** Wrong PINs in a row; 10 wipes this person's offline data */
  failedAttempts: number;
  createdAt: number;
};

/** A saved Convex query answer, encrypted. key = `${userId}|${function}|${args}` */
export type SavedQueryRow = {
  key: string;
  userId: string;
  savedAt: number;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
};

/**
 * An unlocked vault that survives page loads (offline, every page change is a full load) until
 * 5 minutes without use. The key is a non-extractable CryptoKey: usable here, never readable.
 */
export type UnlockedRow = {
  userId: string;
  key: CryptoKey;
  expiresAt: number;
};

export type OutboxStatus = 'pending' | 'failed' | 'conflict';

/**
 * A change made on this phone that the server hasn't confirmed yet (lib/offline/outbox.ts). `id` is
 * the id the phone gave it, sent with it so the server saves it once. The change itself (which
 * patient, what was written) is encrypted in `data`; the rest says nothing about anyone.
 */
export type OutboxRow = {
  id: string;
  userId: string;
  kind: string;
  /** When it was made (sent as "when it happened") */
  createdAt: number;
  status: OutboxStatus;
  /** Tries that failed for want of a connection */
  attempts: number;
  nextTryAt: number;
  /** Why the server refused it (our own messages) */
  error?: string;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
};

class OfflineDb extends Dexie {
  vaults!: Table<VaultRow, string>;
  queries!: Table<SavedQueryRow, string>;
  unlocked!: Table<UnlockedRow, string>;
  outbox!: Table<OutboxRow, string>;

  constructor() {
    super('rehabify-vault');
    this.version(1).stores({
      vaults: 'userId',
      queries: 'key, userId, savedAt, [userId+savedAt]',
    });
    this.version(2).stores({ unlocked: 'userId' });
    this.version(3).stores({ outbox: 'id, userId, [userId+createdAt]' });
  }
}

let instance: OfflineDb | null = null;

/** Null where IndexedDB isn't available (server render, some private windows). */
export function offlineDb(): OfflineDb | null {
  if (typeof indexedDB === 'undefined') return null;
  instance ??= new OfflineDb();
  return instance;
}

/** Deletes the whole store (offline mode switched off, or "Reset offline data"). */
export async function deleteOfflineDb() {
  instance?.close();
  instance = null;
  if (typeof indexedDB !== 'undefined') await Dexie.delete('rehabify-vault');
}
