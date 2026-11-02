'use client';

/**
 * Keeps the offline vault (lib/offline/vault.ts) in step with sign-in. Mounted once in the root
 * layout, inside Clerk and Convex.
 * - Offline mode off (master switch, or this account not in the pilot): nothing is kept on the
 *   phone; turning it off wipes what was there (also the kill switch for data).
 * - Online and signed in: the account's pilot switch is read; a locked vault opens silently with
 *   this phone's secret from Convex; a phone that was switched off remotely wipes its copy.
 * - Offline: the last person's vault is found so the PIN screen can open it.
 */
import { useEffect } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { offlineModeOn, setOfflinePilot, useOfflineMode } from '@/lib/pwa';
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
const myUserRef = makeFunctionReference<'query', Record<string, never>, { offlinePilot?: boolean } | null>(
  'users:getMyUser'
);

const PILOT_MODE = process.env.NEXT_PUBLIC_OFFLINE_MODE === 'pilot';

export default function OfflineBridge() {
  const session = useOfflineSession();
  const vault = useVault();
  const offlineMode = useOfflineMode();
  const { isAuthenticated } = useConvexAuth();
  const unlockDevice = useMutation(unlockDeviceRef);
  const signedInUser = session.mode === 'online' ? session.userId : null;
  // Pilot: the account's switch, read live whenever someone is signed in online
  const me = useQuery(myUserRef, PILOT_MODE && signedInUser && isAuthenticated ? {} : 'skip');

  useEffect(() => {
    if (!PILOT_MODE || !signedInUser || !isAuthenticated || me === undefined || me === null) return;
    setOfflinePilot(me.offlinePilot === true);
  }, [signedInUser, isAuthenticated, me]);

  // Effects read offlineModeOn() itself, not `offlineMode`: while a page starts up that value is
  // briefly "off" (the server can't see this phone's pilot switch), and wiping on it would erase
  // a pilot user's offline copy on every page load
  useEffect(() => {
    if (!offlineModeOn()) {
      void wipeAll().catch(() => undefined);
      return;
    }
    startAutoLock();
  }, [offlineMode]);

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
  }, [offlineMode, signedInUser, isAuthenticated, vault.status, unlockDevice]);

  // Offline (or still loading): find the last person's vault for the PIN screen
  useEffect(() => {
    if (!offlineModeOn() || session.mode === 'online') return;
    const last = lastSignedInUser();
    if (last) void loadVault(last).catch(() => undefined);
  }, [offlineMode, session.mode]);

  return null;
}
