'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TrendingUp,
  Users,
  Building2,
  Calendar,
  DollarSign,
  Activity,
  Server,
  Bell,
  AlertTriangle,
  Database,
  Zap,
  Download,
  RefreshCw
} from 'lucide-react'
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, PieChart as RechartsPieChart, Pie, Cell, Area, AreaChart } from 'recharts'
import { format } from 'date-fns'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  timestamp: number;
  details: string;
}

interface PendingActionsSummary {
  pendingApprovals: number;
  failedNotifications: number;
  systemAlerts: number;
  supportTickets: number;
}

export function AdvancedAnalyticsDashboard() {
  const platformAnalytics = useQuery(api.admin.getPlatformAnalytics)
  const systemMetrics = useQuery(api.admin.getSystemMetrics)
  const platformRevenue = useQuery(api.admin.getPlatformRevenue)

  // Create time-series data for the revenue chart (deterministic, no randomness)
  const revenueAnalytics: Array<{ date: number; amount: number }> = platformRevenue ? (() => {
    const days = 30
    const perDay = Math.floor((platformRevenue.monthlyRevenue || 0) / days)
    return Array.from({ length: days }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - i))
      return {
        date: date.getTime(),
        amount: perDay,
      }
    })
  })() : []
  const activityLogs = useQuery(api.admin.getUserActivityLogs, { limit: 10 }) as ActivityLog[] | undefined
  const adminStats = useQuery(api.admin.getAdminDashboardStats)
  const pendingActions: PendingActionsSummary | undefined = adminStats ? {
    pendingApprovals: adminStats.pendingApprovals ?? 0,
    failedNotifications: adminStats.unsentNotifications ?? 0,
    systemAlerts: 0,
    supportTickets: 0,
  } : undefined

  if (!platformAnalytics || !systemMetrics || !platformRevenue || !activityLogs || !pendingActions) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const userRoleData = Object.entries(platformAnalytics.userStats.byRole).map(([role, count]) => ({
    name: role.charAt(0).toUpperCase() + role.slice(1),
    value: count,
    color: COLORS[Object.keys(platformAnalytics.userStats.byRole).indexOf(role) % COLORS.length]
  }))

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Platform Analytics
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Real-time insights and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 md:flex-none">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" className="flex-1 md:flex-none shadow-lg shadow-primary/20">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Users"
          value={platformAnalytics.overview.totalUsers.toLocaleString()}
          change={`+${platformAnalytics.userStats.newUsersThisWeek}`}
          changeLabel="this week"
          icon={Users}
          color="blue"
        />
        <MetricCard
          title="Active Clinics"
          value={platformAnalytics.overview.totalClinics.toLocaleString()}
          change="+12%"
          changeLabel="growth rate"
          icon={Building2}
          color="green"
        />
        <MetricCard
          title="Total Appointments"
          value={platformAnalytics.overview.totalAppointments.toLocaleString()}
          change="+8.2%"
          changeLabel="this month"
          icon={Calendar}
          color="purple"
        />
        <MetricCard
          title="Revenue (₦)"
          value={`₦${(platformAnalytics.overview.revenueThisMonth / 1000).toFixed(0)}K`}
          change={`+${platformAnalytics.overview.growthRate}%`}
          changeLabel="growth"
          icon={DollarSign}
          color="orange"
        />
      </div>

      {/* Tour Analytics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Tour Completions"
          value={platformAnalytics.userStats.tourCompletions.toLocaleString()}
          change={`${platformAnalytics.userStats.onboardingCompletionRate.toFixed(1)}%`}
          changeLabel="completion rate"
          icon={TrendingUp}
          color="blue"
        />
      </div>

      {/* Pending Actions Alert */}
      {pendingActions && (pendingActions.pendingApprovals > 0 || pendingActions.failedNotifications > 0) && (
        <Card className="border-amber-200 bg-amber-50/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 mr-2" />
              <CardTitle className="text-amber-800">Action Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {pendingActions.pendingApprovals > 0 && (
                <div className="flex items-center space-x-2 bg-white/50 p-2 rounded-lg">
                  <Badge variant="destructive" className="h-6 w-6 flex items-center justify-center p-0">{pendingActions.pendingApprovals}</Badge>
                  <span className="text-sm font-medium text-amber-900">Pending Approvals</span>
                </div>
              )}
              {pendingActions.failedNotifications > 0 && (
                <div className="flex items-center space-x-2 bg-white/50 p-2 rounded-lg">
                  <Badge variant="destructive" className="h-6 w-6 flex items-center justify-center p-0">{pendingActions.failedNotifications}</Badge>
                  <span className="text-sm font-medium text-amber-900">Failed Notifications</span>
                </div>
              )}
              {pendingActions.systemAlerts > 0 && (
                <div className="flex items-center space-x-2 bg-white/50 p-2 rounded-lg">
                  <Badge variant="destructive" className="h-6 w-6 flex items-center justify-center p-0">{pendingActions.systemAlerts}</Badge>
                  <span className="text-sm font-medium text-amber-900">System Alerts</span>
                </div>
              )}
              {pendingActions.supportTickets > 0 && (
                <div className="flex items-center space-x-2 bg-white/50 p-2 rounded-lg">
                  <Badge variant="secondary" className="h-6 w-6 flex items-center justify-center p-0">{pendingActions.supportTickets}</Badge>
                  <span className="text-sm font-medium text-amber-900">Support Tickets</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="w-full justify-start inline-flex min-w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Engagement */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-primary" />
                  User Engagement
                </CardTitle>
                <CardDescription>
                  Daily, weekly, and monthly active users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Daily Active Users</span>
                    <span className="text-2xl font-bold">{platformAnalytics.engagement.dailyActiveUsers}</span>
                  </div>
                  <Progress value={platformAnalytics.engagement.dailyActiveUsers / platformAnalytics.engagement.monthlyActiveUsers * 100} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Weekly Active Users</span>
                    <span className="text-2xl font-bold">{platformAnalytics.engagement.weeklyActiveUsers}</span>
                  </div>
                  <Progress value={platformAnalytics.engagement.weeklyActiveUsers / platformAnalytics.engagement.monthlyActiveUsers * 100} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Monthly Active Users</span>
                    <span className="text-2xl font-bold">{platformAnalytics.engagement.monthlyActiveUsers}</span>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* System Health */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Server className="mr-2 h-5 w-5 text-primary" />
                  System Health
                </CardTitle>
                <CardDescription>
                  Real-time system performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Uptime</span>
                      <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">
                        {platformAnalytics.systemHealth.uptime}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Latency</span>
                      <span className="text-sm font-medium">{platformAnalytics.systemHealth.responseTime}ms</span>
                    </div>
                  </div>
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Errors</span>
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">
                        {platformAnalytics.systemHealth.errorRate}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Delivery</span>
                      <span className="text-sm font-medium">{platformAnalytics.systemHealth.notificationDeliveryRate}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Distribution by Role */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle>User Distribution by Role</CardTitle>
                <CardDescription>
                  Breakdown of users by their assigned roles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={userRoleData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {userRoleData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* User Growth Metrics */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle>User Growth Metrics</CardTitle>
                <CardDescription>
                  Key user acquisition and retention metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Onboarding Completion Rate</span>
                    <span className="text-sm">{platformAnalytics.userStats.onboardingCompletionRate.toFixed(1)}%</span>
                  </div>
                  <Progress value={platformAnalytics.userStats.onboardingCompletionRate} className="h-2" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{platformAnalytics.userStats.newUsersThisWeek}</div>
                    <div className="text-sm text-muted-foreground">New Users This Week</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-2xl font-bold">{platformAnalytics.userStats.activeUsersToday}</div>
                    <div className="text-sm text-muted-foreground">Active Today</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Chart */}
            <Card className="lg:col-span-2 border-none shadow-md">
              <CardHeader>
                <CardTitle>Revenue Trend (30 Days)</CardTitle>
                <CardDescription>
                  Daily revenue performance over the last 30 days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueAnalytics}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#005b57" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#005b57" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                      />
                      <YAxis
                        tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}K`}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                      />
                      <Tooltip
                        labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                        formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#005b57"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Metrics */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
                <CardDescription>
                  Key financial metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-muted-foreground">Total Revenue</span>
                    <span className="font-bold">₦{platformRevenue.totalRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-muted-foreground">Monthly Revenue</span>
                    <span className="font-bold">₦{platformRevenue.monthlyRevenue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm text-muted-foreground">Avg Revenue/User</span>
                    <span className="font-bold">₦{platformRevenue.averageRevenuePerUser.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Growth Rate</span>
                    <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">
                      +{platformAnalytics.overview.growthRate}%
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3">Payment Methods</h4>
                  <div className="space-y-2">
                    {Object.entries(platformRevenue.breakdown).map(([method, amount]) => (
                      <div key={method} className="flex justify-between text-sm">
                        <span className="capitalize text-muted-foreground">{method}</span>
                        <span className="font-medium">₦{(amount as number).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Database Metrics */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5 text-primary" />
                  Database Performance
                </CardTitle>
                <CardDescription>
                  Database health and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.activeConnections.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Active Connections</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.diskUsage.toFixed(1)} GB</div>
                    <div className="text-xs text-muted-foreground">Disk Usage</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">CPU Usage</span>
                      <span className="text-sm text-muted-foreground">{systemMetrics.cpuUsage.toFixed(1)}%</span>
                    </div>
                    <Progress value={systemMetrics.cpuUsage} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Memory Usage</span>
                      <span className="text-sm text-muted-foreground">{systemMetrics.memoryUsage.toFixed(1)}%</span>
                    </div>
                    <Progress value={systemMetrics.memoryUsage} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API Performance */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="mr-2 h-5 w-5 text-primary" />
                  API Performance
                </CardTitle>
                <CardDescription>
                  Real-time API metrics and health
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.requestsPerSecond.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">Requests/sec</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.networkLatency.toFixed(0)}ms</div>
                    <div className="text-xs text-muted-foreground">Network Latency</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 rounded-lg bg-muted/30">
                    <span className="text-sm">Error Rate</span>
                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">
                      {systemMetrics.errorRate.toFixed(2)}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded-lg bg-muted/30">
                    <span className="text-sm">Active Connections</span>
                    <span className="text-sm font-medium">{systemMetrics.activeConnections}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification System */}
            <Card className="lg:col-span-2 border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="mr-2 h-5 w-5 text-primary" />
                  Notification System
                </CardTitle>
                <CardDescription>
                  Notification delivery performance and queue status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{Math.floor(systemMetrics.uptime / 3600).toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Uptime Hours</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{(100 - systemMetrics.errorRate).toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{systemMetrics.errorRate.toFixed(2)}%</div>
                    <div className="text-sm text-muted-foreground">Error Rate</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{systemMetrics.requestsPerSecond.toFixed(0)}</div>
                    <div className="text-sm text-muted-foreground">Requests/sec</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="mr-2 h-5 w-5 text-primary" />
                Recent User Activity
              </CardTitle>
              <CardDescription>
                Latest user actions and system events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activityLogs ? (
                <div className="space-y-4">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="flex items-center space-x-4 p-4 rounded-lg bg-muted/30 border border-transparent hover:border-border transition-colors">
                      <div className="flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-green-500 ring-4 ring-green-500/20" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div>
                            <p className="text-sm font-medium">{log.action}</p>
                            <p className="text-sm text-muted-foreground truncate">{log.details}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(log.timestamp), 'MMM dd, HH:mm')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4 p-4">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string
  change: string
  changeLabel: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'purple' | 'orange'
}

function MetricCard({ title, value, change, changeLabel, icon: Icon, color }: MetricCardProps) {
  const colorStyles = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
      iconBg: 'bg-green-100 dark:bg-green-900/40',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-100 dark:bg-purple-900/40',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      text: 'text-orange-600 dark:text-orange-400',
      iconBg: 'bg-orange-100 dark:bg-orange-900/40',
    },
  }

  const style = colorStyles[color]

  return (
    <Card className="border-none shadow-md bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`rounded-full p-2 ${style.iconBg} ${style.text}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center text-xs text-muted-foreground mt-1">
          <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
          <span className="text-green-600 font-medium mr-1">{change}</span> {changeLabel}
        </div>
      </CardContent>
    </Card>
  )
}