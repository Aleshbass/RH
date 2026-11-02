'use client';

/**
 * "Get the app": puts Rehabify on the home screen and turns on push notifications, so
 * physiotherapists and clinics hear about new patients and messages straight away.
 *
 * <AppSetupPrompt /> (in the physio and clinic portals) opens on its own until both are done;
 * "Not now" only puts it off for a day. <AppSetupButton /> opens it from the top bar.
 * Browser side in lib/pwa.ts, server side in convex/push.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Bell, Check, Copy, Loader2, MoreVertical, ShareIos, Smartphone, SquarePlus } from '@/components/icons';
import {
  appSetupSnoozed,
  closeAppSetup,
  currentDevice,
  detectDevice,
  disablePush,
  enablePush,
  isStandalone,
  livePermission,
  notificationPermission,
  openAppSetup,
  pushDiagnostics,
  promptInstall,
  refreshAppSetup,
  setIconBadge,
  snoozeAppSetup,
  usePwaState,
  type Device,
  type SavedDevice,
} from '@/lib/pwa';
import { endPromptTurn, whenPromptTurn } from '@/lib/overlayTurn';
import { cn } from '@/lib/utils';

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
const configRef = makeFunctionReference<'query', Record<string, never>, { publicKey: string | null; devices: number }>(
  'push:config'
);
const subscribeRef = makeFunctionReference<'mutation', SavedDevice, { ok: boolean }>('push:subscribe');
const unsubscribeRef = makeFunctionReference<'mutation', { endpoint: string }, { ok: boolean }>('push:unsubscribe');
const sendTestRef = makeFunctionReference<'mutation', Record<string, never>, { ok: boolean }>('push:sendTest');
// Same paths as the bell and the Messages tab, so they share one subscription
const unreadNotificationsRef = makeFunctionReference<'query', Record<string, never>, number>(
  'notifications:getMyUnreadCount'
);
const unreadMessagesRef = makeFunctionReference<'query', Record<string, never>, number>('chat:getUnreadCount');

/**
 * Keeps the red count on the home-screen app icon equal to unread notifications plus unread
 * messages while the app is open (pushes update it while it's closed: public/sw.js).
 */
export function AppIconBadge() {
  const notifications = useQuery(unreadNotificationsRef, {});
  const messages = useQuery(unreadMessagesRef, {});
  useEffect(() => {
    if (notifications === undefined || messages === undefined) return;
    setIconBadge(notifications + messages);
  }, [notifications, messages]);
  return null;
}

type Need = 'install' | 'notify' | 'blocked' | 'done';

type Env = {
  standalone: boolean;
  device: Device;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
};

/** What this device still needs: the app installed, notifications on, or nothing. */
export function useAppSetup() {
  const pwa = usePwaState();
  const config = useQuery(configRef, {});
  const [env, setEnv] = useState<Env | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [device, permission] = await Promise.all([
        currentDevice().catch(() => null),
        livePermission().catch(() => notificationPermission()),
      ]);
      if (cancelled) return;
      setEnv({
        standalone: isStandalone(),
        device: detectDevice(),
        permission,
        subscribed: Boolean(device),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pwa.revision, pwa.justInstalled]);

  let need: Need | null = null;
  if (env && config !== undefined) {
    const installed = env.standalone || pwa.justInstalled;
    const pushReady = Boolean(config.publicKey) && env.permission !== 'unsupported';
    if (!installed && (env.device.platform !== 'desktop' || pwa.canPrompt)) need = 'install';
    else if (!pushReady) need = 'done';
    else if (env.permission === 'denied') need = 'blocked';
    else if (env.permission === 'default' || !env.subscribed) need = 'notify';
    else need = 'done';
  }

  return { need, env, config, pwa };
}

const primaryClass = 'h-11 w-full rounded-xl bg-rh-lime font-semibold text-rh-ink hover:bg-rh-lime-deep';
const quietClass =
  'h-11 w-full rounded-xl text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white';

