"use client"

import { useMemo } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import Link from "next/link"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import { Bell, CheckCircle2, Trash2, ArrowUpRight } from "@/components/icons"

interface NotificationDoc {
  _id: Id<"notifications">
  createdAt: number
  readAt?: number
  status?: "pending" | "delivered" | "read" | "failed" | "retrying"
  type?: string
  priority?: "low" | "medium" | "high" | "urgent"
  payload?: {
    title?: string
    body?: string
    data?: {
      actionUrl?: string
      [key: string]: unknown
    }
    link?: string
  }
}

export default function NotificationsPage() {
  const me = useQuery(api.users.getMyUser)
  const notifications = useQuery(api.notifications.getMyNotifications, {
    limit: 100,
    includeRead: true,
  }) as NotificationDoc[] | undefined
  const unreadCount = useQuery(api.notifications.getMyUnreadCount)

  const markAsRead = useMutation(api.notifications.markAsRead)
  const markAllAsRead = useMutation(api.notifications.markAllAsRead)
  const deleteNotification = useMutation(api.notifications.deleteNotification)

  const sorted = useMemo(() => {
    if (!notifications) return [] as NotificationDoc[]
    return [...notifications].sort((a, b) => b.createdAt - a.createdAt)
  }, [notifications])

  const handleMarkAll = async () => {
    if (!me?._id) return
    try {
      await markAllAsRead({ userId: me._id })
      toast.success("All notifications marked as read")
    } catch (e) {
      toast.error("Failed to mark all as read")
      console.error(e)
    }
  }

  const handleMarkRead = async (id: Id<"notifications">) => {
    try {
      await markAsRead({ notificationId: id })
    } catch (e) {
      toast.error("Failed to mark as read")
      console.error(e)
    }
  }

  const handleDelete = async (id: Id<"notifications">) => {
    try {
      await deleteNotification({ notificationId: id })
      toast.success("Notification deleted")
    } catch (e) {
      toast.error("Failed to delete notification")
      console.error(e)
    }
  }

  const openAndMark = async (n: NotificationDoc) => {
    const url = n.payload?.data?.actionUrl || n.payload?.link
    if (url) {
      // mark as read in background; don't block navigation
      markAsRead({ notificationId: n._id }).catch(() => {})
      // Next Link preferred in JSX; here we just open via location for simplicity
      window.location.href = url
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-[#005b57]" />
          <h1 className="text-2xl font-bold">Notifications</h1>
          {typeof unreadCount === "number" && unreadCount > 0 && (
            <Badge className="ml-2 bg-[#00cd0f] text-white border-0">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
          <Button onClick={handleMarkAll} disabled={!me || (unreadCount ?? 0) === 0}>
            Mark all as read
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[70vh]">
            {sorted.length > 0 ? (
              <div className="divide-y">
                {sorted.map((n) => {
                  const isRead = Boolean(n.readAt) || n.status === "read"
                  const url = n.payload?.data?.actionUrl || n.payload?.link
                  return (
                    <div key={n._id} className="flex items-start gap-4 p-4">
                      <div className={`mt-2 h-2 w-2 rounded-full ${isRead ? "bg-gray-300" : "bg-blue-600"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">{n.payload?.title ?? "Notification"}</p>
                          {n.priority && (
                            <Badge variant="outline" className="text-xs">
                              {n.priority}
                            </Badge>
                          )}
                          {n.type && (
                            <Badge variant="secondary" className="text-xs">
                              {n.type}
                            </Badge>
                          )}
                        </div>
                        {n.payload?.body && (
                          <p className="text-sm text-gray-600 mt-1">{n.payload.body}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {format(new Date(n.createdAt), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {url && (
                          <Button variant="ghost" size="sm" onClick={() => openAndMark(n)} className="gap-1">
                            Open <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        )}
                        {!isRead && (
                          <Button variant="ghost" size="sm" onClick={() => handleMarkRead(n._id)} className="gap-1">
                            <CheckCircle2 className="h-4 w-4" /> Mark read
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(n._id)} className="text-red-600 gap-1">
                          <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[40vh] text-center text-gray-500">
                <Bell className="h-12 w-12 mb-4 text-gray-300" />
                <p className="text-sm">You have no notifications yet.</p>
                <p className="text-xs mt-1">New alerts about appointments, billing, and messages will appear here.</p>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
