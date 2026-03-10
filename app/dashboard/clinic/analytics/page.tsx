'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Users,
  DollarSign,
  Calendar,
  Video,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react'
import { TourGuide } from '@/components/shared/TourGuide'

// Removed unused AnalyticsData interface - data is accessed directly from queries

export default function OwnerAnalyticsPage() {
  // Get analytics data
  const analyticsData = useQuery(api.clinics.getOwnerAnalytics)
  const revenueData = useQuery(api.clinics.getClinicRevenue)
  const staffMetrics = useQuery(api.clinics.getStaffMetrics)
  const appointmentStats = useQuery(api.clinics.getClinicAppointmentStats)

  if (analyticsData === undefined || revenueData === undefined || staffMetrics === undefined || appointmentStats === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const getGrowthBadge = (growth: number) => {
    if (growth > 0) {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{formatPercentage(growth)}
        </Badge>
      )
    } else if (growth < 0) {
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <TrendingDown className="h-3 w-3 mr-1" />
          {formatPercentage(growth)}
        </Badge>
      )
    } else {
      return (
        <Badge variant="secondary">
          No change
        </Badge>
      )
    }
  }

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div id="analytics-header">
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-gray-600">Comprehensive insights into your clinic&apos;s performance</p>
        </div>

        {/* Key Metrics Cards */}
        <div id="analytics-key-metrics" className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Revenue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(revenueData?.totalRevenue || 0)}</div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">This month: {formatCurrency(revenueData?.thisMonth || 0)}</p>
                {getGrowthBadge(revenueData?.growth || 0)}
              </div>
            </CardContent>
          </Card>

          {/* Staff */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staffMetrics?.active || 0}</div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(staffMetrics?.utilization || 0)} utilization
                </p>
                <Badge variant="outline">
                  +{staffMetrics?.newThisMonth || 0} this month
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Appointments */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Appointments</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointmentStats?.total || 0}</div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(appointmentStats?.completionRate || 0)} completion rate
                </p>
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {appointmentStats?.completed || 0} completed
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Telehealth */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Telehealth</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round((analyticsData?.telehealth?.totalMinutes || 0) / 60)}h</div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">
                  {analyticsData?.telehealth?.sessionsCount || 0} sessions
                </p>
                {getGrowthBadge(analyticsData?.telehealth?.growth || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Analytics */}
        <div id="analytics-detailed" className="grid gap-6 md:grid-cols-2">
          {/* Staff Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Staff Performance
              </CardTitle>
              <CardDescription>Staff utilization and workload metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Overall Utilization</span>
                  <span className="font-medium">{formatPercentage(staffMetrics?.utilization || 0)}</span>
                </div>
                <Progress value={staffMetrics?.utilization || 0} className="h-2" />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{staffMetrics?.active || 0}</div>
                  <div className="text-xs text-gray-600">Active Staff</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{staffMetrics?.newThisMonth || 0}</div>
                  <div className="text-xs text-gray-600">New This Month</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Appointment Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Appointment Breakdown
              </CardTitle>
              <CardDescription>Patient throughput and appointment outcomes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <div>
                    <div className="font-medium">{appointmentStats?.completed || 0}</div>
                    <div className="text-xs text-gray-600">Completed</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <div>
                    <div className="font-medium">{appointmentStats?.cancelled || 0}</div>
                    <div className="text-xs text-gray-600">Cancelled</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <div>
                    <div className="font-medium">{appointmentStats?.noShows || 0}</div>
                    <div className="text-xs text-gray-600">No-shows</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <div>
                    <div className="font-medium">{formatPercentage(appointmentStats?.completionRate || 0)}</div>
                    <div className="text-xs text-gray-600">Success Rate</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Revenue Analysis
              </CardTitle>
              <CardDescription>Financial performance and trends</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">This Month</span>
                  <span className="font-medium">{formatCurrency(revenueData?.thisMonth || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Last Month</span>
                  <span className="font-medium">{formatCurrency(revenueData?.lastMonth || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Growth</span>
                  {getGrowthBadge(revenueData?.growth || 0)}
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(revenueData?.totalRevenue || 0)}</div>
                  <div className="text-xs text-gray-600">Total Revenue</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patient Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Patient Metrics
              </CardTitle>
              <CardDescription>Patient acquisition and retention</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{analyticsData?.patients?.total || 0}</div>
                  <div className="text-xs text-gray-600">Total Patients</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{analyticsData?.patients?.active || 0}</div>
                  <div className="text-xs text-gray-600">Active Patients</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{analyticsData?.patients?.newThisMonth || 0}</div>
                  <div className="text-xs text-gray-600">New This Month</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{formatPercentage(analyticsData?.patients?.retention || 0)}</div>
                  <div className="text-xs text-gray-600">Retention Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card id="analytics-insights">
          <CardHeader>
            <CardTitle>Quick Insights</CardTitle>
            <CardDescription>Key takeaways and recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Strong Performance</span>
                </div>
                <p className="text-sm text-green-700">
                  Your clinic is performing well with {formatPercentage(appointmentStats?.completionRate || 0)} appointment completion rate.
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-800">Staff Utilization</span>
                </div>
                <p className="text-sm text-blue-700">
                  Staff utilization at {formatPercentage(staffMetrics?.utilization || 0)}. Consider optimizing schedules for better efficiency.
                </p>
              </div>

              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-purple-800">Telehealth Growth</span>
                </div>
                <p className="text-sm text-purple-700">
                  Telehealth sessions growing by {formatPercentage(analyticsData?.telehealth?.growth || 0)}. Great adoption rate!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      <TourGuide
        tourId="clinic-analytics-tour"
        steps={[
          {
            target: "#analytics-header",
            title: "Analytics Dashboard",
            content: "Gain comprehensive insights into your clinic's performance, revenue, and growth.",
            position: "bottom"
          },
          {
            target: "#analytics-key-metrics",
            title: "Key Metrics",
            content: "Track vital stats like total revenue, active staff, appointment volume, and telehealth sessions.",
            position: "bottom"
          },
          {
            target: "#analytics-detailed",
            title: "Deep Dive",
            content: "Explore detailed breakdowns of staff performance, appointment outcomes, and revenue trends.",
            position: "top"
          },
          {
            target: "#analytics-insights",
            title: "Smart Insights",
            content: "Get AI-driven recommendations and highlights to optimize your clinic's operations.",
            position: "top"
          }
        ]}
      />
    </div >
  )
}
