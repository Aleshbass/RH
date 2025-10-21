"use client";

import { useMemo } from "react";
import { useSecurityEvents, useAllUsers, useUserActivityLogs } from "@/hooks/useDashboardData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Clock,
  Key,
  Lock,
  Eye,
  RefreshCw,
  Download
} from "lucide-react";
import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";

interface SecurityEvent {
  id: string;
  type: string;
  severity: string;
  details: string;
  timestamp: number;
  userId: string;
}

const securityColumns: ColumnDef<SecurityEvent>[] = [
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => {
      const severity = row.getValue("severity") as string;
      const severityColors = {
        low: "bg-green-100 text-green-800",
        medium: "bg-yellow-100 text-yellow-800",
        high: "bg-orange-100 text-orange-800",
        critical: "bg-red-100 text-red-800",
      };
      return (
        <Badge className={severityColors[severity as keyof typeof severityColors]}>
          {severity.toUpperCase()}
        </Badge>
      );
    },
  },
  {
    accessorKey: "type",
    header: "Event Type",
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      return (
        <div className="flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{type.replace('_', ' ')}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "details",
    header: "Description",
  },
  {
    accessorKey: "timestamp",
    header: "Time",
    cell: ({ row }) => {
      const timestamp = row.getValue("timestamp") as number;
      return (
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{format(new Date(timestamp), 'MMM dd, HH:mm')}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "userId",
    header: "User ID",
    cell: ({ row }) => {
      const userId = row.getValue("userId") as string;
      return (
        <code className="text-sm bg-muted px-2 py-1 rounded">{userId}</code>
      );
    },
  },
];

export default function AdminSecurityPage() {
  const securityEvents = useSecurityEvents(20);
  const allUsers = useAllUsers();
  const activityLogsQuery = useUserActivityLogs(500);

  // Memoize stats calculation to prevent infinite re-renders from Date.now()
  const stats = useMemo(() => {
    if (!securityEvents?.data) return { total: 0, critical: 0, high: 0, lastHour: 0 };
    
    const now = Date.now();
    const events = securityEvents.data as SecurityEvent[];
    
    return {
      total: events.length || 0,
      critical: events.filter((e: SecurityEvent) => e.severity === 'critical').length || 0,
      high: events.filter((e: SecurityEvent) => e.severity === 'high').length || 0,
      lastHour: events.filter((e: SecurityEvent) => now - e.timestamp < 60 * 60 * 1000).length || 0,
    };
  }, [securityEvents?.data]);

  const roleCounts = useMemo(() => {
    const users = (allUsers?.data as any[]) ?? [];
    const admins = users.filter(u => u?.role === 'admin').length;
    const superAdmins = users.filter(u => u?.role === 'admin' && (u?.adminLevel === 'super' || u?.isSuperAdmin === true)).length;
    const systemAdmins = users.filter(u => u?.role === 'admin' && (u?.adminLevel === 'system' || u?.isSystemAdmin === true)).length;
    const clinicOwners = users.filter(u => u?.role === 'clinic_owner').length;
    const physios = users.filter(u => u?.role === 'physiotherapist').length;
    const patients = users.filter(u => u?.role === 'patient').length;
    const premiumPatients = users.filter(u => u?.role === 'patient' && (u?.plan === 'premium' || u?.subscriptionTier === 'premium')).length;
    return { admins, superAdmins, systemAdmins, clinicOwners, physios, patients, premiumPatients };
  }, [allUsers?.data]);

  const auditStats = useMemo(() => {
    const logs = (activityLogsQuery?.data as any[]) ?? [];
    const sec = (securityEvents?.data as SecurityEvent[]) ?? [];
    const totalAuditEntries = logs.length;
    const adminActions = logs.filter(l => (l?.userRole || '').toLowerCase().includes('admin')).length;
    const failedLoginAttempts = sec.filter(e => (e?.type || '').toLowerCase().includes('failed')).length;
    const dataAccessEvents = logs.filter(l => {
      const activity = (l?.activity || '').toLowerCase();
      const detailsStr = typeof l?.details === 'string' ? l.details.toLowerCase() : JSON.stringify(l?.details || {}).toLowerCase();
      return activity.includes('access') || detailsStr.includes('access') || detailsStr.includes('data');
    }).length;
    return { totalAuditEntries, adminActions, failedLoginAttempts, dataAccessEvents };
  }, [activityLogsQuery?.data, securityEvents?.data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Center</h1>
          <p className="text-muted-foreground">
            Monitor security events and configure protection policies
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Security Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Events</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Alerts</CardTitle>
            <XCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
            <p className="text-xs text-muted-foreground">Need investigation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lastHour}</div>
            <p className="text-xs text-muted-foreground">Last hour</p>
          </CardContent>
        </Card>
      </div>

      {/* Security Tabs */}
      <Tabs defaultValue="events" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="policies">Security Policies</TabsTrigger>
          <TabsTrigger value="access">Access Control</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Security Events
              </CardTitle>
              <CardDescription>
                Real-time security events and threat detection
              </CardDescription>
            </CardHeader>
            <CardContent>
              {securityEvents?.data ? (
                <DataTable 
                  data={(securityEvents.data as SecurityEvent[]) || []} 
                  columns={securityColumns}
                  searchKey="details"
                />
              ) : (
                <div className="text-center py-8">
                  <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Loading security events...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Lock className="mr-2 h-5 w-5" />
                  Password Policy
                </CardTitle>
                <CardDescription>
                  Configure password requirements and security
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Minimum Length</span>
                  <Badge variant="secondary">8 characters</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Require Special Characters</span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Require Numbers</span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Password Expiry</span>
                  <Badge variant="secondary">90 days</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Key className="mr-2 h-5 w-5" />
                  Two-Factor Authentication
                </CardTitle>
                <CardDescription>
                  Multi-factor authentication settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Required for Admins</span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Optional for Users</span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Backup Codes</span>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">SMS Verification</span>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="access" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Eye className="mr-2 h-5 w-5" />
                Access Control
              </CardTitle>
              <CardDescription>
                Manage user permissions and role-based access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Admin Roles</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Super Admin</span>
                      <Badge variant="secondary">{roleCounts.superAdmins} {roleCounts.superAdmins === 1 ? 'user' : 'users'}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">System Admin</span>
                      <Badge variant="secondary">{roleCounts.systemAdmins} {roleCounts.systemAdmins === 1 ? 'user' : 'users'}</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Healthcare Roles</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Clinic Owner</span>
                      <Badge variant="secondary">{roleCounts.clinicOwners} {roleCounts.clinicOwners === 1 ? 'user' : 'users'}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Physiotherapist</span>
                      <Badge variant="secondary">{roleCounts.physios} {roleCounts.physios === 1 ? 'user' : 'users'}</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Patient Roles</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Standard Patient</span>
                      <Badge variant="secondary">{roleCounts.patients} {roleCounts.patients === 1 ? 'user' : 'users'}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Premium Patient</span>
                      <Badge variant="secondary">{roleCounts.premiumPatients} {roleCounts.premiumPatients === 1 ? 'user' : 'users'}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                Audit Trail
              </CardTitle>
              <CardDescription>
                System audit logs and compliance tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Audit Statistics</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Total Audit Entries</span>
                        <Badge variant="secondary">{auditStats.totalAuditEntries}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Admin Actions</span>
                        <Badge variant="secondary">{auditStats.adminActions}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Failed Login Attempts</span>
                        <Badge variant="secondary">{auditStats.failedLoginAttempts}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Data Access Events</span>
                        <Badge variant="secondary">{auditStats.dataAccessEvents}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Compliance Status</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">HIPAA Compliance</span>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">GDPR Compliance</span>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Data Retention</span>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Audit Logging</span>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 