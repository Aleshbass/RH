'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bell,
  Calendar,
  CreditCard,
  HelpCircle,
  MessageSquare,
  Moon,
  Phone,
  PlayCircle,
  Sun,
  Video,
  Volume2,
  VolumeX,
  WhatsApp,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useClinicTheme } from '@/components/clinic/ClinicTheme'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PatientDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { playSound, setSoundsEnabled, soundsEnabled, SOUND_SETTING_EVENT } from '@/lib/sounds'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { cn } from '@/lib/utils'
import { START_PATIENT_TOUR_EVENT } from '@/components/patient/shell/PatientTour'
import { useCareHome } from '@/components/patient/careHome'

/** Square icon button used in the top bar. */
export const topBarButtonClass =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pt-line bg-pt-surface text-pt-ink transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-95'

/* ---------------------------------------------------------------------------------------------- */
/* Theme                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export function PatientThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { theme, toggleTheme } = useClinicTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Light mode' : 'Dark mode'

  return (
    <button
      type="button"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      }}
      aria-label={`Switch to ${label.toLowerCase()}`}
      title={withLabel ? undefined : label}
      className={cn(withLabel ? 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-pt-ink hover:bg-pt-hover' : topBarButtonClass, className)}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </motion.span>
        </AnimatePresence>
      </span>
      {withLabel && <span className="flex-1 truncate text-left">{label}</span>}
    </button>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Sounds                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/** The browser's sound preference, kept in sync with every other toggle on the page. */
export function useSoundSetting() {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    const sync = () => setEnabled(soundsEnabled())
    sync()
    window.addEventListener(SOUND_SETTING_EVENT, sync)
    return () => window.removeEventListener(SOUND_SETTING_EVENT, sync)
  }, [])
  const update = useCallback((next: boolean) => {
    setSoundsEnabled(next)
    if (next) playSound('success')
  }, [])
  return [enabled, update] as const
}

