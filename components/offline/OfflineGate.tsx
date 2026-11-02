'use client';

/**
 * Wraps each portal (physio, clinic, patient). Offline, nothing shows until the PIN opens the
 * vault. Online, someone without a PIN on this phone is asked once a day to choose one.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Lock, WifiOff } from '@/components/icons';
import { primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui';
import { unlockDeviceRef } from '@/components/offline/OfflineBridge';
import { useOfflineMode } from '@/lib/pwa';
import { lastSignedInUser, useOfflineSession, useOnline } from '@/lib/offline/session';
import {
  MAX_PIN_ATTEMPTS,
  PIN_PATTERN,
  createVault,
  deviceId,
  rememberDeviceSecret,
  unlockWithPin,
  useVault,
} from '@/lib/offline/vault';
import { endPromptTurn, whenPromptTurn } from '@/lib/overlayTurn';
import { cn } from '@/lib/utils';

export function OfflineGate({ children }: { children: ReactNode }) {
  const session = useOfflineSession();
  const online = useOnline();
  const vault = useVault();
  const offlineMode = useOfflineMode();
  if (!offlineMode) return <>{children}</>;
  if (session.mode === 'offline' && !session.unlocked) return <PinUnlockScreen userId={session.userId} />;
  // Offline with nothing saved on this phone (never set up, or just wiped): say so, instead of a
  // loading screen that would never finish
  if (session.mode === 'loading' && !online && (vault.status === 'none' || !lastSignedInUser())) {
    return <OfflineUnavailable wipedForPins={vault.wipedForPins} />;
  }
  return (
    <>
      {children}
      {session.mode === 'online' && session.userId ? <PinSetupPrompt userId={session.userId} /> : null}
    </>
  );
}

function PinField({
  id,
  label,
  value,
  onChange,
  autoFocus,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="block text-left">
      <span className="text-sm font-medium text-pt-ink">{label}</span>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        className="mt-1.5 w-full rounded-xl border border-pt-line-strong bg-pt-surface px-4 py-3 text-center text-2xl tracking-[0.5em] text-pt-ink outline-none focus:border-pt-primary disabled:opacity-60"
      />
    </label>
  );
}

function OfflineCard({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-pt-canvas px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-pt-line bg-pt-surface p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pt-hover text-pt-ink">{icon}</div>
        {children}
      </div>
    </div>
  );
}

/** Offline: the PIN opens the data saved on this phone. */
function PinUnlockScreen({ userId }: { userId: string }) {
  const vault = useVault();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const left = MAX_PIN_ATTEMPTS - vault.failedAttempts;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!PIN_PATTERN.test(pin) || busy) return;
    setBusy(true);
    setMessage(null);
    // After the 10th wrong PIN the data is wiped and OfflineGate shows why
    const result = await unlockWithPin(userId, pin).catch(() => 'wrong' as const);
    setBusy(false);
    setPin('');
    if (result === 'wrong') setMessage('That PIN isn’t right.');
  }

  return (
    <OfflineCard icon={<Lock className="h-5 w-5" />}>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-pt-ink">You’re offline</h1>
          <p className="mt-1 text-sm text-pt-muted">Enter your PIN to open what’s saved on this phone.</p>
        </div>
        <PinField id="offline-pin" label="PIN" value={pin} onChange={setPin} autoFocus disabled={busy} />
        {message ? (
          <p role="alert" className="text-sm text-pt-rose-fg">
            {message} {left <= 3 ? `${left} ${left === 1 ? 'try' : 'tries'} left before the saved data is removed.` : null}
          </p>
        ) : null}
        <Button type="submit" disabled={!PIN_PATTERN.test(pin) || busy} className={cn(primaryButtonClass, 'h-12 w-full')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unlock'}
        </Button>
        <p className="text-xs text-pt-muted">
          Forgot your PIN? Connect to the internet, sign out and sign in again, then choose a new one.
        </p>
      </form>
    </OfflineCard>
  );
}

