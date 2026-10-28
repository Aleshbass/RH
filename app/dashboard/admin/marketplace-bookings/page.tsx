'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePaginatedQuery, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Search,
  Wifi,
  XCircle,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { playSound } from '@/lib/sounds';
import { RehabifyId } from '@/components/shared/RehabifyId';
import { getService } from '@/lib/rehabify-services';
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  cardClass,
  downloadCsv,
  formatNaira,
  inputClass,
  primaryButtonClass,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui';

const PAGE_SIZE = 25;

/** One row as returned by the bookings list and search queries. Amounts are in kobo. */
type BookingRow = {
  _id: Id<'marketplaceBookings'>;
  createdAt: number;
  sessionDate?: number;
  sessionType: string;
  sessionDuration: number;
  isOnline: boolean;
  packageSessions?: number;
  bookingStatus: string;
  paymentStatus: string;
  paymentReference?: string;
  bookingCode?: string;
  totalAmount: number;
  platformFee: number;
  rehabifyEarnings?: number;
  patientNumber: string | null;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  isGuest: boolean;
  physiotherapistId?: Id<'users'>;
  physioName: string;
  physioEmail: string;
  physioLocation: string;
  physioOffersOnline: boolean;
  physioOffersInPerson: boolean;
  joyBookingRoute?: string;
  adminSchedulingStatus?: string;
  // Standard pricing (Oct 2026)
  serviceId?: string;
  travelZoneName?: string;
  travelArea?: string;
  adminAttentionReason?: string;
};

type PhysioOption = {
  id: Id<'users'>;
  name: string;
  email: string;
  location: string;
  offersOnline: boolean;
  offersInPerson: boolean;
};

type Stats = {
  total: number;
  capped: boolean;
  statusCounts: Record<string, number>;
  paymentFailed: number;
  guest: number;
  awaitingSchedule: number;
  rehabifyRevenue: number;
};

