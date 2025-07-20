'use client'

import { useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

interface Notification {
  _id: string
  title: string
  message: string
  createdAt: number
}

export default function NotificationToaster() {
  // Poll unread notifications (latest first)
  const notifications = useQuery(api.notifications.getMyNotifications, {
    limit: 1,
    includeRead: false,
  }) as Notification[] | undefined

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
      toast(latest.title, {
        description: latest.message,
        duration: 5000,
      })
    }
  }, [notifications])

  return null
} 