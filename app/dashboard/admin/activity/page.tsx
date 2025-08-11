"use client";

import { useMemo } from "react";
import { useUserActivityLogs } from "@/hooks/useUserActivityLogs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DataTable } from "@/components/ui/data-table";
import { 
  Activity, 
  User, 
  Clock, 
  MapPin, 
  RefreshCw,
  Download,
  Filter
} from "lucide-react";
import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";
import { ActivityLog } from "@/types/activity";

const activityColumns: ColumnDef<ActivityLog>[] = [
  {
    accessorKey: "userName",
    header: "User",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center space-x-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              {user.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.userName}</div>
            <div className="text-sm text-muted-foreground">{user.userEmail}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "userRole",
    header: "Role",
    cell: ({ row }) => {
      const role = row.getValue("userRole") as string;
      const roleColors = {
        admin: "bg-red-100 text-red-800",
        clinic_owner: "bg-blue-100 text-blue-800",
        physiotherapist: "bg-green-100 text-green-800",
        patient: "bg-purple-100 text-purple-800",
      };
      return (
        <Badge className={roleColors[role as keyof typeof roleColors] || "bg-gray-100 text-gray-800"}>
          {role?.replace('_', ' ') || 'Unassigned'}
        </Badge>
      );
    },
  },
  {
    accessorKey: "activity",
    header: "Activity",
    cell: ({ row }) => {
      return (
        <div className="flex items-center space-x-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span>{row.getValue("activity")}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "timestamp",
    header: "Time",
    cell: ({ row }) => {
      const timestamp = row.getValue("timestamp") as number;
      return (
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{format(new Date(timestamp), 'MMM dd, HH:mm')}</div>
            <div className="text-sm text-muted-foreground">
              {format(new Date(timestamp), 'yyyy')}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "ipAddress",
    header: "IP Address",
    cell: ({ row }) => {
      const ip = row.getValue("ipAddress") as string;
      return ip ? (
        <div className="flex items-center space-x-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <code className="text-sm bg-muted px-2 py-1 rounded">{ip}</code>
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
];

function ActivityLogsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export default function AdminActivityPage() {
  const activityLogs = useUserActivityLogs(50);

  // Memoize stats calculations to prevent infinite re-renders from Date.now()
  const stats = useMemo(() => {
    if (!activityLogs?.data) return { totalEvents: 0, activeUsers: 0, recentActivity: 0 };
    
    const now = Date.now();
    const data = activityLogs.data;
    
    return {
      totalEvents: data.length || 0,
      activeUsers: new Set(data.map((log: ActivityLog) => log.userId)).size,
      recentActivity: data.filter((log: ActivityLog) => now - log.timestamp < 60 * 60 * 1000).length,
    };
  }, [activityLogs?.data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Activity</h1>
          <p className="text-muted-foreground">
            Monitor user actions and system events across the platform
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">Unique users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentActivity}</div>
            <p className="text-xs text-muted-foreground">Last hour</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Status</CardTitle>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Live</div>
            <p className="text-xs text-muted-foreground">Real-time monitoring</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Logs</CardTitle>
          <CardDescription>
            Real-time user activity and system events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityLogs?.data ? (
            <DataTable 
              data={activityLogs.data} 
              columns={activityColumns}
              searchKey="userName"
            />
          ) : (
            <ActivityLogsSkeleton />
          )}
        </CardContent>
      </Card>
    </div>
  );
} 