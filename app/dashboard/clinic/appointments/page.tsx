'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Appointment } from '@/stores/appointmentStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Calendar, 
  Clock, 
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users
} from 'lucide-react'
import { format, isToday } from 'date-fns'

export default function ClinicAppointmentsPage() {
  const appointments = useQuery(api.clinics.getClinicAppointments)
  const appointmentStats = useQuery(api.clinics.getClinicAppointmentStats)

  if (appointments === undefined || appointmentStats === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  const todayAppointments = appointments?.filter((apt: Appointment) => 
    isToday(new Date(apt.startTime))
  ) || []

  const upcomingAppointments = appointments?.filter((apt: Appointment) => 
    new Date(apt.startTime) > new Date() && !isToday(new Date(apt.startTime))
  ) || []

  const pastAppointments = appointments?.filter((apt: Appointment) => 
    new Date(apt.startTime) < new Date() && !isToday(new Date(apt.startTime))
  ) || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'cancelled': return 'destructive'
      case 'no-show': return 'secondary'
      default: return 'outline'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-3 w-3" />
      case 'cancelled': return <XCircle className="h-3 w-3" />
      case 'no-show': return <AlertCircle className="h-3 w-3" />
      default: return <Clock className="h-3 w-3" />
    }
  }

    type AppointmentType = NonNullable<ReturnType<typeof useQuery<typeof api.clinics.getClinicAppointments>>>[number];

  const AppointmentCard = ({ appointment }: { appointment: AppointmentType }) => (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
      <div className="flex items-center space-x-4">
        <Avatar>
          <AvatarImage src={appointment.patient?.user?.imageUrl} />
          <AvatarFallback>
            {appointment.patient?.user?.firstName?.[0]}
            {appointment.patient?.user?.lastName?.[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-semibold">
            {appointment.patient?.user?.firstName} {appointment.patient?.user?.lastName}
          </h3>
          <p className="text-sm text-gray-600">
            with {appointment.physiotherapist?.user?.firstName} {appointment.physiotherapist?.user?.lastName}
          </p>
          <div className="flex items-center space-x-4 mt-1">
            <span className="text-xs text-gray-500 flex items-center">
              <Calendar className="h-3 w-3 mr-1" />
              {format(new Date(appointment.startTime), 'MMM d, yyyy')}
            </span>
            <span className="text-xs text-gray-500 flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              {format(new Date(appointment.startTime), 'h:mm a')}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Badge variant={getStatusColor(appointment.status)} className="flex items-center space-x-1">
          {getStatusIcon(appointment.status)}
          <span className="capitalize">{appointment.status}</span>
        </Badge>
        <Button variant="outline" size="sm">View</Button>
      </div>
    </div>
  )

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Appointments</h1>
            <p className="text-gray-600">Manage all clinic appointments and schedules</p>
          </div>
          <Button onClick={() => {
            // Navigate to physiotherapist dashboard to book appointments
            window.location.href = '/dashboard/physiotherapist/appointments';
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Appointment
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointmentStats?.today || 0}</div>
              <p className="text-xs text-muted-foreground">Scheduled appointments</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointmentStats?.thisWeek || 0}</div>
              <p className="text-xs text-muted-foreground">Total appointments</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointmentStats?.completed || 0}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">No Shows</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{appointmentStats?.noShows || 0}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>
        </div>

        {/* Appointments Tabs */}
        <Tabs defaultValue="today" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="today">Today ({todayAppointments.length})</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming ({upcomingAppointments.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({pastAppointments.length})</TabsTrigger>
            </TabsList>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
          </div>

          <TabsContent value="today">
            <Card>
              <CardHeader>
                <CardTitle>Today&apos;s Appointments</CardTitle>
                <CardDescription>
                  {todayAppointments.length} appointments scheduled for today
                </CardDescription>
              </CardHeader>
              <CardContent>
                {todayAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {todayAppointments.map((appointment: Appointment) => (
                      <AppointmentCard key={appointment._id} appointment={appointment} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments today</h3>
                    <p className="text-gray-600 mb-4">Your schedule is clear for today.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upcoming">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Appointments</CardTitle>
                <CardDescription>
                  {upcomingAppointments.length} appointments scheduled
                </CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingAppointments.map((appointment: Appointment) => (
                      <AppointmentCard key={appointment._id} appointment={appointment} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No upcoming appointments</h3>
                    <p className="text-gray-600 mb-4">Schedule new appointments to see them here.</p>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Schedule Appointment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="past">
            <Card>
              <CardHeader>
                <CardTitle>Past Appointments</CardTitle>
                <CardDescription>
                  {pastAppointments.length} completed appointments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pastAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {pastAppointments.slice(0, 10).map((appointment: Appointment) => (
                      <AppointmentCard key={appointment._id} appointment={appointment} />
                    ))}
                    {pastAppointments.length > 10 && (
                      <div className="text-center pt-4">
                        <Button variant="outline">Load More</Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No past appointments</h3>
                    <p className="text-gray-600">Completed appointments will appear here.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
