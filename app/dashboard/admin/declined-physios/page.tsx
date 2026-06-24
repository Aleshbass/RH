"use client";

import { useMutation } from "convex/react";
import { useQueryUntyped } from "@/lib/convexUntyped";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { format } from "date-fns";
import { useState, useCallback } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { 
  User, 
  Stethoscope, 
  Building2, 
  Shield,
  Phone,
  AlertCircle,
  XCircle,
  Trash2,
  RefreshCw
} from "lucide-react";

// Type definitions for approval objects
type ApprovalWithUser = {
  _id: Id<"accountApprovalStatus">;
  _creationTime: number;
  userId: Id<"users">;
  status: string;
  submittedAt: number;
  reviewedAt?: number;
  reviewedBy?: Id<"users">;
  comments?: string;
  requiredDocuments?: string[];
  user: {
    _id: Id<"users">;
    role: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    imageUrl?: string;
    phoneNumber?: string;
    [key: string]: unknown;
  } | null;
};

export default function DeclinedPhysiosPage() {
  const [processingUserId, setProcessingUserId] = useState<Id<"users"> | null>(null);

  const declinedApprovals = useQueryUntyped(api.users.getDeclinedApprovals) as ApprovalWithUser[] | undefined;
  const deleteUser = useMutation(api.users.adminDeleteUser);

  const handleDelete = useCallback(async (userId: Id<"users">, userName: string) => {
    setProcessingUserId(userId);
    try {
      await deleteUser({ userId });
      toast.success(`${userName} deleted successfully`, {
        description: 'The user and all associated data have been permanently removed.',
        duration: 5000,
      });
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error('Failed to delete user', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        duration: 5000,
      });
    } finally {
      setProcessingUserId(null);
    }
  }, [deleteUser]);

  // Loading state
  if (declinedApprovals === undefined) {
    return <DeclinedPageSkeleton />;
  }

  // Filter out to only show physiotherapists, or we can show all. The prompt said "declined physios and all their data". Let's focus on physios, or show everyone with a focus on physios.
  // The user asked "where can I find the physiotherapist that were not approved. Physios that were declined."
  // So it might be best to just filter by physiotherapist role, or show all with badges. We'll show all but keep it clear. Let's just filter by physio if that's what they asked for, or show all and let them see the badges. I'll show all but ensure roles are clear.
  const declinedUsers = declinedApprovals.filter(approval => approval.user !== null);
  const declinedPhysios = declinedUsers.filter(a => a.user?.role === 'physiotherapist');

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center items-start gap-4 justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Declined Applications</h1>
          <p className="text-muted-foreground mt-1">
            Review physiotherapists and users whose applications were declined
          </p>
        </div>
        <div className="flex items-center">
          <Badge variant="secondary" className="text-sm">
            {declinedUsers.length} total declined
          </Badge>
        </div>
      </div>

      {/* Approval Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Physiotherapists</CardTitle>
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {declinedPhysios.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Declined physiotherapist applications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Other Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {declinedUsers.length - declinedPhysios.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Declined clinic owners and other users
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Declined Approvals */}
      {!declinedUsers || declinedUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No declined applications</h3>
            <p className="text-muted-foreground text-center">
              There are no declined user approval requests at this time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Declined Applications History</h2>
          </div>
          
          <div className="grid gap-4">
            {declinedUsers.map((approval: ApprovalWithUser) => {
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
              const isProcessing = processingUserId === approval.userId;
              const userName = `${approval.user.firstName || ''} ${approval.user.lastName || ''}`.trim() || approval.user.email;

              return (
                <Card key={approval._id} className="hover:shadow-md transition-shadow border-l-4 border-l-red-500">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex items-start space-x-4">
                        <Avatar className="h-12 w-12 mt-1">
                          <AvatarImage src={approval.user?.imageUrl ?? undefined} />
                          <AvatarFallback>
                            {approval.user.firstName?.charAt(0) || approval.user.email?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-lg">
                            {approval.user.firstName} {approval.user.lastName}
                          </h3>
                          <div className="flex flex-col gap-1 mt-1 text-sm text-muted-foreground">
                            <p>{approval.user.email}</p>
                            {approval.user.phoneNumber && (
                              <p className="flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {approval.user.phoneNumber}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 mt-3">
                            <Badge variant="outline" className="bg-gray-50">
                              <Icon className="mr-1 h-3 w-3" />
                              {config.label}
                            </Badge>
                            {approval.reviewedAt && (
                              <Badge variant="secondary" className="bg-red-50 text-red-700 hover:bg-red-50">
                                <XCircle className="mr-1 h-3 w-3" />
                                Declined on {format(new Date(approval.reviewedAt), 'MMM dd, yyyy')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {approval.comments && (
                        <div className="bg-red-50 p-4 rounded-md md:max-w-md border border-red-100 flex-1 relative">
                          <h4 className="text-sm font-semibold text-red-800 mb-1 flex items-center">
                            <AlertCircle className="h-4 w-4 mr-1" />
                            Reason for Decline
                          </h4>
                          <p className="text-sm text-red-700 whitespace-pre-wrap">
                            {approval.comments}
                          </p>

                          <div className="absolute bottom-2 right-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  disabled={isProcessing}
                                  className="text-red-600 border-red-200 hover:bg-red-100 h-8 bg-white/50"
                                >
                                  {isProcessing ? (
                                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                                  ) : (
                                    <Trash2 className="h-3 w-3 mr-1" />
                                  )}
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Permanently Delete User?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you absolutely sure you want to delete <strong>{userName}</strong>? 
                                    This action cannot be undone. It will permanently remove their account, profile data, and this application.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDelete(approval.userId, userName || 'User')}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DeclinedPageSkeleton() {
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center items-start gap-4 justify-between">
        <div className="space-y-2 w-full md:w-auto">
          <Skeleton className="h-8 w-48 md:w-64" />
          <Skeleton className="h-4 w-64 md:w-96" />
        </div>
        <div className="flex items-center">
          <Skeleton className="h-6 w-24" />
        </div>
      </div>

      {/* Statistics skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
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
      <div className="grid gap-4 mt-8">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-4">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="space-y-2 flex-1 w-full">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <div className="flex space-x-2 mt-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                </div>
                <Skeleton className="h-24 w-full md:w-64 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
