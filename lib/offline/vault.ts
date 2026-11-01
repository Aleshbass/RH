'use client';

/**
 * The offline vault: one person's encrypted data on this phone, and whether it's unlocked.
 *
 * - Set up online with a 4-6 digit PIN; the data key is locked by the PIN and by this phone's
 *   secret from Convex (convex/offline.ts). Online the vault opens with the secret, so the PIN is
 *   only asked offline.
 * - Locks after 5 minutes without use; offline, the PIN opens it again.
 * - 10 wrong PINs in a row wipe this person's offline data (it's all on the server anyway).
 * - The unlocked key can't be exported. It stays usable across page loads (offline, every page
 *   change is a full load) until 5 minutes without use, then the PIN is needed again.
 */
import { useSyncExternalStore } from 'react';
import type { Value } from 'convex/values';
import {
  PIN_ITERATIONS,
  keyFromDeviceSecret,
  keyFromPin,
  newDataKey,
  open,
  randomBytes,
  seal,
  unwrapDataKey,
  wrapDataKey,
} from './crypto';
import { deleteOfflineDb, offlineDb, type VaultRow } from './db';

export const AUTO_LOCK_MS = 5 * 60 * 1000;
export const MAX_PIN_ATTEMPTS = 10;
export const PIN_PATTERN = /^\d{4,6}$/;
/** Saved answers older than this are dropped, and each person keeps at most MAX_SAVED */
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SAVED = 400;
const DEVICE_ID_KEY = 'rh_offline_device';

export type VaultStatus = 'unknown' | 'none' | 'locked' | 'unlocked';
export type VaultState = {
  status: VaultStatus;
  userId: string | null;
  failedAttempts: number;
  /** The saved data was just removed after too many wrong PINs (the offline screen says why) */
  wipedForPins: boolean;
};

const SERVER_STATE: VaultState = { status: 'unknown', userId: null, failedAttempts: 0, wipedForPins: false };
let state: VaultState = SERVER_STATE;
let dataKey: CryptoKey | null = null;
/** This phone's secret for the signed-in person, held in memory while online */
let deviceSecret: { userId: string; secret: string } | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<VaultState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVault(): VaultState {
  return useSyncExternalStore(subscribeVault, () => state, () => SERVER_STATE);
}

export function vaultState(): VaultState {
  return state;
}

/** A random id for this phone (not secret; the server pairs it with the secret). */
export function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY);
    if (saved) return saved;
    const id = btoa(String.fromCharCode(...randomBytes(24))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return '';
  }
}

/** After the phone was switched off: the next set-up registers it as a new device. */
export function forgetDeviceId() {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    // Storage blocked: nothing saved
  }
}

export function rememberDeviceSecret(userId: string, secret: string) {
  deviceSecret = { userId, secret };
}

export function deviceSecretFor(userId: string): string | null {
  return deviceSecret?.userId === userId ? deviceSecret.secret : null;
}

/**
 * Finds out whether this person has a vault on this phone: still open from the last page (used in
 * the last 5 minutes), locked, or none.
 */
export async function loadVault(userId: string): Promise<VaultStatus> {
  if (state.userId === userId && state.status !== 'unknown') return state.status;
  dataKey = null;
  const db = offlineDb();
  const row = await db?.vaults.get(userId);
  if (db && row) {
    const open = await db.unlocked.get(userId);
    if (open && open.expiresAt > Date.now()) {
      dataKey = open.key;
      touch();
      update({ userId, status: 'unlocked', failedAttempts: row.failedAttempts });
      return state.status;
    }
    if (open) await db.unlocked.delete(userId);
  }
  update({ userId, status: row ? 'locked' : 'none', failedAttempts: row?.failedAttempts ?? 0 });
  return state.status;
}

let keptOpenAt = 0;

/** Keeps the vault open across page loads until 5 minutes without use (key stays non-extractable). */
async function keepOpen(userId: string) {
  const db = offlineDb();
  if (!db || !dataKey) return;
  keptOpenAt = Date.now();
  await db.unlocked.put({ userId, key: dataKey, expiresAt: keptOpenAt + AUTO_LOCK_MS });
}

async function forgetOpen(userId: string | null) {
  keptOpenAt = 0;
  if (userId) await offlineDb()?.unlocked.delete(userId);
}

