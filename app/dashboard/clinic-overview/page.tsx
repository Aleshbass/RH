'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Type definition for staff member
interface StaffMember {
  _id: string;
  user?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  specializations?: string[];
  [key: string]: unknown;
}
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Building2, 
  Users, 
  Star,
  MapPin,
  Phone,
  Mail,
  Activity,
  AlertCircle
} from '@/components/icons'
import { format } from 'date-fns'

export default function ClinicOverviewPage() {
  const user = useQuery(api.users.getMyUser, {})
  const currentUserWithProfile = useQuery(api.queries.getCurrentUser, {})
  const clinicStats = useQuery(api.clinics.getClinicDashboardStats, {})
  const clinicStaff = useQuery(api.clinics.getClinicStaff, {})

  // Check if user is actually clinic-based
  const isClinicBased = user?.role === 'physiotherapist' && currentUserWithProfile?.clinicId
  const clinicInfo = currentUserWithProfile?.clinic

  // Loading state
  if (user === undefined || currentUserWithProfile === undefined) {
    return <ClinicOverviewSkeleton />
  }

  // Redirect if not clinic-based physiotherapist
  if (!isClinicBased) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This page is only available for clinic-based physiotherapists.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {clinicInfo?.name || 'Clinic Overview'}
        </h1>
        <p className="text-gray-600">Here&apos;s an overview of your clinic&apos;s performance</p>
      </div>

      {/* Clinic Information */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Clinic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {clinicInfo ? (
              <>
                <div>
                  <h3 className="font-semibold">{clinicInfo.name}</h3>
                  <p className="text-sm text-muted-foreground">Clinic Name</p>
                </div>
                {clinicInfo.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm">{clinicInfo.address}</p>
                      <p className="text-xs text-muted-foreground">Address</p>
                    </div>
                  </div>
                )}
                {clinicInfo.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{clinicInfo.contactPhone}</p>
                      <p className="text-xs text-muted-foreground">Phone</p>
                    </div>
                  </div>
                )}
                {clinicInfo.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{clinicInfo.contactEmail}</p>
                      <p className="text-xs text-muted-foreground">Email</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Loading clinic information...</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Clinic Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clinicStats ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{clinicStats.totalPatients}</div>
                  <p className="text-xs text-muted-foreground">Total Patients</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{clinicStats.activeStaff}</div>
                  <p className="text-xs text-muted-foreground">Active Staff</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{clinicStats.appointmentsToday}</div>
                  <p className="text-xs text-muted-foreground">Today&apos;s Appointments</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{clinicStats.completionRate}%</div>
                  <p className="text-xs text-muted-foreground">Completion Rate</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            Your colleagues at {clinicInfo?.name || 'the clinic'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clinicStaff ? (
            clinicStaff.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clinicStaff.map((member: StaffMember) => (
                  <div key={member._id} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {member.user?.firstName} {member.user?.lastName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {member.specializations?.[0] || 'Physiotherapist'}
                      </p>
                      {member.user?._id && user && (member.user._id === (user as unknown as { _id?: string })?._id) && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          You
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No team members found
              </p>
            )
          ) : (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Your Role & Responsibilities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Your Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium">Position</h4>
              <p className="text-sm text-muted-foreground">
                Physiotherapist at {clinicInfo?.name || 'this clinic'}
              </p>
            </div>
            <div>
              <h4 className="font-medium">Specializations</h4>
              <div className="flex flex-wrap gap-2 mt-2">
                {currentUserWithProfile?.specializations?.map((spec: string, index: number) => (
                  <Badge key={index} variant="outline">
                    {spec}
                  </Badge>
                )) || (
                  <p className="text-sm text-muted-foreground">
                    No specializations listed
                  </p>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-medium">Member Since</h4>
              <p className="text-sm text-muted-foreground">
                {currentUserWithProfile?._creationTime 
                  ? format(new Date(currentUserWithProfile._creationTime), 'MMMM d, yyyy')
                  : 'Unknown'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ClinicOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="text-center">
                  <Skeleton className="h-8 w-16 mx-auto mb-2" />
                  <Skeleton className="h-3 w-20 mx-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 