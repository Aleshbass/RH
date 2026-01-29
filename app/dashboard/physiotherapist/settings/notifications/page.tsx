'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Bell } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export default function NotificationsSettingsPage() {
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
                    <p className="text-gray-400">Loading notification settings...</p>
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
                        <Switch defaultChecked className="data-[state=checked]:bg-[#005b57]" />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">New Patient Registrations</h4>
                            <p className="text-sm text-gray-400">Get notified when new patients join</p>
                        </div>
                        <Switch defaultChecked className="data-[state=checked]:bg-[#005b57]" />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Email Notifications</h4>
                            <p className="text-sm text-gray-400">Receive important updates via email</p>
                        </div>
                        <Switch defaultChecked className="data-[state=checked]:bg-[#005b57]" />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Push Notifications</h4>
                            <p className="text-sm text-gray-400">Receive browser push notifications</p>
                        </div>
                        <Switch className="data-[state=checked]:bg-[#005b57]" />
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-white">Marketing Communications</h4>
                            <p className="text-sm text-gray-400">Updates about new features and promotions</p>
                        </div>
                        <Switch className="data-[state=checked]:bg-[#005b57]" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
