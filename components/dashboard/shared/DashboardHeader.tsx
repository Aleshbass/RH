'use client'

import { useState, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
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
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Notification {
  _id: string
  title?: string
  message?: string
  read?: boolean
  createdAt: number
  data?: {
    actionUrl?: string
  }
}

export function DashboardHeader() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [lastNotifId, setLastNotifId] = useState<string | null>(null)

  // Recent notifications & count
  const notifications = useQuery(api.notifications.getMyNotifications, { limit: 5, includeRead: true })
  const unreadCount = useQuery(api.notifications.getMyUnreadCount, {})

  const quickActions = [
    {
      title: 'Schedule Appointment',
      icon: Calendar,
      href: '/dashboard/appointments/new',
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
    {
      title: 'Book Appointment',
      icon: Calendar,
      href: '/dashboard/appointments/book',
      roles: ['patient'],
    },
  ]

  // Note: userData is not available in this component, so showing all actions for now
  const filteredQuickActions = quickActions

  // Toast on new notification
  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const latest = notifications[0] as Notification
      if (!latest.read && latest._id !== lastNotifId) {
        toast(latest.title, {
          description: latest.message,
          action: {
            label: 'Open',
            onClick: () => {
              if (latest.data?.actionUrl) {
                router.push(latest.data.actionUrl)
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
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left Side - Logo & Search */}
        <div className="flex items-center gap-4 flex-1">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="text-xl font-bold text-gray-900">Rehabify</span>
          </Link>
          
          {/* Search Bar */}
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search patients, appointments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 border-gray-200"
            />
          </div>
        </div>

        {/* Right Side - Actions & User */}
        <div className="flex items-center gap-4">
          {/* Quick Actions */}
          {filteredQuickActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Quick Actions
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

          {/* Notifications */}
          <Popover open={showNotifications} onOpenChange={setShowNotifications}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative p-2"
              >
                <Bell className="h-5 w-5" />
                {unreadCount && unreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold">Notifications</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotifications(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="h-80">
                {notifications && notifications.length > 0 ? (
                  <div className="divide-y">
                    {notifications.map((notification: Notification) => (
                      <div key={notification._id} className="p-4 hover:bg-gray-50">
                        <div className="flex items-start gap-3">
                          <div className={`h-2 w-2 rounded-full mt-2 ${
                            notification.read ? 'bg-gray-300' : 'bg-blue-600'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.message}
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
          <Button variant="ghost" size="sm" asChild className="p-2">
            <Link href="/dashboard/settings">
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