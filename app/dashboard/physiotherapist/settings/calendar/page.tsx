'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarConnectionStatus } from '@/components/settings/CalendarConnectionStatus';

export default function CalendarSettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();

    const currentUser = useQuery(api.users.getMyUser);

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

    // Show loading while auth or user data is loading (undefined = loading)
    if (!isLoaded || currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading calendar settings...</p>
                </div>
            </div>
        );
    }

    // Handle null currentUser (no Convex record - user not found)
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
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Calendar className="h-6 w-6" />
                    Calendar
                </h1>
                <p className="text-gray-400 mt-1">Connect and manage your calendar integrations</p>
            </div>

            {/* Calendar Card */}
            <Card className="bg-[#1a1a1a] border-white/10">
                <CardContent className="p-6">
                    <CalendarConnectionStatus currentUser={currentUser} />
                </CardContent>
            </Card>
        </div>
    );
}
