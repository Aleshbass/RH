'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface NotificationPreferences {
    appointmentReminders: boolean;
    newPatientRegistrations: boolean;
    emailNotifications: boolean;
    pushNotifications: boolean;
    marketingCommunications: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    appointmentReminders: true,
    newPatientRegistrations: true,
    emailNotifications: true,
    pushNotifications: false,
    marketingCommunications: false,
};

export default function NotificationsSettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();

    const currentUser = useQuery(api.users.getMyUser);

    // Controlled state for notification preferences
    const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Mutation for updating preferences
    const updatePreferencesMutation = useMutation(api.users.updateNotificationPreferences);

    // Initialize preferences from user data
    useEffect(() => {
        // @ts-ignore - Schema updated but types might lag
        if (currentUser?.notificationPreferences) {
            setPreferences({
                // @ts-ignore
                appointmentReminders: currentUser.notificationPreferences.appointmentReminders ?? true,
                // @ts-ignore
                newPatientRegistrations: currentUser.notificationPreferences.newPatientRegistrations ?? true,
                // @ts-ignore
                emailNotifications: currentUser.notificationPreferences.emailNotifications ?? true,
                // @ts-ignore
                pushNotifications: currentUser.notificationPreferences.pushNotifications ?? false,
                // @ts-ignore
                marketingCommunications: currentUser.notificationPreferences.marketingCommunications ?? false,
            });
        }
    }, [currentUser]);

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

    const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean) => {
        setPreferences(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updatePreferencesMutation({ notificationPreferences: preferences });
            toast.success('Notification preferences saved');
            setHasChanges(false);
        } catch (error) {
            console.error('Error saving preferences:', error);
            toast.error('Failed to save notification preferences');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isLoaded || currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading notification settings...</p>
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

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Bell className="h-6 w-6" />
                    Notifications
                </h1>
                <p className="text-gray-400 mt-1">Manage your notification preferences</p>
            </div>

            {/* Notifications Card */}
            <Card className="bg-[#1a1a1a] border-white/10">
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Appointment Reminders</h4>
                            <p className="text-sm text-gray-400">Get notified about upcoming appointments</p>
                        </div>
                        <Switch
                            checked={preferences.appointmentReminders}
                            onCheckedChange={(checked) => handlePreferenceChange('appointmentReminders', checked)}
                            className="data-[state=checked]:bg-[#005b57]"
                        />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">New Patient Registrations</h4>
                            <p className="text-sm text-gray-400">Get notified when new patients join</p>
                        </div>
                        <Switch
                            checked={preferences.newPatientRegistrations}
                            onCheckedChange={(checked) => handlePreferenceChange('newPatientRegistrations', checked)}
                            className="data-[state=checked]:bg-[#005b57]"
                        />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Email Notifications</h4>
                            <p className="text-sm text-gray-400">Receive important updates via email</p>
                        </div>
                        <Switch
                            checked={preferences.emailNotifications}
                            onCheckedChange={(checked) => handlePreferenceChange('emailNotifications', checked)}
                            className="data-[state=checked]:bg-[#005b57]"
                        />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Push Notifications</h4>
                            <p className="text-sm text-gray-400">Receive browser push notifications</p>
                        </div>
                        <Switch
                            checked={preferences.pushNotifications}
                            onCheckedChange={(checked) => handlePreferenceChange('pushNotifications', checked)}
                            className="data-[state=checked]:bg-[#005b57]"
                        />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Marketing Communications</h4>
                            <p className="text-sm text-gray-400">Updates about new features and promotions</p>
                        </div>
                        <Switch
                            checked={preferences.marketingCommunications}
                            onCheckedChange={(checked) => handlePreferenceChange('marketingCommunications', checked)}
                            className="data-[state=checked]:bg-[#005b57]"
                        />
                    </div>

                    {/* Save Button */}
                    {hasChanges && (
                        <>
                            <Separator className="bg-white/10" />
                            <div className="flex justify-end pt-2">
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-[#005b57] hover:bg-[#00443e] text-white"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
