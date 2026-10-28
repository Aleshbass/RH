'use client';

/**
 * Push messages to the phones and browsers where people turned on Rehabify notifications
 * (components/pwa/AppSetup.tsx). Server side in convex/push.ts.
 */
import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BellRing, Building2, Loader2, Send, Stethoscope, UserRound, Users } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  inputClass,
  PageHeader,
  Panel,
  primaryButtonClass,
  StatTile,
  StatusBadge,
} from '@/components/admin/ui';
import { cn } from '@/lib/utils';

type Audience = 'physiotherapists' | 'clinics' | 'patients' | 'everyone';
type Overview = {
  configured: boolean;
  counts: Record<Audience, { people: number; devices: number }>;
  recent: { _id: string; title: string; body: string; url?: string; audience: string; devices: number; createdAt: number }[];
};

// Plain references: the generated api type is at TypeScript's depth limit (TS2589)
const overviewRef = makeFunctionReference<'query', Record<string, never>, Overview>('push:adminOverview');
const broadcastRef = makeFunctionReference<
  'mutation',
  { audience: Audience; title: string; body: string; url?: string },
  { devices: number }
>('push:broadcast');

const AUDIENCES: { id: Audience; label: string; icon: typeof Users }[] = [
  { id: 'physiotherapists', label: 'Physiotherapists', icon: Stethoscope },
  { id: 'clinics', label: 'Clinics (owners and staff)', icon: Building2 },
  { id: 'patients', label: 'Patients', icon: UserRound },
  { id: 'everyone', label: 'Everyone', icon: Users },
];
const audienceLabel = (id: string) => AUDIENCES.find((a) => a.id === id)?.label ?? id;

export default function AdminPushPage() {
  const overview = useQuery(overviewRef, {});
  const broadcast = useMutation(broadcastRef);
  const [audience, setAudience] = useState<Audience>('physiotherapists');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState(false);

  const target = overview?.counts[audience];
  const ready = title.trim().length > 0 && body.trim().length > 0 && Boolean(target?.devices);

  const send = async () => {
    try {
      const result = await broadcast({ audience, title, body, url: url.trim() || undefined });
      toast.success(`Sent to ${result.devices} ${result.devices === 1 ? 'device' : 'devices'}`);
      setTitle('');
      setBody('');
      setUrl('');
    } catch (error) {
      const message = (error as { data?: unknown })?.data;
      toast.error(typeof message === 'string' ? message : 'Couldn’t send. Please try again.');
      throw error;
    }
  };

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Platform"
        title="Push notifications"
        description="Send a notification to the phones and browsers where people turned on Rehabify notifications."
      />

      {overview && !overview.configured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
          Push isn’t set up yet. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to the Convex environment, then people can turn
          notifications on.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {AUDIENCES.map((a) => (
          <StatTile
            key={a.id}
            label={a.label}
            icon={a.icon}
            value={overview ? overview.counts[a.id].people : '—'}
            hint={overview ? `${overview.counts[a.id].devices} devices with notifications on` : undefined}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="New notification" description="Short and specific works best. It shows on the lock screen.">
          <div className="space-y-4 px-5 pb-5 pt-3">
            <div>
              <Label className="text-sm font-medium">Send to</Label>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Send to">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={audience === a.id}
                    onClick={() => setAudience(a.id)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                      audience === a.id
                        ? 'border-rh-ink bg-rh-ink text-white dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink'
                        : 'border-black/10 hover:border-black/25 dark:border-white/10 dark:hover:border-white/25'
                    )}
                  >
                    <span className="block font-medium">{a.label}</span>
                    <span className={cn('text-xs', audience === a.id ? 'opacity-80' : 'text-neutral-500')}>
                      {overview ? `${overview.counts[a.id].people} people` : '…'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="push-title" className="text-sm font-medium">
                Title
              </Label>
              <Input
                id="push-title"
                className={cn(inputClass, 'mt-1.5 h-11')}
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="New patients waiting in Lagos"
              />
            </div>
            <div>
              <Label htmlFor="push-body" className="text-sm font-medium">
                Message
              </Label>
              <Textarea
                id="push-body"
                className={cn(inputClass, 'mt-1.5 min-h-24')}
                value={body}
                maxLength={240}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Turn on duty to be matched with patients near you today."
              />
              <p className="mt-1 text-right text-xs text-neutral-500">{body.length}/240</p>
            </div>
            <div>
              <Label htmlFor="push-url" className="text-sm font-medium">
                Opens (optional)
              </Label>
              <Input
                id="push-url"
                className={cn(inputClass, 'mt-1.5 h-11')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/dashboard"
              />
              <p className="mt-1 text-xs text-neutral-500">A Rehabify page, starting with /. Leave empty to open their dashboard.</p>
            </div>
            <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={!ready} onClick={() => setConfirming(true)}>
              <Send className="mr-2 h-4 w-4" />
              {target?.devices ? `Send to ${target.people} ${target.people === 1 ? 'person' : 'people'}` : 'Nobody to send to yet'}
            </Button>
          </div>
        </Panel>

        <Panel title="Sent" description="The last 20 push notifications sent from here.">
          {overview === undefined ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          ) : overview.recent.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={<BellRing className="h-6 w-6" />} title="Nothing sent yet" />
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.05] px-5 pb-3 dark:divide-white/[0.06]">
              {overview.recent.map((item) => (
                <li key={item._id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-rh-ink dark:text-white">{item.title}</p>
                    <StatusBadge tone="neutral">{audienceLabel(item.audience)}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">{item.body}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {format(item.createdAt, 'd MMM yyyy, h:mm a')} · {item.devices} devices
                    {item.url ? ` · opens ${item.url}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Send to ${audienceLabel(audience).toLowerCase()}?`}
        description={`It goes to ${target?.devices ?? 0} devices straight away and can’t be taken back.`}
        confirmLabel="Send now"
        onConfirm={send}
      />
    </AdminPage>
  );
}
