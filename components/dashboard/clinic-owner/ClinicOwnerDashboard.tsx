'use client'

// Type definitions
type DashboardStats = {
  totalPatients?: number;
  activeStaff?: number;
  appointmentsToday?: number;
  thisMonthAppointments?: number;
  completionRate?: number;
  pendingInvitations?: number;
};

type Revenue = {
  thisMonth?: number;
  lastMonth?: number;
  pendingPayments?: number;
  growth?: number;
};

type PerformanceMetrics = {
  averageRating?: number;
  totalReviews?: number;
  patientRetentionRate?: number;
  staffUtilization?: number;
  averageSessionsPerPatient?: number;
};

type ActivityItem = {
  type: string;
  title: string;
  description: string;
  timestamp: string;
};

// Clinic data types
type ClinicData = {
  _id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
  physiotherapistCount?: number;
};

type UserData = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type StaffMember = {
  _id: string;
  userId: string;
  _creationTime: number;
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
};

type InvitationData = {
  _id: string;
  inviteeEmail: string;
  role: string;
  code: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  clinicOwnerId: string;
};

import { 
  useMyUser, 
  useMyClinic, 
  useClinicInvitations, 
  useClinicStaff,
  useClinicDashboardStats,
  useClinicRevenue,
  useClinicPerformanceMetrics,
  useClinicRecentActivity
} from '@/hooks/useDashboardData'
import { useClinicStore } from '@/stores/clinicStore'
import { useDashboardStore } from '@/stores/dashboardStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Building2, 
  Users, 
  Calendar, 
  DollarSign, 
  UserPlus, 
  Settings, 
  FileText,
  BarChart3,
  Star,
  TrendingUp,
  Activity,
  XCircle,
  AlertTriangle,
  TrendingDown
} from 'lucide-react'
import { format } from 'date-fns'
import React from 'react'
import { StaffManagement } from './StaffManagement'
import type { Clinic as ClinicStore, StaffMember as ClinicStaff, ClinicInvitation as ClinicInvitationStore } from '@/stores/clinicStore'
import { Id } from '@/convex/_generated/dataModel'

