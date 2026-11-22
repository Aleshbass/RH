'use client';

/**
 * "Turn on" / "Choose a PIN" in Settings (components/offline/OfflineUseSettings.tsx) asks the PIN
 * dialog (components/offline/OfflineGate.tsx) to open now: no daily snooze, no waiting its turn.
 * Kept until the dialog takes it, in case the dialog mounts only once offline use is switched on.
 */
let requested = false;
const listeners = new Set<() => void>();

export function requestOfflineSetup() {
  requested = true;
  listeners.forEach((listener) => listener());
}

/** True once per request: the dialog that takes it opens. */
export function takeOfflineSetupRequest(): boolean {
  const was = requested;
  requested = false;
  return was;
}

export function onOfflineSetupRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
