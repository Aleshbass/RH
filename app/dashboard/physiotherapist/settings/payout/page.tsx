'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, DollarSign } from 'lucide-react';
import { PayoutSettings } from '@/components/dashboard/physiotherapist/settings/PayoutSettings';

export default function PayoutSettingsPage() {
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

    if (!isLoaded || currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading payout settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <DollarSign className="h-6 w-6" />
                    Payout
                </h1>
                <p className="text-gray-400 mt-1">Manage your payout methods and banking details</p>
            </div>

            {/* Payout Settings */}
            <PayoutSettings currentUser={currentUser} />
        </div>
    );
}
