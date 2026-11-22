'use client';

/**
 * Says so when the connection is gone, on every page, for everyone: saves made now aren't kept
 * (they're refused at once: lib/offline/connection.ts), so people know before they type.
 * - No network on the phone: "You're offline".
 * - The phone has network but the line to Rehabify has been down for a few seconds: "Reconnecting".
 * With offline use open on this phone, the portals' own pill (components/offline/SyncStatus.tsx)
 * says what's kept on the phone instead, so this stays out of the way.
 */
import { useEffect, useState } from 'react';
import { useConvexConnectionState } from 'convex/react';
import { Loader2, WifiOff } from '@/components/icons';
import { offlineModeOn } from '@/lib/pwa';
import { useOnline } from '@/lib/offline/session';
import { useVault } from '@/lib/offline/vault';

/** A blip shorter than this (a page change, a quick reconnect) isn't worth a message */
const RECONNECTING_AFTER_MS = 5_000;

export function ConnectionBanner() {
  // Browser only: the server has no connection to report (and shouldn't open one to ask)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Banner /> : null;
}

function Banner() {
  const online = useOnline();
  const vault = useVault();
  const connection = useConvexConnectionState();
  const lineDown = online && connection.hasEverConnected && !connection.isWebSocketConnected;
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!lineDown) {
      setReconnecting(false);
      return;
    }
    const timer = window.setTimeout(() => setReconnecting(true), RECONNECTING_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [lineDown]);

  if (vault.status === 'unlocked' && offlineModeOn()) return null;
  if (online && !reconnecting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-[45] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-[#0b1312] px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-white/10 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6"
    >
      {online ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <WifiOff className="h-4 w-4 shrink-0" />}
      <span className="truncate">
        {online ? 'Connection lost. Reconnecting…' : 'You’re offline. Changes won’t save until you’re back online.'}
      </span>
    </div>
  );
}
