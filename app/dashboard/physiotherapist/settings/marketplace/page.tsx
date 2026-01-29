'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Store, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import MarketplaceSettingsForm from '@/components/marketplace/MarketplaceSettingsForm';

export default function MarketplaceSettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();

    const currentUser = useQuery(api.users.getMyUser);
    const marketplaceSettings = useQuery(api.marketplace.settings.getMyMarketplaceSettings);

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push('/sign-in');
        }
    }, [isLoaded, isSignedIn, router]);

    useEffect(() => {
        // Handle null (no Convex record) or wrong role
        if (!currentUser || currentUser.role !== 'physiotherapist') {
            if (currentUser !== undefined) {
                router.push('/dashboard');
            }
        }
    }, [currentUser, router]);

    // Show loading while auth or user data is loading
    if (!isLoaded || currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading marketplace settings...</p>
                </div>
            </div>
        );
    }

    // Handle null currentUser (no Convex record) or incorrect role
    if (currentUser === null || (currentUser && currentUser.role !== 'physiotherapist')) {
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
                    <Store className="h-6 w-6" />
                    Marketplace
                </h1>
                <p className="text-gray-400 mt-1">Manage your marketplace profile and visibility settings</p>
            </div>

            {/* Marketplace Card - Light mode wrapper for form component */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
                {/* Loading state - marketplaceSettings is undefined */}
                {marketplaceSettings === undefined && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                )}

                {/* Empty state - marketplaceSettings is null (no settings exist yet) */}
                {marketplaceSettings === null && (
                    <div className="py-8 text-center">
                        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            No marketplace settings found
                        </h3>
                        <p className="text-gray-500 mb-6 max-w-md mx-auto">
                            Set up your marketplace profile to start receiving bookings from patients.
                        </p>
                        <MarketplaceSettingsForm settings={null} />
                    </div>
                )}

                {/* Settings exist - render form with settings */}
                {marketplaceSettings && (
                    <MarketplaceSettingsForm settings={marketplaceSettings} />
                )}
            </div>
        </div>
    );
}
