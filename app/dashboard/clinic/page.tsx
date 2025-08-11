'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { format } from 'date-fns'


export default function ClinicDashboard() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  
  // Get user and clinic data
  const currentUser = useQuery(api.users.getMyUser)
  const approvalStatus = useQuery(api.users.getUserApprovalStatus)
  const clinic = useQuery(api.clinics.getMyClinic)
  const clinicStats = useQuery(api.clinics.getClinicDashboardStats)
  const clinicRevenue = useQuery(api.clinics.getClinicRevenue)

  const recentActivity = useQuery(api.clinics.getClinicRecentActivity, { limit: 5 })
  const clinicStaff = useQuery(api.clinics.getClinicStaff)
  const pendingInvitations = useQuery(api.clinics.getClinicInvitations)
  const authRedirected = useRef(false)
  const roleRedirected = useRef(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn && !authRedirected.current) {
      authRedirected.current = true
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn])

  // Redirect if not approved clinic owner
  useEffect(() => {
    if (currentUser && approvalStatus !== undefined) {
      if (currentUser.role !== 'clinic_owner' && !roleRedirected.current) {
        roleRedirected.current = true
        router.push('/sign-in')
        return
      }
    }
  }, [currentUser, approvalStatus])

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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {clinic?.name || 'Clinic Management Dashboard'}
          </h1>
          <p className="text-muted-foreground">
            Overview of your clinic operations and performance
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </Badge>
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
        <Card>
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
              {pendingInvitations && pendingInvitations.length > 0 
                ? `+${pendingInvitations.length} pending invites`
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
              {/* Today's Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  {isDataLoading ? (
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                  ) : (
                    <div className="text-2xl font-bold text-blue-600">
                      {clinicStats?.appointmentsToday || 0}
                    </div>
                  )}
                  <div className="text-sm text-blue-800">Today&apos;s Appointments</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  {isDataLoading ? (
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                  ) : (
                    <div className="text-2xl font-bold text-green-600">
                      {Math.round((clinicStats?.appointmentsToday || 0) * (clinicStats?.completionRate || 0) / 100)}
                    </div>
                  )}
                  <div className="text-sm text-green-800">Completed Today</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  {isDataLoading ? (
                    <Skeleton className="h-8 w-8 mx-auto mb-2" />
                  ) : (
                    <div className="text-2xl font-bold text-yellow-600">
                      {clinicStats?.pendingInvitations || 0}
                    </div>
                  )}
                  <div className="text-sm text-yellow-800">Pending Invitations</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="font-medium mb-3">Recent Activity</h4>
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
                    recentActivity.map((activity: any, index: number) => {
                      const getActivityIcon = (type: string) => {
                        switch (type) {
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
                            <div className={`w-8 h-8 ${getActivityColor(activity.type)} rounded-full flex items-center justify-center`}>
                              {getActivityIcon(activity.type)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{activity.title}</p>
                              <p className="text-xs text-muted-foreground">{activity.description}</p>
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

        {/* Management Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Management Actions</CardTitle>
            <CardDescription>Quick access to key management functions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start" variant="outline">
              <Stethoscope className="mr-2 h-4 w-4" />
              Manage Physiotherapists
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Users className="mr-2 h-4 w-4" />
              View All Patients
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Calendar className="mr-2 h-4 w-4" />
              Clinic Schedule
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <DollarSign className="mr-2 h-4 w-4" />
              Financial Reports
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Clinic Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Staff Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Performance</CardTitle>
          <CardDescription>Overview of your physiotherapists&apos; performance this month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {clinicStaff === undefined ? (
              // Loading state
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <div className="flex items-center space-x-3 mb-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : clinicStaff.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No staff members yet</p>
                <p className="text-sm">Invite physiotherapists to join your clinic</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clinicStaff.map((member: any) => {
                  const initials = member.user?.firstName && member.user?.lastName 
                    ? `${member.user.firstName.charAt(0)}${member.user.lastName.charAt(0)}`
                    : member.user?.email?.charAt(0).toUpperCase() || 'S'
                  
                  return (
                    <div key={member._id} className="p-4 border rounded-lg">
                      <div className="flex items-center space-x-3 mb-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={member.user?.imageUrl} alt={`${member.user?.firstName} ${member.user?.lastName}`} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">{member.user?.firstName} {member.user?.lastName}</h3>
                          <p className="text-sm text-gray-600">{member.user?.email}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Specialization:</span>
                          <span className="font-medium">{member.specializations?.[0] || 'General'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>License:</span>
                          <span className="font-medium">{member.licenseNumber || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Bio:</span>
                          <span className="font-medium text-xs">{member.bio ? (member.bio.length > 30 ? member.bio.substring(0, 30) + '...' : member.bio) : 'No bio available'}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Status:</span>
                          <div className="flex items-center space-x-1">
                            <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                            <span className="font-medium text-green-600">Active</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Welcome Message for New Clinic Owners */}
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <Building2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-emerald-900">Welcome to Rehabify Health!</CardTitle>
              <CardDescription className="text-emerald-700">
                Your clinic account has been approved and you&apos;re ready to manage your practice
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Stethoscope className="mr-2 h-4 w-4" />
              Invite Physiotherapists
            </Button>
            <Button variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <Settings className="mr-2 h-4 w-4" />
              Complete Clinic Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 