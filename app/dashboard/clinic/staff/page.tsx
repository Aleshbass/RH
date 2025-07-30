'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Users, 
  UserPlus, 
  Mail, 
  Phone,
  Calendar,
  Activity,
  MoreHorizontal
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function StaffManagementPage() {
  const clinicStaff = useQuery(api.clinics.getClinicStaff)
  const pendingInvitations = useQuery(api.clinics.getClinicInvitations)

  if (clinicStaff === undefined || pendingInvitations === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Staff Management</h1>
            <p className="text-gray-600">Manage your clinic&apos;s physiotherapists and staff members</p>
          </div>
          <Link href="/dashboard/clinic/staff/invite">
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Staff
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clinicStaff?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Active staff members</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invitations</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingInvitations?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting response</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clinicStaff?.filter(staff => staff.user?.isActive)?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Currently online</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Invitations */}
        {pendingInvitations && pendingInvitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>Staff invitations awaiting response</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvitations.map((invitation) => (
                  <div key={invitation._id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarFallback>
                          {invitation.patientName?.split(' ').map(n => n[0]).join('') || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{invitation.patientName}</p>
                        <p className="text-sm text-gray-600">{invitation.patientEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">Pending</Badge>
                      <p className="text-sm text-gray-500">
                        Sent {format(new Date(invitation._creationTime), 'MMM d')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Staff */}
        <Card>
          <CardHeader>
            <CardTitle>Active Staff Members</CardTitle>
            <CardDescription>Your clinic&apos;s physiotherapists and staff</CardDescription>
          </CardHeader>
          <CardContent>
            {clinicStaff && clinicStaff.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clinicStaff.map((staff) => (
                  <Card key={staff._id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-3">
                        <Avatar>
                          <AvatarImage src={staff.user?.imageUrl} />
                          <AvatarFallback>
                            {staff.user?.firstName?.[0]}{staff.user?.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="font-semibold">
                            {staff.user?.firstName} {staff.user?.lastName}
                          </h3>
                          <p className="text-sm text-gray-600 capitalize">{staff.role}</p>
                        </div>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="h-3 w-3 mr-2" />
                          {staff.user?.email}
                        </div>
                        {staff.user?.phone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="h-3 w-3 mr-2" />
                            {staff.user.phone}
                          </div>
                        )}
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-3 w-3 mr-2" />
                          Joined {format(new Date(staff._creationTime), 'MMM yyyy')}
                        </div>
                        <div className="flex items-center justify-between pt-2">
                          <Badge variant={staff.user?.isActive ? "default" : "secondary"}>
                            {staff.user?.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <div className="flex space-x-1">
                            <Button variant="outline" size="sm">View</Button>
                            <Button variant="outline" size="sm">Edit</Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No staff members yet</h3>
                <p className="text-gray-600 mb-4">
                  Start building your team by inviting physiotherapists to join your clinic.
                </p>
                <Link href="/dashboard/clinic/staff/invite">
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite Your First Staff Member
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
