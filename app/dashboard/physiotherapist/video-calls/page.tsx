'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { format, isToday, isTomorrow } from 'date-fns';
import { Copy, Loader2, Plus, Video } from 'lucide-react';
import { toast } from 'sonner';
import { playSound } from '@/lib/sounds';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, PageContainer, PageHeader, Panel, StatusBadge, primaryButtonClass } from '@/components/physio/ui';
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

type PatientLite = { _id: Id<'users'>; firstName?: string; lastName?: string; email?: string };

/** Join opens this long before the start time. */
const JOIN_EARLY_MS = 10 * 60 * 1000;

const fullName = (p?: { firstName?: string; lastName?: string }) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Patient';

function localDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
      return <StatusBadge tone="amber">Missed</StatusBadge>;
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

function ScheduleDialog({
  open,
  onOpenChange,
  patients,
  defaultPlatform,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: PatientLite[];
  defaultPlatform: 'stream' | 'google_meet';
}) {
  const scheduleVideoCall = useMutation(api.videoCalls.scheduleVideoCall);
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('Video session');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('45');
  const [platform, setPlatform] = useState<'stream' | 'google_meet'>(defaultPlatform);
  const [meetLink, setMeetLink] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Next half hour, so the default is always in the future
    const next = new Date(Date.now() + 30 * 60 * 1000);
    next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
    setWhen(localDateTimeValue(next));
    setPlatform(defaultPlatform);
    setConflict(false);
  }, [open, defaultPlatform]);

  const patient = patients.find((p) => p._id === patientId);

  const submit = async (force = false) => {
    const scheduledAt = new Date(when).getTime();
    if (!patientId) return toast.error('Choose a patient.');
    if (!when || Number.isNaN(scheduledAt)) return toast.error('Choose a date and time.');
    if (scheduledAt < Date.now() - 5 * 60 * 1000) return toast.error('Choose a time in the future.');
    if (platform === 'google_meet' && !/^https:\/\/meet\.google\.com\//.test(meetLink.trim())) {
      return toast.error('Paste a Google Meet link (https://meet.google.com/…).');
    }
    setSaving(true);
    try {
      await scheduleVideoCall({
        patientId: patientId as Id<'users'>,
        scheduledAt,
        title: title.trim() || 'Video session',
        notes: notes.trim() || undefined,
        platform,
        duration: Number(duration),
        meetingLink: platform === 'google_meet' ? meetLink.trim() : undefined,
        force: force || undefined,
      });
      playSound('booked');
      toast.success(
        patient?.email ? `Scheduled. ${patient.firstName ?? 'Your patient'} will get the link by email.` : 'Scheduled. Share the link with your patient.'
      );
      onOpenChange(false);
      setPatientId('');
      setNotes('');
      setMeetLink('');
    } catch (error) {
      const message = String((error as Error)?.message ?? '');
      if (message.includes('already exists close to this time')) setConflict(true);
      else toast.error('Couldn’t schedule the session. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a video session</DialogTitle>
          <DialogDescription>Your patient gets an email with the link to join.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Patient</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger>
                <SelectValue placeholder={patients.length ? 'Choose a patient' : 'No patients yet'} />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {fullName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {patient && !patient.email && (
              <p className="text-xs text-amber-700 dark:text-amber-400">This patient has no email on file. You’ll need to send the link yourself.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="call-title">Title</Label>
            <Input id="call-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="call-when">Date and time</Label>
              <Input id="call-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Length</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['30', '45', '60', '90'].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Where</Label>
            <div className="grid grid-cols-2 rounded-lg border border-neutral-200 p-0.5 dark:border-white/[0.07]" role="radiogroup">
              {(
                [
                  ['stream', 'Rehabify video'],
                  ['google_meet', 'Google Meet'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={platform === value}
                  onClick={() => setPlatform(value)}
                  className={cn(
                    'rounded-md py-1.5 text-sm transition-colors',
                    platform === value
                      ? 'bg-neutral-900 font-medium text-white dark:bg-white dark:text-neutral-950'
                      : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {platform === 'google_meet' && (
              <Input
                className="mt-2"
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                aria-label="Google Meet link"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="call-notes">Note for your patient (optional)</Label>
            <Textarea id="call-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Wear loose clothing and have a chair nearby." />
          </div>
          {conflict && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              This patient already has a session close to this time.
              <button type="button" className="ml-1 font-medium underline" onClick={() => submit(true)}>
                Schedule anyway
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => submit(false)} disabled={saving} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VideoCallsPage() {
  const router = useRouter();
  const calls = useQuery(api.videoCalls.getMyVideoCalls, {}) as VideoCall[] | undefined;
  const patients = useQuery(api.patients.getMyPatients, { limit: 200 }) as PatientLite[] | undefined;
  const platformPreference = useQuery(api.physiotherapistProfiles.getVideoPlatformPreference) as string | null | undefined;
  const startVideoCall = useMutation(api.videoCalls.startVideoCall);
  const cancelVideoCall = useMutation(api.videoCalls.cancelVideoCall);

  const [scheduling, setScheduling] = useState(false);
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
            <Button variant="outline" size="sm" onClick={() => copyLink(call)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Link
            </Button>
            <Button size="sm" onClick={() => join(call)} disabled={!canJoin(call)} className={primaryButtonClass}>
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
        actions={
          <Button onClick={() => setScheduling(true)} className={primaryButtonClass} disabled={!patients}>
            <Plus className="mr-2 h-4 w-4" />
            Schedule a session
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
            description="Schedule one here, or book an online appointment from the calendar."
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

      <ScheduleDialog
        open={scheduling}
        onOpenChange={setScheduling}
        patients={patients ?? []}
        defaultPlatform={platformPreference === 'google_meet' ? 'google_meet' : 'stream'}
      />

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
