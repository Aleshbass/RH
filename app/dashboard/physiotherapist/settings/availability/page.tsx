'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AvailabilityScheduler } from '@/components/onboarding/common/AvailabilityScheduler';
import { toast } from 'sonner';

export default function AvailabilitySettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const currentUser = useQuery(api.users.getMyUser);
    const currentUserProfile = useQuery(api.queries.getCurrentUser);
    const updateAvailabilityMutation = useMutation(api.physiotherapists.updateAvailability);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [availabilitySchedule, setAvailabilitySchedule] = useState<any>(null);

    useEffect(() => {
        if (currentUserProfile?.profileData?.availabilitySchedule) {
            setAvailabilitySchedule(currentUserProfile.profileData.availabilitySchedule);
        }
    }, [currentUserProfile]);

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

                    {availabilitySchedule ? (
                        <AvailabilityScheduler
                            value={availabilitySchedule}
                            onChange={setAvailabilitySchedule}
                        />
                    ) : (
                        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-white/10">
                            {[...Array(7)].map((_, i) => (
                                <div key={i} className="flex flex-col py-4 border-b border-white/10 last:border-0">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4 w-32 pt-2">
                                            <Skeleton className="h-6 w-10 rounded-full bg-white/10" />
                                            <Skeleton className="h-4 w-16 bg-white/10" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 justify-end">
                                                <Skeleton className="h-9 w-28 bg-white/10" />
                                                <Skeleton className="h-9 w-28 bg-white/10" />
                                                <Skeleton className="h-8 w-8 rounded-md bg-white/10" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-end pt-4">
                        <Button
                            onClick={handleSaveAvailability}
                            disabled={isSaving}
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
