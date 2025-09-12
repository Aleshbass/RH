'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2, BarChart3, Users, Calendar, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardStats {
  totalPatients: number;
  todaysAppointments: number;
  upcomingAppointments: number;
  completedSessionsThisWeek: number;
  pendingInvitations: number;
}

export default function ReportsPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  // Get current user using direct Convex query
  const currentUser = useQuery(api.users.getMyUser);
  
  // Get dashboard statistics using direct Convex query
  const dashboardStats = useQuery(api.patients.getDashboardStats, {}) as DashboardStats | undefined;
  
  // Get billing revenue stats
  const revenueStats = useQuery(api.billing.getBillingStats, {});

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // Redirect if not physiotherapist
  useEffect(() => {
    if (currentUser && currentUser.role !== 'physiotherapist') {
      router.push('/dashboard');
    }
  }, [currentUser, router]);

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
  if (dashboardStats === undefined) {
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
  if (dashboardStats.totalPatients === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600">Essential metrics for your practice</p>
        </div>
        
        {/* Empty State */}
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No data yet</h3>
            <p className="text-gray-600 mb-4">
              Your analytics will appear here once you start seeing patients.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return `₦${(amount / 100).toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-gray-600">Essential metrics for your practice</p>
      </div>

      {/* Essential Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.totalPatients}</div>
            <p className="text-xs text-muted-foreground">Active patients</p>
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
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {revenueStats ? formatCurrency(revenueStats.totalRevenue) : '₦0'}
            </div>
            <p className="text-xs text-muted-foreground">
              {revenueStats ? `${formatCurrency(revenueStats.pendingPayments)} pending` : 'No earnings yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Practice Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-sm text-gray-600 mb-2">This Week</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Sessions Completed:</span>
                  <span className="font-medium">{dashboardStats.completedSessionsThisWeek}</span>
                </div>
                <div className="flex justify-between">
                  <span>Today&apos;s Appointments:</span>
                  <span className="font-medium">{dashboardStats.todaysAppointments}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-sm text-gray-600 mb-2">Overall</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Patients:</span>
                  <span className="font-medium">{dashboardStats.totalPatients}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Revenue:</span>
                  <span className="font-medium">
                    {revenueStats ? formatCurrency(revenueStats.totalRevenue) : '₦0'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coming Soon Notice */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">More insights coming soon</h3>
            <p className="text-gray-600">
              Advanced charts, treatment progress tracking, and detailed performance analytics will be added in future updates.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 