export function ClinicOwnerDashboard() {
  // Use dashboard store for UI state
  const { activeTab, setActiveTab } = useDashboardStore()
  
  // Use enhanced hooks for data
  const { data: user, isLoading: userLoading, error: userError } = useMyUser()
  const { data: clinic, isLoading: clinicLoading, error: clinicError } = useMyClinic()
  const { data: invitations, isLoading: invitationsLoading } = useClinicInvitations()
  const { data: staff, isLoading: staffLoading } = useClinicStaff()
  
  // Use new clinic-specific hooks
  const { data: dashboardStats, isLoading: statsLoading } = useClinicDashboardStats()
  const { data: revenue, isLoading: revenueLoading } = useClinicRevenue()
  const { data: performanceMetrics, isLoading: metricsLoading } = useClinicPerformanceMetrics()
  const { data: recentActivity, isLoading: activityLoading } = useClinicRecentActivity(10)
  
  // Use clinic store for clinic-specific state
  const { 
    setCurrentClinic,
    setStaff,
    setInvitations 
  } = useClinicStore()
  
  // Update stores when data changes
  React.useEffect(() => {
    if (clinic && user) {
      // Transform clinic data to match store type
      const clinicData = clinic as ClinicData;
      const userData = user as UserData;
      const transformedClinic: ClinicStore = {
        _id: clinicData._id as unknown as Id<'clinics'>,
        name: clinicData.name,
        address: clinicData.address,
        phoneNumber: clinicData.contactPhone,
        email: clinicData.contactEmail,
        ownerId: userData._id as unknown as Id<'users'>,
      }
      setCurrentClinic(transformedClinic)
    }
  }, [clinic, user, setCurrentClinic])
  
  React.useEffect(() => {
    if (staff) {
      // Transform staff data to match store type
      const staffData = staff as StaffMember[];
      const transformedStaff: ClinicStaff[] = staffData.map((member) => ({
        _id: member.userId as unknown as Id<'users'>,
        firstName: member.user?.firstName,
        lastName: member.user?.lastName,
        email: member.user?.email,
        role: 'physiotherapist',
        profileId: member._id,
        joinedAt: member._creationTime,
        status: 'active',
      }))
      setStaff(transformedStaff)
    }
  }, [staff, setStaff])
  
  React.useEffect(() => {
    if (invitations) {
      // Transform invitations data to match store type
      const invitationData = invitations as InvitationData[];
      const transformedInvitations: ClinicInvitationStore[] = invitationData.map((invitation) => ({
        _id: invitation._id as unknown as Id<'clinicStaffInvitations'>,
        email: invitation.inviteeEmail,
        role: invitation.role,
        invitationCode: invitation.code,
        status: invitation.status as ClinicInvitationStore['status'],
        invitedAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        invitedBy: invitation.clinicOwnerId as unknown as Id<'users'>,
      }))
      setInvitations(transformedInvitations)
    }
  }, [invitations, setInvitations])

  // Error states
  if (userError || clinicError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <CardTitle>Error Loading Dashboard</CardTitle>
            <CardDescription>
              {userError?.message || clinicError?.message || 'Please try refreshing the page'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (userLoading || clinicLoading || staffLoading || invitationsLoading || statsLoading) {
    return <ClinicOwnerDashboardSkeleton />
  }

  if (!clinic) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
            <CardTitle>No Clinic Found</CardTitle>
            <CardDescription>
              You don&apos;t have a clinic set up yet. Please complete your clinic setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">
              Set Up Clinic
          </Button>
          </CardContent>
        </Card>
        </div>
    )
  }

  interface ClinicInvitation {
  _id: string;
  inviteeEmail: string;
  role: string;
  code: string;
  status: string;
  createdAt: number;
  expiresAt?: number;
  clinicOwnerId: string;
}

interface MinimalClinic {
  name?: string;
}

const pendingInvitations = (invitations as ClinicInvitation[])?.filter((inv: ClinicInvitation) => inv.status === 'pending') || []

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {(clinic as MinimalClinic)?.name || 'Your Clinic'}
          </h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Clinic Management Dashboard
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Staff
          </Button>
        </div>
      </div>

      {/* Pending Invitations Alert */}
      {pendingInvitations.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            You have {pendingInvitations.length} pending staff invitation{pendingInvitations.length === 1 ? '' : 's'}.
            <Button 
              variant="link" 
              className="p-0 h-auto text-yellow-800 underline ml-1"
              onClick={() => setActiveTab('staff')}
            >
              View invitations
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : (dashboardStats as DashboardStats)?.totalPatients || 0}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-600" />
              Active across all staff
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : (dashboardStats as DashboardStats)?.activeStaff || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Physiotherapists
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : (dashboardStats as DashboardStats)?.appointmentsToday || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {(dashboardStats as DashboardStats)?.thisMonthAppointments || 0} this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-16" /> : `${(dashboardStats as DashboardStats)?.completionRate || 0}%`}
            </div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Revenue Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-3xl font-bold">
                    {formatCurrency((revenue as Revenue)?.thisMonth || 0)}
                  </div>
                  <p className="text-sm text-muted-foreground">This month</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    {((revenue as Revenue)?.growth || 0) >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`font-medium ${((revenue as Revenue)?.growth || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Math.abs((revenue as Revenue)?.growth || 0)}%
                    </span>
                    <span className="text-muted-foreground">vs last month</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <div className="text-lg font-semibold">
                      {formatCurrency((revenue as Revenue)?.lastMonth || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Last month</p>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">
                      {formatCurrency((revenue as Revenue)?.pendingPayments || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">Pending payments</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    {(performanceMetrics as PerformanceMetrics)?.averageRating || 0}
                    <Star className="h-5 w-5 text-yellow-500 fill-current" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {(performanceMetrics as PerformanceMetrics)?.totalReviews || 0} reviews
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Patient Retention</span>
                    <span className="font-medium">{(performanceMetrics as PerformanceMetrics)?.patientRetentionRate || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Staff Utilization</span>
                    <span className="font-medium">{(performanceMetrics as PerformanceMetrics)?.staffUtilization || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Sessions/Patient</span>
                    <span className="font-medium">{(performanceMetrics as PerformanceMetrics)?.averageSessionsPerPatient || 0}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="staff">Staff Management</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity && (recentActivity as ActivityItem[]).length > 0 ? (
                <div className="space-y-4">
                  {(recentActivity as ActivityItem[]).map((activity: ActivityItem, index: number) => (
                    <div key={index} className="flex items-center gap-4 p-3 rounded-lg border">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        {activity.type === 'appointment' && <Calendar className="h-5 w-5 text-blue-600" />}
                        {activity.type === 'session' && <FileText className="h-5 w-5 text-green-600" />}
                        {activity.type === 'invitation' && <UserPlus className="h-5 w-5 text-purple-600" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {activity.type === 'appointment' && 'New appointment scheduled'}
                          {activity.type === 'session' && 'Session completed'}
                          {activity.type === 'invitation' && 'Patient invitation sent'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.timestamp), 'MMM d, yyyy at h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <StaffManagement />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Patient Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Total Patients</span>
                    <span className="font-bold">{(dashboardStats as DashboardStats | undefined)?.totalPatients || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Retention Rate</span>
                    <span className="font-bold">{(performanceMetrics as PerformanceMetrics | undefined)?.patientRetentionRate || 0}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Avg Sessions per Patient</span>
                    <span className="font-bold">{(performanceMetrics as PerformanceMetrics | undefined)?.averageSessionsPerPatient || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Staff Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Active Staff</span>
                    <span className="font-bold">{(dashboardStats as DashboardStats | undefined)?.activeStaff || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Utilization Rate</span>
                    <span className="font-bold">{(performanceMetrics as PerformanceMetrics | undefined)?.staffUtilization || 0}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Pending Invitations</span>
                    <span className="font-bold">{(dashboardStats as DashboardStats | undefined)?.pendingInvitations || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Clinic Settings</CardTitle>
              <CardDescription>
                Manage your clinic information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Clinic Name</label>
                    <p className="text-sm text-muted-foreground">{(clinic as ClinicData).name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Location</label>
                    <p className="text-sm text-muted-foreground">
                      {(clinic as ClinicData).city ? `${(clinic as ClinicData).city}, ${(clinic as ClinicData).country}` : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Contact Email</label>
                    <p className="text-sm text-muted-foreground">{(clinic as ClinicData).contactEmail || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Contact Phone</label>
                    <p className="text-sm text-muted-foreground">{(clinic as ClinicData).contactPhone || 'Not set'}</p>
                  </div>
                </div>
                <div className="pt-4">
                  <Button>
                    <Settings className="mr-2 h-4 w-4" />
                    Edit Clinic Settings
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ClinicOwnerDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Metrics Skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-0 pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
      <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
    </div>
  )
} 