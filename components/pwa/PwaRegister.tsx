'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { applyUpdate, startPwa, usePwaState } from '@/lib/pwa';

const UPDATE_TOAST = 'rh-app-update';

/** Registers the service worker, keeps the install prompt and offers new versions (lib/pwa.ts). */
export default function PwaRegister() {
  const { updateReady } = usePwaState();

  useEffect(() => {
    startPwa();
  }, []);

  useEffect(() => {
    if (!updateReady) return;
    toast('A new version of Rehabify is ready', {
      id: UPDATE_TOAST,
      description: 'Refresh when you have finished what you are doing.',
      duration: Infinity,
      action: { label: 'Refresh', onClick: () => void applyUpdate() },
    });
  }, [updateReady]);

  return null;
}
