'use client';

/**
 * Appointment pieces shared by the physio, patient and clinic views: status badge, where the
 * visit happens (address or video link), a slot picker from the physio's real availability,
 * and the physio's actions (accept, decline, propose another time, cancel, mark completed).
 * Times are always shown in Lagos time.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { CalendarClock, Check, CheckCircle2, Loader2, MapPin, UserX, Video, X } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  awaitingConfirmationFrom,
  hasPendingProposal,
  isOpenAppointment,
  type AppointmentSide,
  type AppointmentStatusFields,
  type StatusTone,
} from '@/convex/helpers/appointmentStatus';
import { lagosDateTime, lagosShortDate, lagosTime, lagosTimeRange, startOfZonedDay, zonedDateKey } from '@/convex/helpers/lagosTime';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';
import { useGoogleBusyRefresh } from '@/lib/hooks/useGoogleBusyRefresh';

export type AppointmentLike = AppointmentStatusFields & {
  _id: string;
  patientId?: string;
  physiotherapistId?: string;
  startTime: number;
  endTime: number;
  serviceType?: string;
  appointmentType?: string;
  isOnline?: boolean;
  location?: string;
  meetingLink?: string;
  googleMeetLink?: string;
  manualMeetingLink?: string;
  streamMeetingLink?: string;
  proposalNote?: string;
  patient?: { firstName?: string; lastName?: string } | null;
};

type Slot = { start: number; end: number; duration: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The readable part of a Convex error (ConvexError data, or the server message). */
export function appointmentErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === 'string' && error.data.trim()) return error.data;
  const raw = error instanceof Error ? error.message : '';
  const match = raw.match(/(?:Uncaught (?:Convex)?Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/);
  const message = match?.[1]?.trim();
  return message && message !== 'Server Error' ? message : fallback;
}

export function isVideoVisit(apt: Pick<AppointmentLike, 'appointmentType' | 'isOnline'>): boolean {
  return apt.appointmentType === 'telehealth' || apt.isOnline === true;
}

/** The visit's join link, from whichever video path created it (only real URLs). */
export function meetingLinkOf(apt: AppointmentLike): string | undefined {
  const links = [apt.meetingLink, apt.streamMeetingLink, apt.googleMeetLink, apt.manualMeetingLink];
  return links.find((link): link is string => typeof link === 'string' && /^https?:\/\//i.test(link));
}

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-white/[0.07] dark:text-neutral-300',
  teal: 'bg-rh-lime/10 text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
};

/** Tone for a badge: pending visits waiting on the viewer stand out. */
export function appointmentBadgeTone(apt: AppointmentLike, viewer?: AppointmentSide): StatusTone {
  if (viewer && isOpenAppointment(apt.status)) {
    if (hasPendingProposal(apt)) return viewer === 'patient' ? 'amber' : 'neutral';
    const waitingOn = awaitingConfirmationFrom(apt);
    if (waitingOn) return waitingOn === viewer ? 'amber' : 'neutral';
  }
  return appointmentStatusTone(apt.status);
}

export function AppointmentStatusBadge({
  appointment,
  viewer,
  className,
}: {
  appointment: AppointmentLike;
  viewer?: AppointmentSide;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        TONE_CLASSES[appointmentBadgeTone(appointment, viewer)],
        className
      )}
    >
      {appointmentStatusLabel(appointment, viewer)}
    </span>
  );
}

/** Where the visit happens: the address for in-person visits, the join link for video calls. */
export function AppointmentPlace({
  appointment,
  viewer,
  className,
}: {
  appointment: AppointmentLike;
  viewer: AppointmentSide;
  className?: string;
}) {
  const link = meetingLinkOf(appointment);
  const live = isOpenAppointment(appointment.status) && appointment.endTime > Date.now();
  const stop = (e: MouseEvent) => e.stopPropagation();

  if (isVideoVisit(appointment)) {
    return (
      <div className={cn('flex min-w-0 items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400', className)}>
        <Video className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
        {link && live ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="truncate font-medium text-rh-ink underline-offset-2 hover:underline dark:text-rh-lime"
          >
            Join video call
          </a>
        ) : (
          <span className="truncate">
            Video call
            {live && !link
              ? appointment.status === 'confirmed'
                ? ' · link on its way'
                : viewer === 'patient'
                  ? ' · link sent once confirmed'
                  : ' · link made when confirmed'
              : ''}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-start gap-1.5 text-sm text-neutral-600 dark:text-neutral-400', className)}>
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      {appointment.location ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.location)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={stop}
          className="line-clamp-2 break-words underline-offset-2 hover:underline"
        >
          {appointment.location}
        </a>
      ) : (
        <span>In person</span>
      )}
    </div>
  );
}

/**
 * Bookable times from the physio's working hours, days off and existing bookings, grouped by
 * Lagos day. `excludeAppointmentId` frees the visit's own current time when moving it.
 */
