'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AvailabilityScheduler } from '@/components/onboarding/common/AvailabilityScheduler';
import { toast } from 'sonner';

// Default empty schedule for new users
const DEFAULT_SCHEDULE = {
    monday: { isOpen: false, slots: [] },
    tuesday: { isOpen: false, slots: [] },
    wednesday: { isOpen: false, slots: [] },
    thursday: { isOpen: false, slots: [] },
    friday: { isOpen: false, slots: [] },
    saturday: { isOpen: false, slots: [] },
    sunday: { isOpen: false, slots: [] },
};

export default function AvailabilitySettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [isDataLoading, setIsDataLoading] = useState(true);

    const currentUser = useQuery(api.users.getMyUser);
    const currentUserProfile = useQuery(api.queries.getCurrentUser);
    const updateAvailabilityMutation = useMutation(api.physiotherapists.updateAvailability);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [availabilitySchedule, setAvailabilitySchedule] = useState<any>(DEFAULT_SCHEDULE);

    useEffect(() => {
        if (currentUserProfile !== undefined) {
            setIsDataLoading(false);
            if (currentUserProfile?.profileData?.availabilitySchedule) {
                setAvailabilitySchedule(currentUserProfile.profileData.availabilitySchedule);
            }
        }
    }, [currentUserProfile]);

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push('/sign-in');
        }
    }, [isLoaded, isSignedIn, router]);

    useEffect(() => {
        // Wait for auth to load before checking user
        if (!isLoaded) return;

        // Handle null (no Convex record) or wrong role
        if (currentUser === null) {
            router.push('/sign-in');
        } else if (currentUser && currentUser.role !== 'physiotherapist') {
            router.push('/dashboard');
        }
    }, [isLoaded, currentUser, router]);

    if (!isLoaded || currentUser === undefined || currentUserProfile === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading availability...</p>
                </div>
            </div>
        );
    }

    // Handle null currentUser
    if (currentUser === null) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <p className="text-gray-400">User profile not found</p>
                </div>
            </div>
        );
    }

    const handleSaveAvailability = async () => {
        if (!availabilitySchedule) return;
        setIsSaving(true);
        try {
            await updateAvailabilityMutation({ availabilitySchedule });
            toast.success('Availability schedule updated successfully!');
        } catch (error) {
            console.error('Error saving availability:', error);
            toast.error('Failed to update availability. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Clock className="h-6 w-6" />
                    Availability
                </h1>
                <p className="text-gray-400 mt-1">Set your weekly availability for patient bookings</p>
            </div>

            {/* Availability Card */}
            <Card className="bg-[#1a1a1a] border-white/10">
                <CardContent className="p-6 space-y-6">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                        <p className="text-sm text-blue-300">
                            Set your weekly availability here. This schedule will be visible to patients when they book appointments with you.
                        </p>
                    </div>

                    {isDataLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <AvailabilityScheduler
                            value={availabilitySchedule}
                            onChange={setAvailabilitySchedule}
                        />
                    )}

                    <div className="flex justify-end pt-4">
                        <Button
                            onClick={handleSaveAvailability}
                            disabled={isSaving || isDataLoading}
                            className="bg-[#005b57] hover:bg-[#00443e] text-white"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Availability'
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
