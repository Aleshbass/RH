'use client';

import { useAuth, SignOutButton, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Shield, Key, LogOut, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export default function PrivacySettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();

    const currentUser = useQuery(api.users.getMyUser);
    const { openUserProfile } = useClerk();

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push('/sign-in');
        }
    }, [isLoaded, isSignedIn, router]);

    useEffect(() => {
        if (currentUser && currentUser.role !== 'physiotherapist') {
            router.push('/dashboard');
        }
    }, [currentUser, router]);

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

    return (
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
                        <Switch defaultChecked className="data-[state=checked]:bg-[#005b57]" />
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
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10"
                        >
                            Deactivate
                        </Button>
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Delete Account</h4>
                            <p className="text-sm text-gray-400">Permanently delete your account and all associated data.</p>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="bg-red-600 hover:bg-red-700"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete account
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
