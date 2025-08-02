'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Server, 
  Database, 
  Cpu, 
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  RefreshCw,
  Bell
} from 'lucide-react'
import { format } from 'date-fns'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

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



export function SystemMonitoring() {
  const platformAnalytics = useQuery(api.admin.getPlatformAnalytics)
  const systemMetrics = useQuery(api.admin.getSystemMetrics) as SystemMetrics | undefined
  
  // Mock pending actions data since the API doesn't exist yet
  const pendingActions = {
    systemAlerts: 2,
    failedNotifications: 3
  }

  if (!platformAnalytics || !systemMetrics) {
    return <SystemMonitoringSkeleton />
  }

  // Mock performance data for the last 24 hours
  const performanceData = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date()
    hour.setHours(hour.getHours() - (23 - i))
    return {
      time: format(hour, 'HH:mm'),
      cpu: Math.random() * 30 + 40, // 40-70% CPU usage
      memory: Math.random() * 20 + 60, // 60-80% memory usage
      responseTime: Math.random() * 100 + 200, // 200-300ms response time
    }
  })

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'text-green-600 bg-green-100'
    if (value >= thresholds.warning) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time system health and performance monitoring
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live Monitoring
          </Badge>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="System Health"
          value="Operational"
          status="good"
          icon={CheckCircle}
          detail={`${platformAnalytics.systemHealth.uptime}% uptime`}
        />
        <StatusCard
          title="Database"
          value="Healthy"
          status="good"
          icon={Database}
          detail={`${systemMetrics.database.queryPerformance}% performance`}
        />
        <StatusCard
          title="API Services"
          value="Running"
          status="good"
          icon={Server}
          detail={`${systemMetrics.api.requestsPerMinute} req/min`}
        />
        <StatusCard
          title="Notifications"
          value="Active"
          status={systemMetrics.notifications.queueSize > 10 ? "warning" : "good"}
          icon={Bell}
          detail={`${systemMetrics.notifications.queueSize} in queue`}
        />
      </div>

      {/* Critical Alerts */}
      {pendingActions && (pendingActions.systemAlerts > 0 || pendingActions.failedNotifications > 5) && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <CardTitle className="text-red-800">Critical Alerts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingActions.systemAlerts > 0 && (
                <div className="flex items-center justify-between p-3 bg-white rounded border">
                  <div className="flex items-center space-x-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">System Performance Issues</span>
                  </div>
                  <Badge variant="destructive">{pendingActions.systemAlerts}</Badge>
                </div>
              )}
              {pendingActions.failedNotifications > 5 && (
                <div className="flex items-center justify-between p-3 bg-white rounded border">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">High Notification Failure Rate</span>
                  </div>
                  <Badge variant="destructive">{pendingActions.failedNotifications}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="mr-2 h-5 w-5" />
              System Performance (24h)
            </CardTitle>
            <CardDescription>
              Real-time system metrics over the last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="CPU Usage (%)"
                  />
                  <Line
                    type="monotone"
                    dataKey="memory"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name="Memory Usage (%)"
                  />
                  <Line
                    type="monotone"
                    dataKey="responseTime"
                    stroke="#ffc658"
                    strokeWidth={2}
                    name="Response Time (ms)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Database Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Database Metrics
            </CardTitle>
            <CardDescription>
              Database performance and storage metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Query Performance</span>
                <span className="font-medium">{systemMetrics.database.queryPerformance}%</span>
              </div>
              <Progress value={systemMetrics.database.queryPerformance} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Index Efficiency</span>
                <span className="font-medium">{systemMetrics.database.indexEfficiency}%</span>
              </div>
              <Progress value={systemMetrics.database.indexEfficiency} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">{systemMetrics.database.totalDocuments.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Documents</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">{systemMetrics.database.storageUsed} GB</div>
                <div className="text-xs text-muted-foreground">Storage</div>
              </div>
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
              Real-time API metrics and status
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
                <Badge 
                  variant="secondary" 
                  className={getStatusColor(100 - systemMetrics.api.errorRate, { good: 99, warning: 95 })}
                >
                  {systemMetrics.api.errorRate}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Requests Per Minute</span>
                <span className="text-sm font-medium">{systemMetrics.api.requestsPerMinute}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Status</span>
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Healthy
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Cpu className="mr-2 h-5 w-5" />
              System Resources
            </CardTitle>
            <CardDescription>
              Current system resource utilization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>CPU Usage</span>
                <span className="font-medium">45%</span>
              </div>
              <Progress value={45} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Memory Usage</span>
                <span className="font-medium">68%</span>
              </div>
              <Progress value={68} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Disk Usage</span>
                <span className="font-medium">32%</span>
              </div>
              <Progress value={32} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Network I/O</span>
                <span className="font-medium">24%</span>
              </div>
              <Progress value={24} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Notification System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bell className="mr-2 h-5 w-5" />
              Notification System
            </CardTitle>
            <CardDescription>
              Notification delivery and queue status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">{(systemMetrics.notifications.deliveryRate * 100).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Delivered Today</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">{systemMetrics.notifications.queueSize}</div>
                <div className="text-xs text-muted-foreground">In Queue</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Delivery Rate</span>
                <Badge 
                  variant="secondary" 
                  className={getStatusColor(systemMetrics.notifications.deliveryRate, { good: 95, warning: 85 })}
                >
                  {systemMetrics.notifications.deliveryRate}%
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Failure Rate</span>
                <Badge 
                  variant="secondary" 
                  className={getStatusColor(100 - systemMetrics.notifications.failureRate, { good: 98, warning: 95 })}
                >
                  {systemMetrics.notifications.failureRate}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface StatusCardProps {
  title: string
  value: string
  status: 'good' | 'warning' | 'error'
  icon: React.ElementType
  detail: string
}

function StatusCard({ title, value, status, icon: Icon, detail }: StatusCardProps) {
  const statusColors = {
    good: 'text-green-600 bg-green-100 border-green-200',
    warning: 'text-yellow-600 bg-yellow-100 border-yellow-200',
    error: 'text-red-600 bg-red-100 border-red-200',
  }

  const iconColors = {
    good: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
  }

  return (
    <Card className={`${statusColors[status]}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColors[status]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs opacity-80">{detail}</p>
      </CardContent>
    </Card>
  )
}

function SystemMonitoringSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex space-x-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  )
} 