/** A row with a switch, for menus and settings. */
export function SoundSwitchRow({ className }: { className?: string }) {
  const [enabled, setEnabled] = useSoundSetting()
  const Icon = enabled ? Volume2 : VolumeX
  return (
    <label className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-pt-ink hover:bg-pt-hover', className)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">Sounds</span>
      <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Play sounds" className="data-[state=checked]:bg-pt-accent" />
    </label>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Notifications                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

type NotificationDoc = {
  _id: Id<'notifications'>
  type?: string
  createdAt: number
  readAt?: number
  status?: string
  payload?: {
    title?: string
    body?: string
    data?: { actionUrl?: string }
    link?: string
  }
}

function linkFor(notification: NotificationDoc, mapLink?: (url: string) => string) {
  const url = notification.payload?.data?.actionUrl || notification.payload?.link
  // Only follow links inside the app
  if (!url || !url.startsWith('/')) return null
  return mapLink ? mapLink(url) : url
}

function iconFor(type?: string) {
  const kind = type ?? ''
  if (kind.includes('payment') || kind.includes('invoice')) return CreditCard
  if (kind.includes('message') || kind.includes('chat')) return MessageSquare
  if (kind.includes('video') || kind.includes('call')) return Video
  if (kind.includes('appointment') || kind.includes('booking')) return Calendar
  return Bell
}

/** A gentle sound that says what kind of news it is: money in, a booking, a message. */
function soundFor(type?: string) {
  const kind = type ?? ''
  if (kind.includes('declined') || kind.includes('cancel')) playSound('reject')
  else if (kind.includes('payment') || kind.includes('paid')) playSound('paid')
  else if (kind.includes('appointment') || kind.includes('booking')) playSound('booked')
  else playSound('receive')
}

/**
 * Bell with the unread count. Opens a drawer with recent notifications, and toasts (with a
 * little sound) anything that arrives while the page is open. `mapLink` points links written for
 * another portal at this one (the clinic portal opens physio links on its own pages).
 */
export function PatientNotifications({ className, mapLink }: { className?: string; mapLink?: (url: string) => string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const notifications = useQuery(api.notifications.getMyNotifications, { limit: 20, includeRead: true }) as
    | NotificationDoc[]
    | undefined
  const unreadCount = useQuery(api.notifications.getMyUnreadCount, {}) as number | undefined
  const markAsRead = useMutation(api.notifications.markAsRead)
  const markAllMyAsRead = useMutation(api.notifications.markAllMyAsRead)

  const lastSeenId = useRef<string | null>(null)
  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    const latest = notifications[0]
    if (lastSeenId.current === null) {
      lastSeenId.current = latest._id
      return
    }
    if (latest._id === lastSeenId.current) return
    lastSeenId.current = latest._id
    if (latest.readAt || latest.status === 'read') return
    soundFor(latest.type)
    const href = linkFor(latest, mapLink)
    toast(latest.payload?.title ?? 'New notification', {
      description: latest.payload?.body,
      action: href ? { label: 'Open', onClick: () => router.push(href) } : undefined,
    })
  }, [notifications, router, mapLink])

  const openNotification = (notification: NotificationDoc) => {
    if (!notification.readAt && notification.status !== 'read') {
      markAsRead({ notificationId: notification._id }).catch(() => {
        // Stays unread; not worth interrupting
      })
    }
    const href = linkFor(notification, mapLink)
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  const unread = unreadCount ?? 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className={cn(topBarButtonClass, className)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-pt-accent px-1 text-center text-[10px] font-bold leading-[18px] text-[#06210a] ring-2 ring-pt-canvas">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <PatientDrawer
        open={open}
        onOpenChange={setOpen}
        title="Notifications"
        description={unread > 0 ? `${unread} new` : 'You’re all caught up'}
        footer={
          unread > 0 ? (
            <Button
              className={cn(secondaryButtonClass, 'w-full')}
              onClick={() => markAllMyAsRead({}).catch(() => toast.error('Could not mark notifications as read'))}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      >
        {notifications === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-pt-sunken" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken text-pt-muted">
              <Bell className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-pt-ink">Nothing new</p>
            <p className="mt-1 text-sm text-pt-muted">Booking updates, messages and payments show up here.</p>
          </div>
        ) : (
          <ul className="-mx-2 space-y-1">
            {notifications.map((notification) => {
              const isUnread = !notification.readAt && notification.status !== 'read'
              const Icon = iconFor(notification.type)
              return (
                <li key={notification._id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className="flex w-full gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-pt-hover"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        isUnread ? 'bg-pt-accent-soft text-pt-accent-ink' : 'bg-pt-sunken text-pt-muted'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm text-pt-ink', isUnread && 'font-semibold')}>
                        {notification.payload?.title ?? 'Notification'}
                      </span>
                      {notification.payload?.body && (
                        <span className="mt-0.5 line-clamp-2 block text-sm text-pt-muted">{notification.payload.body}</span>
                      )}
                      <span className="mt-1 block text-xs text-pt-faint">
                        {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                      </span>
                    </span>
                    {isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-pt-accent" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PatientDrawer>
    </>
  )
}

/* ---------------------------------------------------------------------------------------------- */
/* Help                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

/** Quick answers. A clinic's patients get their clinic's (`clinicName`): no Rehabify booking or payment rules. */
function helpTopics(clinicName: string | null): { q: string; a: string }[] {
  return [
  clinicName
    ? {
        q: 'How do I book a session?',
        a: `Go to Appointments and tap “Book a session”. Pick a time with your physiotherapist, or ask ${clinicName} for another time, clinician or service.`,
      }
    : {
        q: 'How do I book a session?',
        a: 'Go to Appointments and tap “Book a session” and pick a time that suits you. Your physio confirms it; Rehabify Care visits are confirmed once they’re paid.',
      },
  {
    q: 'How do I join a video call?',
    a: 'When your physio has confirmed an online visit, a “Join call” button appears on Home and in Appointments. Use a phone or laptop with a camera and a quiet spot.',
  },
  {
    q: 'Can I change or cancel a visit?',
    a: 'Yes. Open the visit in Appointments and choose Reschedule or Cancel.',
  },
  {
    q: 'Who can see my records?',
    a: 'You and your physio. New uploads are shared with your physio so they can use them in your care. Make any file private in Records at any time.',
  },
  {
    q: 'What is the daily check-in for?',
    a: 'It tells your physio how your pain and day-to-day activity are going between visits, so they can adjust your plan early.',
  },
  ]
}

/** “?” in the top bar: quick answers, the tour, and a direct line to Joy on WhatsApp. */
export function PatientHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  // A clinic's patients ask their clinic, not Joy
  const { clinic } = useCareHome()
  const topics = helpTopics(clinic?.name ?? null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Help" title="Help" className={cn(topBarButtonClass, className)}>
        <HelpCircle className="h-4 w-4" />
      </button>
      <PatientDrawer
        open={open}
        onOpenChange={setOpen}
        title="Help"
        description="Quick answers to common questions"
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className={cn(secondaryButtonClass, 'w-full')}
              onClick={() => {
                setOpen(false)
                window.dispatchEvent(new Event(START_PATIENT_TOUR_EVENT))
              }}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Take the tour
            </Button>
            {clinic ? (
              <Button asChild className={cn(primaryButtonClass, 'w-full')}>
                <a href={clinic.phone ? `tel:${clinic.phone.replace(/\s+/g, '')}` : '/dashboard/patient/messages'}>
                  <Phone className="mr-2 h-4 w-4" />
                  <span className="truncate">{clinic.phone ? `Call ${clinic.name}` : `Message ${clinic.name}`}</span>
                </a>
              </Button>
            ) : (
              <Button asChild className={cn(primaryButtonClass, 'w-full')}>
                <a href={joyWhatsAppUrl('Hi Joy, I need help with my Rehabify dashboard.')} target="_blank" rel="noopener noreferrer">
                  <WhatsApp className="mr-2 h-4 w-4" />
                  Ask Joy on WhatsApp
                </a>
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-2">
          {topics.map((topic) => (
            <details key={topic.q} className="group rounded-2xl bg-pt-sunken px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-pt-ink">
                {topic.q}
                <span className="text-lg leading-none text-pt-faint transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-pt-muted">{topic.a}</p>
            </details>
          ))}
        </div>
      </PatientDrawer>
    </>
  )
}
