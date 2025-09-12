'use client'

import { useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

interface NotificationDoc {
  _id: string
  createdAt: number
  readAt?: number
  payload?: {
    title?: string
    body?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: { actionUrl?: string; [k: string]: any }
    link?: string
  }
}

export default function NotificationToaster() {
  // Poll unread notifications (latest first)
  const notifications = useQuery(api.notifications.getMyNotifications, {
    limit: 1,
    includeRead: false,
  }) as NotificationDoc[] | undefined

  const lastSeenId = useRef<string | null>(null)

  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    const latest = notifications[0]
    if (lastSeenId.current === null) {
      // first mount – just record
      lastSeenId.current = latest._id
      return
    }
    if (latest._id !== lastSeenId.current) {
      lastSeenId.current = latest._id
      toast(latest.payload?.title ?? 'Notification', {
        description: latest.payload?.body,
        duration: 5000,
      })
    }
  }, [notifications])

  return null
}