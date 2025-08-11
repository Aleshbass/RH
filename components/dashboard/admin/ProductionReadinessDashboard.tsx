'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity, 
  Users, 
  Mail, 
  CreditCard,
  FileText,
  Shield,
  Zap,
  TrendingUp,
  Clock,
  AlertCircle
} from 'lucide-react'

// Simple interfaces to avoid deep type instantiation
interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical'
  uptime: number
  responseTime: number
  errorRate: number
  notificationDeliveryRate: number
}

interface FeatureStatus {
  name: string
  status: 'ready' | 'partial' | 'missing'
  description: string
  issues?: string[]
}

interface ProductionMetrics {
  totalUsers: number
  activeUsers: number
  totalAppointments: number
  totalPayments: number
  systemHealth: SystemHealth
}

export default function ProductionReadinessDashboard() {
  const [metrics, setMetrics] = useState<ProductionMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  // Mock data for demonstration - in real implementation, this would come from your analytics API
  useEffect(() => {
    const mockMetrics: ProductionMetrics = {
      totalUsers: 1250,
      activeUsers: 890,
      totalAppointments: 3420,
      totalPayments: 2100,
      systemHealth: {
        status: 'healthy',
        uptime: 99.8,
        responseTime: 145,
        errorRate: 0.2,
        notificationDeliveryRate: 98.5
      }
    }

    setTimeout(() => {
      setMetrics(mockMetrics)
      setLoading(false)
    }, 1000)
  }, [])

  const productionFeatures: FeatureStatus[] = [
    {
      name: 'Authentication & Authorization',
      status: 'ready',
      description: 'Clerk integration with role-based access control'
    },
    {
      name: 'Patient Invitation System',
      status: 'ready',
      description: 'Enterprise-grade invitation flow with email notifications'
    },
    {
      name: 'Clinic Staff Management',
      status: 'ready',
      description: 'Complete invitation and management system for clinic staff'
    },
    {
      name: 'Payment Processing',
      status: 'ready',
      description: 'Paystack integration with webhook handling and split payments'
    },
    {
      name: 'Email Notifications',
      status: 'ready',
      description: 'Comprehensive email system with templates and delivery tracking'
    },
    {
      name: 'File Management',
      status: 'ready',
      description: 'Document upload/download with role-based access controls'
    },
    {
      name: 'Dashboard UI',
      status: 'ready',
      description: 'Fixed double sidebar issue, responsive design'
    },
    {
      name: 'Alternative Addition Methods',
      status: 'ready',
      description: 'Form-based patient and physiotherapist addition alongside invites'
    },
    {
      name: 'Error Monitoring',
      status: 'ready',
      description: 'Sentry integration with comprehensive error tracking'
    },
    {
      name: 'Analytics & Monitoring',
      status: 'ready',
      description: 'Real-time system metrics and user activity tracking'
    },
    {
      name: 'Treatment Plans',
      status: 'partial',
      description: 'Basic structure in place, needs full implementation',
      issues: ['Exercise tracking incomplete', 'Progress visualization missing']
    },
    {
      name: 'Health Monitoring Integration',
      status: 'partial',
      description: 'Fitbit integration framework exists but OAuth flow incomplete',
      issues: ['OAuth flow needs completion', 'Data sync not implemented']
    },
    {
      name: 'Push Notifications',
      status: 'partial',
      description: 'Infrastructure exists but delivery not implemented',
      issues: ['Push notification service integration needed']
    }
  ]

  const getStatusIcon = (status: FeatureStatus['status']) => {
    switch (status) {
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'partial':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'missing':
        return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusBadge = (status: FeatureStatus['status']) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-800">Production Ready</Badge>
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-800">Partial</Badge>
      case 'missing':
        return <Badge className="bg-red-100 text-red-800">Missing</Badge>
    }
  }

  const readyFeatures = productionFeatures.filter(f => f.status === 'ready').length
  const totalFeatures = productionFeatures.length
  const readinessPercentage = Math.round((readyFeatures / totalFeatures) * 100)

  const getHealthStatus = (health: SystemHealth) => {
    switch (health.status) {
      case 'healthy':
        return { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle2 }
      case 'warning':
        return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: AlertTriangle }
      case 'critical':
        return { color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle }
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Readiness Dashboard</h1>
          <p className="text-gray-600">Monitor system health and feature completion status</p>
        </div>
        <div className="flex items-center gap-2">
          <Progress value={readinessPercentage} className="w-32" />
          <span className="text-sm font-medium">{readinessPercentage}% Ready</span>
        </div>
      </div>

      {/* Overall Status */}
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>System Status: Production Ready</strong> - Core features are enterprise-grade and ready for deployment.
          {productionFeatures.filter(f => f.status === 'partial').length > 0 && 
            ` ${productionFeatures.filter(f => f.status === 'partial').length} features need completion for full enterprise readiness.`
          }
        </AlertDescription>
      </Alert>

      {/* System Health Metrics */}
      {metrics && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.systemHealth.uptime}%</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Response Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.systemHealth.responseTime}ms</div>
              <p className="text-xs text-muted-foreground">Average response time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.systemHealth.errorRate}%</div>
              <p className="text-xs text-muted-foreground">Last 24 hours</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Email Delivery</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.systemHealth.notificationDeliveryRate}%</div>
              <p className="text-xs text-muted-foreground">Delivery success rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Feature Status */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Completion Status</CardTitle>
          <CardDescription>
            Enterprise features and their production readiness status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {productionFeatures.map((feature, index) => (
              <div key={index} className="flex items-start justify-between p-4 border rounded-lg">
                <div className="flex items-start gap-3">
                  {getStatusIcon(feature.status)}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{feature.name}</h4>
                      {getStatusBadge(feature.status)}
                    </div>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                    {feature.issues && (
                      <ul className="text-sm text-red-600 mt-2">
                        {feature.issues.map((issue, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <span className="w-1 h-1 bg-red-600 rounded-full"></span>
                            {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage Statistics */}
      {metrics && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Registered users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Appointments</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalAppointments.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Total scheduled</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payments</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalPayments.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Processed successfully</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Next Steps for Full Enterprise Readiness</CardTitle>
          <CardDescription>
            Recommended improvements to achieve 100% production readiness
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium">Complete Treatment Plans System</p>
                <p className="text-sm text-gray-600">Implement exercise tracking and progress visualization</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium">Finalize Health Monitoring Integration</p>
                <p className="text-sm text-gray-600">Complete Fitbit OAuth flow and data synchronization</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium">Implement Push Notifications</p>
                <p className="text-sm text-gray-600">Add mobile push notification delivery service</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
