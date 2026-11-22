'use client';

/**
 * Settings › "Use Rehabify without internet" on this phone: turn it on (choose a PIN), change the
 * PIN, or turn it off here (this phone's offline copy is deleted; nothing on Rehabify changes).
 * Shown only to accounts that may use it (NEXT_PUBLIC_OFFLINE_MODE, the admin's pilot switch).
 * Turning off waits until changes kept on this phone have been sent, so nothing is stranded.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Loader2, WifiOff } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { unlockDeviceRef } from '@/components/offline/OfflineBridge';
import { setOfflineOnThisPhone, useOfflineAvailable, useOfflineMode } from '@/lib/pwa';
import { unsentCount, useOutbox } from '@/lib/offline/outbox';
import { useOnline } from '@/lib/offline/session';
import { requestOfflineSetup } from '@/lib/offline/setupRequest';
import { PIN_PATTERN, deviceId, rememberDeviceSecret, replacePin, useVault } from '@/lib/offline/vault';

function Row({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-200">
          <WifiOff className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
        </div>
      </div>
      {children ? <div className="flex flex-wrap gap-2 pl-12">{children}</div> : null}
    </div>
  );
}

function ChangePinDialog({ open, onOpenChange, userId }: { open: boolean; onOpenChange: (open: boolean) => void; userId: string }) {
  const unlockDevice = useMutation(unlockDeviceRef);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setConfirm('');
    setError(null);
  }, [open]);

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
      // The phone's own key from Rehabify (online and signed in) opens the saved data, so the old PIN isn't needed
      const result = await unlockDevice({ deviceId: id, label: navigator.userAgent.slice(0, 120) });
      if (result.status !== 'ok') throw new Error('This phone was switched off for offline use. Contact support.');
      rememberDeviceSecret(userId, result.secret);
      await replacePin(userId, pin, result.secret);
      toast.success('PIN changed', { description: 'Use the new PIN when you’re offline.' });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Couldn’t change the PIN. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const pinInput = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={value}
        disabled={busy}
        onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="h-11 text-center text-lg tracking-[0.4em]"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogTitle>Change your offline PIN</DialogTitle>
        <DialogDescription>Choose a new 4–6 digit PIN. What’s saved on this phone stays.</DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          {pinInput('offline-new-pin', 'New PIN', pin, setPin)}
          {pinInput('offline-confirm-pin', 'Type it again', confirm, setConfirm)}
          {error ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change PIN'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shows its children (e.g. a settings panel holding OfflineUseSettings) only to accounts that may use offline. */
export function WhenOfflineAvailable({ children }: { children: React.ReactNode }) {
  return useOfflineAvailable() ? <>{children}</> : null;
}

export function OfflineUseSettings() {
  const available = useOfflineAvailable();
  const on = useOfflineMode();
  const vault = useVault();
  const online = useOnline();
  const outbox = useOutbox();
  const [lockedUnsent, setLockedUnsent] = useState(0);
  const [confirmOff, setConfirmOff] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const userId = vault.userId;

  // Changes not sent yet: listed when the vault is open; only counted while it's locked
  useEffect(() => {
    if (!userId || vault.status !== 'locked') return setLockedUnsent(0);
    let cancelled = false;
    void unsentCount(userId).then((count) => !cancelled && setLockedUnsent(count));
    return () => {
      cancelled = true;
    };
  }, [userId, vault.status]);

  if (!available) return null;
  const unsent = vault.status === 'unlocked' ? outbox.length : lockedUnsent;

  if (!on) {
    return (
      <Row
        title="Use Rehabify without internet"
        description="Off on this phone. Turn it on to keep the pages you open, encrypted and locked with a PIN, so they still open (and your changes are kept) when the network drops."
      >
        <Button
          className="h-10 rounded-xl"
          onClick={() => {
            setOfflineOnThisPhone(true);
            requestOfflineSetup();
          }}
        >
          Turn on
        </Button>
      </Row>
    );
  }

  if (vault.status === 'unknown') {
    return <Row title="Use Rehabify without internet" description="Checking this phone…" />;
  }

  if (vault.status === 'none') {
    return (
      <Row
        title="Use Rehabify without internet"
        description="On, but no PIN yet. Choose a 4–6 digit PIN to start keeping the pages you open on this phone."
      >
        <Button className="h-10 rounded-xl" disabled={!online} onClick={() => requestOfflineSetup()}>
          Choose a PIN
        </Button>
        {!online && <p className="w-full text-xs text-neutral-500">Connect to the internet to set it up.</p>}
      </Row>
    );
  }

  return (
    <>
      <Row
        title="Use Rehabify without internet"
        description="On for this phone. Pages you open are kept for 14 days, encrypted with your PIN. It locks after 5 minutes unused, and 10 wrong PINs delete it."
      >
        <Button variant="outline" className="h-10 rounded-xl" disabled={!online || !userId} onClick={() => setChangingPin(true)}>
          Change PIN
        </Button>
        <Button variant="ghost" className="h-10 rounded-xl text-neutral-600 dark:text-neutral-300" disabled={unsent > 0} onClick={() => setConfirmOff(true)}>
          Turn off on this phone
        </Button>
        {unsent > 0 && (
          <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
            {unsent === 1 ? '1 change on this phone hasn’t' : `${unsent} changes on this phone haven’t`} been sent yet. They go out on their own when you’re
            online; you can turn this off once they have.
          </p>
        )}
        {!online && <p className="w-full text-xs text-neutral-500">Changing the PIN needs internet.</p>}
      </Row>

      {userId ? <ChangePinDialog open={changingPin} onOpenChange={setChangingPin} userId={userId} /> : null}

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogTitle>Turn off offline use on this phone?</DialogTitle>
          <DialogDescription>
            Everything this phone keeps for offline use is deleted. Your records are safe on Rehabify, and you can turn it back on here any time.
          </DialogDescription>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setConfirmOff(false)}>
              Keep it on
            </Button>
            <Button
              variant="destructive"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                // OfflineBridge wipes this phone's copy and stored pages once it's off
                setOfflineOnThisPhone(false);
                setConfirmOff(false);
                toast.success('Offline use is off on this phone', { description: 'What it kept has been deleted.' });
              }}
            >
              Turn off
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
