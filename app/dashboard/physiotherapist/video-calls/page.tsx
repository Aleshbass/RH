'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { format, isToday, isTomorrow } from 'date-fns';
import { Copy, Plus, Video } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { accentButtonClass, EmptyState, PageContainer, PageHeader, Panel, StatusBadge, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui';
import { useBooking } from '@/components/physio/schedule/BookingDrawer';
import { cn } from '@/lib/utils';

type VideoCall = {
  _id: Id<'videoCalls'>;
  roomId: string;
  title?: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled' | 'missed';
  scheduledAt?: number;
  startTime?: number;
  plannedDuration?: number;
  meetingLink?: string;
  platform?: string;
  patient?: { _id: string; firstName?: string; lastName?: string; email?: string };
};

/** Join opens this long before the start time. */
const JOIN_EARLY_MS = 10 * 60 * 1000;

const fullName = (p?: { firstName?: string; lastName?: string }) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Patient';

function whenLabel(time: number) {
  if (isToday(time)) return `Today, ${format(time, 'h:mm a')}`;
  if (isTomorrow(time)) return `Tomorrow, ${format(time, 'h:mm a')}`;
  return format(time, 'EEE d MMM, h:mm a');
}

function callStatus(call: VideoCall) {
  switch (call.status) {
    case 'active':
      return <StatusBadge tone="green">In progress</StatusBadge>;
    case 'ended':
      return <StatusBadge>Ended</StatusBadge>;
    case 'cancelled':
      return <StatusBadge tone="red">Cancelled</StatusBadge>;
    case 'missed':
      return <StatusBadge tone="neutral">Missed</StatusBadge>;
    default:
      return <StatusBadge tone="teal">Scheduled</StatusBadge>;
  }
}

/** In-app link for built-in calls (relative, so it works on any domain); external link otherwise. */
function callHref(call: VideoCall) {
  const link = call.meetingLink ?? '';
  if (link.includes('/video-call/')) return `/video-call/${link.split('/video-call/')[1]}`;
  if (link && !link.includes('daily.co')) return link;
  return `/video-call/${call.roomId}`;
}

export default function VideoCallsPage() {
  const router = useRouter();
  const calls = useQuery(api.videoCalls.getMyVideoCalls, {}) as VideoCall[] | undefined;
  const openBooking = useBooking();
  const startVideoCall = useMutation(api.videoCalls.startVideoCall);
  const cancelVideoCall = useMutation(api.videoCalls.cancelVideoCall);

  const [cancelling, setCancelling] = useState<VideoCall | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Re-check join windows every 30 seconds
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { upcoming, past } = useMemo(() => {
    const list = calls ?? [];
    const isOpen = (call: VideoCall) => {
      if (call.status === 'active') return true;
      if (call.status !== 'scheduled') return false;
      const start = call.scheduledAt ?? call.startTime ?? 0;
      return start + (call.plannedDuration ?? 60) * 60 * 1000 > now;
    };
    return {
      upcoming: list.filter(isOpen).sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)),
      past: list.filter((call) => !isOpen(call)).slice(0, 20),
    };
  }, [calls, now]);

  const canJoin = (call: VideoCall) => {
    if (call.status === 'active') return true;
    if (call.status !== 'scheduled') return false;
    const start = call.scheduledAt ?? 0;
    return start - JOIN_EARLY_MS <= now && now <= start + (call.plannedDuration ?? 60) * 60 * 1000;
  };

  const join = async (call: VideoCall) => {
    try {
      await startVideoCall({ callId: call._id });
    } catch {
      // Starting only records the start time; joining still works
    }
    const href = callHref(call);
    if (href.startsWith('/')) router.push(href);
    else window.open(href, '_blank', 'noopener');
  };

  const copyLink = async (call: VideoCall) => {
    const href = callHref(call);
    const absolute = href.startsWith('/') ? `${window.location.origin}${href}` : href;
    try {
      await navigator.clipboard.writeText(absolute);
      toast.success('Link copied');
    } catch {
      toast.error('Couldn’t copy the link');
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    try {
      await cancelVideoCall({ callId: cancelling._id, reason: cancelReason.trim() || undefined });
      toast.success('Session cancelled');
    } catch {
      toast.error('Couldn’t cancel the session');
    } finally {
      setCancelling(null);
      setCancelReason('');
    }
  };

  const row = (call: VideoCall, isUpcoming: boolean) => {
    const start = call.scheduledAt ?? call.startTime;
    return (
      <li key={call._id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{fullName(call.patient)}</p>
            {callStatus(call)}
            {call.platform === 'google_meet' && <StatusBadge>Google Meet</StatusBadge>}
          </div>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {start ? whenLabel(start) : 'No time set'}
            {call.plannedDuration ? ` · ${call.plannedDuration} min` : ''}
            {call.title ? ` · ${call.title}` : ''}
          </p>
        </div>
        {isUpcoming && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelling(call)} className="text-neutral-500">
              Cancel
            </Button>
            <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} onClick={() => copyLink(call)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Link
            </Button>
            <Button size="sm" onClick={() => join(call)} disabled={!canJoin(call)} className={cn(canJoin(call) ? accentButtonClass : primaryButtonClass, 'h-9')}>
              {canJoin(call) ? 'Join' : start ? `Opens ${format(start - JOIN_EARLY_MS, 'h:mm a')}` : 'Join'}
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Video sessions"
        description="Online sessions with your patients. Join opens 10 minutes before the start."
        info="Each video session gets a private link that only you and your patient can use. It also shows on your calendar and the patient’s dashboard."
        actions={
          <Button onClick={() => openBooking({ mode: 'telehealth' })} className={cn(primaryButtonClass, 'h-10 px-4')}>
            <Plus className="mr-2 h-4 w-4" />
            Book a video session
          </Button>
        }
      />

      <Panel title="Upcoming">
        {calls === undefined ? (
          <div className="space-y-3 p-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon={<Video className="h-8 w-8" />}
            title="No video sessions coming up"
            description="Book one and its private link is made for you."
            action={
              <Button onClick={() => openBooking({ mode: 'telehealth' })} className={cn(primaryButtonClass, 'h-10')}>
                Book a video session
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{upcoming.map((call) => row(call, true))}</ul>
        )}
      </Panel>

      {past.length > 0 && (
        <Panel title="Past">
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">{past.map((call) => row(call, false))}</ul>
        </Panel>
      )}

      <AlertDialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling ? `Let ${fullName(cancelling.patient)} know, so they don’t wait for you.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (optional)"
            aria-label="Reason for cancelling"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-red-600 text-white hover:bg-red-700">
              Cancel session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
