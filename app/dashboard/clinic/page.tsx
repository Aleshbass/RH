'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Type definitions for activity and staff
interface ActivityItem {
  type: string;
  title?: string;
  description: string;
  timestamp: number;
  status?: string;
  [key: string]: unknown;
}

// Minimal staff member shape for UI rendering
interface StaffMember {
  _id: string;
  user?: {
    imageUrl?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}


import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Users, 
  Calendar, 
  TrendingUp, 
  CheckCircle2,
  UserPlus,
  Building2,
  Loader2,
  DollarSign,
  Stethoscope,
  Settings,
  AlertCircle,
  Activity
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { useQueryUntyped } from '@/lib/convexUntyped'


export default function ClinicDashboard() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  
  // Get user and clinic data - use untyped queries to avoid deep instantiation and explicit any casts
  const currentUser = useQueryUntyped(api.users.getMyUser)
  const approvalStatus = useQueryUntyped(api.users.getUserApprovalStatus)
  const clinic = useQueryUntyped(api.clinics.getMyClinic)
  const clinicStats = useQuery(api.clinics.getClinicDashboardStats)
  const clinicRevenue = useQuery(api.clinics.getClinicRevenue)

  const recentActivity = useQuery(api.clinics.getClinicActivity, { limit: 5 })
  const clinicStaff = useQuery(api.clinics.getClinicStaff)
  const pendingInvitations = useQuery(api.clinics.getClinicInvitations)
  const authRedirected = useRef(false)
  const roleRedirected = useRef(false)
  const nowRef = useRef(Date.now())
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)

  const userId = currentUser?._id

  // Load welcome dismissal state from localStorage
  useEffect(() => {
    if (!userId) return
    try {
      const key = `clinic_welcome_dismissed_${userId}`
      const val = window.localStorage.getItem(key)
      setWelcomeDismissed(val === '1')
    } catch {
      // ignore storage errors
    }
  }, [userId])

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn && !authRedirected.current) {
      authRedirected.current = true
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  // Redirect if not approved clinic owner
  useEffect(() => {
    if (currentUser && approvalStatus !== undefined) {
      if (currentUser.role !== 'clinic_owner' && !roleRedirected.current) {
        roleRedirected.current = true
        router.push('/sign-in')
        return
      }
    }
  }, [currentUser, approvalStatus, router])

  // Loading state
  if (!isLoaded || currentUser === undefined || approvalStatus === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading your clinic dashboard...</p>
        </div>
      </div>
    )
  }

  // Show error if no clinic found
  if (clinic === null) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No clinic found. Please complete your clinic setup first.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Loading state for data
  const isDataLoading = clinic === undefined || clinicStats === undefined || clinicRevenue === undefined

  // Determine if we should show the Welcome card
  const isRecentlyApproved = Boolean(
    approvalStatus &&
    approvalStatus.status === 'approved' &&
    typeof approvalStatus.reviewedAt === 'number' &&
    nowRef.current - approvalStatus.reviewedAt <= 7 * 24 * 60 * 60 * 1000
  )

  const shouldShowWelcome = Boolean(isRecentlyApproved && currentUser?.onboarded && !welcomeDismissed)

  const pendingInvitesCount = Array.isArray(pendingInvitations)
    ? pendingInvitations.filter((inv: { status: string; isExpired?: boolean }) => inv.status === "pending" && !inv.isExpired).length
    : 0;

  const handleDismissWelcome = () => {
    setWelcomeDismissed(true)
    if (!userId) return
    try {
      window.localStorage.setItem(`clinic_welcome_dismissed_${userId}`, '1')
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#005b57]"> {/* 30% - Core Green */}
            {clinic?.name || 'Clinic Management Dashboard'}
          </h1>
          <p className="text-gray-600">
            Overview of your clinic operations and performance
          </p>
        </div>
        <div className="flex items-center gap-3 sm:self-auto">
          {approvalStatus?.status === 'approved' ? (
            <Badge className="bg-[#D4FAE8] text-[#005b57] border-0"> {/* 10% - Mint Green accent */}
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Approved
            </Badge>
          ) : approvalStatus?.status === 'pending_review' ? (
            <Badge className="bg-[#FFE682] text-[#005b57] border-0"> {/* 10% - Fairy Tale accent */}
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Pending approval
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
              Rejected
            </Badge>
          )}
          <Avatar className="h-10 w-10">
            <AvatarImage src={currentUser?.imageUrl} />
            <AvatarFallback>
              {currentUser?.firstName?.charAt(0) || currentUser?.email?.charAt(0) || 'C'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-[#005b57]"> {/* 30% - Core Green accent border */}
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <Skeleton className="h-8 w-16 mb-2" />
            ) : (
              <div className="text-2xl font-bold">{clinicStats?.totalPatients || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              Across all physiotherapists
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <Skeleton className="h-8 w-16 mb-2" />
            ) : (
              <div className="text-2xl font-bold">{clinicStats?.activeStaff || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {pendingInvitesCount > 0 
                ? `+${pendingInvitesCount} pending invites`
                : 'All approved and active'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <Skeleton className="h-8 w-20 mb-2" />
            ) : (
              <div className="text-2xl font-bold">
                ₦{clinicRevenue?.thisMonth?.toLocaleString() || '0'}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {clinicRevenue?.growth !== undefined ? (
                clinicRevenue.growth >= 0 ? (
                  <span className="text-green-600">+{clinicRevenue.growth}% from last month</span>
                ) : (
                  <span className="text-red-600">{clinicRevenue.growth}% from last month</span>
                )
              ) : (
                'This month'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <Skeleton className="h-8 w-16 mb-2" />
            ) : (
              <div className="text-2xl font-bold">{clinicStats?.completionRate || 0}%</div>
            )}
            <p className="text-xs text-muted-foreground">
              Appointment completion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Clinic Overview */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Clinic Overview</CardTitle>
            <CardDescription>Your clinic&apos;s daily operations and key metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Today&apos;s Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-[#F0F8F7] rounded-lg"> {/* Soft green background */}
                  {isDataLoading ? (
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                  ) : (
                    <div className="text-2xl font-bold text-[#005b57]"> {/* 30% - Core Green */}
                      {clinicStaff?.map((member: StaffMember) => (
                        <div key={member._id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.user?.imageUrl} />
                            <AvatarFallback>
                              {member.user?.firstName?.[0] || member.user?.email?.[0] || 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {member.user?.firstName || ''} {member.user?.lastName || ''}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member.user?.email || ''}
                            </p>
                          </div>
                        </div>
                      </div>
                      ))}
                    </div>
                  )}
                  <div className="text-sm text-[#005b57]">Today&apos;s Appointments</div> {/* 30% - Core Green */}
                </div>
                <div className="text-center p-4 bg-[#D4FAE8] rounded-lg"> {/* 10% - Mint Green accent */}
                  {isDataLoading ? (
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                  ) : (
                    <div className="text-2xl font-bold text-[#005b57]"> {/* 30% - Core Green */}
                      {Math.round((clinicStats?.appointmentsToday || 0) * (clinicStats?.completionRate || 0) / 100)}
                    </div>
                  )}
                  <div className="text-sm text-[#005b57]">Completed Today</div> {/* 30% - Core Green */}
                </div>
                <div className="text-center p-4 bg-[#FFE682] rounded-lg"> {/* 10% - Fairy Tale accent */}
                  {isDataLoading ? (
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                  ) : (
                    <div className="text-2xl font-bold text-[#005b57]"> {/* 30% - Core Green */}
                      {clinicStats?.pendingInvitations || 0}
                    </div>
                  )}
                  <div className="text-sm text-[#005b57]">Pending Invitations</div> {/* 30% - Core Green */}
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="font-medium mb-3 text-[#005b57]">Recent Activity</h4> {/* 30% - Core Green */}
                <div className="space-y-3">
                  {recentActivity === undefined ? (
                    // Loading state
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Skeleton className="w-8 h-8 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))
                  ) : recentActivity.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No recent activity</p>
                    </div>
                  ) : (
                    recentActivity.map((activity: ActivityItem, index: number) => {
                      const getActivityIcon = (type: string) => {
                        switch (type) {
                          case 'appointment':
                            return <Calendar className="h-4 w-4 text-purple-600" />
                          case 'invitation':
                            return <UserPlus className="h-4 w-4 text-indigo-600" />
                          case 'patient_registration':
                            return <Users className="h-4 w-4 text-blue-600" />
                          case 'patient_registered':
                            return <UserPlus className="h-4 w-4 text-blue-600" />
                          case 'appointment_completed':
                            return <CheckCircle2 className="h-4 w-4 text-green-600" />
                          case 'schedule_updated':
                            return <Calendar className="h-4 w-4 text-purple-600" />
                          case 'staff_joined':
                            return <Stethoscope className="h-4 w-4 text-indigo-600" />
                          default:
                            return <Activity className="h-4 w-4 text-gray-600" />
                        }
                      }

                      const getActivityColor = (type: string) => {
                        switch (type) {
                          case 'appointment':
                            return 'bg-purple-100'
                          case 'invitation':
                            return 'bg-yellow-100'
                          case 'patient_registration':
                            return 'bg-blue-100'
                          case 'patient_registered':
                            return 'bg-blue-100'
                          case 'appointment_completed':
                            return 'bg-green-100'
                          case 'schedule_updated':
                            return 'bg-purple-100'
                          case 'staff_joined':
                            return 'bg-indigo-100'
                          default:
                            return 'bg-gray-100'
                        }
                      }

                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getActivityColor(activity.type)}`}>
                              {getActivityIcon(activity.type)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{activity.title || 'Activity'}</p>
                              <p className="text-xs text-muted-foreground">{activity.description || ''}</p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {activity.timestamp ? format(new Date(activity.timestamp), 'MMM d, h:mm a') : 'Recently'}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column */}
        <div className="space-y-6">
          {shouldShowWelcome && (
            <Card>
              <CardHeader className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-[#D4FAE8] rounded-full flex items-center justify-center"> {/* 10% - Mint Green accent */}
                  <Building2 className="h-5 w-5 text-[#005b57]" /> {/* 30% - Core Green */}
                </div>
                <div>
                  <CardTitle className="text-[#005b57]">Welcome to Rehabify Health!</CardTitle> {/* 30% - Core Green */}
                  <CardDescription className="text-[#005b57]/80"> {/* 30% - Core Green with opacity */}
                    Your clinic account has been approved and you&apos;re ready to manage your practice
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <Button className="bg-[#005b57] hover:bg-[#004a47]" onClick={() => router.push('/dashboard/clinic/staff?action=invite')}> {/* 30% - Core Green */}
                    <Stethoscope className="mr-2 h-4 w-4" />
                    Invite Physiotherapists
                  </Button>
                  <Button variant="outline" className="border-[#005b57] text-[#005b57] hover:bg-[#F0F8F7]" onClick={() => router.push('/dashboard/clinic/settings')}> {/* 30% - Core Green */}
                    <Settings className="mr-2 h-4 w-4" />
                    Complete Clinic Setup
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[#005b57] sm:ml-auto" onClick={handleDismissWelcome}> {/* 30% - Core Green */}
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Management Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Management Actions</CardTitle>
              <CardDescription>Quick access to key management functions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" variant="outline" onClick={() => router.push('/dashboard/clinic/staff')}>
                <Stethoscope className="mr-2 h-4 w-4" />
                Manage Physiotherapists
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => router.push('/dashboard/clinic/patients')}>
                <Users className="mr-2 h-4 w-4" />
                View All Patients
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => router.push('/dashboard/clinic/appointments')}>
                <Calendar className="mr-2 h-4 w-4" />
                Clinic Schedule
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => router.push('/dashboard/clinic/reports')}>
                <DollarSign className="mr-2 h-4 w-4" />
                Financial Reports
              </Button>
              <Button className="w-full justify-start" variant="outline" onClick={() => router.push('/dashboard/clinic/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Clinic Settings
              </Button>
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Recently active staff</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {clinicStaff === undefined ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              ) : clinicStaff.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff yet</p>
              ) : (
                clinicStaff.slice(0, 3).map((member: StaffMember) => (
                  <div key={member._id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.user?.imageUrl} />
                        <AvatarFallback>
                          {member.user?.firstName?.[0] || member.user?.email?.[0] || 'S'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.user?.firstName || ''} {member.user?.lastName || ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.user?.email || ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <Button variant="outline" className="w-full mt-2 justify-start" onClick={() => router.push('/dashboard/clinic/staff')}>
                <Stethoscope className="mr-2 h-4 w-4" />
                Manage Team
              </Button>
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>Invites awaiting acceptance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvitations === undefined ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))
              ) : pendingInvitesCount === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invitations</p>
              ) : (
                pendingInvitations
                  .filter((inv: { status: string; isExpired?: boolean; _id: string; inviteeEmail: string; role: string; expiresAt: number }) => inv.status === 'pending' && !inv.isExpired)
                  .slice(0, 5)
                  .map((inv: { _id: string; inviteeEmail: string; role: string; expiresAt: number }) => (
                    <div key={inv._id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{inv.inviteeEmail}</p>
                        <p className="text-xs text-muted-foreground">{inv.role}</p>
                      </div>
                      <div className="text-xs text-muted-foreground sm:text-right">
                        Expires {formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}
                      </div>
                    </div>
                  ))
              )}
              <Button variant="outline" className="w-full mt-2 justify-start" onClick={() => router.push('/dashboard/clinic/staff?action=invite')}>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Staff
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
 