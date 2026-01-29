'use client';

import { useAuth, SignOutButton, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Shield, Key, LogOut, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

export default function PrivacySettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();
    const { openUserProfile } = useClerk();

    const currentUser = useQuery(api.queries.getCurrentUser);
    const updateProfileMutation = useMutation(api.users.updatePhysiotherapistProfile);

    // Controlled state for profile visibility
    const [profileVisible, setProfileVisible] = useState(true);
    const [isSavingVisibility, setIsSavingVisibility] = useState(false);

    // Dialog states
    const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // Initialize profile visibility from user settings
    useEffect(() => {
        // @ts-ignore - profileData types from getCurrentUser return value
        if (currentUser?.profileData?.isAvailableOnMarketplace !== undefined) {
            // @ts-ignore
            setProfileVisible(currentUser.profileData.isAvailableOnMarketplace);
        }
    }, [currentUser]);

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push('/sign-in');
        }
    }, [isLoaded, isSignedIn, router]);

    useEffect(() => {
        // Handle null (no Convex record) and wrong role
        if (currentUser === null || (currentUser && currentUser.role !== 'physiotherapist')) {
            router.push('/dashboard');
        }
    }, [currentUser, router]);

    const handleVisibilityChange = async (checked: boolean) => {
        const previousValue = profileVisible;
        setProfileVisible(checked);
        setIsSavingVisibility(true);

        try {
            await updateProfileMutation({ isAvailableOnMarketplace: checked });
            toast.success(checked ? 'Profile is now visible' : 'Profile is now hidden');
        } catch (error) {
            console.error('Error updating visibility:', error);
            // Rollback on failure
            setProfileVisible(previousValue);
            toast.error('Failed to update profile visibility');
        } finally {
            setIsSavingVisibility(false);
        }
    };

    const handleDeactivate = async () => {
        try {
            // TODO: Implement actual deactivation when backend is ready
            toast.info('Account deactivation is not yet implemented');
            setShowDeactivateDialog(false);
        } catch (error) {
            console.error('Error deactivating account:', error);
            toast.error('Failed to deactivate account');
        }
    };

    const handleDeleteAccount = async () => {
        try {
            // TODO: Implement actual deletion when backend is ready
            toast.info('Account deletion is not yet implemented');
            setShowDeleteDialog(false);
        } catch (error) {
            console.error('Error deleting account:', error);
            toast.error('Failed to delete account');
        }
    };

    if (!isLoaded || currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading privacy settings...</p>
                </div>
            </div>
        );
    }

    // Handle null currentUser (no Convex record)
    if (currentUser === null) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <p className="text-gray-400">User profile not found</p>
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div className="space-y-6">
                {/* Page Header */}
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Shield className="h-6 w-6" />
                        Privacy & Security
                    </h1>
                    <p className="text-gray-400 mt-1">Manage your account security and privacy settings</p>
                </div>

                {/* Privacy Card */}
                <Card className="bg-[#1a1a1a] border-white/10">
                    <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-white">Profile Visibility</h4>
                                <p className="text-sm text-gray-400">Allow other healthcare providers to see your profile</p>
                            </div>
                            <Switch
                                checked={profileVisible}
                                onCheckedChange={handleVisibilityChange}
                                disabled={isSavingVisibility}
                                className="data-[state=checked]:bg-[#005b57]"
                            />
                        </div>

                        <Separator className="bg-white/10" />

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-white">Two-Factor Authentication</h4>
                                <p className="text-sm text-gray-400">Add an extra layer of security to your account</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openUserProfile()}
                                className="bg-transparent border-white/20 text-white hover:bg-white/10"
                            >
                                <Key className="h-4 w-4 mr-2" />
                                Configure
                            </Button>
                        </div>

                        <Separator className="bg-white/10" />

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-white">Change Password</h4>
                                <p className="text-sm text-gray-400">Update your account password</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openUserProfile()}
                                className="bg-transparent border-white/20 text-white hover:bg-white/10"
                            >
                                <Key className="h-4 w-4 mr-2" />
                                Change Password
                            </Button>
                        </div>

                        <Separator className="bg-white/10" />

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-white">Sign Out</h4>
                                <p className="text-sm text-gray-400">Sign out of your account on this device</p>
                            </div>
                            <SignOutButton>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-transparent border-white/20 text-white hover:bg-white/10"
                                >
                                    <LogOut className="h-4 w-4 mr-2" />
                                    Sign Out
                                </Button>
                            </SignOutButton>
                        </div>
                    </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="bg-[#1a1a1a] border-red-500/30">
                    <CardContent className="p-6 space-y-4">
                        <div>
                            <h3 className="text-lg font-semibold text-red-400">Danger zone</h3>
                            <p className="text-sm text-gray-400">Be careful. Account deletion cannot be undone.</p>
                        </div>

                        <Separator className="bg-white/10" />

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-white">Deactivate Account</h4>
                                <p className="text-sm text-gray-400">Temporarily disable your account. You can reactivate it later.</p>
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10"
                                        onClick={() => setShowDeactivateDialog(true)}
                                    >
                                        Deactivate
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Temporarily disable your account</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>

                        <Separator className="bg-white/10" />

                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-white">Delete Account</h4>
                                <p className="text-sm text-gray-400">Permanently delete your account and all associated data.</p>
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={() => setShowDeleteDialog(true)}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete account
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>This action cannot be undone</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </CardContent>
                </Card>

                {/* Deactivate Confirmation Dialog */}
                <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
                    <AlertDialogContent className="bg-[#1a1a1a] border-white/10">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Deactivate Account?</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-400">
                                Your account will be temporarily disabled. You can reactivate it by signing in again.
                                Your data will be preserved.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="bg-transparent border-white/20 text-white hover:bg-white/10">
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDeactivate}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                Deactivate
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Delete Confirmation Dialog */}
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogContent className="bg-[#1a1a1a] border-white/10">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Delete Account Permanently?</AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-400">
                                This action cannot be undone. All your data, including patient records,
                                appointments, and settings will be permanently deleted.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="bg-transparent border-white/20 text-white hover:bg-white/10">
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDeleteAccount}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Permanently
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TooltipProvider>
    );
}
