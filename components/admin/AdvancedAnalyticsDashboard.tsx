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

interface SystemMetrics {
  database: {
    totalDocuments: number;
    queryPerformance: number;
    indexEfficiency: number;
    storageUsed: number;
  };
  api: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
  };
  notifications: {
    queueSize: number;
    deliveryRate: number;
    failureRate: number;
  };
}

interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  timestamp: number;
  details: string;
}

interface RevenueData {
  date: string;
  amount: number;
  trend: number;
}

interface PendingAction {
  id: string;
  type: string;
  priority: string;
  dueDate: number;
  assignedTo: string;
}

export function AdvancedAnalyticsDashboard() {
  const platformAnalytics = useQuery(api.admin.getPlatformAnalytics)
  const systemMetrics = useQuery(api.admin.getSystemMetrics) as SystemMetrics | undefined
  const revenueAnalytics = useQuery(api.admin.getRevenueAnalytics, { period: "30d" }) as RevenueData[] | undefined
  const activityLogs = useQuery(api.admin.getUserActivityLogs, { limit: 10 }) as ActivityLog[] | undefined
  const pendingActions = useQuery(api.admin.getPendingActions) as PendingAction[] | undefined

  if (!platformAnalytics || !systemMetrics || !revenueAnalytics || !activityLogs || !pendingActions) {
    return <div>Loading...</div>
  }

  const userRoleData = Object.entries(platformAnalytics.userStats.byRole).map(([role, count]) => ({
    name: role.charAt(0).toUpperCase() + role.slice(1),
    value: count,
    color: COLORS[Object.keys(platformAnalytics.userStats.byRole).indexOf(role) % COLORS.length]
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Analytics</h1>
          <p className="text-muted-foreground">
            Real-time insights and performance metrics for Rehabify Health
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>
          <Button size="sm">
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

      {/* Pending Actions Alert */}
      {pendingActions && (pendingActions.pendingApprovals > 0 || pendingActions.failedNotifications > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 mr-2" />
              <CardTitle className="text-amber-800">Action Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {pendingActions.pendingApprovals > 0 && (
                <div className="flex items-center space-x-2">
                  <Badge variant="destructive">{pendingActions.pendingApprovals}</Badge>
                  <span className="text-sm">Pending Approvals</span>
                </div>
              )}
              {pendingActions.failedNotifications > 0 && (
                <div className="flex items-center space-x-2">
                  <Badge variant="destructive">{pendingActions.failedNotifications}</Badge>
                  <span className="text-sm">Failed Notifications</span>
                </div>
              )}
              {pendingActions.systemAlerts > 0 && (
                <div className="flex items-center space-x-2">
                  <Badge variant="destructive">{pendingActions.systemAlerts}</Badge>
                  <span className="text-sm">System Alerts</span>
                </div>
              )}
              {pendingActions.supportTickets > 0 && (
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">{pendingActions.supportTickets}</Badge>
                  <span className="text-sm">Support Tickets</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Engagement */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5" />
                  User Engagement
                </CardTitle>
                <CardDescription>
                  Daily, weekly, and monthly active users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Daily Active Users</span>
                  <span className="text-2xl font-bold">{platformAnalytics.engagement.dailyActiveUsers}</span>
                </div>
                <Progress value={platformAnalytics.engagement.dailyActiveUsers / platformAnalytics.engagement.monthlyActiveUsers * 100} />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Weekly Active Users</span>
                  <span className="text-2xl font-bold">{platformAnalytics.engagement.weeklyActiveUsers}</span>
                </div>
                <Progress value={platformAnalytics.engagement.weeklyActiveUsers / platformAnalytics.engagement.monthlyActiveUsers * 100} />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Monthly Active Users</span>
                  <span className="text-2xl font-bold">{platformAnalytics.engagement.monthlyActiveUsers}</span>
                </div>
                <Progress value={100} />
              </CardContent>
            </Card>

            {/* System Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Server className="mr-2 h-5 w-5" />
                  System Health
                </CardTitle>
                <CardDescription>
                  Real-time system performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Uptime</span>
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        {platformAnalytics.systemHealth.uptime}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Response Time</span>
                      <span className="text-sm font-medium">{platformAnalytics.systemHealth.responseTime}ms</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Error Rate</span>
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        {platformAnalytics.systemHealth.errorRate}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Notifications</span>
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
            <Card>
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
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* User Growth Metrics */}
            <Card>
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
                  <Progress value={platformAnalytics.userStats.onboardingCompletionRate} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{platformAnalytics.userStats.newUsersThisWeek}</div>
                    <div className="text-sm text-muted-foreground">New Users This Week</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
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
            <Card className="lg:col-span-2">
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
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                      />
                      <YAxis 
                        tickFormatter={(value) => `₦${(value / 1000).toFixed(0)}K`}
                      />
                      <Tooltip 
                        labelFormatter={(value) => format(new Date(value), 'MMM dd, yyyy')}
                        formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue']}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
                <CardDescription>
                  Key financial metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Revenue</span>
                    <span className="font-medium">₦{platformAnalytics.overview.revenueThisMonth.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Monthly Recurring</span>
                    <span className="font-medium">₦{platformAnalytics.overview.monthlyRecurring.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Average Order Value</span>
                    <span className="font-medium">₦{platformAnalytics.overview.averageOrderValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Growth Rate</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      +{platformAnalytics.overview.growthRate}%
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Payment Methods</h4>
                  <div className="space-y-2">
                    {Object.entries(platformAnalytics.overview.paymentMethodBreakdown).map(([method, percentage]) => (
                      <div key={method} className="flex justify-between">
                        <span className="text-sm">{method}</span>
                        <span className="text-sm font-medium">{percentage}%</span>
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5" />
                  Database Performance
                </CardTitle>
                <CardDescription>
                  Database health and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.database.totalDocuments.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Total Documents</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.database.storageUsed} GB</div>
                    <div className="text-xs text-muted-foreground">Storage Used</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Query Performance</span>
                    <span className="text-sm font-medium">{systemMetrics.database.queryPerformance}%</span>
                  </div>
                  <Progress value={systemMetrics.database.queryPerformance} />
                  
                  <div className="flex justify-between">
                    <span className="text-sm">Index Efficiency</span>
                    <span className="text-sm font-medium">{systemMetrics.database.indexEfficiency}%</span>
                  </div>
                  <Progress value={systemMetrics.database.indexEfficiency} />
                </div>
              </CardContent>
            </Card>

            {/* API Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="mr-2 h-5 w-5" />
                  API Performance
                </CardTitle>
                <CardDescription>
                  Real-time API metrics and health
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.api.requestsPerMinute}</div>
                    <div className="text-xs text-muted-foreground">Requests/min</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-lg font-bold">{systemMetrics.api.averageResponseTime}ms</div>
                    <div className="text-xs text-muted-foreground">Avg Response</div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Error Rate</span>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {systemMetrics.api.errorRate}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Active Connections</span>
                    <span className="text-sm font-medium">{systemMetrics.api.activeConnections}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification System */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="mr-2 h-5 w-5" />
                  Notification System
                </CardTitle>
                <CardDescription>
                  Notification delivery performance and queue status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{systemMetrics.notifications.totalSent.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Sent</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{systemMetrics.notifications.deliveryRate}%</div>
                    <div className="text-sm text-muted-foreground">Delivery Rate</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{systemMetrics.notifications.failureRate}%</div>
                    <div className="text-sm text-muted-foreground">Failure Rate</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-xl font-bold">{systemMetrics.notifications.queueSize}</div>
                    <div className="text-sm text-muted-foreground">Queue Size</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="mr-2 h-5 w-5" />
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
                    <div key={log.id} className="flex items-center space-x-4 p-3 rounded-lg border">
                      <div className="flex-shrink-0">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{log.action}</p>
                            <p className="text-sm text-muted-foreground">{log.details}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
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
                    <div key={i} className="flex items-center space-x-4 p-3">
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
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    purple: 'text-purple-600 bg-purple-100',
    orange: 'text-orange-600 bg-orange-100',
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`rounded-full p-2 ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center text-xs text-muted-foreground">
          <TrendingUp className="mr-1 h-3 w-3" />
          {change} {changeLabel}
        </div>
      </CardContent>
    </Card>
  )
}

 