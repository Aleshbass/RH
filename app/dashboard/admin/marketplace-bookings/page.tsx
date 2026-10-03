// @ts-nocheck
'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Search,
  MapPin,
  Globe,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRightLeft,
  Wifi,
  Building2,
  Phone,
  Mail,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Banknote,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';


const PAGE_SIZE = 25;

function localDateTimeValue(timestamp: number): string {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'payment_failed', label: 'Payment Failed' },
  { value: 'awaiting_admin_schedule', label: 'Awaiting Scheduling' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

type StatusConfig = { label: string; color: string; icon: LucideIcon };
const STATUS_CONFIG: Record<string, StatusConfig> = {
  confirmed:       { label: 'Confirmed',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pending_payment: { label: 'Pending Payment', color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: Clock },
  payment_failed: { label: 'Payment Failed', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  awaiting_admin_schedule: { label: 'Awaiting Scheduling', color: 'bg-violet-50 text-violet-700 border-violet-200', icon: Calendar },
  completed:       { label: 'Completed',        color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: CheckCircle2 },
  cancelled:       { label: 'Cancelled',        color: 'bg-red-50 text-red-700 border-red-200',             icon: XCircle },
  no_show:         { label: 'No Show',          color: 'bg-gray-100 text-gray-600 border-gray-200',         icon: AlertCircle },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

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
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {location && (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-500">
          <MapPin className="h-3 w-3 text-teal-500 shrink-0" />
          {location}
        </span>
      )}
      {offersOnline && (
        <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-1.5 py-0.5">
          <Wifi className="h-2.5 w-2.5" /> Online
        </span>
      )}
      {offersInPerson && (
        <span className="inline-flex items-center gap-0.5 text-[10px] bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-1.5 py-0.5">
          <Building2 className="h-2.5 w-2.5" /> In-person
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: StatusConfig = STATUS_CONFIG[status] ?? {
    label: status,
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    icon: AlertCircle,
  };
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2.5 py-1 whitespace-nowrap',
        cfg.color
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {cfg.label}
    </span>
  );
}

// ─── Reassign Modal ───────────────────────────────────────────────────────────

interface ReassignModalProps {
  booking: {
    _id: Id<'marketplaceBookings'>;
    patientName: string;
    physioName: string;
    physiotherapistId: Id<'users'>;
  };
  onClose: () => void;
}

function ReassignModal({ booking, onClose }: ReassignModalProps) {
  const physios = useQuery((api as any).admin.marketplaceBookings.adminGetAllPhysiosForSelect);
  const reassign = useMutation((api as any).admin.marketplaceBookings.adminReassignBookingPhysio);

  const [selectedPhysioId, setSelectedPhysioId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const filteredPhysios = useMemo(() => {
    if (!physios) return [];
    const q = search.toLowerCase();
    return (physios as any[])
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
    if (!selectedPhysioId) { toast.error('Please select a physiotherapist'); return; }
    setLoading(true);
    try {
      await reassign({
        bookingId: booking._id,
        newPhysiotherapistId: selectedPhysioId as Id<'users'>,
        reason: reason.trim() || undefined,
      });
      toast.success('Booking reassigned successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reassign booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-5 w-5 text-teal-600 shrink-0" />
            Reassign Physiotherapist
          </DialogTitle>
          <DialogDescription className="text-sm">
            Transfer{' '}
            <span className="font-semibold text-gray-800">{booking.patientName}</span>'s booking
            from{' '}
            <span className="font-semibold text-gray-800">{booking.physioName}</span> to another
            physiotherapist. Their appointment, relationship, and treatment plan will all be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by name or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Physio list */}
          <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {!physios ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : filteredPhysios.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No physiotherapists found</div>
            ) : (
              filteredPhysios.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPhysioId(p.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors',
                    selectedPhysioId === p.id
                      ? 'bg-teal-50 border-l-[3px] border-l-teal-500'
                      : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      {p.email && <p className="text-xs text-gray-500 truncate">{p.email}</p>}
                      <PhysioLocationBadge
                        location={p.location}
                        offersOnline={p.offersOnline}
                        offersInPerson={p.offersInPerson}
                      />
                    </div>
                    {selectedPhysioId === p.id && (
                      <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-1" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Patient requested different location…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !selectedPhysioId}
            className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Reassigning…</>
            ) : (
              <><ArrowRightLeft className="h-4 w-4 mr-2" />Confirm Reassignment</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleVirtualModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const physios = useQuery((api as any).admin.marketplaceBookings.adminGetAllPhysiosForSelect);
  const schedule = useMutation((api as any).joyIntegration.adminScheduleJoyVirtualBooking);
  const reschedule = useMutation((api as any).joyIntegration.adminRescheduleJoyVirtualBooking);
  const isReschedule = booking.adminSchedulingStatus === 'scheduled' && booking.bookingStatus === 'confirmed';
  const [physiotherapistId, setPhysiotherapistId] = useState(() => booking.physiotherapistId || '');
  // Leave a small buffer above Convex's five-minute safety minimum so an
  // admin cannot accidentally select the current time and lose the form.
  const [startLocal, setStartLocal] = useState(() => localDateTimeValue(isReschedule ? booking.sessionDate : Date.now() + 10 * 60_000));
  const [loading, setLoading] = useState(false);
  const onlinePhysios = (physios as any[] | undefined)?.filter((p) => p.offersOnline) ?? [];
  const confirm = async () => {
    if (!physiotherapistId || !startLocal) { toast.error('Choose a clinician and appointment date/time'); return; }
    const startTime = new Date(startLocal).getTime();
    if (!Number.isFinite(startTime)) { toast.error('Enter a valid appointment date/time'); return; }
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
      onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Could not schedule this consultation');
    } finally { setLoading(false); }
  };
  return <Dialog open onOpenChange={onClose}>
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isReschedule ? 'Reschedule virtual consultation' : 'Schedule virtual consultation'}</DialogTitle>
        <DialogDescription>{isReschedule ? 'Choose a new future time. The existing clinician and secure meeting link remain unchanged; Joy will send updated details.' : 'Assign an online clinician and time. Saving confirms the paid booking and sends the patient’s appointment details through Joy.'}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">Clinician</label>
          <Select value={physiotherapistId} onValueChange={setPhysiotherapistId}>
            <SelectTrigger disabled={isReschedule}><SelectValue placeholder="Select an online clinician" /></SelectTrigger>
            <SelectContent>{onlinePhysios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">Date and time</label>
          <Input type="datetime-local" value={startLocal} min={localDateTimeValue(Date.now() + 5 * 60_000)} onChange={(e) => setStartLocal(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={confirm} disabled={loading || !physiotherapistId || !startLocal} className="bg-teal-600 hover:bg-teal-700 text-white">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : <><Calendar className="h-4 w-4 mr-2" />{isReschedule ? 'Reschedule and notify' : 'Schedule and notify'}</>}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

// ─── Booking Card (mobile) ────────────────────────────────────────────────────

function BookingCard({ booking, onReassign, onSchedule }: { booking: any; onReassign: () => void; onSchedule: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      {/* Top row: date + status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-400">
            {new Date(booking.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
          {booking.paymentReference && (
            <p className="text-[10px] text-gray-400 font-mono truncate max-w-[160px]">
              {booking.paymentReference}
            </p>
          )}
        </div>
        <StatusBadge status={booking.bookingStatus} />
      </div>

      {/* Patient */}
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shrink-0 text-white text-xs font-bold">
          {booking.patientName?.[0]?.toUpperCase() || 'G'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{booking.patientName}</span>
            {booking.isGuest && (
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-1.5 py-0.5 font-medium">
                <Globe className="h-2.5 w-2.5" /> Guest
              </span>
            )}
          </div>
          {booking.patientEmail && (
            <p className="text-xs text-gray-500 flex items-center gap-0.5 mt-0.5 truncate">
              <Mail className="h-3 w-3 shrink-0" /> {booking.patientEmail}
            </p>
          )}
          {booking.patientPhone && (
            <p className="text-xs text-gray-500 flex items-center gap-0.5 truncate">
              <Phone className="h-3 w-3 shrink-0" /> {booking.patientPhone}
            </p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-50" />

      {/* Physio */}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Physiotherapist</p>
        <p className="text-sm font-semibold text-gray-900">{booking.physioName}</p>
        {booking.physioEmail && (
          <p className="text-xs text-gray-500">{booking.physioEmail}</p>
        )}
        <PhysioLocationBadge
          location={booking.physioLocation}
          offersOnline={booking.physioOffersOnline}
          offersInPerson={booking.physioOffersInPerson}
        />
      </div>

      {/* Session + Amount row */}
      <div className="flex items-end justify-between gap-2 pt-1">
        <div>
          <p className="text-xs capitalize text-gray-700 font-medium">
            {booking.sessionType?.replace(/_/g, ' ')} · {booking.sessionDuration}min
          </p>
          {booking.isOnline ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600">
              <Wifi className="h-2.5 w-2.5" /> Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
              <Building2 className="h-2.5 w-2.5" /> In-person
            </span>
          )}
          {booking.packageSessions > 1 && (
            <p className="text-[10px] text-teal-600 font-medium">{booking.packageSessions}-session pack</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-gray-900">
            {formatCurrency(booking.totalAmount, 'NGN')}
          </p>
          <p className="text-[10px] text-gray-400">
            Fee: {formatCurrency(booking.platformFee, 'NGN')}
          </p>
        </div>
      </div>

      {booking.adminSchedulingStatus === 'awaiting_schedule' ? <Button
        size="sm" onClick={onSchedule}
        className="w-full h-9 text-xs bg-teal-600 hover:bg-teal-700 text-white"
      ><Calendar className="h-3.5 w-3.5 mr-1.5" />Schedule virtual consultation</Button> : booking.joyBookingRoute === 'admin_scheduled_virtual' ? <Button size="sm" variant="outline" disabled className="w-full h-9 text-xs">{booking.paymentStatus === 'failed' ? 'Payment failed' : booking.bookingStatus === 'confirmed' ? 'Scheduled' : 'Awaiting payment'}</Button> : <Button
        size="sm"
        variant="outline"
        onClick={onReassign}
        className="w-full h-9 text-xs border-gray-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors"
      >
        <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
        Reassign Physiotherapist
      </Button>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminMarketplaceBookingsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [reassignBooking, setReassignBooking] = useState<any | null>(null);
  const [scheduleBooking, setScheduleBooking] = useState<any | null>(null);

  // Paginated + filtered result
  const result = useQuery(
    (api as any).admin.marketplaceBookings.adminGetAllMarketplaceBookings,
    { status: statusFilter, search: search || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  );

  // All bookings for stats (unfiltered)
  const allResult = useQuery(
    (api as any).admin.marketplaceBookings.adminGetAllMarketplaceBookings,
    { limit: 9999 }
  );

  const bookings: any[] = result?.bookings ?? [];
  const total: number = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isLoading = result === undefined;

  const allBookings: any[] = allResult?.bookings ?? [];
  const confirmedCount = allBookings.filter((b) => b.bookingStatus === 'confirmed').length;
  const guestCount = allBookings.filter((b) => b.isGuest).length;
  const platformRevenue = allBookings
    .filter((b) => b.paymentStatus === 'completed')
    .reduce((sum, b) => sum + (b.rehabifyEarnings || 0), 0);

  const stats = [
    { label: 'Total Bookings',   value: allResult ? String(allResult.total) : '—',                            icon: Calendar,       color: 'text-blue-600 bg-blue-50' },
    { label: 'Confirmed',         value: allResult ? String(confirmedCount) : '—',                             icon: CheckCircle2,   color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Guest Bookings',    value: allResult ? String(guestCount) : '—',                                 icon: Globe,          color: 'text-purple-600 bg-purple-50' },
    { label: 'Rehabify Revenue',  value: allResult ? formatCurrency(platformRevenue, 'NGN') : '—',             icon: Banknote,       color: 'text-teal-600 bg-teal-50' },
  ];

  return (
    <div className="flex-1 space-y-5 p-4 md:p-8 pt-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Marketplace Bookings</h1>
        <p className="text-muted-foreground mt-1">
          Manage all patient bookings, view guest details, and reassign physiotherapists.
        </p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border border-gray-100 shadow-sm">
            <CardContent className="p-3 md:p-4 flex items-center gap-3">
              <div className={cn('h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center shrink-0', color)}>
                <Icon className="h-4 w-4 md:h-5 md:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] md:text-xs text-gray-500 font-medium truncate">{label}</p>
                <p className="text-lg md:text-xl font-bold text-gray-900 truncate">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search patient name, email, or reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 w-full"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-7 w-7 animate-spin text-teal-500" />
        </div>
      )}

      {/* ── Empty ── */}
      {!isLoading && bookings.length === 0 && (
        <Card className="border border-gray-100">
          <CardContent className="flex flex-col items-center justify-center h-48 text-center">
            <Calendar className="h-10 w-10 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No bookings found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filter</p>
          </CardContent>
        </Card>
      )}

      {/* ── Mobile: Cards ── */}
      {!isLoading && bookings.length > 0 && (
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
      )}

      {/* ── Desktop: Table ── */}
      {!isLoading && bookings.length > 0 && (
        <Card className="hidden md:block border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50">
                  <TableHead className="whitespace-nowrap text-xs font-semibold text-gray-600 w-32">Date</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600">Patient</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600">Physiotherapist</TableHead>
                  <TableHead className="whitespace-nowrap text-xs font-semibold text-gray-600">Session</TableHead>
                  <TableHead className="whitespace-nowrap text-xs font-semibold text-gray-600">Amount</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 w-36">Status</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-gray-600 w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking._id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Date */}
                    <TableCell className="whitespace-nowrap align-top py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(booking.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(booking.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </TableCell>

                    {/* Patient */}
                    <TableCell className="align-top py-3">
                      <div className="flex items-start gap-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shrink-0 text-white text-xs font-bold mt-0.5">
                          {booking.patientName?.[0]?.toUpperCase() || 'G'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">{booking.patientName}</p>
                            {booking.isGuest && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] bg-purple-50 text-purple-600 border border-purple-200 rounded-full px-1.5 py-0.5 font-medium whitespace-nowrap">
                                <Globe className="h-2.5 w-2.5" /> Guest
                              </span>
                            )}
                          </div>
                          {booking.patientEmail && (
                            <p className="text-xs text-gray-500 flex items-center gap-0.5 mt-0.5 truncate max-w-[200px]">
                              <Mail className="h-2.5 w-2.5 shrink-0" /> {booking.patientEmail}
                            </p>
                          )}
                          {booking.patientPhone && (
                            <p className="text-xs text-gray-500 flex items-center gap-0.5">
                              <Phone className="h-2.5 w-2.5 shrink-0" /> {booking.patientPhone}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Physiotherapist */}
                    <TableCell className="align-top py-3">
                      <p className="text-sm font-semibold text-gray-900">{booking.physioName}</p>
                      {booking.physioEmail && (
                        <p className="text-xs text-gray-500 truncate max-w-[180px]">{booking.physioEmail}</p>
                      )}
                      <PhysioLocationBadge
                        location={booking.physioLocation}
                        offersOnline={booking.physioOffersOnline}
                        offersInPerson={booking.physioOffersInPerson}
                      />
                    </TableCell>

                    {/* Session */}
                    <TableCell className="align-top py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-800 capitalize">
                        {booking.sessionType?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-500">{booking.sessionDuration} min</p>
                      {booking.isOnline ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600">
                          <Wifi className="h-2.5 w-2.5" /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                          <Building2 className="h-2.5 w-2.5" /> In-person
                        </span>
                      )}
                      {booking.packageSessions > 1 && (
                        <p className="text-[10px] text-teal-600 font-medium">{booking.packageSessions}-session pack</p>
                      )}
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="align-top py-3 whitespace-nowrap">
                      <p className="text-sm font-bold text-gray-900">
                        {formatCurrency(booking.totalAmount, 'NGN')}
                      </p>
                      <p className="text-xs text-gray-400">
                        Fee: {formatCurrency(booking.platformFee, 'NGN')}
                      </p>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="align-top py-3">
                      <StatusBadge status={booking.paymentStatus === 'failed' ? 'payment_failed' : booking.bookingStatus} />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="align-top py-3 text-right">
                      {booking.adminSchedulingStatus === 'awaiting_schedule' ? <Button
                        size="sm"
                        onClick={() => setScheduleBooking(booking)}
                        className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
                      ><Calendar className="h-3.5 w-3.5 mr-1" />Schedule</Button> : booking.joyBookingRoute === 'admin_scheduled_virtual' && booking.bookingStatus === 'confirmed' && booking.sessionDate > Date.now() ? <Button size="sm" variant="outline" onClick={() => setScheduleBooking(booking)} className="h-8 text-xs border-gray-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 whitespace-nowrap"><Calendar className="h-3.5 w-3.5 mr-1" />Reschedule</Button> : booking.joyBookingRoute === 'admin_scheduled_virtual' ? <span className={`inline-flex items-center gap-1 text-xs ${booking.paymentStatus === 'failed' ? 'text-red-700' : 'text-emerald-700'}`}>{booking.paymentStatus === 'failed' ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{booking.paymentStatus === 'failed' ? 'Payment failed' : booking.bookingStatus === 'confirmed' ? 'Scheduled' : 'Awaiting payment'}</span> : <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReassignBooking(booking)}
                        className="h-8 text-xs border-gray-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors whitespace-nowrap"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                        Reassign
                      </Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} bookings
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-gray-600 font-medium min-w-[60px] text-center">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  size="sm" variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Mobile pagination */}
      {!isLoading && bookings.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between md:hidden">
          <p className="text-xs text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-9 w-9 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-600 font-medium">{page + 1}/{totalPages}</span>
            <Button
              size="sm" variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="h-9 w-9 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Reassign modal */}
      {reassignBooking && (
        <ReassignModal booking={reassignBooking} onClose={() => setReassignBooking(null)} />
      )}
      {scheduleBooking && (
        <ScheduleVirtualModal booking={scheduleBooking} onClose={() => setScheduleBooking(null)} />
      )}
    </div>
  );
}
