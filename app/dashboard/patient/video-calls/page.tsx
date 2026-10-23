'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Camera, CalendarPlus, ChevronRight, Headphones, History, Video, Wifi } from '@/components/icons'
import StreamVideoCallManager from '@/components/video/StreamVideoCallManager'
import { formatLagos, lagosTime, lagosTimeRange } from '@/convex/helpers/lagosTime'
import { isVideoVisit, meetingLinkOf } from '@/components/appointments/appointment-ui'
import { cn } from '@/lib/utils'
import {
  EmptyState,
  IconChip,
  InfoTip,
  PageContainer,
  PageHeader,
  PageSkeleton,
  Panel,
  StatusBadge,
  accentButtonClass,
  initials,
  listRowClass,
  primaryButtonClass,
  secondaryButtonClass,
  type Tone,
} from '@/components/patient/ui'
import { PatientAppointmentBookingModal } from '@/components/patient/PatientAppointmentBookingModal'
import {
  canJoinVisit,
  durationMinutes,
  isJoinTime,
  isLiveAppointment,
  patientStatus,
  useJoinVisit,
  type PatientAppointment,
} from '@/components/patient/AppointmentDetailsModal'

const APPOINTMENTS_HREF = '/dashboard/patient/appointments'

// Type definition for video calls
type VideoCall = {
  _id: Id<'videoCalls'>
  roomId: string
  title?: string
  patientId?: Id<'users'>
  physiotherapistId?: Id<'users'>
  scheduledAt?: number
  startTime: number
  endTime?: number
  status: 'scheduled' | 'active' | 'ended' | 'cancelled' | 'missed'
  callType: 'appointment' | 'consultation' | 'emergency'
  duration?: number
  participants: Id<'users'>[]
  physiotherapist?: { firstName?: string; lastName?: string; imageUrl?: string }
  appointmentId?: Id<'appointments'>
  platform?: string
  meetingLink?: string
}

const PAST_CALL_STATUS: Record<string, { label: string; tone: Tone }> = {
  ended: { label: 'Ended', tone: 'neutral' },
  missed: { label: 'Missed', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'rose' },
}

const CHECKLIST: { icon: typeof Camera; tone: Tone; title: string; tip: string }[] = [
  {
    icon: Camera,
    tone: 'violet',
    title: 'Allow your camera and microphone',
    tip: 'When your browser asks, tap Allow. If you said no by mistake, tap the lock icon next to the web address to change it.',
  },
  {
    icon: Headphones,
    tone: 'sun',
    title: 'Find a quiet, private spot',
    tip: 'Earphones help you hear clearly. Wear comfortable clothes and leave room to move, as your physio may ask you to show a movement.',
  },
  {
    icon: Wifi,
    tone: 'green',
    title: 'Use a steady connection',
    tip: 'Wi-Fi is best. If the picture freezes, pause other downloads or move closer to your router.',
  },
]

function physioNameOf(call: VideoCall) {
  return [call.physiotherapist?.firstName, call.physiotherapist?.lastName].filter(Boolean).join(' ')
}

// Within the pre-join window (default: 10 minutes before start)
function isWithinJoinWindow(scheduledAt?: number, minutes = 10) {
  if (!scheduledAt) return false
  return Date.now() >= scheduledAt - minutes * 60 * 1000
}

