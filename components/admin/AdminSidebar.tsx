'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { Badge } from '@/components/ui/badge'
import {
  Users,
  Settings,
  Home,
  ShieldCheck,
  Bell,
  MessageSquare,
  Activity,
  BookOpen,
  Award,
  ChevronUp,
  LogOut,
  UserCog,
  Shield,
  TrendingUp,
  ClipboardCheck,
  AlertTriangle,
  Zap,
  Lock,
  Mail,
  Palette,
  Globe,
  UserPlus,
  WalletCards,
  Stethoscope,
  Handshake,
} from 'lucide-react'
import { TooltipContent } from '@/components/ui/tooltip'
import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'



const navigationGroups = [
  {
    title: 'Overview',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: Home,
        roles: ['admin'],
        description: 'Main dashboard overview',
      },
    ],
  },
  {
    title: 'User Management',
    items: [
      {
        title: 'All Users',
        href: '/dashboard/admin/users',
        icon: Users,
        roles: ['admin'],
        description: 'Manage all platform users',
      },
      {
        title: 'Account Approvals',
        href: '/dashboard/admin/approvals',
        icon: ClipboardCheck,
        badge: 0, // Will be updated with actual count
        roles: ['admin'],
        description: 'Review pending account approvals',
      },
      {
        title: 'Declined Approvals',
        href: '/dashboard/admin/declined-physios',
        icon: UserCog, // reusing UserCog or some other icon
        roles: ['admin'],
        description: 'View declined applications',
      },
      {
        title: 'Role Management',
        href: '/dashboard/admin/roles',
        icon: Shield,
        roles: ['admin'],
        description: 'Manage user roles and permissions',
      },
      {
        title: 'Doctor Referrals',
        href: '/dashboard/admin/referrals',
        icon: UserPlus,
        roles: ['admin'],
        description: 'Process referring doctor patient intake queue',
      },
      {
        title: 'MediLoan Applications',
        href: '/dashboard/admin/loans',
        icon: WalletCards,
        roles: ['admin'],
        description: 'Track patient loan applications via MyItura',
      },
      {
        title: 'AwaDoc Integration',
        href: '/dashboard/admin/awadoc',
        icon: Stethoscope,
        roles: ['admin'],
        description: 'Manage AwaDoc marketplace integration & test webhooks',
      },
    ],
  },
  {
    title: 'System Analytics',
    items: [
      {
        title: 'Platform Analytics',
        href: '/dashboard/admin/analytics',
        icon: TrendingUp,
        roles: ['admin'],
        description: 'View system-wide analytics',
      },
      {
        title: 'Marketplace Bookings',
        href: '/dashboard/admin/marketplace-bookings',
        icon: ClipboardCheck,
        roles: ['admin'],
        description: 'View and manage all marketplace bookings',
      },
      {
        title: 'Transactions',
        href: '/dashboard/admin/transactions',
        icon: WalletCards,
        roles: ['admin'],
        description: 'View all marketplace payments and invoices',
      },
      {
        title: 'User Activity',
        href: '/dashboard/admin/activity',
        icon: Activity,
        roles: ['admin'],
        description: 'Monitor user activity logs',
      },
      {
        title: 'System Health',
        href: '/dashboard/admin/health',
        icon: Zap,
        roles: ['admin'],
        description: 'Monitor system performance',
      },
    ],
  },

  {
    title: 'Content Management',
    items: [
      {
        title: 'Exercise Library',
        href: '/dashboard/admin/exercises',
        icon: BookOpen,
        roles: ['admin'],
        description: 'Manage exercise content',
      },
      {
        title: 'CPD Courses',
        href: '/dashboard/admin/cpd',
        icon: Award,
        roles: ['admin'],
        description: 'Manage continuing education',
      },
      {
        title: 'Content Moderation',
        href: '/dashboard/admin/moderation',
        icon: AlertTriangle,
        roles: ['admin'],
        description: 'Review flagged content',
      },
    ],
  },
  {
    title: 'Platform Settings',
    items: [
      {
        title: 'System Settings',
        href: '/dashboard/admin/system',
        icon: Settings,
        roles: ['admin'],
        description: 'Configure system settings',
      },
      {
        title: 'Email Templates',
        href: '/dashboard/admin/emails',
        icon: Mail,
        roles: ['admin'],
        description: 'Manage email templates',
      },
      {
        title: 'Security Settings',
        href: '/dashboard/admin/security',
        icon: Lock,
        roles: ['admin'],
        description: 'Configure security policies',
      },
    ],
  },
  {
    title: 'Communication',
    items: [
      {
        title: 'Notifications',
        href: '/dashboard/notifications',
        icon: Bell,
        badge: 0, // Will be updated with actual count
        roles: ['admin'],
        description: 'View system notifications',
      },
      {
        title: 'Messages',
        href: '/dashboard/messages',
        icon: MessageSquare,
        roles: ['admin'],
        description: 'Platform messaging system',
      },
      {
        title: 'Announcements',
        href: '/dashboard/admin/announcements',
        icon: Globe,
        roles: ['admin'],
        description: 'Create platform announcements',
      },
      {
        title: 'Partnerships',
        href: '/dashboard/admin/partnerships',
        icon: Handshake,
        roles: ['admin'],
        description: 'Review B2B partnership inquiries',
      },
    ],
  },
]

