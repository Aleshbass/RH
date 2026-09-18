'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  ShieldCheck,
  Activity,
  ClipboardCheck,
  Bell,
  ChevronRight,
  UserPlus,
  Settings,
  BarChart3,
  Server,
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Handshake,
} from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'
import { ActivityLog } from "@/types/activity"
import AdminLiveMap from "@/components/dashboard/admin/AdminLiveMap"

interface StatCardProps {
  title: string
  value: string | number
  description: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  badge?: {
    text: string
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
  }
  trend?: {
    value: number
    isPositive: boolean
  }
}

function StatCard({ title, value, description, icon: Icon, href, badge, trend }: StatCardProps) {
  const CardComponent = href ? Link : 'div'
  
  return (
    <CardComponent href={href || '#'} className={href ? 'block' : ''}>
      <Card className={`${href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {badge && (
              <Badge variant={badge.variant} className="text-xs">
                {badge.text}
              </Badge>
            )}
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">{value.toLocaleString()}</div>
            {trend && (
              <div className={`flex items-center text-sm ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-1" />
                )}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </CardComponent>
  )
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-[60px] mb-2" />
        <Skeleton className="h-3 w-[120px]" />
      </CardContent>
    </Card>
  )
}

export default function AdminDashboard() {
  // Get current user to verify admin status
  const currentUser = useQuery(api.users.getMyUser)

  // Get real-time admin data - use direct Convex hooks instead of custom wrapper
  const adminStats = useQuery(api.admin.getAdminDashboardStats)
  const systemHealth = useQuery(api.admin.getSystemHealth)
  const recentActivity = useQuery(api.admin.getUserActivityLogs, { limit: 5 })
  const pendingApprovals = useQuery(api.users.getPendingApprovals)
  const pendingPartnerships = useQuery(
    api.adminPartnerships.getPartnerApplications,
    currentUser?.role === 'admin' ? { status: 'pending' } : 'skip'
  )

  // Debug logging
  console.log('Admin Dashboard Debug:', {
    adminStats: adminStats,
    systemHealth: systemHealth,
    currentUser: currentUser
  })

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You need administrator privileges to access this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive platform management and real-time monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/admin/system">
              <Settings className="h-4 w-4 mr-2" />
              System Settings
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/admin/users">
              <UserPlus className="h-4 w-4 mr-2" />
              Manage Users
            </Link>
          </Button>
        </div>
      </div>

      {/* Real-time Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {adminStats ? (
          <>
            <StatCard
              title="Total Users"
              value={adminStats.totalUsers}
              description="All registered users"
              icon={Users}
              href="/dashboard/admin/users"
              trend={{
                value: Math.round((adminStats.newUsersThisWeek / adminStats.totalUsers) * 100),
                isPositive: true
              }}
            />
            <StatCard
              title="Pending Approvals"
              value={adminStats.pendingApprovals}
              description="Accounts awaiting approval"
              icon={ClipboardCheck}
              href="/dashboard/admin/approvals"
              badge={
                adminStats.pendingApprovals > 0
                  ? { text: 'Action Required', variant: 'destructive' }
                  : { text: 'Up to date', variant: 'secondary' }
              }
            />
            <StatCard
              title="System Health"
              value={`${systemHealth?.overall || 0}%`}
              description="Overall system status"
              icon={Server}
              href="/dashboard/admin/health"
              badge={{
                text: systemHealth?.status === 'excellent' ? 'Excellent' : 
                      systemHealth?.status === 'good' ? 'Good' : 'Warning',
                variant: systemHealth?.status === 'excellent' ? 'default' : 
                        systemHealth?.status === 'good' ? 'secondary' : 'destructive'
              }}
            />
            <StatCard
              title="Today's Activity"
              value={adminStats.appointmentsToday}
              description="Appointments scheduled today"
              icon={Activity}
              href="/dashboard/admin/activity"
              trend={{
                value: 12,
                isPositive: true
              }}
            />
          </>
        ) : (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        )}
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        {adminStats ? (
          <>
            <StatCard
              title="Approved Rehabify Physios"
              value={adminStats.usersByRole.physiotherapists}
              description="Approved Rehabify physios"
              icon={Activity}
              href="/dashboard/admin/users?role=physiotherapist"
              badge={{ text: 'Rehabify', variant: 'default' }}
            />
            <StatCard
              title="Registered Physios"
              value={adminStats.publicRegistryStats?.totalRegistered || 0}
              description="On the public directory"
              icon={Users}
              href="/dashboard/admin/physio-registry"
              badge={
                adminStats.publicRegistryStats?.overlapWithPlatform > 0
                  ? { text: `${adminStats.publicRegistryStats.overlapWithPlatform} also on Rehabify`, variant: 'secondary' }
                  : undefined
              }
            />
            <StatCard
              title="Total Patients"
              value={adminStats.usersByRole.patients}
              description="Active platform patients"
              icon={Users}
              href="/dashboard/admin/users?role=patient"
            />
            <StatCard
              title="Clinic Owners"
              value={adminStats.usersByRole.clinicOwners}
              description="Registered clinic owners"
              icon={Users}
              href="/dashboard/admin/users?role=clinic_owner"
            />
            <StatCard
              title="Total Clinics"
              value={adminStats.totalClinics}
              description="Active healthcare facilities"
              icon={Database}
            />
            <StatCard
              title="Notifications"
              value={adminStats.unsentNotifications}
              description="Pending notifications"
              icon={Bell}
              badge={
                adminStats.unsentNotifications > 0
                  ? { text: 'Pending', variant: 'destructive' }
                  : { text: 'Clear', variant: 'secondary' }
              }
            />
          </>
        ) : (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        )}
      </div>

      {/* Live Map of Physiotherapists */}
      <AdminLiveMap />

      {/* Quick Actions & System Status */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Common administrative tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link href="/dashboard/admin/users">
                <span className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Manage Users
                </span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link href="/dashboard/admin/approvals">
                <span className="flex items-center">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Review Approvals
                </span>
                {pendingApprovals && pendingApprovals.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingApprovals.length}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link href="/dashboard/admin/partnerships">
                <span className="flex items-center">
                  <Handshake className="h-4 w-4 mr-2 text-teal-700" />
                  Partnerships & Integrations
                </span>
                {pendingPartnerships && pendingPartnerships.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingPartnerships.length} pending
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link href="/dashboard/admin/referrals">
                <span className="flex items-center">
                  <UserPlus className="h-4 w-4 mr-2 text-blue-700" />
                  Inbound Patient Referrals
                </span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link href="/dashboard/admin/analytics">
                <span className="flex items-center">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Platform Analytics
                </span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link href="/dashboard/admin/security">
                <span className="flex items-center">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Security Center
                </span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* System Health Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Server className="h-5 w-5 mr-2" />
              System Health
            </CardTitle>
            <CardDescription>
              Real-time system status and performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {systemHealth ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Database</span>
                  </div>
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {systemHealth.components.database.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">API Services</span>
                  </div>
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {systemHealth.components.api.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {systemHealth.components.notifications.status === 'healthy' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm">Notifications</span>
                  </div>
                  <Badge variant={systemHealth.components.notifications.status === 'healthy' ? 'default' : 'destructive'}>
                    {systemHealth.components.notifications.status}
                  </Badge>
                </div>
                <div className="pt-2">
                  <Button variant="ghost" size="sm" className="w-full" asChild>
                    <Link href="/dashboard/admin/health">
                      View Detailed Monitoring
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Bell className="h-5 w-5 mr-2" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Latest user actions and system events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentActivity && Array.isArray(recentActivity) ? (
              recentActivity.length > 0 ? (
                recentActivity.map((activity: ActivityLog) => (
                  <div key={activity._id.toString()} className="flex items-center space-x-4 text-sm">
                    <div className="flex h-2 w-2 bg-blue-500 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <p className="font-medium">{activity.activity}</p>
                      <p className="text-muted-foreground">
                        {activity.userName} ({activity.userRole?.replace('_', ' ')})
                      </p>
                    </div>
                    <div className="text-muted-foreground">
                      {format(new Date(activity.timestamp), 'MMM dd, HH:mm')}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No recent activity</p>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            )}
            
            <Button variant="ghost" size="sm" className="w-full mt-4" asChild>
              <Link href="/dashboard/admin/activity">
                View All Activity
                <ChevronRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 