/** First set-up, online: a new data key locked by the PIN and by the device secret. */
export async function createVault(userId: string, pin: string, secret: string) {
  if (!PIN_PATTERN.test(pin)) throw new Error('The PIN must be 4 to 6 digits');
  const db = offlineDb();
  if (!db) throw new Error('This browser can’t keep data for offline use');
  const key = await newDataKey();
  const pinSalt = randomBytes(16);
  const deviceSalt = randomBytes(16);
  const row: VaultRow = {
    userId,
    deviceId: deviceId(),
    pinSalt,
    pinIterations: PIN_ITERATIONS,
    wrappedByPin: await wrapDataKey(key, await keyFromPin(pin, pinSalt)),
    deviceSalt,
    wrappedByDevice: await wrapDataKey(key, await keyFromDeviceSecret(secret, deviceSalt)),
    failedAttempts: 0,
    createdAt: Date.now(),
  };
  await db.vaults.put(row);
  // In memory, only a non-extractable copy
  dataKey = await unwrapDataKey(row.wrappedByDevice, await keyFromDeviceSecret(secret, deviceSalt));
  // Ask the browser not to clear this data under storage pressure
  void navigator.storage?.persist?.().catch(() => undefined);
  touch();
  await keepOpen(userId);
  update({ userId, status: 'unlocked', failedAttempts: 0, wipedForPins: false });
}

/** Offline unlock. "wiped" after too many wrong PINs. */
export async function unlockWithPin(userId: string, pin: string): Promise<'ok' | 'wrong' | 'wiped'> {
  const db = offlineDb();
  const row = await db?.vaults.get(userId);
  if (!db || !row) {
    update({ userId, status: 'none', failedAttempts: 0 });
    return 'wiped';
  }
  try {
    dataKey = await unwrapDataKey(row.wrappedByPin, await keyFromPin(pin, row.pinSalt, row.pinIterations));
  } catch {
    const failedAttempts = row.failedAttempts + 1;
    if (failedAttempts >= MAX_PIN_ATTEMPTS) {
      await wipeUser(userId);
      update({ wipedForPins: true });
      return 'wiped';
    }
    await db.vaults.update(userId, { failedAttempts });
    update({ failedAttempts });
    return 'wrong';
  }
  if (row.failedAttempts) await db.vaults.update(userId, { failedAttempts: 0 });
  touch();
  await keepOpen(userId);
  update({ userId, status: 'unlocked', failedAttempts: 0 });
  void prune(userId);
  return 'ok';
}

/** Online unlock with the device secret (signing in proves who it is, so wrong-PIN counts reset). */
export async function unlockWithDevice(userId: string, secret: string): Promise<boolean> {
  const db = offlineDb();
  const row = await db?.vaults.get(userId);
  if (!db || !row) return false;
  try {
    dataKey = await unwrapDataKey(row.wrappedByDevice, await keyFromDeviceSecret(secret, row.deviceSalt));
  } catch {
    return false;
  }
  if (row.failedAttempts) await db.vaults.update(userId, { failedAttempts: 0 });
  touch();
  await keepOpen(userId);
  update({ userId, status: 'unlocked', failedAttempts: 0 });
  void prune(userId);
  return true;
}

/** Online, signed in: a new PIN (forgotten or changed). The saved data is kept. */
export async function replacePin(userId: string, pin: string, secret: string) {
  if (!PIN_PATTERN.test(pin)) throw new Error('The PIN must be 4 to 6 digits');
  const db = offlineDb();
  const row = await db?.vaults.get(userId);
  if (!db || !row) throw new Error('Offline use isn’t set up on this device');
  const key = await unwrapDataKey(row.wrappedByDevice, await keyFromDeviceSecret(secret, row.deviceSalt), true);
  const pinSalt = randomBytes(16);
  await db.vaults.update(userId, {
    pinSalt,
    pinIterations: PIN_ITERATIONS,
    wrappedByPin: await wrapDataKey(key, await keyFromPin(pin, pinSalt)),
    failedAttempts: 0,
  });
  dataKey = await unwrapDataKey(row.wrappedByDevice, await keyFromDeviceSecret(secret, row.deviceSalt));
  touch();
  await keepOpen(userId);
  update({ userId, status: 'unlocked', failedAttempts: 0 });
}

