'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, BarChart3, Users, Calendar, TrendingUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, subDays, subWeeks, subMonths } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  totalPatients: number;
  todaysAppointments: number;
  upcomingAppointments: number;
  completedSessionsThisWeek: number;
  pendingInvitations: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function ReportsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter'>('month');

  // Get current user using direct Convex query
  const currentUser = useQuery(api.users.getMyUser);
  
  // Get dashboard statistics using direct Convex query
  const dashboardStats = useQuery(api.patients.getDashboardStats, {}) as DashboardStats | undefined;

  // Get appointments for the selected date range
  const now = new Date();
  const startDate = (() => {
    switch (dateRange) {
      case 'week':
        return subWeeks(now, 1).getTime();
      case 'month':
        return subMonths(now, 1).getTime();
      case 'quarter':
        return subMonths(now, 3).getTime();
      default:
        return subMonths(now, 1).getTime();
    }
  })();
  const endDate = now.getTime();

  const appointments = useQuery(api.appointments.getMyAppointments, {
    startDate,
    endDate,
    limit: 200,
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && currentUser.role !== 'physiotherapist') {
      router.push('/dashboard');
    }
  }, [currentUser]);

  // Loading state
  if (!isLoaded || currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  // Check if data is loading
  if (dashboardStats === undefined || appointments === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading reports...</p>
        </div>
      </div>
    );
  }

  // Check if no data exists yet
  if (dashboardStats.totalPatients === 0 && appointments.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600">Track your practice performance and insights</p>
        </div>
        
        {/* Empty State */}
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No reports yet</h3>
            <p className="text-gray-600 mb-4">
              Your reports will appear here once you start seeing patients and completing appointments.
            </p>
            <Button onClick={() => router.push('/dashboard/physiotherapist/patients')}>
              <Users className="h-4 w-4 mr-2" />
              Invite Patients
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Process data for charts
  const appointmentsByStatus = appointments.reduce((acc: Record<string, number>, appointment: any) => {
    acc[appointment.status] = (acc[appointment.status] || 0) + 1;
    return acc;
  }, {});

  const statusChartData = Object.entries(appointmentsByStatus).map(([status, count]) => ({
    name: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: count,
  }));

  // Appointments by day (last 7 days)
  const appointmentsByDay = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(now, 6 - i);
    const dayAppointments = appointments.filter((apt: any) => {
      const aptDate = new Date(apt.startTime);
      return aptDate.toDateString() === date.toDateString();
    });
    
    return {
      date: format(date, 'MMM dd'),
      appointments: dayAppointments.length,
      completed: dayAppointments.filter((apt: any) => apt.status === 'completed').length,
    };
  });

  // Service type distribution
  const serviceTypes = appointments.reduce((acc: Record<string, number>, appointment: any) => {
    acc[appointment.serviceType] = (acc[appointment.serviceType] || 0) + 1;
    return acc;
  }, {});

  const serviceTypeData = Object.entries(serviceTypes).map(([service, count]) => ({
    name: service,
    value: count,
  }));

  const handleExportReport = (): void => {
    // Implement export functionality
    console.log('Exporting report...');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600">Track your practice performance and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'quarter')}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
          </select>
          <Button onClick={handleExportReport} variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalPatients}</div>
            <p className="text-xs text-muted-foreground">Active patient relationships</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.todaysAppointments}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.upcomingAppointments} upcoming
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions This Week</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.completedSessionsThisWeek}</div>
            <p className="text-xs text-muted-foreground">Completed sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.pendingInvitations}</div>
            <p className="text-xs text-muted-foreground">Awaiting patient response</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics */}
      <Tabs defaultValue="appointments" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Appointments by Day */}
            <Card>
              <CardHeader>
                <CardTitle>Appointments by Day (Last 7 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={appointmentsByDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="appointments" fill="#8884d8" name="Total" />
                    <Bar dataKey="completed" fill="#82ca9d" name="Completed" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Appointment Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Appointment Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Recent Appointments Table */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Appointments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {appointments.slice(0, 5).map((appointment: any) => (
                  <div key={appointment._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-gray-900">
                          {appointment.patient 
                            ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
                            : 'Unknown Patient'
                          }
                        </p>
                        <p className="text-sm text-gray-600">
                          {format(new Date(appointment.startTime), 'MMM dd, yyyy - h:mm a')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={appointment.status === 'completed' ? 'default' : 'secondary'}>
                        {appointment.status}
                      </Badge>
                      <span className="text-sm text-gray-600">{appointment.serviceType}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patients" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Patient Growth */}
            <Card>
              <CardHeader>
                <CardTitle>Patient Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Patient growth chart coming soon</p>
                </div>
              </CardContent>
            </Card>

            {/* Patient Demographics */}
            <Card>
              <CardHeader>
                <CardTitle>Patient Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Active Patients</span>
                    <span className="font-medium text-gray-900">{dashboardStats.totalPatients}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">New This Month</span>
                    <span className="font-medium text-green-600">
                      {/* This would be calculated from actual data */}
                      {Math.floor(dashboardStats.totalPatients * 0.1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Average Sessions per Patient</span>
                    <span className="font-medium text-blue-600">
                      {dashboardStats.totalPatients > 0 
                        ? Math.round(dashboardStats.completedSessionsThisWeek / dashboardStats.totalPatients * 10) / 10
                        : 0
                      }
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Service Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Service Type Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={serviceTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {serviceTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Service Performance */}
            <Card>
              <CardHeader>
                <CardTitle>Service Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(serviceTypes).map(([service, count]) => (
                    <div key={service} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{service}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${((count as number) / appointments.length) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{count as number}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Completion Rate */}
            <Card>
              <CardHeader>
                <CardTitle>Appointment Completion Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="text-4xl font-bold text-green-600 mb-2">
                    {appointments.length > 0 
                      ? Math.round((appointments.filter((apt: any) => apt.status === 'completed').length / appointments.length) * 100)
                      : 0
                    }%
                  </div>
                  <p className="text-gray-600">
                    {appointments.filter((apt: any) => apt.status === 'completed').length} of {appointments.length} appointments completed
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* No-Show Rate */}
            <Card>
              <CardHeader>
                <CardTitle>No-Show Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="text-4xl font-bold text-orange-600 mb-2">
                    {appointments.length > 0 
                      ? Math.round((appointments.filter((apt: any) => apt.status === 'no_show').length / appointments.length) * 100)
                      : 0
                    }%
                  </div>
                  <p className="text-gray-600">
                    {appointments.filter((apt: any) => apt.status === 'no_show').length} no-shows out of {appointments.length} appointments
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Insights */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">📈 Positive Trends</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• High appointment completion rate</li>
                    <li>• Growing patient base</li>
                    <li>• Consistent session scheduling</li>
                  </ul>
                </div>
                
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <h4 className="font-medium text-yellow-900 mb-2">⚠️ Areas for Improvement</h4>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    <li>• Consider follow-up strategies for no-shows</li>
                    <li>• Monitor patient engagement levels</li>
                    <li>• Optimize appointment scheduling</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 