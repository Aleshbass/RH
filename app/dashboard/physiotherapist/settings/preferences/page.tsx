'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

export default function PreferencesSettingsPage() {
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
                    <p className="text-gray-400">Loading preferences...</p>
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
                            <Select defaultValue="UTC+1 (West Africa Time)">
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
                            <Select defaultValue="English">
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
                            <Select defaultValue="DD/MM/YYYY">
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
                            <Select defaultValue="12h">
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
                </CardContent>
            </Card>
        </div>
    );
}