type StatusFilter =
  | 'all'
  | 'awaiting_physio'
  | 'awaiting_admin_schedule'
  | 'confirmed'
  | 'pending_payment'
  | 'payment_failed'
  | 'completed'
  | 'cancelled';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'awaiting_physio', label: 'Awaiting physio' },
  { value: 'awaiting_admin_schedule', label: 'Awaiting scheduling' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending_payment', label: 'Pending payment' },
  { value: 'payment_failed', label: 'Payment failed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

type BadgeTone = 'neutral' | 'teal' | 'green' | 'amber' | 'red';
const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  confirmed: { label: 'Confirmed', tone: 'green' },
  pending_payment: { label: 'Pending payment', tone: 'neutral' },
  payment_failed: { label: 'Payment failed', tone: 'red' },
  awaiting_admin_schedule: { label: 'Awaiting scheduling', tone: 'amber' },
  awaiting_physio: { label: 'Awaiting physio', tone: 'amber' },
  completed: { label: 'Completed', tone: 'teal' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  no_show: { label: 'No show', tone: 'neutral' },
};

const dialogClass = 'w-[calc(100vw-2rem)] max-w-lg rounded-2xl dark:border-white/10 dark:bg-rh-ink-2 sm:w-full';
const selectContentClass = 'dark:border-white/10 dark:bg-rh-ink-2';
const fieldLabelClass = 'mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-300';

/** Kobo to a ₦ string. */
const naira = (kobo?: number) => formatNaira((kobo ?? 0) / 100);

function localDateTimeValue(timestamp: number): string {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const errorMessage = (error: unknown, fallback: string) =>
  (error as Error)?.message?.replace(/^.*(ConvexError|Uncaught Error): /, '').split('\n')[0] || fallback;

/** The status a row shows: a failed payment wins over the booking state. */
const displayStatus = (b: BookingRow) => (b.paymentStatus === 'failed' ? 'payment_failed' : b.bookingStatus);

const formatDate = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ─── Small pieces ─────────────────────────────────────────────────────────────

function BookingStatus({ booking }: { booking: BookingRow }) {
  const status = displayStatus(booking);
  const cfg = STATUS_BADGE[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral' as const };
  return <StatusBadge tone={cfg.tone} className="whitespace-nowrap capitalize">{cfg.label}</StatusBadge>;
}

function PhysioLocationBadge({
  location,
  offersOnline,
  offersInPerson,
}: {
  location: string;
  offersOnline: boolean;
  offersInPerson: boolean;
}) {
  if (!location && !offersOnline && !offersInPerson) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {location && (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <MapPin className="h-3 w-3 shrink-0 text-rh-ink dark:text-rh-lime" />
          {location}
        </span>
      )}
      {offersOnline && (
        <StatusBadge tone="teal" className="gap-0.5 text-[10px]">
          <Wifi className="h-2.5 w-2.5" /> Online
        </StatusBadge>
      )}
      {offersInPerson && (
        <StatusBadge tone="neutral" className="gap-0.5 text-[10px]">
          <Building2 className="h-2.5 w-2.5" /> In-person
        </StatusBadge>
      )}
    </div>
  );
}

function PatientCell({ booking }: { booking: BookingRow }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rh-honeydew text-xs font-semibold text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
        {booking.patientName?.[0]?.toUpperCase() || 'G'}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="max-w-[180px] truncate text-sm font-semibold text-rh-ink dark:text-white">{booking.patientName}</p>
          <RehabifyId value={booking.patientNumber} />
          {booking.isGuest && (
            <StatusBadge tone="amber" className="gap-0.5 text-[10px]">
              <Globe className="h-2.5 w-2.5" /> Guest
            </StatusBadge>
          )}
        </div>
        {booking.patientEmail && (
          <p className="mt-0.5 flex max-w-[220px] items-center gap-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{booking.patientEmail}</span>
          </p>
        )}
        {booking.patientPhone && (
          <p className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
            <Phone className="h-3 w-3 shrink-0" /> {booking.patientPhone}
          </p>
        )}
      </div>
    </div>
  );
}

/** Why a paid booking needs an admin (e.g. paid after the hold lapsed and the slot was taken). */
function AttentionReason({ booking }: { booking: BookingRow }) {
  // Also: the patient asked the care team to find another physio after a decline
  if ((booking.bookingStatus !== 'awaiting_admin_schedule' && booking.bookingStatus !== 'awaiting_physio') || !booking.adminAttentionReason) return null;
  return (
    <p className="mt-1.5 flex max-w-[260px] items-start gap-1.5 rounded-lg bg-rh-peach px-2 py-1.5 text-left text-[11px] font-medium leading-snug text-[#8a4b08] dark:bg-amber-400/10 dark:text-amber-200">
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
      {booking.adminAttentionReason}
    </p>
  );
}

function SessionSummary({ booking }: { booking: BookingRow }) {
  const service = booking.serviceId ? getService(booking.serviceId) : undefined;
  return (
    <div>
      {service ? (
        <p className="max-w-[220px] whitespace-normal text-sm text-rh-ink dark:text-neutral-100">{service.name}</p>
      ) : (
        <p className="text-sm capitalize text-rh-ink dark:text-neutral-100">{booking.sessionType?.replace(/_/g, ' ')}</p>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{booking.sessionDuration} min</p>
      {booking.travelZoneName && (
        <p className="flex items-center gap-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          {booking.travelArea ? `${booking.travelArea}, ` : ''}
          {booking.travelZoneName}
        </p>
      )}
      {booking.isOnline ? (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-rh-ink dark:text-rh-lime">
          <Wifi className="h-2.5 w-2.5" /> Online
        </span>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <Building2 className="h-2.5 w-2.5" /> In-person
        </span>
      )}
      {(booking.packageSessions ?? 0) > 1 && (
        <p className="text-[11px] font-medium text-rh-ink dark:text-rh-lime">{booking.packageSessions}-session pack</p>
      )}
    </div>
  );
}

/**
 * The one action a booking offers: schedule a paid Joy virtual consult, reschedule an upcoming
 * one, show where a Joy consult stands, or reassign the clinician on any other booking.
 */
function BookingAction({
  booking,
  onReassign,
  onSchedule,
  block = false,
}: {
  booking: BookingRow;
  onReassign: () => void;
  onSchedule: () => void;
  block?: boolean;
}) {
  const size = block ? 'h-9 w-full' : 'h-8';
  if (booking.adminSchedulingStatus === 'awaiting_schedule') {
    return (
      <Button size="sm" onClick={onSchedule} className={cn(primaryButtonClass, size, 'whitespace-nowrap text-xs')}>
        <Calendar className="mr-1.5 h-3.5 w-3.5" />
        {block ? 'Schedule virtual consultation' : 'Schedule'}
      </Button>
    );
  }
  if (booking.joyBookingRoute === 'admin_scheduled_virtual') {
    if (booking.bookingStatus === 'confirmed' && (booking.sessionDate ?? 0) > Date.now()) {
      return (
        <Button size="sm" onClick={onSchedule} className={cn(softButtonClass, size, 'whitespace-nowrap text-xs')}>
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          Reschedule
        </Button>
      );
    }
    const failed = booking.paymentStatus === 'failed';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium',
          block && 'w-full justify-center py-2',
          failed ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
        )}
      >
        {failed ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {failed ? 'Payment failed' : booking.bookingStatus === 'confirmed' ? 'Scheduled' : 'Awaiting payment'}
      </span>
    );
  }
  return (
    <Button size="sm" onClick={onReassign} className={cn(softButtonClass, size, 'whitespace-nowrap text-xs')}>
      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
      {block ? 'Reassign physiotherapist' : 'Reassign'}
    </Button>
  );
}

// ─── Reassign dialog ──────────────────────────────────────────────────────────

function ReassignDialog({ booking, onClose }: { booking: BookingRow; onClose: () => void }) {
  const physios = useQuery(api.admin.marketplaceBookings.adminGetAllPhysiosForSelect) as PhysioOption[] | undefined;
  const reassign = useMutation(api.admin.marketplaceBookings.adminReassignBookingPhysio);

  const [selectedPhysioId, setSelectedPhysioId] = useState<Id<'users'> | ''>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const filteredPhysios = useMemo(() => {
    if (!physios) return [];
    const q = search.toLowerCase();
    return physios
      .filter((p) => p.id !== booking.physiotherapistId)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)
      );
  }, [physios, search, booking.physiotherapistId]);

  const handleConfirm = async () => {
    if (!selectedPhysioId) {
      toast.error('Please select a physiotherapist');
      return;
    }
    setLoading(true);
    try {
      await reassign({
        bookingId: booking._id,
        newPhysiotherapistId: selectedPhysioId,
        reason: reason.trim() || undefined,
      });
      playSound('success');
      toast.success('Booking reassigned successfully');
      onClose();
    } catch (err) {
      playSound('error');
      toast.error(errorMessage(err, 'Failed to reassign booking'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base dark:text-white">
            <ArrowRightLeft className="h-5 w-5 shrink-0 text-rh-ink dark:text-rh-lime" />
            Reassign physiotherapist
          </DialogTitle>
          <DialogDescription className="text-sm">
            Transfer <span className="font-semibold text-rh-ink dark:text-white">{booking.patientName}</span>&apos;s booking
            from <span className="font-semibold text-rh-ink dark:text-white">{booking.physioName}</span> to another
            physiotherapist. Their appointment, relationship and treatment plan will all be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search by name, email or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, 'pl-9')}
            />
          </div>

          <div className="max-h-60 divide-y divide-black/[0.05] overflow-y-auto rounded-xl border border-black/[0.06] dark:divide-white/[0.06] dark:border-white/10">
            {!physios ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
              </div>
            ) : filteredPhysios.length === 0 ? (
              <p className="p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">No physiotherapists found</p>
            ) : (
              filteredPhysios.map((p) => {
                const selected = selectedPhysioId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPhysioId(p.id)}
                    aria-pressed={selected}
                    className={cn(
                      'w-full border-l-[3px] px-4 py-3 text-left transition-colors',
                      selected
                        ? 'border-l-rh-lime bg-rh-honeydew dark:border-l-rh-lime dark:bg-white/[0.06]'
                        : 'border-l-transparent hover:bg-rh-canvas dark:hover:bg-white/[0.03]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{p.name}</p>
                        {p.email && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{p.email}</p>}
                        <PhysioLocationBadge location={p.location} offersOnline={p.offersOnline} offersInPerson={p.offersInPerson} />
                      </div>
                      {selected && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-rh-ink dark:text-rh-lime" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div>
            <Label htmlFor="reassign-reason" className={fieldLabelClass}>
              Reason <span className="font-normal text-neutral-400">(optional)</span>
            </Label>
            <Input
              id="reassign-reason"
              placeholder="e.g. Patient requested a different location…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button onClick={onClose} disabled={loading} className={cn(softButtonClass, 'w-full sm:w-auto')}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading || !selectedPhysioId} className={cn(primaryButtonClass, 'w-full sm:w-auto')}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reassigning…
              </>
            ) : (
              <>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Confirm reassignment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Joy virtual consult scheduling ───────────────────────────────────────────

function ScheduleVirtualDialog({ booking, onClose }: { booking: BookingRow; onClose: () => void }) {
  const physios = useQuery(api.admin.marketplaceBookings.adminGetAllPhysiosForSelect) as PhysioOption[] | undefined;
  const schedule = useMutation(api.joyIntegration.adminScheduleJoyVirtualBooking);
  const reschedule = useMutation(api.joyIntegration.adminRescheduleJoyVirtualBooking);
  const isReschedule = booking.adminSchedulingStatus === 'scheduled' && booking.bookingStatus === 'confirmed';
  const [physiotherapistId, setPhysiotherapistId] = useState<string>(() => booking.physiotherapistId || '');
  // Leave a small buffer above Convex's five-minute safety minimum so an
  // admin cannot accidentally select the current time and lose the form.
  const [startLocal, setStartLocal] = useState(() =>
    localDateTimeValue(isReschedule && booking.sessionDate ? booking.sessionDate : Date.now() + 10 * 60_000)
  );
  const [loading, setLoading] = useState(false);
  const onlinePhysios = physios?.filter((p) => p.offersOnline) ?? [];

  const confirm = async () => {
    if (!physiotherapistId || !startLocal) {
      toast.error('Choose a clinician and appointment date/time');
      return;
    }
    const startTime = new Date(startLocal).getTime();
    if (!Number.isFinite(startTime)) {
      toast.error('Enter a valid appointment date/time');
      return;
    }
    if (startTime < Date.now() + 5 * 60_000) {
      toast.error('Choose an appointment time at least five minutes from now.');
      return;
    }
    setLoading(true);
    try {
      if (isReschedule) {
        await reschedule({ bookingId: booking._id, startTime });
        toast.success('Virtual consultation rescheduled. Joy will notify the patient.');
      } else {
        await schedule({ bookingId: booking._id, physiotherapistId: physiotherapistId as Id<'users'>, startTime });
        toast.success('Virtual consultation scheduled. Joy will notify the patient.');
      }
      playSound('booked');
      onClose();
    } catch (error) {
      playSound('error');
      toast.error(errorMessage(error, 'Could not schedule this consultation'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base dark:text-white">
            <CalendarClock className="h-5 w-5 shrink-0 text-rh-ink dark:text-rh-lime" />
            {isReschedule ? 'Reschedule virtual consultation' : 'Schedule virtual consultation'}
          </DialogTitle>
          <DialogDescription>
            {isReschedule
              ? 'Choose a new future time. The existing clinician and secure meeting link remain unchanged; Joy will send updated details.'
              : 'Assign an online clinician and time. Saving confirms the paid booking and sends the patient’s appointment details through Joy.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-rh-canvas px-4 py-3 text-sm dark:bg-white/[0.04]">
          <p className="font-semibold text-rh-ink dark:text-white">{booking.patientName}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {(booking.serviceId && getService(booking.serviceId)?.name) || booking.sessionType?.replace(/_/g, ' ')} · {booking.sessionDuration} min ·{' '}
            {naira(booking.totalAmount)}
          </p>
          <AttentionReason booking={booking} />
        </div>

        <div className="space-y-4 py-1">
          <div>
            <Label className={fieldLabelClass}>Clinician</Label>
            <Select value={physiotherapistId} onValueChange={setPhysiotherapistId}>
              <SelectTrigger disabled={isReschedule} className={cn(inputClass, 'w-full')}>
                <SelectValue placeholder={physios === undefined ? 'Loading clinicians…' : 'Select an online clinician'} />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {onlinePhysios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="joy-start" className={fieldLabelClass}>
              Date and time
            </Label>
            <Input
              id="joy-start"
              type="datetime-local"
              value={startLocal}
              min={localDateTimeValue(Date.now() + 5 * 60_000)}
              onChange={(e) => setStartLocal(e.target.value)}
              className={cn(inputClass, 'dark:[color-scheme:dark]')}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button onClick={onClose} disabled={loading} className={cn(softButtonClass, 'w-full sm:w-auto')}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={loading || !physiotherapistId || !startLocal}
            className={cn(primaryButtonClass, 'w-full sm:w-auto')}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Calendar className="mr-2 h-4 w-4" />
                {isReschedule ? 'Reschedule and notify' : 'Schedule and notify'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Booking card (mobile) ────────────────────────────────────────────────────

function BookingCard({ booking, onReassign, onSchedule }: { booking: BookingRow; onReassign: () => void; onSchedule: () => void }) {
  return (
    <div className={cn(cardClass, 'space-y-3 p-4')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatDate(booking.createdAt)} · {formatTime(booking.createdAt)}
          </p>
          {(booking.bookingCode || booking.paymentReference) && (
            <p className="max-w-[180px] truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
              {booking.bookingCode || booking.paymentReference}
            </p>
          )}
        </div>
        <BookingStatus booking={booking} />
      </div>
      <AttentionReason booking={booking} />

      <PatientCell booking={booking} />

      <div className="border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Physiotherapist</p>
        <p className="text-sm font-semibold text-rh-ink dark:text-white">{booking.physioName}</p>
        {booking.physioEmail && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{booking.physioEmail}</p>}
        <PhysioLocationBadge
          location={booking.physioLocation}
          offersOnline={booking.physioOffersOnline}
          offersInPerson={booking.physioOffersInPerson}
        />
      </div>

      <div className="flex items-end justify-between gap-2">
        <SessionSummary booking={booking} />
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{naira(booking.totalAmount)}</p>
          <p className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">Fee {naira(booking.platformFee)}</p>
        </div>
      </div>

      <BookingAction booking={booking} onReassign={onReassign} onSchedule={onSchedule} block />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminMarketplaceBookingsPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput.trim());
  const searching = search.length >= 2;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reassignBooking, setReassignBooking] = useState<BookingRow | null>(null);
  const [scheduleBooking, setScheduleBooking] = useState<BookingRow | null>(null);

  const stats = useQuery(api.admin.marketplaceBookings.adminGetMarketplaceBookingStats) as Stats | undefined;

  const paged = usePaginatedQuery(
    api.admin.marketplaceBookings.adminGetAllMarketplaceBookings,
    searching ? 'skip' : { status: statusFilter },
    { initialNumItems: PAGE_SIZE }
  );
  const searchResult = useQuery(
    api.admin.marketplaceBookings.adminSearchMarketplaceBookings,
    searching ? { search, status: statusFilter } : 'skip'
  ) as { bookings: BookingRow[]; scanned: number; capped: boolean } | undefined;

  const bookings: BookingRow[] = searching ? searchResult?.bookings ?? [] : (paged.results as BookingRow[]);
  const isLoading = searching ? searchResult === undefined : paged.status === 'LoadingFirstPage';

  const filterOptions = STATUS_FILTERS.map((f) => ({
    ...f,
    count: !stats
      ? undefined
      : f.value === 'all'
        ? stats.total
        : f.value === 'payment_failed'
          ? stats.paymentFailed
          : stats.statusCounts[f.value] ?? 0,
  }));

  const confirmedCount = stats?.statusCounts.confirmed ?? 0;
  const countHint = stats?.capped ? `latest ${stats.total.toLocaleString()} bookings` : undefined;

  const exportRows = () => {
    if (bookings.length === 0) return;
    downloadCsv(
      `marketplace-bookings-${new Date().toISOString().slice(0, 10)}`,
      bookings.map((b) => ({
        created: new Date(b.createdAt).toISOString(),
        bookingCode: b.bookingCode ?? '',
        paymentReference: b.paymentReference ?? '',
        status: displayStatus(b),
        patientId: b.patientNumber ?? '',
        patient: b.patientName,
        patientEmail: b.patientEmail,
        patientPhone: b.patientPhone,
        guest: b.isGuest ? 'yes' : 'no',
        physiotherapist: b.physioName,
        physioEmail: b.physioEmail,
        sessionType: b.sessionType,
        service: b.serviceId ? getService(b.serviceId)?.name ?? b.serviceId : '',
        travelZone: b.travelZoneName ?? '',
        durationMinutes: b.sessionDuration,
        online: b.isOnline ? 'yes' : 'no',
        packageSessions: b.packageSessions ?? 1,
        totalNaira: (b.totalAmount ?? 0) / 100,
        platformFeeNaira: (b.platformFee ?? 0) / 100,
        rehabifyNaira: (b.rehabifyEarnings ?? 0) / 100,
      }))
    );
  };

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace"
        title="Bookings"
        description="Every patient booking, including guests. Schedule Joy virtual consultations and reassign physiotherapists."
        actions={
          <Button onClick={exportRows} disabled={bookings.length === 0} className={softButtonClass}>
            <Download className="mr-2 h-4 w-4" />
            Export shown
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="Bookings"
            icon={Calendar}
            value={stats ? stats.total.toLocaleString() : '—'}
            hint={stats ? countHint ?? `${stats.guest.toLocaleString()} from guests` : undefined}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Awaiting scheduling"
            icon={CalendarClock}
            tone={stats && stats.awaitingSchedule > 0 ? 'attention' : 'peach'}
            value={stats ? stats.awaitingSchedule.toLocaleString() : '—'}
            hint="paid Joy virtual consults"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Confirmed" icon={CheckCircle2} tone="mint" value={stats ? confirmedCount.toLocaleString() : '—'} hint={countHint} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Rehabify revenue"
            icon={Banknote}
            value={stats ? naira(stats.rehabifyRevenue) : '—'}
            hint={stats?.capped ? countHint : 'from completed payments'}
          />
        </StaggerItem>
      </Stagger>

      <Panel bodyClassName="space-y-4 p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Search patient, clinician, email, phone or reference…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={cn(inputClass, 'pl-9')}
            aria-label="Search bookings"
          />
        </div>
        <FilterChips value={statusFilter} onChange={setStatusFilter} options={filterOptions} />
        {searching && searchResult && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {searchResult.bookings.length} match{searchResult.bookings.length === 1 ? '' : 'es'} in the latest{' '}
            {searchResult.scanned.toLocaleString()} bookings
            {searchResult.capped ? '. Older bookings aren’t searched; clear the search and page through the list to reach them.' : '.'}
          </p>
        )}
      </Panel>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl dark:bg-white/[0.06]" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Calendar />}
            title="No bookings found"
            description={searching || statusFilter !== 'all' ? 'Try a different search or status.' : 'Bookings appear here as soon as a patient books.'}
          />
        </Panel>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid gap-3 md:hidden">
            {bookings.map((booking) => (
              <BookingCard
                key={booking._id}
                booking={booking}
                onReassign={() => setReassignBooking(booking)}
                onSchedule={() => setScheduleBooking(booking)}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <Panel className="hidden md:block">
            <div className={tableWrapClass}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-32 whitespace-nowrap pl-5">Date</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Physiotherapist</TableHead>
                    <TableHead className="whitespace-nowrap">Session</TableHead>
                    <TableHead className="whitespace-nowrap">Amount</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead className="w-28 pr-5 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking._id}>
                      <TableCell className="whitespace-nowrap py-3 pl-5 align-top">
                        <p className="text-sm font-medium text-rh-ink dark:text-white">{formatDate(booking.createdAt)}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{formatTime(booking.createdAt)}</p>
                        {booking.bookingCode && (
                          <p className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{booking.bookingCode}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-3 align-top">
                        <PatientCell booking={booking} />
                      </TableCell>
                      <TableCell className="py-3 align-top">
                        <p className="text-sm font-semibold text-rh-ink dark:text-white">{booking.physioName}</p>
                        {booking.physioEmail && (
                          <p className="max-w-[200px] truncate text-xs text-neutral-500 dark:text-neutral-400">{booking.physioEmail}</p>
                        )}
                        <PhysioLocationBadge
                          location={booking.physioLocation}
                          offersOnline={booking.physioOffersOnline}
                          offersInPerson={booking.physioOffersInPerson}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-3 align-top">
                        <SessionSummary booking={booking} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-3 align-top">
                        <p className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{naira(booking.totalAmount)}</p>
                        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">Fee {naira(booking.platformFee)}</p>
                      </TableCell>
                      <TableCell className="py-3 align-top">
                        <BookingStatus booking={booking} />
                        <AttentionReason booking={booking} />
                      </TableCell>
                      <TableCell className="py-3 pr-5 text-right align-top">
                        <BookingAction
                          booking={booking}
                          onReassign={() => setReassignBooking(booking)}
                          onSchedule={() => setScheduleBooking(booking)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>

          {!searching && (
            <div className="flex flex-col items-center gap-2 pb-2">
              {paged.status === 'CanLoadMore' || paged.status === 'LoadingMore' ? (
                <Button
                  onClick={() => paged.loadMore(PAGE_SIZE)}
                  disabled={paged.status === 'LoadingMore'}
                  className={cn(softButtonClass, 'min-w-40')}
                >
                  {paged.status === 'LoadingMore' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Load more
                </Button>
              ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">That&apos;s every booking.</p>
              )}
              <p className="text-xs tabular-nums text-neutral-400 dark:text-neutral-500">Showing {bookings.length.toLocaleString()}</p>
            </div>
          )}
        </>
      )}

      {reassignBooking && <ReassignDialog booking={reassignBooking} onClose={() => setReassignBooking(null)} />}
      {scheduleBooking && <ScheduleVirtualDialog booking={scheduleBooking} onClose={() => setScheduleBooking(null)} />}
    </AdminPage>
  );
}
