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

class OfflineDb extends Dexie {
  vaults!: Table<VaultRow, string>;
  queries!: Table<SavedQueryRow, string>;
  unlocked!: Table<UnlockedRow, string>;

  constructor() {
    super('rehabify-vault');
    this.version(1).stores({
      vaults: 'userId',
      queries: 'key, userId, savedAt, [userId+savedAt]',
    });
    this.version(2).stores({ unlocked: 'userId' });
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
