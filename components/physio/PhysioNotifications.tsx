'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { Bell } from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

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

/** Physio-portal links opened from the clinic portal go to the same thing there */
export function toClinicPortal(url: string) {
  const patient = url.match(/^\/dashboard\/physiotherapist\/patients\/([^/?#]+)/)
  if (patient) return `/dashboard/clinic/patients/${patient[1]}`
  if (url.startsWith('/dashboard/physiotherapist/billing')) return '/dashboard/clinic/billing'
  if (url.startsWith('/dashboard/physiotherapist/appointments') || url.startsWith('/dashboard/physiotherapist/calendar')) {
    return '/dashboard/clinic/appointments'
  }
  if (url.startsWith('/dashboard/physiotherapist')) return '/dashboard/clinic'
  return url
}

function linkFor(notification: NotificationDoc, portal: 'physio' | 'clinic' = 'physio') {
  const url = notification.payload?.data?.actionUrl || notification.payload?.link
  // Only follow in-app links; anything else stays in the list
  if (!url || !url.startsWith('/')) return null
  return portal === 'clinic' ? toClinicPortal(url) : url
}

/**
 * Bell with unread count and the latest notifications. Also toasts a notification that
 * arrives while the page is open.
 */
export function PhysioNotifications({ className, portal = 'physio' }: { className?: string; portal?: 'physio' | 'clinic' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const notifications = useQuery(api.notifications.getMyNotifications, { limit: 8, includeRead: true }) as
    | NotificationDoc[]
    | undefined
  const unreadCount = useQuery(api.notifications.getMyUnreadCount, {}) as number | undefined
  const markAsRead = useMutation(api.notifications.markAsRead)
  const markAllMyAsRead = useMutation(api.notifications.markAllMyAsRead)

  // Toast only for notifications that arrive after the page loaded
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
    // A little chime for the good news: money in, new bookings
    const kind = latest.type ?? ''
    if (kind === 'payment_received' || kind === 'payment_confirmed') playSound('paid')
    else if (kind === 'appointment_scheduled' || kind === 'appointment_confirmed' || kind === 'appointment') playSound('booked')
    else if (kind === 'patient_check_in') playSound('receive')
    const href = linkFor(latest, portal)
    toast(latest.payload?.title ?? 'New notification', {
      description: latest.payload?.body,
      action: href ? { label: 'Open', onClick: () => router.push(href) } : undefined,
    })
  }, [notifications, router, portal])

  const openNotification = async (notification: NotificationDoc) => {
    if (!notification.readAt && notification.status !== 'read') {
      markAsRead({ notificationId: notification._id }).catch(() => {
        // Stays unread; not worth interrupting the user
      })
    }
    const href = linkFor(notification, portal)
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  const unread = unreadCount ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-rh-ink shadow-soft transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime/40 active:scale-95 dark:bg-rh-ink-2 dark:text-neutral-200',
            className
          )}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rh-amber px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-rh-canvas dark:ring-rh-ink">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border-black/[0.05] p-0 shadow-lift dark:border-white/[0.07] dark:bg-rh-ink-2"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-white/[0.07]">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllMyAsRead({}).catch(() => toast.error('Could not mark notifications as read'))}
              className="text-xs font-medium text-rh-ink hover:underline dark:text-rh-lime"
            >
              Mark all as read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {notifications === undefined ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {notifications.map((notification) => {
                const isUnread = !notification.readAt && notification.status !== 'read'
                return (
                  <li key={notification._id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          isUnread ? 'bg-rh-lime dark:bg-rh-lime' : 'bg-transparent'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-sm text-neutral-900 dark:text-white',
                            isUnread && 'font-medium'
                          )}
                        >
                          {notification.payload?.title ?? 'Notification'}
                        </span>
                        {notification.payload?.body && (
                          <span className="mt-0.5 line-clamp-2 block text-sm text-neutral-500 dark:text-neutral-400">
                            {notification.payload.body}
                          </span>
                        )}
                        <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
                          {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