export function lock() {
  dataKey = null;
  void forgetOpen(state.userId).catch(() => undefined);
  if (state.status === 'unlocked') update({ status: 'locked' });
}

/** Removes one person's offline data from this phone (sign-out, switched-off phone, 10 wrong PINs). */
export async function wipeUser(userId: string) {
  const db = offlineDb();
  if (db) {
    await db.transaction('rw', db.vaults, db.queries, db.unlocked, async () => {
      await db.vaults.delete(userId);
      await db.queries.where('userId').equals(userId).delete();
      await db.unlocked.delete(userId);
    });
  }
  if (deviceSecret?.userId === userId) deviceSecret = null;
  if (state.userId === userId) {
    dataKey = null;
    update({ status: 'none', failedAttempts: 0 });
  }
}

/** Removes everyone's offline data (offline mode switched off, or "Reset offline data"). */
export async function wipeAll() {
  dataKey = null;
  deviceSecret = null;
  await deleteOfflineDb();
  update({ status: 'unknown', userId: null, failedAttempts: 0, wipedForPins: false });
}

// ---- Saved query answers (encrypted) ----

function usable(userId: string) {
  return dataKey !== null && state.status === 'unlocked' && state.userId === userId;
}

export async function saveAnswer(userId: string, key: string, value: Value) {
  const db = offlineDb();
  if (!db || !usable(userId) || !dataKey) return;
  const sealed = await seal(dataKey, key, value);
  await db.queries.put({ key, userId, savedAt: Date.now(), ...sealed });
}

/** The saved answer, or null (none saved, vault locked, or it no longer decrypts). */
export async function readAnswer(userId: string, key: string): Promise<{ value: Value; savedAt: number } | null> {
  const db = offlineDb();
  if (!db || !usable(userId) || !dataKey) return null;
  const row = await db.queries.get(key);
  if (!row || row.userId !== userId) return null;
  try {
    return { value: await open(dataKey, key, row), savedAt: row.savedAt };
  } catch {
    await db.queries.delete(key);
    return null;
  }
}

/** Every saved answer of this person, decrypted (on unlock; at most MAX_SAVED). */
export async function readAllAnswers(userId: string): Promise<Map<string, Value>> {
  const answers = new Map<string, Value>();
  const db = offlineDb();
  if (!db || !usable(userId) || !dataKey) return answers;
  const key = dataKey;
  const rows = await db.queries.where('userId').equals(userId).toArray();
  for (const row of rows) {
    try {
      answers.set(row.key, await open(key, row.key, row));
    } catch {
      await db.queries.delete(row.key);
    }
  }
  return answers;
}

/** Retention: drop old answers and keep the newest MAX_SAVED per person. */
async function prune(userId: string) {
  const db = offlineDb();
  if (!db) return;
  const cutoff = Date.now() - KEEP_MS;
  await db.queries
    .where('[userId+savedAt]')
    .between([userId, 0], [userId, cutoff])
    .delete();
  const count = await db.queries.where('userId').equals(userId).count();
  if (count > MAX_SAVED) {
    const oldest = await db.queries
      .where('[userId+savedAt]')
      .between([userId, 0], [userId, Infinity])
      .limit(count - MAX_SAVED)
      .primaryKeys();
    await db.queries.bulkDelete(oldest);
  }
}

// ---- Auto-lock after 5 minutes without use ----

let lastActivity = Date.now();
let autoLockStarted = false;

function touch() {
  lastActivity = Date.now();
  // Still in use: keep it open across page loads (written at most every 30 seconds)
  if (state.status === 'unlocked' && state.userId && lastActivity - keptOpenAt > 30_000) {
    void keepOpen(state.userId).catch(() => undefined);
  }
}

export function startAutoLock() {
  if (autoLockStarted || typeof window === 'undefined') return;
  autoLockStarted = true;
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    window.addEventListener(type, touch, { passive: true });
  }
  const check = () => {
    if (state.status === 'unlocked' && Date.now() - lastActivity > AUTO_LOCK_MS) lock();
  };
  // Back from the background after a long time: lock before anything shows
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.setInterval(check, 30_000);
}