export function SlotPicker({
  physiotherapistId,
  durationMinutes,
  excludeAppointmentId,
  selected,
  onSelect,
  days = 21,
}: {
  physiotherapistId: string;
  durationMinutes: number;
  excludeAppointmentId?: string;
  selected: Slot | null;
  onSelect: (slot: Slot | null) => void;
  days?: number;
}) {
  const range = useMemo(() => {
    const start = startOfZonedDay(Date.now());
    return { startDate: start, endDate: start + days * DAY_MS - 1 };
  }, [days]);

  useGoogleBusyRefresh(physiotherapistId);
  const slots = useQuery(api.calendar.availability.getAvailableSlots, {
    physiotherapistId: physiotherapistId as Id<'users'>,
    ...range,
    sessionDuration: durationMinutes,
    excludeAppointmentId: excludeAppointmentId as Id<'appointments'> | undefined,
  }) as Slot[] | undefined;

  const byDay = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    const now = Date.now();
    for (const slot of (slots ?? []).filter((s) => s.start > now).sort((a, b) => a.start - b.start)) {
      const key = zonedDateKey(slot.start);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return groups;
  }, [slots]);

  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (byDay.size === 0) return;
    if (!day || !byDay.has(day)) setDay(selected ? zonedDateKey(selected.start) : [...byDay.keys()][0]);
  }, [byDay, day, selected]);

  if (slots === undefined) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading open times…
      </div>
    );
  }
  if (byDay.size === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-white/10">
        No open times in the next {Math.round(days / 7)} weeks.
      </p>
    );
  }

  const daySlots = (day && byDay.get(day)) || [];
  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="listbox" aria-label="Day">
        {[...byDay.entries()].map(([key, list]) => (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={key === day}
            onClick={() => {
              setDay(key);
              if (selected && zonedDateKey(selected.start) !== key) onSelect(null);
            }}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors',
              key === day
                ? 'border-rh-lime bg-rh-lime text-rh-ink dark:border-rh-lime dark:bg-rh-lime dark:text-neutral-950'
                : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-300'
            )}
          >
            {lagosShortDate(list[0].start)}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {daySlots.map((slot) => {
          const active = selected?.start === slot.start;
          return (
            <button
              key={slot.start}
              type="button"
              onClick={() => onSelect(active ? null : slot)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border px-2 py-1.5 text-sm tabular-nums transition-colors',
                active
                  ? 'border-rh-lime bg-rh-lime/10 font-medium text-rh-ink dark:border-rh-lime dark:text-rh-lime'
                  : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-300'
              )}
            >
              {lagosTime(slot.start)}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Times are Lagos time (WAT).</p>
    </div>
  );
}

/** Physio offers the patient another time from their own availability. */
export function ProposeTimeDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: AppointmentLike | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const propose = useMutation(api.appointments.proposeNewTime);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSlot(null);
      setNote('');
    }
  }, [open]);

  if (!appointment) return null;
  const duration = Math.max(15, Math.round((appointment.endTime - appointment.startTime) / 60000));

  const submit = async () => {
    if (!slot) return;
    setSaving(true);
    try {
      const result = await propose({
        appointmentId: appointment._id as Id<'appointments'>,
        startTime: slot.start,
        endTime: slot.end,
        note: note.trim() || undefined,
      });
      toast.success(result?.message ?? 'New time sent to the patient');
      onOpenChange(false);
    } catch (error) {
      toast.error(appointmentErrorMessage(error, 'Could not send the new time. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[520px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Propose another time</DialogTitle>
          <DialogDescription>
            Now: {lagosDateTime(appointment.startTime)} ({duration} min). The patient can accept the new time or keep
            this one.
          </DialogDescription>
        </DialogHeader>
        {appointment.physiotherapistId && (
          <SlotPicker
            physiotherapistId={appointment.physiotherapistId}
            durationMinutes={duration}
            excludeAppointmentId={appointment._id}
            selected={slot}
            onSelect={setSlot}
          />
        )}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the patient (optional)"
          rows={2}
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Back
          </Button>
          <Button onClick={submit} disabled={!slot || saving} className="bg-rh-lime text-rh-ink hover:bg-rh-lime-deep">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {slot ? `Propose ${lagosShortDate(slot.start)}, ${lagosTime(slot.start)}` : 'Pick a time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Physio declines a request or cancels a visit, with an optional reason for the patient. */
export function CancelVisitDialog({
  appointment,
  mode,
  open,
  onOpenChange,
}: {
  appointment: AppointmentLike | null;
  mode: 'decline' | 'cancel';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateStatus = useMutation(api.appointments.updateAppointmentStatus);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!appointment) return null;
  const patientName = [appointment.patient?.firstName, appointment.patient?.lastName].filter(Boolean).join(' ') || 'The patient';

  const submit = async () => {
    setSaving(true);
    try {
      await updateStatus({
        appointmentId: appointment._id as Id<'appointments'>,
        status: 'cancelled_by_therapist',
        cancellationReason: reason.trim() || undefined,
      });
      toast.success(mode === 'decline' ? 'Request declined. The patient has been told.' : 'Visit cancelled. The patient has been told.');
      onOpenChange(false);
    } catch (error) {
      toast.error(appointmentErrorMessage(error, 'Could not update the visit. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{mode === 'decline' ? 'Decline this request?' : 'Cancel this visit?'}</DialogTitle>
          <DialogDescription>
            {lagosDateTime(appointment.startTime)}. {patientName} will be told in the app and by email.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional, shared with the patient)"
          rows={3}
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'decline' ? 'Decline request' : 'Cancel visit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The physio's buttons for one visit. Requests the patient made get Accept / Decline /
 * Propose another time; visits the physio set wait for the patient; past open visits get
 * Mark completed / No-show.
 */
export function PhysioAppointmentActions({
  appointment,
  className,
}: {
  appointment: AppointmentLike;
  className?: string;
}) {
  const updateStatus = useMutation(api.appointments.updateAppointmentStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [cancelMode, setCancelMode] = useState<'decline' | 'cancel' | null>(null);

  const now = Date.now();
  const open = isOpenAppointment(appointment.status);
  if (!open && appointment.status !== 'no_show') return null;

  const upcoming = appointment.endTime > now;
  const started = appointment.startTime <= now;
  const needsMe = awaitingConfirmationFrom(appointment) === 'provider' && !hasPendingProposal(appointment);

  const setStatus = async (status: 'confirmed' | 'completed' | 'no_show', done: string) => {
    setBusy(status);
    try {
      await updateStatus({ appointmentId: appointment._id as Id<'appointments'>, status });
      if (status === 'confirmed') playSound('booked');
      toast.success(done);
    } catch (error) {
      toast.error(appointmentErrorMessage(error, 'Could not update the visit. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const stop = (handler: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    handler();
  };

  const buttons: ReactNode[] = [];
  if (open && upcoming && !started && needsMe) {
    buttons.push(
      <Button
        key="accept"
        size="sm"
        onClick={stop(() => setStatus('confirmed', 'Visit confirmed. The patient has been told.'))}
        disabled={busy !== null}
        className="bg-rh-lime text-rh-ink hover:bg-rh-lime-deep"
      >
        {busy === 'confirmed' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
        Accept
      </Button>,
      <Button key="decline" size="sm" variant="outline" onClick={stop(() => setCancelMode('decline'))} disabled={busy !== null}>
        <X className="mr-1.5 h-3.5 w-3.5" />
        Decline
      </Button>
    );
  }
  if (open && upcoming && !started) {
    buttons.push(
      <Button key="propose" size="sm" variant="outline" onClick={stop(() => setProposeOpen(true))} disabled={busy !== null}>
        <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
        {hasPendingProposal(appointment) ? 'Propose a different time' : 'Propose another time'}
      </Button>
    );
    if (!needsMe) {
      buttons.push(
        <Button
          key="cancel"
          size="sm"
          variant="ghost"
          onClick={stop(() => setCancelMode('cancel'))}
          disabled={busy !== null}
          className="text-neutral-600 hover:bg-red-50 hover:text-red-700 dark:text-neutral-300"
        >
          Cancel visit
        </Button>
      );
    }
  }
  if (started && (open || appointment.status === 'no_show')) {
    buttons.push(
      <Button
        key="completed"
        size="sm"
        variant="outline"
        onClick={stop(() => setStatus('completed', 'Marked as completed.'))}
        disabled={busy !== null}
      >
        {busy === 'completed' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
        Mark completed
      </Button>
    );
    if (open) {
      buttons.push(
        <Button key="noshow" size="sm" variant="ghost" onClick={stop(() => setStatus('no_show', 'Marked as no-show.'))} disabled={busy !== null}>
          <UserX className="mr-1.5 h-3.5 w-3.5" />
          No-show
        </Button>
      );
    }
  }

  // Clicks inside (including the dialogs, which portal out but bubble through React) must not
  // reach a clickable card around these actions
  return (
    <div className="contents" onClick={(e) => e.stopPropagation()}>
      {hasPendingProposal(appointment) && appointment.proposedStartTime && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          You proposed {lagosDateTime(appointment.proposedStartTime)}. Waiting for the patient.
        </p>
      )}
      {buttons.length > 0 && <div className={cn('flex flex-wrap gap-2', className)}>{buttons}</div>}
      <ProposeTimeDialog appointment={appointment} open={proposeOpen} onOpenChange={setProposeOpen} />
      <CancelVisitDialog
        appointment={appointment}
        mode={cancelMode ?? 'cancel'}
        open={cancelMode !== null}
        onOpenChange={(next) => !next && setCancelMode(null)}
      />
    </div>
  );
}

/** "Wed, 21 Oct · 10:00 AM – 11:00 AM" in Lagos time. */
export function appointmentWhen(apt: Pick<AppointmentLike, 'startTime' | 'endTime'>): string {
  return `${lagosShortDate(apt.startTime)} · ${lagosTimeRange(apt.startTime, apt.endTime)}`;
}
