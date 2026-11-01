'use client';

/**
 * Saved query answers in memory while the vault is open, so a page can render them straight away
 * (lib/offline/convexClient.ts reads them synchronously). Loaded from the encrypted store when the
 * vault opens; dropped from memory when it locks.
 */
import { convexToJson, type Value } from 'convex/values';
import { readAllAnswers, saveAnswer, subscribeVault, vaultState } from './vault';

let answers = new Map<string, Value>();
let savedJson = new Map<string, string>();
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Called when saved answers appear (vault opened) or go (vault locked). */
export function onSavedAnswersChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function answerKey(userId: string, functionName: string, keyArgs: Record<string, unknown>) {
  return `${userId}|${functionName}|${JSON.stringify(convexToJson(keyArgs as Value))}`;
}

subscribeVault(() => {
  const vault = vaultState();
  if (vault.status === 'unlocked' && vault.userId) {
    if (loadedFor === vault.userId) return;
    const userId = vault.userId;
    loadedFor = userId;
    readAllAnswers(userId)
      .then((loaded) => {
        const now = vaultState();
        if (now.status !== 'unlocked' || now.userId !== userId) return;
        answers = loaded;
        savedJson = new Map();
        notify();
      })
      .catch(() => undefined);
    return;
  }
  loadedFor = null;
  if (answers.size > 0) {
    answers = new Map();
    savedJson = new Map();
    notify();
  }
});

/** The saved answer for the person whose vault is open, if any. */
export function savedAnswer(functionName: string, keyArgs: Record<string, unknown>): Value | undefined {
  const vault = vaultState();
  if (vault.status !== 'unlocked' || !vault.userId) return undefined;
  return answers.get(answerKey(vault.userId, functionName, keyArgs));
}

/**
 * Keeps a live answer for offline use. Only for `userId`, the person the answer was given to,
 * and only when their vault is open (never someone else's).
 */
export function keepAnswer(userId: string, functionName: string, keyArgs: Record<string, unknown>, value: Value) {
  const vault = vaultState();
  if (vault.status !== 'unlocked' || vault.userId !== userId) return;
  const key = answerKey(userId, functionName, keyArgs);
  const json = JSON.stringify(convexToJson(value));
  // Live queries re-send the same answer often: only write when it changed
  if (savedJson.get(key) === json) return;
  savedJson.set(key, json);
  answers.set(key, value);
  saveAnswer(userId, key, value).catch(() => undefined);
}
