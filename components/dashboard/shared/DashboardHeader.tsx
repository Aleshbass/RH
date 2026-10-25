'use client'

import { useState, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Bell,
  Search,
  Plus,
  Calendar,
  Users,
  FileText,
  Settings,
  X,
  Building2,
} from '@/components/icons'
import { Menu } from '@/components/icons'
import { format } from 'date-fns'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useSidebarStore } from '@/stores/sidebarStore'
import { WebsiteLink } from '@/components/dashboard/shared/WebsiteLink'

interface NotificationDoc {
  _id: string
  createdAt: number
  readAt?: number
  status?: 'pending' | 'delivered' | 'read' | 'failed' | 'retrying'
  payload?: {
    title?: string
    body?: string
    data?: {
      actionUrl?: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any
    }
    link?: string
  }
}

export function DashboardHeader() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [lastNotifId, setLastNotifId] = useState<string | null>(null)
  const { toggleMobile } = useSidebarStore()

  // Untyped hooks: the generated `api` type is at TypeScript's depth limit (TS2589) here
  const user = useQueryUntyped(api.users.getMyUser) as { role?: string } | null | undefined
  const clinicInfo = useQueryUntyped(api.clinics.getMyClinicInfo) as { name: string } | null | undefined

  // Recent notifications & count
  const notifications = useQueryUntyped(api.notifications.getMyNotifications, { limit: 5, includeRead: true }) as
    | NotificationDoc[]
    | undefined
  const unreadCount = useQueryUntyped(api.notifications.getMyUnreadCount, {}) as number | undefined
  const markAsRead = useMutationUntyped(api.notifications.markAsRead)
  const markAllMyAsRead = useMutationUntyped(api.notifications.markAllMyAsRead)

  const quickActions = [
    {
      title: 'Schedule Appointment',
      icon: Calendar,
      href: '/dashboard/physiotherapist/calendar?new=1',
      roles: ['physiotherapist', 'clinic_owner'],
    },
    {
      title: 'Add Patient',
      icon: Users,
      href: '/dashboard/patients/new',
      roles: ['physiotherapist', 'clinic_owner'],
    },
    {
      title: 'New Session Log',
      icon: FileText,
      href: '/dashboard/sessions/new',
      roles: ['physiotherapist', 'clinic_owner'],
    },
  ]

  // Filter actions by the current user's role — patients must not see provider-only actions
  const filteredQuickActions = user
    ? quickActions.filter((a) => a.roles.includes(user.role ?? ''))
    : []

  // Toast on new notification
  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const latest = notifications[0] as unknown as NotificationDoc
      const isRead = Boolean(latest.readAt) || latest.status === 'read'
      if (!isRead && latest._id !== lastNotifId) {
        toast(latest.payload?.title ?? 'Notification', {
          description: latest.payload?.body,
          action: {
            label: 'Open',
            onClick: () => {
              let url = latest.payload?.data?.actionUrl || latest.payload?.link

              // Fix old clinic-owner routes to new clinic routes
              if (url && url.includes('/dashboard/clinic-owner')) {
                url = url.replace('/dashboard/clinic-owner', '/dashboard/clinic/staff')
              }
              // Fallback for legacy notifications without URLs
              if (!url) {
                url = '/dashboard/clinic/staff'
              }

              if (url) {
                router.push(url)
              } else {
                console.error('[TOAST CLICK] No URL to navigate to!')
              }
              setShowNotifications(true)
            },
          },
        })
        setLastNotifId(latest._id)
      }
    }
  }, [notifications, lastNotifId, router])

  return (
    <header className="bg-rh-ink border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center justify-between">
        {/* Left Side - Logo & Search */}
        <div className="flex items-center gap-3 sm:gap-4 flex-1">
          {/* Mobile hamburger */}
          <Button
            id="mobile-menu-trigger"
            variant="ghost"
            size="icon"
            onClick={toggleMobile}
            className="text-white hover:bg-white/10 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-rh-lime rounded-lg flex items-center justify-center"> {/* 10% - Highlighter accent */}
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="text-xl font-bold text-white hidden sm:inline">Rehabify</span>
          </Link>

          {/* Clinic Badge for Clinic Physiotherapists */}
          {user?.role === 'physiotherapist' && clinicInfo && (
            <Badge
              variant="secondary"
              className="hidden lg:flex items-center gap-1.5 bg-white/10 text-white border-white/20 hover:bg-white/20 px-3 py-1.5"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span className="font-medium">{clinicInfo.name}</span>
            </Badge>
          )}

          {/* Search Bar */}
          <div className="relative max-w-md flex-1 hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search patients, appointments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/70 focus:bg-white/20"
            />
          </div>
        </div>

        {/* Right Side - Actions & User */}
        <div className="flex items-center gap-4">
          {/* Quick Actions */}
          {filteredQuickActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 border-white/30 text-white bg-transparent hover:bg-white/10 hover:text-white">
                  <Plus className="h-4 w-4" />
                  <span className="hidden md:inline">Quick Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {filteredQuickActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <DropdownMenuItem key={action.href} asChild>
                      <Link href={action.href} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {action.title}
                      </Link>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <WebsiteLink tone="dark" />

          {/* Notifications */}
          <Popover open={showNotifications} onOpenChange={setShowNotifications}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative p-2 text-white hover:bg-white/10"
              >
                <Bell className="h-5 w-5" />
                {unreadCount && unreadCount > 0 && (
                  <Badge
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-rh-lime text-rh-ink border-0"> {/* 10% - Highlighter accent */}
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold">Notifications</h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      try {
                        await markAllMyAsRead({})
                      } catch { }
                    }}
                  >
                    Mark all read
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNotifications(false)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-80">
                {notifications && notifications.length > 0 ? (
                  <div className="divide-y">
                    {(notifications as unknown as NotificationDoc[]).map((notification) => (
                      <div
                        key={notification._id}
                        className="p-4 hover:bg-gray-50 cursor-pointer"
                        onClick={async () => {
                          try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await markAsRead({ notificationId: notification._id as any })
                          } catch (e) {
                            console.error('Failed to mark notification as read', e)
                          }

                          let url = notification.payload?.data?.actionUrl || notification.payload?.link

                          // Fix old clinic-owner routes to new clinic routes
                          if (url && url.includes('/dashboard/clinic-owner')) {
                            url = url.replace('/dashboard/clinic-owner', '/dashboard/clinic/staff')
                          }
                          // Fallback for legacy notifications without URLs
                          if (!url) {
                            url = '/dashboard/clinic/staff'
                          }

                          if (url) {
                            router.push(url)
                          } else {
                            console.error('[NOTIFICATION CLICK] No URL to navigate to!')
                          }
                          setShowNotifications(false)
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`h-2 w-2 rounded-full mt-2 ${(notification.readAt || notification.status === 'read') ? 'bg-gray-300' : 'bg-blue-600'
                            }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {notification.payload?.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.payload?.body}
                            </p>
                            <p className="text-xs text-gray-400 mt-2">
                              {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <Bell className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-sm">No notifications yet</p>
                  </div>
                )}
              </ScrollArea>
              {notifications && notifications.length > 0 && (
                <div className="p-2 border-t">
                  <Button variant="ghost" size="sm" className="w-full" asChild>
                    <Link href="/dashboard/notifications">
                      View all notifications
                    </Link>
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Settings */}
          <Button variant="ghost" size="sm" asChild className="p-2 text-white hover:bg-white/10">
            <Link prefetch={false} href={
              user?.role === 'physiotherapist' ? '/dashboard/physiotherapist/settings' :
                user?.role === 'patient' ? '/dashboard/patient/settings' :
                  user?.role === 'clinic_owner' ? '/dashboard/clinic/settings' :
                    '/dashboard/settings'
            }>
              <Settings className="h-5 w-5" />
            </Link>
          </Button>

          {/* User Menu */}
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
        </div>
      </div>
    </header>
  )
} 