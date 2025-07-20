'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DataTable } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Users, 
  Shield, 
  MoreHorizontal,
  UserCog,
  Crown,
  Stethoscope,
  Building2,
  User
} from 'lucide-react'
import { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { toast } from 'sonner'

type UserRole = 'patient' | 'physiotherapist' | 'clinic_owner' | 'admin' | 'family_member'

interface UserData {
  _id: Id<'users'>
  clerkId: string
  firstName?: string
  lastName?: string
  email?: string
  imageUrl?: string
  phoneNumber?: string
  role?: UserRole
  onboarded: boolean
  physiotherapistProfileId?: Id<'physiotherapistProfiles'>
  patientProfileId?: Id<'patientProfiles'>
  lastLoginAt?: number
  _creationTime: number
}

interface RoleChangeDialogProps {
  user: UserData
  onClose: () => void
  onRoleChange: (userId: Id<'users'>, newRole: UserRole) => void
}

function RoleChangeDialog({ user, onClose, onRoleChange }: RoleChangeDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role || 'patient')
  const [isLoading, setIsLoading] = useState(false)

  const handleRoleChange = async () => {
    if (selectedRole === user.role) {
      onClose()
      return
    }

    setIsLoading(true)
    try {
      await onRoleChange(user._id, selectedRole)
      toast.success(`User role updated to ${selectedRole.replace('_', ' ')}`)
      onClose()
    } catch {
      toast.error('Failed to update user role')
    } finally {
      setIsLoading(false)
    }
  }

  const roleLabels = {
    patient: 'Patient',
    physiotherapist: 'Physiotherapist',
    clinic_owner: 'Clinic Owner',
    family_member: 'Family Member',
    admin: 'Administrator'
  }

  const roleIcons = {
    patient: User,
    physiotherapist: Stethoscope,
    clinic_owner: Building2,
    family_member: User,
    admin: Shield
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Change User Role</DialogTitle>
        <DialogDescription>
          Update the role for {user.firstName} {user.lastName} ({user.email})
        </DialogDescription>
      </DialogHeader>
      
      <div className="py-4">
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.imageUrl} />
              <AvatarFallback>
                {user.firstName?.charAt(0) || user.email?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{user.firstName} {user.lastName}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Select New Role:</label>
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(roleLabels).map(([value, label]) => {
                  const Icon = roleIcons[value as UserRole]
                  return (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center space-x-2">
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedRole === 'admin' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Crown className="h-4 w-4 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-800">Admin Privileges</p>
              </div>
              <p className="text-xs text-yellow-700 mt-1">
                This user will have full administrative access to the platform.
              </p>
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleRoleChange} disabled={isLoading || selectedRole === user.role}>
          {isLoading ? 'Updating...' : 'Update Role'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

export function UserManagement() {
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null)
  const [showRoleDialog, setShowRoleDialog] = useState(false)

  // Get all users
  const users = useQuery(api.users.getAllUsers)
  
  // Get current user to verify admin status
  const currentUser = useQuery(api.users.getMyUser)

  // Mutations
  const setUserRole = useMutation(api.users.setUserRole)

  const handleRoleChange = async (userId: Id<'users'>, newRole: UserRole) => {
    await setUserRole({ userId, role: newRole })
  }

  const openRoleDialog = (user: UserData) => {
    setSelectedUser(user)
    setShowRoleDialog(true)
  }

  const closeRoleDialog = () => {
    setSelectedUser(null)
    setShowRoleDialog(false)
  }

  const userColumns: ColumnDef<UserData>[] = [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => (
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={row.original.imageUrl} />
            <AvatarFallback>
              {row.original.firstName?.charAt(0) || row.original.email?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">
              {row.original.firstName} {row.original.lastName}
            </div>
            <div className="text-sm text-muted-foreground">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const role = row.original.role || 'patient'
                 const roleConfig = {
           patient: { label: 'Patient', icon: User, variant: 'secondary' as const },
           physiotherapist: { label: 'Physiotherapist', icon: Stethoscope, variant: 'default' as const },
           clinic_owner: { label: 'Clinic Owner', icon: Building2, variant: 'default' as const },
           family_member: { label: 'Family Member', icon: User, variant: 'secondary' as const },
           admin: { label: 'Administrator', icon: Shield, variant: 'destructive' as const }
         }
        
        const config = roleConfig[role]
        const Icon = config.icon
        
        return (
          <Badge variant={config.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.onboarded ? 'default' : 'secondary'}>
          {row.original.onboarded ? 'Active' : 'Pending'}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      cell: ({ row }) => (
        <div className="text-sm">
          {format(new Date(row.original._creationTime), 'MMM dd, yyyy')}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openRoleDialog(row.original)}>
              <UserCog className="mr-2 h-4 w-4" />
              Change Role
            </DropdownMenuItem>
            {row.original.role !== 'admin' && (
              <DropdownMenuItem onClick={() => openRoleDialog(row.original)}>
                <Crown className="mr-2 h-4 w-4" />
                Promote to Admin
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  if (users === undefined || currentUser === undefined) {
    return <UserManagementSkeleton />
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-600">
            You need administrator privileges to access this page.
          </p>
        </div>
      </div>
    )
  }

  const roleStats = {
    total: users.length,
    admins: users.filter((u: UserData) => u.role === 'admin').length,
    physiotherapists: users.filter((u: UserData) => u.role === 'physiotherapist').length,
    clinicOwners: users.filter((u: UserData) => u.role === 'clinic_owner').length,
    patients: users.filter((u: UserData) => u.role === 'patient').length,
    familyMembers: users.filter((u: UserData) => u.role === 'family_member').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage user roles and permissions across the platform
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roleStats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Administrators</CardTitle>
            <Shield className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roleStats.admins}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Physiotherapists</CardTitle>
            <Stethoscope className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roleStats.physiotherapists}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clinic Owners</CardTitle>
            <Building2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roleStats.clinicOwners}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Patients</CardTitle>
            <User className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roleStats.patients}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage user roles and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable 
            data={users} 
            columns={userColumns}
            searchKey="email"
          />
        </CardContent>
      </Card>

      {/* Role Change Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        {selectedUser && (
          <RoleChangeDialog
            user={selectedUser}
            onClose={closeRoleDialog}
            onRoleChange={handleRoleChange}
          />
        )}
      </Dialog>
    </div>
  )
}

function UserManagementSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 