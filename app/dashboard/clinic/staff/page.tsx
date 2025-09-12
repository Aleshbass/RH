'use client'

// Removed unused useState import
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Users, 
  Mail, 
  Activity,
  Shield,
  Clock,
  TrendingUp,
  BarChart3,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import AddPhysiotherapistModal from '@/components/dashboard/clinic/AddPhysiotherapistModal'
import StaffTable from '@/components/clinic/staff/StaffTable'
import { toast } from 'sonner'
import { useEffect, useState } from 'react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'



// Type definitions for staff and invitations
interface StaffMember {
  _id: string;
  status: string;
  role: string;
  user?: {
    onboarded: boolean;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  [key: string]: unknown;
}

interface Invitation {
  _id: string;
  inviteeName?: string;
  inviteeEmail: string;
  [key: string]: unknown;
}

export default function StaffManagementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [inviteOpen, setInviteOpen] = useState(false)

  // Queries
  const clinicStaffQuery = useQuery(api.clinics.getClinicStaff)
  const pendingInvitationsQuery = useQuery(api.clinics.getClinicInvitations)
  const staffMetricsQuery = useQuery(api.clinics.getStaffMetrics)
  
  // Actions
  const resendStaffInvitation = useAction(
    api.actions.clinics.resendClinicStaffInvitation
  )
  
  const clinicStaff = clinicStaffQuery
  const pendingInvitations = pendingInvitationsQuery
  const staffMetrics = staffMetricsQuery

  const handleRefresh = () => {
    // Force refresh by reloading the page
    window.location.reload()
  }

  // Open invite modal via deep link: ?action=invite
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'invite') {
      setInviteOpen(true)
      // Clean the URL to avoid re-triggering on refresh
      const params = new URLSearchParams(searchParams.toString())
      params.delete('action')
      const newQuery = params.toString()
      router.replace(newQuery ? `${pathname}?${newQuery}` : pathname, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pathname])

  

  if (clinicStaff === undefined || pendingInvitations === undefined || staffMetrics === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
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
            <p className="text-gray-600">Comprehensive staff management and analytics for your clinic</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/clinic/analytics">
              <Button variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </Button>
            </Link>
            <Link href="/dashboard/clinic/audit">
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Audit Log
              </Button>
            </Link>
            <AddPhysiotherapistModal 
              open={inviteOpen}
              onOpenChange={setInviteOpen}
              onSuccess={handleRefresh}
            />
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clinicStaff?.length || 0}</div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">Active: {clinicStaff?.filter((staff: StaffMember) => staff.status === 'active').length || 0}</p>
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{staffMetrics?.newThisMonth || 0} this month
                </Badge>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Staff Utilization</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{staffMetrics?.utilization?.toFixed(1) || 0}%</div>
              <p className="text-xs text-muted-foreground">Average workload efficiency</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clinicStaff?.filter((staff: StaffMember) => staff.user?.onboarded)?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Currently online</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Role Distribution</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clinicStaff?.filter((staff: StaffMember) => staff.role === 'physiotherapist').length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Physiotherapists</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Invitations */}
        {pendingInvitations && pendingInvitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Invitations ({pendingInvitations.length})
              </CardTitle>
              <CardDescription>Staff invitations awaiting response</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvitations.map((invitation: Invitation) => (
                  <div key={invitation._id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="bg-orange-100 p-2 rounded-full">
                        <Mail className="h-4 w-4 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium">{invitation.inviteeName || 'Unnamed Invitee'}</p>
                        <p className="text-sm text-gray-600">{invitation.inviteeEmail}</p>
                        <p className="text-xs text-gray-500">
                          Role: <span className="capitalize">{(invitation.role as string)?.replace('_', ' ')}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                      <p className="text-sm text-gray-500">
                        Sent {format(new Date(invitation._creationTime as number), 'MMM d')}
                      </p>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={async () => {
                          try {
                            await resendStaffInvitation({
                              inviteeEmail: invitation.inviteeEmail,
                              inviteeName: invitation.inviteeName,
                            })
                            toast.success('Invitation resent')
                          } catch (error) {
                            toast.error('Failed to resend invitation')
                            console.error('Resend invitation error:', error)
                          }
                        }}
                      >
                        Resend
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Staff Management Table */}
        <StaffTable 
          staff={clinicStaff || []} 
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  )
}
