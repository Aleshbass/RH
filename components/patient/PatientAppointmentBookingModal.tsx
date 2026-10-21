'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { getPatientCareTeam } from '@/convex/patients'
import type { QueryResult } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Id } from '@/convex/_generated/dataModel'
import { format, isBefore, startOfToday } from 'date-fns'
import { lagosDate, lagosDateTime, lagosTime, lagosTimeRange, startOfZonedDay, zonedDateKey } from '@/convex/helpers/lagosTime'
import { ChevronLeft, Check, Video, Calendar as CalendarIcon, Clock, User, MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import { useGoogleBusyRefresh } from '@/lib/hooks/useGoogleBusyRefresh'

interface PatientAppointmentBookingModalProps {
    isOpen: boolean
    onClose: () => void
    preselectedPhysiotherapistId?: Id<'users'>
    onAppointmentBooked?: () => void
}

type Step = 'date' | 'time' | 'details' | 'success'
type AppointmentType = 'telehealth' | 'in-person'
type Slot = { start: number; end: number; duration: number }
type CareTeamMember = { physiotherapist: { _id: string; firstName?: string; lastName?: string } } | null

const SERVICE_TYPES = [
    'Initial Consultation',
    'Follow-up Session',
    'Physical Assessment',
    'Exercise Therapy',
    'Manual Therapy',
    'Rehabilitation Session',
    'Progress Review',
    'Discharge Planning',
    'Massage Therapy',
]

const SESSION_MINUTES = 60
const BOOKING_WINDOW_DAYS = 60

function errorMessage(error: unknown) {
    // ConvexError keeps its readable message in `data`, also in production
    const data = (error as { data?: unknown } | null)?.data
    if (typeof data === 'string' && data.trim()) return data
    const raw = error instanceof Error ? error.message : ''
    // Convex prefixes server errors with request details; keep the readable part
    const match = raw.match(/(?:Uncaught Error|ConvexError):\s*(.+?)(?:\n|\s+at\s|$)/)
    return match?.[1] || "We couldn't book that time. Please try again."
}

export function PatientAppointmentBookingModal({
    isOpen,
    onClose,
    preselectedPhysiotherapistId,
    onAppointmentBooked,
}: PatientAppointmentBookingModalProps) {
    const [step, setStep] = useState<Step>('date')
    const [date, setDate] = useState<Date | undefined>(undefined)
    const [slot, setSlot] = useState<Slot | null>(null)
    const [serviceType, setServiceType] = useState<string>('')
    const [appointmentType, setAppointmentType] = useState<AppointmentType>('telehealth')
    const [location, setLocation] = useState<string>('')
    const [notes, setNotes] = useState<string>('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [physiotherapistId, setPhysiotherapistId] = useState<string>('')

    // Typed from the query itself: the generated `api` type degrades to `any` in the full app build
    const careTeam = useQuery(api.patients.getPatientCareTeam, isOpen ? {} : 'skip') as
        | QueryResult<typeof getPatientCareTeam>
        | undefined as CareTeamMember[] | undefined
    const requestAppointment = useMutation(api.appointments.requestAppointment)

    // Rehabify patients book and pay for sessions on the physio's booking page instead
    const billingMode = useQuery(
        api.rehabifyFollowUps.getCareBillingMode,
        isOpen && physiotherapistId ? { physiotherapistId: physiotherapistId as Id<'users'> } : 'skip'
    ) as { mode: 'rehabify' | 'own' } | null | undefined
    const paidOnRehabify = billingMode?.mode === 'rehabify'

    useEffect(() => {
        if (preselectedPhysiotherapistId) {
            setPhysiotherapistId(preselectedPhysiotherapistId)
        } else if (careTeam && careTeam.length > 0 && !physiotherapistId) {
            setPhysiotherapistId(careTeam[0]?.physiotherapist?._id || '')
        }
    }, [preselectedPhysiotherapistId, careTeam, physiotherapistId])

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStep('date')
            setDate(undefined)
            setSlot(null)
            setServiceType('')
            setAppointmentType('telehealth')
            setLocation('')
            setNotes('')
            setIsSubmitting(false)
        }
    }, [isOpen])

    // The physio's real openings (working hours, days off, existing bookings and holds).
    // Days are Lagos days, whatever zone the browser is in.
    const range = useMemo(() => {
        const start = startOfZonedDay(Date.now())
        return { startDate: start, endDate: start + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000 - 1 }
        // Recomputed each time the modal opens so "today" stays current
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])
    useGoogleBusyRefresh(isOpen ? physiotherapistId : null)
    const slots = useQuery(
        api.calendar.availability.getAvailableSlots,
        isOpen && physiotherapistId
            ? { physiotherapistId: physiotherapistId as Id<'users'>, ...range, sessionDuration: SESSION_MINUTES }
            : 'skip'
    ) as Slot[] | undefined

    const upcomingSlots = useMemo(
        () => (slots ?? []).filter((s) => s.start > Date.now()).sort((a, b) => a.start - b.start),
        [slots]
    )
    // A calendar cell is a plain day; slots are matched to it by their Lagos date
    const openDays = useMemo(
        () => new Set(upcomingSlots.map((s) => zonedDateKey(s.start))),
        [upcomingSlots]
    )
    const slotsForDate = useMemo(
        () => (date ? upcomingSlots.filter((s) => zonedDateKey(s.start) === format(date, 'yyyy-MM-dd')) : []),
        [date, upcomingSlots]
    )

    const selectedPhysiotherapist = careTeam?.find(
        (member) => member?.physiotherapist?._id === physiotherapistId
    )
    const physioName = selectedPhysiotherapist
        ? `${selectedPhysiotherapist.physiotherapist.firstName ?? ''} ${selectedPhysiotherapist.physiotherapist.lastName ?? ''}`.trim()
        : ''

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            setDate(selectedDate)
            setSlot(null)
            setStep('time')
        }
    }

    const handleBack = () => {
        if (step === 'time') setStep('date')
        else if (step === 'details') setStep('time')
    }

    const handleSubmit = async () => {
        if (!slot || !serviceType || !physiotherapistId || paidOnRehabify) return
        if (appointmentType === 'in-person' && !location.trim()) {
            toast.error('Please enter the address for your visit')
            return
        }

        setIsSubmitting(true)
        try {
            await requestAppointment({
                physiotherapistId: physiotherapistId as Id<'users'>,
                startTime: slot.start,
                endTime: slot.end,
                serviceType,
                appointmentType,
                location: appointmentType === 'in-person' ? location.trim() : undefined,
                notes: notes.trim() || undefined,
            })
            playSound('booked')
            setStep('success')
            onAppointmentBooked?.()
        } catch (error) {
            console.error('Error booking appointment:', error)
            toast.error(errorMessage(error))
            setIsSubmitting(false)
        }
    }

    const noCareTeam = careTeam !== undefined && careTeam.length === 0 && !preselectedPhysiotherapistId
    const title = step === 'date' ? 'Choose a day' : step === 'time' ? 'Choose a time' : 'Confirm your visit'

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose() }}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl border-0 bg-white p-0 sm:max-w-[460px]">
                {step !== 'success' && (
                    <div className="px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
                        <div className="flex items-center gap-2">
                            {step !== 'date' && (
                                <Button variant="ghost" size="icon" onClick={handleBack} className="h-9 w-9 rounded-full" aria-label="Back">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            )}
                            <DialogTitle className="text-lg font-semibold text-rh-night">{title}</DialogTitle>
                        </div>
                        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-rh-mist">
                            <div
                                className="h-full rounded-full bg-rh-teal transition-all duration-300 ease-in-out"
                                style={{ width: step === 'date' ? '33%' : step === 'time' ? '66%' : '100%' }}
                            />
                        </div>
                    </div>
                )}

                <div className="px-5 pb-6 sm:px-6">
                    {step === 'date' && (
                        noCareTeam ? (
                            <div className="space-y-4 py-6 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rh-mint">
                                    <User className="h-6 w-6 text-rh-teal" />
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold text-rh-night">You&apos;re not linked to a physiotherapist yet</p>
                                    <p className="text-sm text-neutral-600">Find a physio and book your first session from their page.</p>
                                </div>
                                <Button asChild className="rounded-full bg-rh-teal text-white hover:bg-rh-teal-deep">
                                    <Link href="/find-a-physio">Find a physio</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {!preselectedPhysiotherapistId && (careTeam?.length ?? 0) > 1 && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-rh-night">Physiotherapist</label>
                                        <Select
                                            value={physiotherapistId}
                                            onValueChange={(value) => { setPhysiotherapistId(value); setDate(undefined); setSlot(null) }}
                                        >
                                            <SelectTrigger className="rounded-xl">
                                                <SelectValue placeholder="Select physiotherapist" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {careTeam?.map((member) => member && (
                                                    <SelectItem key={member.physiotherapist._id} value={member.physiotherapist._id}>
                                                        {member.physiotherapist.firstName} {member.physiotherapist.lastName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                {paidOnRehabify ? (
                                    <div className="space-y-3 rounded-2xl bg-rh-mint/60 p-5 text-sm text-rh-night">
                                        <p className="font-semibold">
                                            Sessions with {physioName || 'your physiotherapist'} are booked and paid on Rehabify
                                        </p>
                                        <p className="text-neutral-600">
                                            Choose a service and a time on their booking page. The price you see is the price you pay, and your booking is confirmed once paid.
                                        </p>
                                        <Button asChild className="w-full rounded-full bg-rh-teal text-white hover:bg-rh-teal-deep">
                                            <Link href={`/book/${physiotherapistId}`} onClick={onClose}>Go to the booking page</Link>
                                        </Button>
                                    </div>
                                ) : (
                                <>
                                {physioName && (
                                    <p className="text-sm text-neutral-600">
                                        Days with openings for <span className="font-medium text-rh-night">{physioName}</span> are shown below.
                                    </p>
                                )}
                                {slots === undefined && physiotherapistId ? (
                                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
                                    </div>
                                ) : upcomingSlots.length === 0 && physiotherapistId ? (
                                    <div className="rounded-2xl bg-rh-canvas p-5 text-center text-sm text-neutral-600">
                                        No openings in the next {BOOKING_WINDOW_DAYS} days. Send your physio a message to arrange a time.
                                    </div>
                                ) : (
                                    <div className="flex justify-center">
                                        <Calendar
                                            mode="single"
                                            selected={date}
                                            onSelect={handleDateSelect}
                                            {...({
                                                disabled: (day: Date) =>
                                                    isBefore(day, startOfToday()) || !openDays.has(format(day, 'yyyy-MM-dd')),
                                            } as any)}
                                            initialFocus
                                        />
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                        )
                    )}

                    {step === 'time' && (
                        <div className="space-y-4">
                            <div className="text-center">
                                <h3 className="text-base font-semibold text-rh-night">{date ? format(date, 'EEEE, MMMM d') : ''}</h3>
                                <p className="text-sm text-neutral-500">{SESSION_MINUTES}-minute session · times in your time zone</p>
                            </div>
                            {slotsForDate.length === 0 ? (
                                <div className="rounded-2xl bg-rh-canvas p-5 text-center text-sm text-neutral-600">
                                    That day has just filled up. Please pick another day.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {slotsForDate.map((s) => (
                                        <Button
                                            key={s.start}
                                            variant="outline"
                                            className="h-11 rounded-xl border-rh-teal/20 text-rh-night hover:border-rh-teal hover:bg-rh-teal hover:text-white"
                                            onClick={() => { setSlot(s); setStep('details') }}
                                        >
                                            {lagosTime(s.start)}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'details' && slot && (
                        <div className="space-y-5">
                            <div className="space-y-2 rounded-2xl bg-rh-mint/60 p-4 text-sm text-rh-night">
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-rh-teal" />
                                    <span>{physioName || 'Your physiotherapist'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CalendarIcon className="h-4 w-4 text-rh-teal" />
                                    <span>{lagosDate(slot.start)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-rh-teal" />
                                    <span>{lagosTimeRange(slot.start, slot.end)} (Lagos time)</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-rh-night">What is this visit for? *</label>
                                <Select value={serviceType} onValueChange={setServiceType}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue placeholder="Select a service" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SERVICE_TYPES.map((type) => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-rh-night">How would you like to meet? *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {([
                                        { value: 'telehealth', label: 'Video call', Icon: Video },
                                        { value: 'in-person', label: 'In person', Icon: MapPin },
                                    ] as const).map(({ value, label, Icon }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setAppointmentType(value)}
                                            aria-pressed={appointmentType === value}
                                            className={cn(
                                                'flex flex-col items-center gap-2 rounded-2xl border p-3 text-sm font-medium transition-all',
                                                appointmentType === value
                                                    ? 'border-rh-teal bg-rh-teal/5 text-rh-night ring-1 ring-rh-teal'
                                                    : 'border-neutral-200 text-neutral-600 hover:border-rh-teal/50'
                                            )}
                                        >
                                            <Icon className={cn('h-5 w-5', appointmentType === value ? 'text-rh-teal' : 'text-neutral-400')} />
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {appointmentType === 'telehealth' && (
                                    <p className="text-xs text-neutral-500">
                                        Once your physio confirms, the video link appears on your dashboard and in your email.
                                    </p>
                                )}
                            </div>

                            {appointmentType === 'in-person' && (
                                <div className="space-y-2">
                                    <label htmlFor="visit-address" className="text-sm font-medium text-rh-night">Address *</label>
                                    <input
                                        id="visit-address"
                                        type="text"
                                        className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal"
                                        placeholder="House number, street and city"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor="visit-notes" className="text-sm font-medium text-rh-night">Anything your physio should know? (optional)</label>
                                <Textarea
                                    id="visit-notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                                    placeholder="e.g. my knee pain has got worse since last week"
                                    className="min-h-[80px] rounded-xl"
                                />
                            </div>

                            <Button
                                className="h-11 w-full rounded-full bg-rh-teal text-white hover:bg-rh-teal-deep"
                                disabled={!serviceType || isSubmitting || (appointmentType === 'in-person' && !location.trim())}
                                onClick={handleSubmit}
                            >
                                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending request…</> : 'Request appointment'}
                            </Button>
                        </div>
                    )}

                    {step === 'success' && slot && (
                        <div className="space-y-6 py-8 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rh-mint">
                                <Check className="h-8 w-8 text-rh-teal" />
                            </div>
                            <div className="space-y-2">
                                <DialogTitle className="text-2xl font-bold text-rh-night">Request sent</DialogTitle>
                                <p className="text-sm text-neutral-600">
                                    {physioName || 'Your physiotherapist'} will confirm your visit on{' '}
                                    <span className="font-medium text-rh-night">{lagosDateTime(slot.start)}</span>.
                                    We&apos;ll email you when it&apos;s confirmed.
                                </p>
                            </div>
                            <div className="flex flex-col justify-center gap-3 sm:flex-row">
                                <Button variant="outline" className="rounded-full" onClick={onClose}>Close</Button>
                                <Button asChild className="rounded-full bg-rh-teal text-white hover:bg-rh-teal-deep">
                                    <Link href="/dashboard/patient/appointments" onClick={onClose}>View my appointments</Link>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
