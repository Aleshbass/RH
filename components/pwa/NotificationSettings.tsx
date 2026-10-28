'use client';

/**
 * Phone notification settings: this device, which kinds of notification to send, and quiet hours.
 * Used in physio Settings → Notifications and in the clinic's Settings page.
 * Server side in convex/push.ts (myPreferences / savePreferences) and helpers/pushNotify.ts.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DeviceDetails, useAppSetup } from '@/components/pwa/AppSetup';
import { openAppSetup } from '@/lib/pwa';
import {
  DEFAULT_QUIET_HOURS,
  PUSH_CATEGORIES,
  type PushCategory,
  type QuietHours,
} from '@/convex/helpers/pushCategories';

type Prefs = { off: string[]; quietHours: QuietHours | null };

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
const myPreferencesRef = makeFunctionReference<'query', Record<string, never>, Prefs | null>('push:myPreferences');
const savePreferencesRef = makeFunctionReference<'mutation', Prefs, { ok: boolean }>('push:savePreferences');

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

function hourLabel(value: string) {
  const h = Number(value.slice(0, 2));
  if (h === 0) return '12 midnight';
  if (h === 12) return '12 noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function Row({ title, description, action }: { title: string; description?: string; action: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">{title}</p>
        {description && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{action}</div>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{children}</p>
  );
}

/** Whether this phone or browser gets notifications, with a way to fix it. */
function ThisDevice() {
  const { need, env } = useAppSetup();
  if (!need || !env) return <Skeleton className="h-12 w-full rounded-xl" />;

  let title = 'On for this device';
  let description = 'Test it or turn it off here.';
  let action = 'Manage';
  if (need === 'install') {
    title = 'Not on this phone’s home screen yet';
    description = 'Add Rehabify to your home screen to get notifications.';
    action = 'Get the app';
  } else if (need === 'notify') {
    title = 'Off on this device';
    description = 'Turn them on to hear about new patients and messages straight away.';
    action = 'Turn on';
  } else if (need === 'blocked') {
    title = 'Blocked on this device';
    description = 'Notifications are blocked in your browser or phone settings.';
    action = 'How to fix';
  } else if (!env.subscribed) {
    title = 'Not available here';
    description = 'This browser can’t show notifications. Use Rehabify on your phone instead.';
  }

  return (
    <Row
      title={title}
      description={description}
      action={
        !env.subscribed && need === 'done' ? null : (
          <Button variant="outline" size="sm" onClick={openAppSetup}>
            {action}
          </Button>
        )
      }
    />
  );
}

export function NotificationSettings() {
  const saved = useQuery(myPreferencesRef, {});
  const save = useMutation(savePreferencesRef);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (saved && prefs === null) setPrefs(saved);
  }, [saved, prefs]);

  const update = async (next: Prefs) => {
    const before = prefs;
    setPrefs(next);
    try {
      await save(next);
    } catch {
      setPrefs(before);
      toast.error('Couldn’t save. Please try again.');
    }
  };

  const toggleCategory = (id: PushCategory, on: boolean) => {
    if (!prefs) return;
    const off = on ? prefs.off.filter((c) => c !== id) : [...prefs.off, id];
    void update({ ...prefs, off });
  };

  return (
    <div className="space-y-6">
      <div>
        <GroupTitle>This device</GroupTitle>
        <ThisDevice />
        <div className="mt-3">
          <DeviceDetails />
        </div>
      </div>

      <div>
        <GroupTitle>What to send</GroupTitle>
        {prefs === null ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {PUSH_CATEGORIES.map((category) => (
              <Row
                key={category.id}
                title={category.label}
                description={category.description}
                action={
                  <Switch
                    checked={!prefs.off.includes(category.id)}
                    aria-label={category.label}
                    onCheckedChange={(on) => toggleCategory(category.id, on)}
                  />
                }
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Everything still shows in the bell inside Rehabify. These switches only decide what reaches your phone.
        </p>
      </div>

      <div>
        <GroupTitle>Quiet hours</GroupTitle>
        {prefs === null ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <>
            <Row
              title="Quiet hours"
              description="Only urgent alerts reach your phone: a booking about to expire, a patient waiting in your video call, a session about to start and high pain reports."
              action={
                <Switch
                  checked={prefs.quietHours !== null}
                  aria-label="Quiet hours"
                  onCheckedChange={(on) => void update({ ...prefs, quietHours: on ? DEFAULT_QUIET_HOURS : null })}
                />
              }
            />
            {prefs.quietHours && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <span>From</span>
                <Select
                  value={prefs.quietHours.start}
                  onValueChange={(start) => void update({ ...prefs, quietHours: { ...prefs.quietHours!, start } })}
                >
                  <SelectTrigger className="h-9 w-36" aria-label="Quiet hours start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={h}>
                        {hourLabel(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>to</span>
                <Select
                  value={prefs.quietHours.end}
                  onValueChange={(end) => void update({ ...prefs, quietHours: { ...prefs.quietHours!, end } })}
                >
                  <SelectTrigger className="h-9 w-36" aria-label="Quiet hours end">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h} value={h}>
                        {hourLabel(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-neutral-500 dark:text-neutral-400">Nigeria time</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