interface AdminSidebarProps {
  className?: string
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const pathname = usePathname()
  const { user } = useUser()

  // Get user data from Convex
  const userData = useQuery(api.users.getMyUser)

  // Get notification count for current user
  const unreadNotifications = useQuery(
    api.notifications.getUnreadCount,
    userData ? { userId: userData._id } : 'skip'
  )

  // Get pending approvals count for admins
  const pendingApprovalsList = useQuery(
    api.users.getPendingApprovals,
    userData?.role === 'admin' ? {} : 'skip'
  )

  const pendingApprovals = pendingApprovalsList?.length || 0

  // Get pending partner applications count for admins
  const pendingPartnerAppsList = useQuery(
    api.adminPartnerships.getPartnerApplications,
    userData?.role === 'admin' ? { status: 'pending' } : 'skip'
  )
  const pendingPartnerApps = pendingPartnerAppsList?.length || 0

  // Update badge counts for navigation items
  const navigationWithBadges = navigationGroups.map(group => ({
    ...group,
    items: group.items.map(item => {
      if (item.href === '/dashboard/notifications') {
        return { ...item, badge: unreadNotifications || 0 }
      }
      if (item.href === '/dashboard/admin/approvals') {
        return { ...item, badge: pendingApprovals || 0 }
      }
      if (item.href === '/dashboard/admin/partnerships') {
        return { ...item, badge: pendingPartnerApps || 0 }
      }
      return item
    })
  }))

  // Only show if user is admin
  if (!userData || userData.role !== 'admin') {
    return null
  }

  return (
    <Sidebar variant="sidebar" className={cn("top-16 !h-[calc(100vh-4rem)]", className)}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-2 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Admin Dashboard</span>
                <span className="text-xs text-muted-foreground">
                  System Management
                </span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navigationWithBadges.map((group, index) => (
          <div key={group.title}>
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {group.title}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href ||
                      (item.href !== '/dashboard' && pathname.startsWith(item.href))

                    // Extract tooltip content to avoid deep JSX nesting
                    const tooltipContent = (
                      <div>
                        <div className="font-medium">{item.title}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.description}
                          </div>
                        )}
                      </div>
                    )

                    // Flatten badge logic
                    const showBadge = item.badge && item.badge > 0
                    const badgeText = item.badge && item.badge > 99 ? '99+' : item.badge

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={{ children: tooltipContent } as React.ComponentProps<typeof TooltipContent>}
                        >
                          <Link href={item.href}>
                            <Icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            {showBadge && (
                              <SidebarMenuBadge className="bg-destructive text-destructive-foreground">
                                {badgeText}
                              </SidebarMenuBadge>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {index < navigationWithBadges.length - 1 && <SidebarSeparator />}
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.imageUrl} alt={user?.fullName || ''} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium">
                      {user?.fullName}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                  </div>
                  <ChevronUp className="ml-auto h-4 w-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <UserCog className="mr-2 h-4 w-4" />
                    Account Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/admin/preferences">
                    <Palette className="mr-2 h-4 w-4" />
                    Admin Preferences
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <SignOutButton>
                    <button className="w-full flex items-center">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </button>
                  </SignOutButton>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
} 