/** Offline with nothing saved on this phone. */
function OfflineUnavailable({ wipedForPins }: { wipedForPins: boolean }) {
  return (
    <OfflineCard icon={<WifiOff className="h-5 w-5" />}>
      {wipedForPins ? (
        <>
          <h1 className="mt-4 text-xl font-semibold text-pt-ink">Offline data removed</h1>
          <p className="mt-2 text-sm text-pt-muted">
            After {MAX_PIN_ATTEMPTS} wrong PINs, the data saved on this phone was removed to keep it safe. Nothing is lost:
            connect to the internet and sign in to carry on.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-xl font-semibold text-pt-ink">You’re offline</h1>
          <p className="mt-2 text-sm text-pt-muted">
            Nothing is saved on this phone for offline use yet. Connect to the internet to carry on; you can turn on offline
            use when you’re back.
          </p>
        </>
      )}
      <Button type="button" onClick={() => window.location.reload()} className={cn(secondaryButtonClass, 'mt-5 h-11 w-full')}>
        Try again
      </Button>
    </OfflineCard>
  );
}

// "v2": snoozes saved before prompts took turns came from taps on another prompt, not "Not now"
const SNOOZE_KEY = 'rh_offline_pin_snoozed_until_v2';

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/** Online, no PIN on this phone yet: offered once a day ("Not now" snoozes it). */
function PinSetupPrompt({ userId }: { userId: string }) {
  const vault = useVault();
  const unlockDevice = useMutation(unlockDeviceRef);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offered = useRef(false);
  const needsPin = vault.userId === userId && vault.status === 'none';

  useEffect(() => {
    if (!needsPin || offered.current || snoozed()) return;
    offered.current = true;
    // One self-opening prompt at a time: it waits for tours, the app setup prompt, consent...
    let cancel: () => void = () => undefined;
    const timer = window.setTimeout(() => {
      cancel = whenPromptTurn('offline-pin', () => setOpen(true));
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, [needsPin]);

  // Closed (set up, "Not now", or no longer needed): the next waiting prompt may open
  useEffect(() => {
    if (!open || !needsPin) endPromptTurn('offline-pin');
  }, [open, needsPin]);
  useEffect(() => () => endPromptTurn('offline-pin'), []);

  function notNow() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      // Storage blocked: it asks again next visit
    }
    setOpen(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!PIN_PATTERN.test(pin)) return setError('Use 4 to 6 digits.');
    if (pin !== confirm) return setError('The two PINs don’t match.');
    setBusy(true);
    setError(null);
    try {
      const id = deviceId();
      if (!id) throw new Error('This browser can’t keep data for offline use.');
      const result = await unlockDevice({ deviceId: id, label: navigator.userAgent.slice(0, 120) });
      if (result.status !== 'ok') throw new Error('This phone was switched off for offline use. Contact support.');
      rememberDeviceSecret(userId, result.secret);
      await createVault(userId, pin, result.secret);
      setOpen(false);
      toast.success('Offline use is on for this phone', {
        description: 'Pages you open are saved, encrypted, so they still open without internet.',
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t set up offline use. Try again.');
    } finally {
      setBusy(false);
      setPin('');
      setConfirm('');
    }
  }

  if (!needsPin) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : notNow())}>
      {/* Taps outside (e.g. on another prompt) don't count as "Not now": only its own buttons do */}
      <DialogContent
        className="max-w-sm rounded-3xl border-pt-line bg-pt-surface"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="text-pt-ink">Use Rehabify without internet</DialogTitle>
        <DialogDescription className="text-pt-muted">
          Choose a 4–6 digit PIN. Pages you open are saved on this phone, encrypted, and the PIN opens them when you’re
          offline. Online you won’t be asked for it.
        </DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          <PinField id="new-pin" label="New PIN" value={pin} onChange={setPin} autoFocus disabled={busy} />
          <PinField id="confirm-pin" label="Type it again" value={confirm} onChange={setConfirm} disabled={busy} />
          {error ? (
            <p role="alert" className="text-sm text-pt-rose-fg">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" onClick={notNow} disabled={busy} className={cn(secondaryButtonClass, 'h-11 flex-1')}>
              Not now
            </Button>
            <Button type="submit" disabled={busy} className={cn(primaryButtonClass, 'h-11 flex-1')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Turn on'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
