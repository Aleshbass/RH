'use client'

import { useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { 
  Users, 
  Search,
  Filter,
  Download,
  MoreHorizontal,
  UserCheck,
  UserX,
  UserCog,
  Mail,
  Phone,
  Calendar,
  Shield,
  ShieldCheck,
  ShieldX
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface StaffMember {
  _id: string
  firstName?: string
  lastName?: string
  email: string
  role: string
  status: 'active' | 'suspended' | 'terminated'
  phoneNumber?: string
  imageUrl?: string
  joinedAt?: number
  lastActive?: number
  clinicId?: string
}

interface StaffTableProps {
  staff: StaffMember[]
  onRefresh: () => void
}

export default function StaffTable({ staff, onRefresh }: StaffTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // Mutations for staff management - using untyped to avoid deep instantiation
  const updateStaffRole = useMutation(api.clinics.updateStaffRole as any)
  const updateStaffStatus = useMutation(api.clinics.updateStaffStatus as any)
  const reassignStaff = useMutation(api.clinics.reassignStaffToClinic as any)
  // Actions
  const resendInvitation = useAction(
    api.actions.clinics.inviteClinicStaff.createClinicStaffInvitationWithNotification as any
  )

  // Filter staff based on search and filters
  const filteredStaff = staff.filter(member => {
    const matchesSearch = 
      `${member.firstName || ''} ${member.lastName || ''}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRole = roleFilter === 'all' || member.role === roleFilter
    const matchesStatus = statusFilter === 'all' || member.status === statusFilter
    
    return matchesSearch && matchesRole && matchesStatus
  })

  const handleRoleChange = async (staffId: string, newRole: string) => {
    try {
      await updateStaffRole({ staffId: staffId as any, newRole })
      toast.success('Staff role updated successfully')
      onRefresh()
    } catch (error) {
      toast.error('Failed to update staff role')
      console.error('Role update error:', error)
    }
  }

  const handleStatusChange = async (staffId: string, newStatus: 'active' | 'suspended' | 'terminated') => {
    try {
      await updateStaffStatus({ staffId: staffId as any, newStatus })
      toast.success(`Staff ${newStatus === 'active' ? 'activated' : newStatus} successfully`)
      onRefresh()
    } catch (error) {
      toast.error(`Failed to ${newStatus} staff member`)
      console.error('Status update error:', error)
    }
  }

  const handleResendInvitation = async (email: string, name?: string) => {
    try {
      await resendInvitation({
        inviteeEmail: email,
        inviteeName: name,
      })
      toast.success('Invitation resent successfully')
    } catch (error) {
      toast.error('Failed to resend invitation')
      console.error('Resend invitation error:', error)
    }
  }

  const exportStaffData = () => {
    const csvContent = [
      ['Name', 'Email', 'Role', 'Status', 'Phone', 'Joined Date'],
      ...filteredStaff.map(member => [
        `${member.firstName || ''} ${member.lastName || ''}`.trim(),
        member.email,
        member.role,
        member.status,
        member.phoneNumber || '',
        member.joinedAt ? format(new Date(member.joinedAt), 'yyyy-MM-dd') : ''
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clinic-staff-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><UserCheck className="h-3 w-3 mr-1" />Active</Badge>
      case 'suspended':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><UserX className="h-3 w-3 mr-1" />Suspended</Badge>
      case 'terminated':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><ShieldX className="h-3 w-3 mr-1" />Terminated</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'physiotherapist':
        return <Badge variant="outline"><Shield className="h-3 w-3 mr-1" />Physiotherapist</Badge>
      case 'lead_physiotherapist':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><ShieldCheck className="h-3 w-3 mr-1" />Lead Physiotherapist</Badge>
      case 'admin':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100"><UserCog className="h-3 w-3 mr-1" />Admin</Badge>
      default:
        return <Badge variant="secondary">{role}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Staff Members ({filteredStaff.length})
          </CardTitle>
          <Button onClick={exportStaffData} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
        
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search staff by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="physiotherapist">Physiotherapist</SelectItem>
              <SelectItem value="lead_physiotherapist">Lead Physiotherapist</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {filteredStaff.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No staff members found matching your criteria</p>
            </div>
          ) : (
            filteredStaff.map((member) => (
              <div key={member._id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.imageUrl} />
                    <AvatarFallback>
                      {`${member.firstName?.[0] || ''}${member.lastName?.[0] || ''}` || member.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">
                        {`${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unnamed Staff'}
                      </h3>
                      {getRoleBadge(member.role)}
                      {getStatusBadge(member.status)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </span>
                      {member.phoneNumber && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {member.phoneNumber}
                        </span>
                      )}
                      {member.joinedAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Joined {format(new Date(member.joinedAt), 'MMM dd, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    {/* Role Management */}
                    <DropdownMenuItem onClick={() => handleRoleChange(member._id, 'physiotherapist')}>
                      <Shield className="h-4 w-4 mr-2" />
                      Set as Physiotherapist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRoleChange(member._id, 'lead_physiotherapist')}>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Set as Lead Physiotherapist
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRoleChange(member._id, 'admin')}>
                      <UserCog className="h-4 w-4 mr-2" />
                      Set as Admin
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    {/* Status Management */}
                    {member.status !== 'active' && (
                      <DropdownMenuItem onClick={() => handleStatusChange(member._id, 'active')}>
                        <UserCheck className="h-4 w-4 mr-2" />
                        Activate
                      </DropdownMenuItem>
                    )}
                    {member.status === 'active' && (
                      <DropdownMenuItem onClick={() => handleStatusChange(member._id, 'suspended')}>
                        <UserX className="h-4 w-4 mr-2" />
                        Suspend
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuSeparator />
                    
                    {/* Resend Invitation */}
                    <DropdownMenuItem onClick={() => handleResendInvitation(member.email, `${member.firstName || ''} ${member.lastName || ''}`.trim())}>
                      <Mail className="h-4 w-4 mr-2" />
                      Resend Invitation
                    </DropdownMenuItem>
                    
                    {/* Terminate (with confirmation) */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <ShieldX className="h-4 w-4 mr-2" />
                          Terminate
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Terminate Staff Member</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to terminate {`${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email}? 
                            This will revoke their access to the clinic dashboard and cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleStatusChange(member._id, 'terminated')}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Terminate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
