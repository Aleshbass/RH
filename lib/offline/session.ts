'use client';

/**
 * Who is using the app, online or off. Every portal gate asks this instead of Clerk directly:
 * offline, Clerk can't load, so the person is the last one signed in on this phone, and only once
 * their vault is unlocked with the PIN (components/offline/OfflineGate.tsx).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useOfflineMode } from '@/lib/pwa';
import { useVault } from './vault';

const LAST_USER_KEY = 'rh_last_user';
/** Clerk normally loads in 1-3 s; this long without it means it can't be reached */
const CLERK_STALLED_MS = 8_000;

export function lastSignedInUser(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** The browser's own online/offline flag (true on the server). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export type OfflineSession =
  /** Clerk loaded: signed in (userId) or signed out (null) */
  | { mode: 'online'; userId: string | null }
  /** No connection to Clerk: the last person signed in on this phone, if their vault is here */
  | { mode: 'offline'; userId: string; unlocked: boolean }
  /** Still finding out */
  | { mode: 'loading'; userId: null };

export function useOfflineSession(): OfflineSession {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const online = useOnline();
  const vault = useVault();
  const offlineMode = useOfflineMode();
  const [clerkStalled, setClerkStalled] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setClerkStalled(false);
      return;
    }
    const timer = window.setTimeout(() => setClerkStalled(true), CLERK_STALLED_MS);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  if (isLoaded) return { mode: 'online', userId: isSignedIn && userId ? userId : null };

  if (offlineMode && (!online || clerkStalled)) {
    const last = lastSignedInUser();
    if (last && vault.userId === last && (vault.status === 'locked' || vault.status === 'unlocked')) {
      return { mode: 'offline', userId: last, unlocked: vault.status === 'unlocked' };
    }
  }
  return { mode: 'loading', userId: null };
}
