'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DataTable } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  Building2,
  Activity,
  Globe,
  Settings,
  Shield,
  UserCheck,
  BarChart3,
  Server,
  CheckCircle,
} from 'lucide-react'
import { ColumnDef, Row } from '@tanstack/react-table'
import { format } from 'date-fns'

interface UserData {
  _id: string;
  imageUrl?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  onboarded?: boolean;
  _creationTime: number;
}

interface ClinicData {
  _id: string;
  name: string;
  ownerName?: string;
  city?: string;
  country?: string;
}

export function AdminDashboard() {
  const user = useQuery(api.users.getMyUser)
  const allUsers = useQuery(api.users.getAllUsers)
  const allClinics = useQuery(api.clinics.getAllClinics)

  if (user === undefined || allClinics === undefined || allUsers === undefined) {
    return <AdminDashboardSkeleton />
  }

  const totalUsers = allUsers?.length || 0
  const totalClinics = allClinics?.length || 0
  const activeUsers = allUsers?.filter((u: UserData) => u.onboarded).length || 0

  const userColumns: ColumnDef<UserData>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }: { row: Row<UserData> }) => (
        <div className="flex items-center space-x-3 min-w-[200px]">
          <Avatar className="h-8 w-8">
            <AvatarImage src={row.original.imageUrl} />
            <AvatarFallback>
              {row.original.firstName?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{row.original.firstName} {row.original.lastName}</div>
            <div className="text-sm text-muted-foreground">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }: { row: Row<UserData> }) => (
        <Badge variant="secondary" className="capitalize">
          {row.original.role?.replace('_', ' ') || 'patient'}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: () => (
        <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">active</Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      cell: ({ row }: { row: Row<UserData> }) => (
        <div className="text-sm whitespace-nowrap">
          {format(new Date(row.original._creationTime), 'MMM dd, yyyy')}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: () => (
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Shield className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  const clinicColumns: ColumnDef<ClinicData>[] = [
    {
      accessorKey: 'name',
      header: 'Clinic',
      cell: ({ row }: { row: Row<ClinicData> }) => (
        <div className="min-w-[200px]">
          <div className="font-medium">{row.original.name}</div>
          <div className="text-sm text-muted-foreground">
            {row.original.ownerName && `Owner: ${row.original.ownerName}`}
            {row.original.city && row.original.country && ` • ${row.original.city}, ${row.original.country}`}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: () => (
        <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">active</Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: () => (
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            System Administration
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Platform management and oversight dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="flex-1 md:flex-none shadow-lg shadow-primary/20">
            <Users className="mr-2 h-4 w-4" />
            Manage Users
          </Button>
          <Button variant="outline" className="flex-1 md:flex-none">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-md bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              Platform users
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Clinics</CardTitle>
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClinics}</div>
            <p className="text-xs text-muted-foreground">
              Registered facilities
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">99.9%</div>
            <p className="text-xs text-muted-foreground">
              Uptime this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
              <Globe className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              With roles assigned
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList className="w-full justify-start inline-flex min-w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="clinics">Clinic Management</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent Activity */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-primary" />
                  Recent System Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50">
                    <div className="mt-1">
                      <UserCheck className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">New user registered</div>
                      <div className="text-xs text-muted-foreground">2 minutes ago</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50">
                    <div className="mt-1">
                      <Building2 className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Clinic registration</div>
                      <div className="text-xs text-muted-foreground">15 minutes ago</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Status */}
            <Card className="border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Server className="mr-2 h-5 w-5 text-primary" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Database</span>
                  </div>
                  <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">Operational</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">API Services</span>
                  </div>
                  <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0">Operational</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage platform users and their permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <DataTable
                  data={allUsers}
                  columns={userColumns}
                  searchKey="firstName"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clinics" className="space-y-6">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle>Clinic Management</CardTitle>
              <CardDescription>
                Manage registered clinics and facilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <DataTable
                  data={allClinics}
                  columns={clinicColumns}
                  searchKey="name"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle>Platform Analytics</CardTitle>
              <CardDescription>
                Usage statistics and insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                <BarChart3 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Analytics Dashboard</h3>
                <p>Detailed analytics coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex space-x-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
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
    </div>
  )
} 