'use client';

import { useEffect } from 'react';
import { startPwa } from '@/lib/pwa';

/** Registers the service worker and keeps the browser's install prompt (lib/pwa.ts). */
export default function PwaRegister() {
  useEffect(() => {
    startPwa();
  }, []);
  return null;
}
