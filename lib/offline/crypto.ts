/**
 * Encryption for data kept on the phone (Web Crypto only; nothing leaves the browser).
 *
 * - A random AES-GCM-256 data key encrypts every stored item. Each item is bound to its record key
 *   (additional data), so encrypted rows can't be swapped between records.
 * - The data key is stored only wrapped (AES-KW), twice: by a key derived from the person's PIN
 *   (PBKDF2-SHA256, 600,000 rounds, OWASP 2023) and by one derived from the device secret held in
 *   Convex (HKDF-SHA256, convex/offline.ts). In memory it is non-extractable.
 */
import { convexToJson, jsonToConvex, type Value } from 'convex/values';

export const PIN_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function newDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** The key that locks the data key with a PIN. Deliberately slow (~0.5-2 s on a phone). */
export async function keyFromPin(pin: string, salt: Uint8Array<ArrayBuffer>, iterations = PIN_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/** The key that locks the data key with this phone's secret from Convex. */
export async function keyFromDeviceSecret(secret: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', base64ToBytes(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('rehabify-offline-vault') },
    base,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

export function wrapDataKey(dataKey: CryptoKey, lockKey: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('raw', dataKey, lockKey, 'AES-KW');
}

/** Throws when the lock key is wrong (wrong PIN, or a secret that changed). */
export function unwrapDataKey(wrapped: ArrayBuffer, lockKey: CryptoKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey('raw', wrapped, lockKey, 'AES-KW', { name: 'AES-GCM', length: 256 }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}

export type Sealed = { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };

/** Encrypts a Convex value (Ids, numbers, bytes and all), bound to `recordKey`. */
export async function seal(dataKey: CryptoKey, recordKey: string, value: Value): Promise<Sealed> {
  const iv = randomBytes(12);
  const plain = encoder.encode(JSON.stringify(convexToJson(value)));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(recordKey) }, dataKey, plain);
  return { iv, data };
}

/** Throws if the data was changed, belongs to another record, or the key is wrong. */
export async function open(dataKey: CryptoKey, recordKey: string, sealed: Sealed): Promise<Value> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sealed.iv, additionalData: encoder.encode(recordKey) },
    dataKey,
    sealed.data
  );
  return jsonToConvex(JSON.parse(decoder.decode(plain)));
}
