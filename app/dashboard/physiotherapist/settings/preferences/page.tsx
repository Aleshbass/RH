'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

interface Preferences {
    timezone: string;
    language: string;
    dateFormat: string;
    timeFormat: string;
}

const DEFAULT_PREFERENCES: Preferences = {
    timezone: 'UTC+1 (West Africa Time)',
    language: 'English',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
};

export default function PreferencesSettingsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useAuth();

    const currentUser = useQuery(api.users.getMyUser);

    // Controlled state for preferences
    const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Mutation for updating preferences
    const updatePreferencesMutation = useMutation(api.users.updateUserPreferences);

    // Initialize preferences from user data
    useEffect(() => {
        // @ts-ignore - Schema updated but types might lag
        if (currentUser?.preferences) {
            setPreferences({
                // @ts-ignore
                timezone: currentUser.preferences.timezone || DEFAULT_PREFERENCES.timezone,
                // @ts-ignore
                language: currentUser.preferences.language || DEFAULT_PREFERENCES.language,
                // @ts-ignore
                dateFormat: currentUser.preferences.dateFormat || DEFAULT_PREFERENCES.dateFormat,
                // @ts-ignore
                timeFormat: currentUser.preferences.timeFormat || DEFAULT_PREFERENCES.timeFormat,
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

    const handlePreferenceChange = (key: keyof Preferences, value: string) => {
        setPreferences(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updatePreferencesMutation({ preferences });
            toast.success('Preferences saved successfully');
            setHasChanges(false);
        } catch (error) {
            console.error('Error saving preferences:', error);
            toast.error('Failed to save preferences');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isLoaded || currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-400">Loading preferences...</p>
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
                    <Settings className="h-6 w-6" />
                    Preferences
                </h1>
                <p className="text-gray-400 mt-1">Customize your app preferences</p>
            </div>

            {/* Preferences Card */}
            <Card className="bg-[#1a1a1a] border-white/10">
                <CardContent className="p-6 space-y-6">
                    <div>
                        <Label htmlFor="timezone" className="text-gray-300">Timezone</Label>
                        <div className="mt-1.5">
                            <Select
                                value={preferences.timezone}
                                onValueChange={(value) => handlePreferenceChange('timezone', value)}
                            >
                                <SelectTrigger
                                    id="timezone"
                                    className="w-full bg-[#0a0a0a] border-white/10 text-white"
                                >
                                    <SelectValue placeholder="Select timezone" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-white/10">
                                    <SelectItem value="UTC+1 (West Africa Time)" className="text-white focus:bg-white/10 focus:text-white">
                                        UTC+1 (West Africa Time)
                                    </SelectItem>
                                    <SelectItem value="UTC (Greenwich Mean Time)" className="text-white focus:bg-white/10 focus:text-white">
                                        UTC (Greenwich Mean Time)
                                    </SelectItem>
                                    <SelectItem value="UTC-5 (Eastern Time)" className="text-white focus:bg-white/10 focus:text-white">
                                        UTC-5 (Eastern Time)
                                    </SelectItem>
                                    <SelectItem value="UTC-8 (Pacific Time)" className="text-white focus:bg-white/10 focus:text-white">
                                        UTC-8 (Pacific Time)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <div>
                        <Label htmlFor="language" className="text-gray-300">Language</Label>
                        <div className="mt-1.5">
                            <Select
                                value={preferences.language}
                                onValueChange={(value) => handlePreferenceChange('language', value)}
                            >
                                <SelectTrigger
                                    id="language"
                                    className="w-full bg-[#0a0a0a] border-white/10 text-white"
                                >
                                    <SelectValue placeholder="Select language" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-white/10">
                                    <SelectItem value="English" className="text-white focus:bg-white/10 focus:text-white">
                                        English
                                    </SelectItem>
                                    <SelectItem value="French" className="text-white focus:bg-white/10 focus:text-white">
                                        French
                                    </SelectItem>
                                    <SelectItem value="Yoruba" className="text-white focus:bg-white/10 focus:text-white">
                                        Yoruba
                                    </SelectItem>
                                    <SelectItem value="Hausa" className="text-white focus:bg-white/10 focus:text-white">
                                        Hausa
                                    </SelectItem>
                                    <SelectItem value="Igbo" className="text-white focus:bg-white/10 focus:text-white">
                                        Igbo
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <div>
                        <Label htmlFor="dateFormat" className="text-gray-300">Date Format</Label>
                        <div className="mt-1.5">
                            <Select
                                value={preferences.dateFormat}
                                onValueChange={(value) => handlePreferenceChange('dateFormat', value)}
                            >
                                <SelectTrigger
                                    id="dateFormat"
                                    className="w-full bg-[#0a0a0a] border-white/10 text-white"
                                >
                                    <SelectValue placeholder="Select date format" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-white/10">
                                    <SelectItem value="DD/MM/YYYY" className="text-white focus:bg-white/10 focus:text-white">
                                        DD/MM/YYYY
                                    </SelectItem>
                                    <SelectItem value="MM/DD/YYYY" className="text-white focus:bg-white/10 focus:text-white">
                                        MM/DD/YYYY
                                    </SelectItem>
                                    <SelectItem value="YYYY-MM-DD" className="text-white focus:bg-white/10 focus:text-white">
                                        YYYY-MM-DD
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <div>
                        <Label htmlFor="timeFormat" className="text-gray-300">Time Format</Label>
                        <div className="mt-1.5">
                            <Select
                                value={preferences.timeFormat}
                                onValueChange={(value) => handlePreferenceChange('timeFormat', value)}
                            >
                                <SelectTrigger
                                    id="timeFormat"
                                    className="w-full bg-[#0a0a0a] border-white/10 text-white"
                                >
                                    <SelectValue placeholder="Select time format" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1a1a] border-white/10">
                                    <SelectItem value="12h" className="text-white focus:bg-white/10 focus:text-white">
                                        12h (AM/PM)
                                    </SelectItem>
                                    <SelectItem value="24h" className="text-white focus:bg-white/10 focus:text-white">
                                        24h
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Save Button */}
                    {hasChanges && (
                        <>
                            <Separator className="bg-white/10" />
                            <div className="flex justify-end">
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