function Steps({ steps }: { steps: { icon?: React.ReactNode; text: React.ReactNode }[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-neutral-700 dark:text-white/80">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-ink text-xs font-semibold text-rh-lime dark:bg-white/10">
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5">
            {step.text}
            {step.icon && <span className="ml-1.5 inline-flex translate-y-0.5 text-rh-ink dark:text-white">{step.icon}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Benefits() {
  const items = [
    { icon: <Bell className="h-4 w-4" />, text: 'A notification the moment a new patient books or messages you' },
    { icon: <Smartphone className="h-4 w-4" />, text: 'Opens full screen from your home screen, like any app' },
    { icon: <Check className="h-4 w-4" />, text: 'Nothing to download from an app store' },
  ];
  return (
    <ul className="space-y-2.5 rounded-2xl bg-neutral-50 p-4 dark:bg-white/5">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-3 text-sm text-neutral-700 dark:text-white/80">
          <span className="mt-0.5 shrink-0 text-rh-ink dark:text-rh-lime">{item.icon}</span>
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function CopyLink() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboard`);
      toast.success('Link copied. Paste it into your browser.');
    } catch {
      toast.error('Couldn’t copy. Open this page in your browser instead.');
    }
  };
  return (
    <Button type="button" variant="outline" className="h-11 w-full rounded-xl" onClick={copy}>
      <Copy className="mr-2 h-4 w-4" />
      Copy link
    </Button>
  );
}

function InstallBody({ device, canPrompt, onInstalled }: { device: Device; canPrompt: boolean; onInstalled: () => void }) {
  const [busy, setBusy] = useState(false);
  const browser = device.platform === 'ios' ? 'Safari' : 'Chrome';

  if (device.inAppBrowser) {
    return (
      <div className="space-y-4">
        <Benefits />
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-white/80">
          You opened Rehabify inside another app (like WhatsApp), which can’t add apps to your home screen. Open it in{' '}
          {browser} first: tap the menu <MoreVertical className="inline h-3.5 w-3.5" /> and choose “Open in {browser}”, or copy
          the link and paste it there.
        </p>
        <CopyLink />
      </div>
    );
  }

  if (canPrompt) {
    const install = async () => {
      setBusy(true);
      try {
        if (await promptInstall()) {
          toast.success('Rehabify is on your home screen');
          onInstalled();
        }
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="space-y-4">
        <Benefits />
        <Button type="button" className={primaryClass} onClick={install} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
          Add Rehabify to my phone
        </Button>
      </div>
    );
  }

  if (device.platform === 'ios') {
    return (
      <div className="space-y-4">
        <Benefits />
        <Steps
          steps={[
            { text: 'Tap the Share button (bottom of Safari, or top right in Chrome)', icon: <ShareIos className="h-4 w-4" /> },
            { text: 'Scroll down and tap “Add to Home Screen”', icon: <SquarePlus className="h-4 w-4" /> },
            { text: 'Tap Add, then open Rehabify from your home screen, sign in, and turn on notifications' },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Benefits />
      <Steps
        steps={[
          { text: 'Tap the menu at the top right of your browser', icon: <MoreVertical className="h-4 w-4" /> },
          { text: 'Tap “Install app” or “Add to Home screen”' },
          { text: 'Open Rehabify from your home screen and turn on notifications' },
        ]}
      />
    </div>
  );
}

/** What this phone reports about notifications, to screenshot or copy for support. */
export function DeviceDetails({ refreshKey = 0 }: { refreshKey?: number }) {
  const pwa = usePwaState();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<[string, string][] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null);
    void pushDiagnostics().then((next) => {
      if (!cancelled) setRows(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey, pwa.revision]);

  const copy = async () => {
    if (!rows) return;
    try {
      await navigator.clipboard.writeText(rows.map(([k, v]) => `${k}: ${v}`).join('\n'));
      toast.success('Copied. Paste it to Rehabify support.');
    } catch {
      toast.error('Couldn’t copy. Take a screenshot instead.');
    }
  };

  return (
    <details
      className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:bg-white/5 dark:text-white/70"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none font-medium">Details for support</summary>
      {rows === null ? (
        <p className="mt-2 text-neutral-500">Checking…</p>
      ) : (
        <>
          <dl className="mt-2 space-y-1">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-32 shrink-0 text-neutral-500 dark:text-white/50">{label}</dt>
                <dd className="min-w-0 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={copy} className="mt-2 font-semibold text-rh-ink underline dark:text-rh-lime">
            Copy details
          </button>
        </>
      )}
    </details>
  );
}

/** Set before reloading from the "blocked" screen, so the dialog opens again after the reload. */
const REOPEN_KEY = 'rh_app_setup_reopen';

function reopenRequested(): boolean {
  try {
    return sessionStorage.getItem(REOPEN_KEY) === 'reloaded';
  } catch {
    return false;
  }
}

function setReopen(on: boolean) {
  try {
    if (on) sessionStorage.setItem(REOPEN_KEY, 'reloaded');
    else sessionStorage.removeItem(REOPEN_KEY);
  } catch {
    // Storage blocked: the dialog just won't reopen by itself
  }
}

/**
 * Asks for permission (from a tap), subscribes this device, saves it and sends a test.
 * Returns 'denied' when the phone still says notifications are blocked.
 */
function useTurnOnPush(publicKey: string) {
  const subscribe = useMutation(subscribeRef);
  const sendTest = useMutation(sendTestRef);
  const [busy, setBusy] = useState(false);

  const turnOn = async (): Promise<'on' | 'denied' | 'other'> => {
    setBusy(true);
    try {
      const result = await enablePush(publicKey);
      if ('error' in result) {
        if (result.error === 'dismissed') toast('Notifications weren’t turned on. You can do it any time.');
        else if (result.error === 'unsupported') toast.error('This browser can’t show notifications.');
        else if (result.error === 'failed') toast.error('Couldn’t turn on notifications. Please try again.');
        refreshAppSetup();
        return result.error === 'denied' ? 'denied' : 'other';
      }
      await subscribe(result.device);
      await sendTest({}).catch(() => undefined);
      setReopen(false);
      toast.success('Notifications are on. We’ve sent you a test.');
      refreshAppSetup();
      return 'on';
    } catch {
      toast.error('Couldn’t turn on notifications. Please try again.');
      return 'other';
    } finally {
      setBusy(false);
    }
  };

  return { turnOn, busy };
}

function NotifyBody({ publicKey }: { publicKey: string }) {
  const { turnOn, busy } = useTurnOnPush(publicKey);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-neutral-700 dark:text-white/80">
        Your phone will tell you when a new patient books or sends you a message, even when Rehabify is closed. Message
        notifications show who it’s from, never what they wrote.
      </p>
      <Button type="button" className={primaryClass} onClick={() => void turnOn()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
        Turn on notifications
      </Button>
      <DeviceDetails />
    </div>
  );
}

function BlockedBody({ standalone, publicKey, device }: { standalone: boolean; publicKey: string; device: Device }) {
  const { turnOn, busy } = useTurnOnPush(publicKey);
  const [stillBlocked, setStillBlocked] = useState(false);

  // The page often keeps the old "blocked" answer after the setting changes: ask again, and if
  // the phone still says no, reload once (the dialog reopens) before giving the manual steps
  const recheck = async () => {
    const outcome = await turnOn();
    if (outcome !== 'denied') return;
    if (!reopenRequested()) {
      setReopen(true);
      toast('Checking your phone’s new setting…');
      window.location.reload();
      return;
    }
    setStillBlocked(true);
  };

  if (stillBlocked) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-white/80">
          Your phone still says notifications are blocked for Rehabify.
        </p>
        <Steps
          steps={[
            { text: 'Close Rehabify completely (swipe it away from your recent apps), then open it again' },
            ...(device.platform === 'android'
              ? [{ text: 'If it’s still blocked: open Chrome, then Settings, Site settings, Notifications, and allow physioaroundme.com' }]
              : device.platform === 'ios'
                ? [{ text: 'If it’s still blocked: Settings, Notifications, Rehabify, and turn on Allow Notifications' }]
                : [{ text: 'If it’s still blocked: allow notifications for this site in your browser’s settings' }]),
            { text: 'Then tap “Turn on notifications” here' },
          ]}
        />
        <Button type="button" className={primaryClass} onClick={() => void recheck()} disabled={busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Try again
        </Button>
        <DeviceDetails />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-neutral-700 dark:text-white/80">
        Notifications are blocked for Rehabify on this device, so new patients and messages can’t reach you.
      </p>
      <Steps
        steps={
          standalone
            ? [
                { text: 'Open your phone’s Settings, then Notifications' },
                { text: 'Find Rehabify and allow notifications' },
                { text: 'Come back here and tap “I’ve allowed them”' },
              ]
            : [
                { text: 'Tap the icon at the left of the address bar (a lock or sliders)' },
                { text: 'Open the site settings and allow notifications' },
                { text: 'Come back here and tap “I’ve allowed them”' },
              ]
        }
      />
      <Button type="button" className={primaryClass} onClick={() => void recheck()} disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        I’ve allowed them
      </Button>
      <DeviceDetails />
    </div>
  );
}

function DoneBody() {
  const sendTest = useMutation(sendTestRef);
  const unsubscribe = useMutation(unsubscribeRef);
  const [busy, setBusy] = useState<'test' | 'off' | null>(null);

  const test = async () => {
    setBusy('test');
    try {
      await sendTest({});
      toast.success('Test sent. It should arrive in a few seconds.');
    } catch {
      toast.error('Couldn’t send a test. Please try again.');
    } finally {
      setBusy(null);
    }
  };
  const off = async () => {
    setBusy('off');
    try {
      const endpoint = await disablePush();
      if (endpoint) await unsubscribe({ endpoint });
      toast('Notifications are off on this device');
      refreshAppSetup();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-neutral-700 dark:text-white/80">
        You’re all set. New patients and messages will show up as notifications on this device.
      </p>
      <Button type="button" className={primaryClass} onClick={test} disabled={busy !== null}>
        {busy === 'test' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
        Send a test notification
      </Button>
      <Button type="button" variant="ghost" className={quietClass} onClick={off} disabled={busy !== null}>
        Turn off on this device
      </Button>
    </div>
  );
}

const TITLES: Record<Need, { title: string; description: string }> = {
  install: { title: 'Get the Rehabify app', description: 'Add Rehabify to your home screen. It takes a few seconds.' },
  notify: { title: 'Turn on notifications', description: 'So you never miss a new patient or a message.' },
  blocked: { title: 'Notifications are blocked', description: 'Allow them once and you’re set.' },
  done: { title: 'Rehabify app', description: 'Installed, with notifications on.' },
};

/** The setup dialog. Opens on its own until the app is installed and notifications are on. */
export function AppSetupPrompt() {
  const { need, env, config, pwa } = useAppSetup();
  const subscribe = useMutation(subscribeRef);
  const autoOpened = useRef(false);
  const synced = useRef(false);

  // Ask again (a day after "Not now") until it's done: physios and clinics need these alerts
  useEffect(() => {
    if (autoOpened.current || !need || need === 'done') return;
    // Reloaded from the "blocked" screen: carry on where they were, whatever the snooze says
    if (reopenRequested()) {
      autoOpened.current = true;
      openAppSetup();
      return;
    }
    if (need === 'blocked') return;
    autoOpened.current = true;
    if (appSetupSnoozed()) return;
    // One self-opening prompt at a time (a welcome tour, the offline PIN offer...): two overlays
    // at once block each other's buttons
    let cancelWait: () => void = () => undefined;
    const timer = window.setTimeout(() => {
      cancelWait = whenPromptTurn('app-setup', openAppSetup);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      cancelWait();
    };
  }, [need]);

  // Notifications already on: make sure this device is saved for whoever is signed in now
  useEffect(() => {
    if (synced.current || !env?.subscribed || !config?.publicKey) return;
    synced.current = true;
    void currentDevice()
      .then((device) => (device ? subscribe(device) : undefined))
      .catch(() => undefined);
  }, [env?.subscribed, config?.publicKey, subscribe]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) return openAppSetup();
      if (need && need !== 'done') snoozeAppSetup();
      closeAppSetup();
    },
    [need]
  );

  // Closed (by any route): the next waiting prompt may open
  useEffect(() => {
    if (!pwa.setupOpen) endPromptTurn('app-setup');
  }, [pwa.setupOpen]);
  useEffect(() => () => endPromptTurn('app-setup'), []);

  if (!need || !env) return null;
  const copy = TITLES[need];

  return (
    <Dialog open={pwa.setupOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 rounded-3xl border-neutral-200 bg-white p-6 text-neutral-900 dark:border-white/10 dark:bg-rh-ink-2 dark:text-white">
        <div className="flex items-center gap-4 pr-6">
          <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold tracking-tight">{copy.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-neutral-500 dark:text-white/60">{copy.description}</DialogDescription>
          </div>
        </div>

        {need === 'install' && (
          <InstallBody device={env.device} canPrompt={pwa.canPrompt} onInstalled={() => refreshAppSetup()} />
        )}
        {need === 'notify' && config?.publicKey && <NotifyBody publicKey={config.publicKey} />}
        {need === 'blocked' && config?.publicKey && (
          <BlockedBody standalone={env.standalone} publicKey={config.publicKey} device={env.device} />
        )}
        {/* Shown right after notifications are turned on */}
        {need === 'done' && <DoneBody />}

        <Button type="button" variant="ghost" className={cn(quietClass, '-mt-2')} onClick={() => onOpenChange(false)}>
          {need === 'done' ? 'Close' : 'Not now'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const TONES = {
  /** Physio portal top bar (pt-* tokens) */
  portal: 'bg-pt-surface text-pt-ink ring-1 ring-inset ring-pt-line hover:bg-pt-hover',
  /** Clinic console */
  console: 'bg-white text-rh-ink shadow-soft hover:bg-white/80 dark:bg-rh-ink-2 dark:text-white dark:hover:bg-rh-ink-3',
} as const;

/** Top-bar button: "Get the app" until it's installed, then "Turn on alerts" until notifications are on. */
export function AppSetupButton({ tone = 'portal', className }: { tone?: keyof typeof TONES; className?: string }) {
  const { need } = useAppSetup();
  if (!need || need === 'done') return null;
  const label = need === 'install' ? 'Get the app' : 'Turn on alerts';
  return (
    <button
      type="button"
      onClick={openAppSetup}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime',
        TONES[tone],
        className
      )}
    >
      {/* A phone, never a bell: the notifications bell sits right next to it */}
      <Smartphone className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
      <span aria-hidden className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rh-lime sm:hidden" />
    </button>
  );
}
