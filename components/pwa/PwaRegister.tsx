'use client';

import { useEffect, useState } from 'react';
import { applyUpdate, startPwa, usePwaState } from '@/lib/pwa';

/**
 * Registers the service worker, keeps the install prompt and offers new versions (lib/pwa.ts).
 * The update offer is its own small bar rather than a toast: it must show on every page, above
 * everything, whether or not that page has a toast area, and wait for the person's tap.
 */
export default function PwaRegister() {
  const { updateReady } = usePwaState();
  const [later, setLater] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    startPwa();
  }, []);

  if (!updateReady || later) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[2147483000] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-[#0b1312] px-4 py-3 text-white shadow-lg">
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-semibold">A new version of Rehabify is ready.</span>{' '}
          <span className="text-white/75">Refresh when you’ve finished what you’re doing.</span>
        </p>
        <button
          type="button"
          onClick={() => setLater(true)}
          className="shrink-0 rounded-lg px-2 py-2 text-sm font-medium text-white/80 hover:text-white"
        >
          Later
        </button>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            void applyUpdate();
          }}
          className="shrink-0 rounded-lg bg-[#00cd0f] px-3 py-2 text-sm font-semibold text-[#0b1312] disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
