'use client';

/**
 * Keeps the offline vault (lib/offline/vault.ts) in step with sign-in. Mounted once in the root
 * layout, inside Clerk and Convex.
 * - Offline mode off: nothing is kept on the phone (also the kill switch for data).
 * - Online and signed in: a locked vault opens silently with this phone's secret from Convex;
 *   a phone that was switched off remotely wipes its copy.
 * - Offline: the last person's vault is found so the PIN screen can open it.
 */
import { useEffect } from 'react';
import { useConvexAuth, useMutation } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { offlineModeOn } from '@/lib/pwa';
import { lastSignedInUser, useOfflineSession } from '@/lib/offline/session';
import {
  deviceId,
  forgetDeviceId,
  loadVault,
  rememberDeviceSecret,
  startAutoLock,
  unlockWithDevice,
  useVault,
  wipeAll,
  wipeUser,
} from '@/lib/offline/vault';

type UnlockResult = { status: 'ok'; secret: string } | { status: 'revoked' };

// By name: the generated api type is at TypeScript's depth limit (TS2589)
export const unlockDeviceRef = makeFunctionReference<'mutation', { deviceId: string; label?: string }, UnlockResult>(
  'offline:unlockDevice'
);

export default function OfflineBridge() {
  const session = useOfflineSession();
  const vault = useVault();
  const { isAuthenticated } = useConvexAuth();
  const unlockDevice = useMutation(unlockDeviceRef);
  const signedInUser = session.mode === 'online' ? session.userId : null;

  useEffect(() => {
    if (!offlineModeOn()) {
      void wipeAll().catch(() => undefined);
      return;
    }
    startAutoLock();
  }, []);

  // Online: open a locked vault without the PIN (also after the 5-minute auto-lock)
  useEffect(() => {
    if (!offlineModeOn() || !signedInUser || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const status = await loadVault(signedInUser);
      if (status !== 'locked' || cancelled) return;
      const id = deviceId();
      if (!id) return;
      const result = await unlockDevice({ deviceId: id, label: navigator.userAgent.slice(0, 120) });
      if (cancelled) return;
      if (result.status === 'revoked') {
        await wipeUser(signedInUser);
        forgetDeviceId();
        return;
      }
      rememberDeviceSecret(signedInUser, result.secret);
      // Locked with a secret the server no longer has: start again (the data is all on the server)
      if (!(await unlockWithDevice(signedInUser, result.secret))) await wipeUser(signedInUser);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedInUser, isAuthenticated, vault.status, unlockDevice]);

  // Offline (or still loading): find the last person's vault for the PIN screen
  useEffect(() => {
    if (!offlineModeOn() || session.mode === 'online') return;
    const last = lastSignedInUser();
    if (last) void loadVault(last).catch(() => undefined);
  }, [session.mode]);

  return null;
}
