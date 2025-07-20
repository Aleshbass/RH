"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { UserApprovalDialog } from "@/components/admin/UserApprovalDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { 
  Check, 
  Clock, 
  User, 
  Stethoscope, 
  Building2, 
  Shield,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";



export default function AdminApprovalsPage() {
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<Id<"users"> | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Queries and mutations
  const pendingApprovals = useQuery(api.users.getPendingApprovals);
  const debugApprovals = useQuery(api.users.debugApprovalStatus);
  const approveUser = useMutation(api.users.approveUser);
  const declineUser = useMutation(api.users.declineUser);
  const cleanupOrphanedApprovals = useMutation(api.users.cleanupOrphanedApprovals);
  const testNotificationEmail = useAction(api.users.testNotificationEmail);

  const handleApprove = useCallback(async (userId: Id<"users">, comments?: string) => {
    setProcessingUserId(userId);
    try {
      await approveUser({ userId, comments });
      toast.success('User approved successfully', {
        description: 'Email notification has been sent to the user.',
        duration: 5000,
      });
      setShowDialog(false);
      setSelectedUserId(null);
    } catch (error) {
      console.error('Failed to approve user:', error);
      toast.error('Failed to approve user', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      });
      throw error;
    } finally {
      setProcessingUserId(null);
    }
  }, [approveUser]);

  const handleDecline = useCallback(async (userId: Id<"users">, comments: string) => {
    setProcessingUserId(userId);
    try {
      await declineUser({ userId, comments });
      toast.success('User declined', {
        description: 'Email notification has been sent to the user.',
        duration: 5000,
      });
      setShowDialog(false);
      setSelectedUserId(null);
    } catch (error) {
      console.error('Failed to decline user:', error);
      toast.error('Failed to decline user', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      });
      throw error;
    } finally {
      setProcessingUserId(null);
    }
  }, [declineUser]);

  const handleQuickApprove = useCallback(async (userId: Id<"users">, userName: string) => {
    setProcessingUserId(userId);
    try {
      await approveUser({ userId });
      toast.success(`${userName} approved successfully`, {
        description: 'Email notification has been sent.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Failed to approve user:', error);
      toast.error('Failed to approve user', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      });
    } finally {
      setProcessingUserId(null);
    }
  }, [approveUser]);

  const openApprovalDialog = useCallback((userId: Id<"users">) => {
    setSelectedUserId(userId);
    setShowDialog(true);
  }, []);

  const closeApprovalDialog = useCallback(() => {
    setSelectedUserId(null);
    setShowDialog(false);
  }, []);

  const handleCleanupOrphaned = useCallback(async () => {
    try {
      const result = await cleanupOrphanedApprovals({});
      toast.success(`Cleanup completed! Removed ${result.deletedCount} orphaned records.`, {
        description: result.deletedCount > 0 ? 'Pending approvals list should now show correctly.' : 'No orphaned records found.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Failed to cleanup orphaned approvals:', error);
      toast.error('Failed to cleanup orphaned records', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      });
    }
  }, [cleanupOrphanedApprovals]);

  const handleTestEmail = useCallback(async () => {
    try {
      const result = await testNotificationEmail({});
      toast.success('Test email sent!', {
        description: result.message,
        duration: 8000,
      });
    } catch (error) {
      console.error('Failed to send test email:', error);
      toast.error('Failed to send test email', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      });
    }
  }, [testNotificationEmail]);

  // Loading state
  if (pendingApprovals === undefined) {
    return <ApprovalsPageSkeleton />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Approvals</h1>
          <p className="text-muted-foreground">
            Review and approve user account applications
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge variant="secondary" className="text-sm">
            {pendingApprovals?.length || 0} pending
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDebug(!showDebug)}
            className="gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Debug
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Debug Section */}
      {showDebug && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-yellow-800">Pending Approvals Query Result:</h4>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-40">
                  {JSON.stringify(pendingApprovals, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="font-semibold text-yellow-800">All Approval Status Records:</h4>
                <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-40">
                  {JSON.stringify(debugApprovals, null, 2)}
                </pre>
              </div>
              <div className="bg-white p-4 rounded border border-orange-200">
                <h4 className="font-semibold text-orange-800 mb-2">🔧 Fix Detected Issue</h4>
                <p className="text-sm text-orange-700 mb-3">
                  Found {debugApprovals?.filter(a => a.user === null && a.status === 'pending_review').length || 0} orphaned approval records 
                  (where user no longer exists). These are causing pending approvals to not show up.
                </p>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleCleanupOrphaned}
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    Clean Up Orphaned Records
                  </Button>
                  <Button 
                    onClick={handleTestEmail}
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    🧪 Test Email System
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingApprovals?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Require your attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Physiotherapists</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingApprovals?.filter(a => a.user?.role === 'physiotherapist').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Pending physiotherapist approvals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clinic Owners</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingApprovals?.filter(a => a.user?.role === 'clinic_owner').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Pending clinic owner approvals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals */}
      {!pendingApprovals || pendingApprovals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground text-center">
              There are no pending user approval requests at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Pending Applications</h2>
            <div className="text-sm text-muted-foreground">
              Click &quot;Review Details&quot; for complete information
            </div>
          </div>
          
          <div className="grid gap-4">
            {pendingApprovals.map((approval) => {
              const roleConfig = {
                physiotherapist: { label: 'Physiotherapist', icon: Stethoscope, color: 'blue' },
                clinic_owner: { label: 'Clinic Owner', icon: Building2, color: 'green' },
                patient: { label: 'Patient', icon: User, color: 'purple' },
                family_member: { label: 'Family Member', icon: User, color: 'gray' },
                admin: { label: 'Administrator', icon: Shield, color: 'red' }
              };

              // Skip if user is null
              if (!approval.user) return null;

              const config = roleConfig[approval.user.role as keyof typeof roleConfig] || roleConfig.patient;
              const Icon = config.icon;
              const userName = `${approval.user.firstName || ''} ${approval.user.lastName || ''}`.trim() || approval.user.email;
              const isProcessing = processingUserId === approval.userId;

              return (
                <Card key={approval._id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={approval.user.imageUrl} />
                          <AvatarFallback>
                            {approval.user.firstName?.charAt(0) || approval.user.email?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold">
                            {approval.user.firstName} {approval.user.lastName}
                          </h3>
                          <p className="text-sm text-muted-foreground">{approval.user.email}</p>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="outline">
                              <Icon className="mr-1 h-3 w-3" />
                              {config.label}
                            </Badge>
                            <Badge variant="secondary">
                              <Clock className="mr-1 h-3 w-3" />
                              {format(new Date(approval.submittedAt), 'MMM dd, yyyy')}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Quick approve for low-risk applications */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={isProcessing}
                              className="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <Check className="mr-1 h-4 w-4" />
                              Quick Approve
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Quick Approve User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to approve <strong>{userName}</strong> as a {config.label.toLowerCase()}? 
                                This will immediately grant them access to the platform and send them an approval email.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleQuickApprove(approval.userId, userName || 'User')}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Approve Now
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openApprovalDialog(approval.userId)}
                          disabled={isProcessing}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Review Details
                        </Button>
                      </div>
                    </div>
                    
                    {isProcessing && (
                      <div className="mt-4 flex items-center space-x-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Enhanced Approval Dialog */}
      <UserApprovalDialog
        userId={selectedUserId}
        isOpen={showDialog}
        onClose={closeApprovalDialog}
        onApprove={handleApprove}
        onDecline={handleDecline}
      />
    </div>
  );
}

function ApprovalsPageSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex items-center space-x-3">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Statistics skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approvals skeleton */}
      <div className="grid gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <div className="flex space-x-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
} 