export default function PatientVideoCallsPage() {
  const [showVideoManager, setShowVideoManager] = useState(false)
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [selectedCall, setSelectedCall] = useState<VideoCall | null>(null)
  const joinVisit = useJoinVisit()

  const currentUser = useQuery(api.users.getMyUser)
  const allVideoCalls = useQuery(api.videoCalls.getMyVideoCalls, {}) as VideoCall[] | undefined
  const appointments = useQuery(api.appointments.getPatientAppointments, { limit: 100 }) as PatientAppointment[] | undefined

  // Join buttons appear on the clock, not only when data changes
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const { liveCalls, onlineVisits, otherScheduled, pastCalls } = useMemo(() => {
    const calls = allVideoCalls ?? []
    const visits = (appointments ?? [])
      .filter((a) => isVideoVisit(a) && isLiveAppointment(a, now))
      .sort((a, b) => a.startTime - b.startTime)
    const visitIds = new Set(visits.map((v) => v._id))
    return {
      liveCalls: calls.filter((call) => call.status === 'active'),
      onlineVisits: visits,
      // Calls not tied to a visit already listed (e.g. a consultation the physio started)
      otherScheduled: calls.filter((call) => call.status === 'scheduled' && !(call.appointmentId && visitIds.has(call.appointmentId))),
      pastCalls: calls
        .filter((call) => ['ended', 'cancelled', 'missed'].includes(call.status))
        .sort((a, b) => (b.scheduledAt ?? b.startTime) - (a.scheduledAt ?? a.startTime))
        .slice(0, 10),
    }
  }, [allVideoCalls, appointments, now])

  if (!currentUser || allVideoCalls === undefined || appointments === undefined) return <PageSkeleton />

  const handleJoinCall = (call: VideoCall) => {
    // Google Meet opens in a new tab; Rehabify calls open here
    const isGoogleMeet = call.platform === 'google_meet' || (call.meetingLink && call.meetingLink.includes('meet.google.com'))
    if (isGoogleMeet && call.meetingLink) {
      window.open(call.meetingLink, '_blank')
      toast.success('Opening Google Meet in a new tab')
    } else {
      setSelectedCall(call)
      setShowVideoManager(true)
    }
  }

  if (showVideoManager && selectedCall) {
    return (
      <StreamVideoCallManager
        appointmentId={selectedCall.appointmentId}
        defaultParticipants={selectedCall.participants}
        onCallEnd={() => {
          setShowVideoManager(false)
          setSelectedCall(null)
        }}
      />
    )
  }

  const next = onlineVisits[0]
  const laterVisits = onlineVisits.slice(1)
  const nothingUpcoming = liveCalls.length === 0 && onlineVisits.length === 0 && otherScheduled.length === 0

  return (
    <PageContainer>
      <PageHeader
        title="Video calls"
        description="Join your online sessions with your physio."
        info="Video visits open in your browser on a phone or laptop. The Join button appears once your physio has confirmed the visit and its link is ready."
        actions={
          <Button className={cn(primaryButtonClass, 'h-11 px-5')} onClick={() => setIsBookingModalOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Book a session
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Calls happening right now */}
          {liveCalls.map((call) => {
            const name = physioNameOf(call)
            return (
              <section key={call._id} className="rounded-3xl bg-pt-primary p-5 text-pt-on-primary sm:p-6">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-pt-accent" aria-hidden />
                  Live now
                </p>
                <p className="mt-3 text-xl font-semibold tracking-tight">{call.title || 'Video session'}</p>
                {name && <p className="mt-0.5 text-sm opacity-75">With {name}</p>}
                <Button className={cn(accentButtonClass, 'mt-5 h-12 w-full text-[15px] sm:w-auto sm:px-8')} onClick={() => handleJoinCall(call)}>
                  <Video className="mr-2 h-4 w-4" />
                  Join now
                </Button>
              </section>
            )
          })}

          {/* The next online visit, front and centre */}
          {next ? (
            <NextVisitCard apt={next} now={now} onJoin={() => joinVisit(meetingLinkOf(next))} />
          ) : (
            liveCalls.length === 0 && (
              <Panel>
                <EmptyState
                  icon={Video}
                  title="No video visits booked"
                  description="Book a session and choose “Video call” to see your physio from home."
                  action={
                    <Button className={cn(primaryButtonClass, 'h-10 px-4')} onClick={() => setIsBookingModalOpen(true)}>
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      Book a video visit
                    </Button>
                  }
                />
              </Panel>
            )
          )}

          {(laterVisits.length > 0 || otherScheduled.length > 0) && (
            <Panel title="Coming up" description="Your other online sessions" bodyClassName="p-2 sm:p-3">
              <div className="space-y-0.5">
                {laterVisits.map((apt) => {
                  const joinable = canJoinVisit(apt, now) && isJoinTime(apt, now)
                  const status = patientStatus(apt, now)
                  return (
                    <div key={apt._id} className={cn(listRowClass, 'items-start sm:items-center')}>
                      <div className="w-[72px] shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-pt-ink">{lagosTime(apt.startTime)}</p>
                        <p className="text-xs text-pt-faint">{formatLagos(apt.startTime, { weekday: 'short', day: 'numeric', month: 'short' }, 'en-NG')}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-pt-ink">{apt.serviceType || 'Video visit'}</p>
                        <p className="truncate text-xs text-pt-muted">{apt.physiotherapistName || 'Your physiotherapist'}</p>
                        <span className="mt-1.5 flex items-center gap-1">
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          <InfoTip label="What does this status mean?">{status.explain}</InfoTip>
                        </span>
                      </div>
                      {joinable ? (
                        <Button size="sm" className={cn(accentButtonClass, 'h-9 shrink-0 px-3')} onClick={() => joinVisit(meetingLinkOf(apt))}>
                          <Video className="mr-1.5 h-3.5 w-3.5" />
                          Join
                        </Button>
                      ) : (
                        <Link
                          href={APPOINTMENTS_HREF}
                          className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                        >
                          Manage
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  )
                })}
                {otherScheduled.map((call) => {
                  const ready = isWithinJoinWindow(call.scheduledAt, 15)
                  const name = physioNameOf(call)
                  return (
                    <div key={call._id} className={cn(listRowClass, 'items-start sm:items-center')}>
                      <div className="w-[72px] shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-pt-ink">{call.scheduledAt ? lagosTime(call.scheduledAt) : 'To be set'}</p>
                        {call.scheduledAt && (
                          <p className="text-xs text-pt-faint">{formatLagos(call.scheduledAt, { weekday: 'short', day: 'numeric', month: 'short' }, 'en-NG')}</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-pt-ink">{call.title || 'Video session'}</p>
                        {name && <p className="truncate text-xs text-pt-muted">{name}</p>}
                      </div>
                      <Button
                        size="sm"
                        className={cn(ready ? accentButtonClass : secondaryButtonClass, 'h-9 shrink-0 px-3')}
                        disabled={!ready}
                        onClick={() => handleJoinCall(call)}
                      >
                        <Video className="mr-1.5 h-3.5 w-3.5" />
                        {ready ? 'Join' : 'Not started'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </Panel>
          )}

          <Panel
            title="Past calls"
            info="Calls that have ended, were missed or were cancelled. Any notes from your physio are on the visit in Appointments."
            bodyClassName="p-2 sm:p-3"
          >
            {pastCalls.length === 0 ? (
              <EmptyState icon={History} title="No past calls yet" description="Your finished video sessions will show here." className="py-8" />
            ) : (
              <div className="space-y-0.5">
                {pastCalls.map((call) => {
                  const status = PAST_CALL_STATUS[call.status] ?? { label: call.status, tone: 'neutral' as Tone }
                  const when = call.scheduledAt ?? call.startTime
                  const name = physioNameOf(call)
                  return (
                    <div key={call._id} className={cn(listRowClass, 'hover:bg-transparent')}>
                      <Avatar className="h-9 w-9 rounded-xl">
                        <AvatarFallback className="rounded-xl bg-pt-sunken text-xs font-semibold text-pt-muted">
                          {name ? initials(name) : <Video className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-pt-ink">{call.title || 'Video session'}</p>
                        <p className="truncate text-xs text-pt-muted">
                          {formatLagos(when, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, 'en-NG')}
                          {name ? ` · ${name}` : ''}
                        </p>
                      </div>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel
            title="Before your call"
            info="A minute of setup means more time with your physio. Tap the i next to each step for tips."
          >
            <ul className="space-y-3">
              {CHECKLIST.map((item) => (
                <li key={item.title} className="flex items-center gap-3">
                  <IconChip icon={item.icon} tone={item.tone} size="sm" />
                  <span className="min-w-0 flex-1 text-sm text-pt-ink">{item.title}</span>
                  <InfoTip label={`Tips: ${item.title}`}>{item.tip}</InfoTip>
                </li>
              ))}
            </ul>
            {nothingUpcoming && (
              <p className="mt-4 rounded-2xl bg-pt-sunken p-3 text-xs text-pt-muted">
                Your physio may also start a quick call with you. When they do, it shows at the top of this page.
              </p>
            )}
          </Panel>
        </aside>
      </div>

      <PatientAppointmentBookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
      />
    </PageContainer>
  )
}

/** The next online visit: when, who, and a big Join button once it can be joined. */
function NextVisitCard({ apt, now, onJoin }: { apt: PatientAppointment; now: number; onJoin: () => void }) {
  const status = patientStatus(apt, now)
  const joinable = canJoinVisit(apt, now)
  const joinTime = isJoinTime(apt, now)
  const startsIn = Math.round((apt.startTime - now) / 60000)

  let hint: string
  if (joinable && joinTime) hint = startsIn > 0 ? `Starts in ${startsIn} min. You can join now and wait for your physio.` : 'Your session is on now.'
  else if (joinable) hint = 'Your link is ready. You can join from 15 minutes before the start.'
  else if (apt.status === 'confirmed') hint = 'Your video link will appear here before the session.'
  else hint = 'The video link arrives once your physio confirms this visit.'

  return (
    <section className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Next video visit</p>
        <span className="flex items-center gap-1">
          <StatusBadge tone={status.tone} dot>
            {status.label}
          </StatusBadge>
          <InfoTip label="What does this status mean?">{status.explain}</InfoTip>
        </span>
      </div>
      <div className="mt-4 flex items-start gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-2xl bg-pt-sunken py-2.5">
          <span className="text-[11px] font-semibold uppercase text-pt-muted">{formatLagos(apt.startTime, { month: 'short' }, 'en-NG')}</span>
          <span className="text-2xl font-semibold leading-tight tabular-nums text-pt-ink">
            {formatLagos(apt.startTime, { day: 'numeric' }, 'en-NG')}
          </span>
          <span className="text-[11px] text-pt-muted">{formatLagos(apt.startTime, { weekday: 'short' }, 'en-NG')}</span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight text-pt-ink">{apt.serviceType || 'Video visit'}</p>
          <p className="text-sm text-pt-muted">
            {lagosTimeRange(apt.startTime, apt.endTime)} · {durationMinutes(apt)} min
          </p>
          <p className="mt-0.5 text-sm text-pt-muted">With {apt.physiotherapistName || 'your physiotherapist'}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        {joinable ? (
          <Button className={cn(accentButtonClass, 'h-12 px-8 text-[15px]')} onClick={onJoin}>
            <Video className="mr-2 h-4 w-4" />
            Join video call
          </Button>
        ) : (
          <Button asChild className={cn(secondaryButtonClass, 'h-11 px-5')}>
            <Link href={APPOINTMENTS_HREF}>See visit details</Link>
          </Button>
        )}
        <p className="text-sm text-pt-muted sm:ml-2">{hint}</p>
      </div>
    </section>
  )
}
