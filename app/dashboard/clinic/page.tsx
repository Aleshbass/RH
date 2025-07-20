'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Star
} from 'lucide-react'


export default function ClinicDashboard() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  
  const currentUser = useQuery(api.users.getMyUser)
  const approvalStatus = useQuery(api.users.getUserApprovalStatus)
  
  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  // Redirect if not approved clinic owner
  useEffect(() => {
    if (currentUser && approvalStatus !== undefined) {
      if (currentUser.role !== 'clinic_owner') {
        router.push('/sign-in')
        return
      }
      
      // Note: If not approved, we should show the pending approval page instead of redirecting
      // The DashboardRouter already handles this, so we can remove this redirect
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

  // If we get here, user is an approved clinic owner

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Clinic Management Dashboard
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
            <div className="text-2xl font-bold">157</div>
            <p className="text-xs text-muted-foreground">
              +12 this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Physiotherapists</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">6</div>
            <p className="text-xs text-muted-foreground">
              All approved and active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$24,540</div>
            <p className="text-xs text-muted-foreground">
              +18% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Appointment Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94%</div>
            <p className="text-xs text-muted-foreground">
              Booking efficiency
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
                  <div className="text-2xl font-bold text-blue-600">32</div>
                  <div className="text-sm text-blue-800">Today&apos;s Appointments</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">28</div>
                  <div className="text-sm text-green-800">Completed Sessions</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">4</div>
                  <div className="text-sm text-yellow-800">Pending Reviews</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="font-medium mb-3">Recent Activity</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <UserPlus className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">New patient registered</p>
                        <p className="text-xs text-muted-foreground">Jennifer Smith - Shoulder therapy</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">10 min ago</div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Treatment completed</p>
                        <p className="text-xs text-muted-foreground">Dr. Johnson finished session with Mark Davis</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">1 hr ago</div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Schedule updated</p>
                        <p className="text-xs text-muted-foreground">Dr. Martinez added 3 new appointment slots</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">2 hrs ago</div>
                  </div>
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
            {/* Staff member cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center space-x-3 mb-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>DR</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">Dr. Rodriguez</p>
                    <p className="text-xs text-muted-foreground">Senior Physiotherapist</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Patients this month:</span>
                    <span className="font-medium">42</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Success rate:</span>
                    <span className="font-medium text-green-600">96%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rating:</span>
                    <div className="flex items-center">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium ml-1">4.9</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="flex items-center space-x-3 mb-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>SM</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">Dr. Martinez</p>
                    <p className="text-xs text-muted-foreground">Sports Physiotherapist</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Patients this month:</span>
                    <span className="font-medium">38</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Success rate:</span>
                    <span className="font-medium text-green-600">94%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rating:</span>
                    <div className="flex items-center">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium ml-1">4.8</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <div className="flex items-center space-x-3 mb-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>LJ</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">Dr. Johnson</p>
                    <p className="text-xs text-muted-foreground">Rehabilitation Specialist</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Patients this month:</span>
                    <span className="font-medium">35</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Success rate:</span>
                    <span className="font-medium text-green-600">92%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rating:</span>
                    <div className="flex items-center">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium ml-1">4.7</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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