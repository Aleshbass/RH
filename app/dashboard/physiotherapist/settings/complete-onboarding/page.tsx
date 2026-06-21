'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Shield, Clock, FileText, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export default function CompleteOnboardingPage() {
    const currentUser = useQuery(api.users.getMyUser);
    const router = useRouter();
    const [isCompleting, setIsCompleting] = useState(false);
    
    // Using any to bypass strict typing for the untyped mutation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiAny = api as unknown as any;
    const clearOnboardingSkipped = useMutation(apiAny.users.clearOnboardingSkipped);

    useEffect(() => {
        // Redirect if not a physio who skipped onboarding
        if (currentUser && (!currentUser.onboardingSkipped || currentUser.role !== 'physiotherapist')) {
            router.replace('/dashboard/physiotherapist/settings/profile');
        }
    }, [currentUser, router]);

    const handleComplete = async () => {
        setIsCompleting(true);
        try {
            await clearOnboardingSkipped();
            toast.success("Profile marked as complete! You're all set.");
            router.push('/dashboard/physiotherapist');
        } catch (error) {
            console.error("Failed to mark onboarding complete:", error);
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsCompleting(false);
        }
    };

    if (currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!currentUser?.onboardingSkipped) {
        return null; // Will be redirected by useEffect
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => router.back()}
                    className="text-gray-400 hover:text-white"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-white">Complete Your Profile</h1>
                    <p className="text-gray-400">Finish these last few steps to get verified</p>
                </div>
            </div>

            <Card className="bg-[#1a1a1a] border-white/10">
                <CardContent className="p-6 space-y-8">
                    {/* Action Items List */}
                    <div className="space-y-6">
                        {/* Credentials */}
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <Shield className="w-5 h-5 text-blue-500" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-medium text-white mb-1">Verify Credentials</h3>
                                <p className="text-sm text-gray-400 mb-3">Add your license details and certification board info to build trust.</p>
                                <Button 
                                    variant="outline" 
                                    className="bg-transparent border-white/20 text-white hover:bg-white/10"
                                    onClick={() => router.push('/dashboard/physiotherapist/settings/profile')}
                                >
                                    Update Profile Settings
                                </Button>
                            </div>
                        </div>

                        {/* Availability */}
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-green-500" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-medium text-white mb-1">Set Availability</h3>
                                <p className="text-sm text-gray-400 mb-3">Define your working hours so patients can book appointments with you.</p>
                                <Button 
                                    variant="outline" 
                                    className="bg-transparent border-white/20 text-white hover:bg-white/10"
                                    onClick={() => router.push('/dashboard/physiotherapist/settings/availability')}
                                >
                                    Manage Schedule
                                </Button>
                            </div>
                        </div>

                        {/* Documents */}
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-purple-500" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-medium text-white mb-1">Upload Documents</h3>
                                <p className="text-sm text-gray-400 mb-3">Securely upload your ID and practicing license for verification.</p>
                                <Button 
                                    variant="outline" 
                                    className="bg-transparent border-white/20 text-white hover:bg-white/10"
                                    onClick={() => toast.info("Document upload coming soon")}
                                >
                                    Upload Documents
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/10 pt-6">
                        <div className="bg-[#0a0a0a] rounded-xl p-5 border border-white/5">
                            <h4 className="font-medium text-white flex items-center gap-2 mb-2">
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                Done with everything?
                            </h4>
                            <p className="text-sm text-gray-400 mb-4">
                                Once you have completed all the optional sections above, click the button below to submit your profile for final review.
                            </p>
                            <Button 
                                onClick={handleComplete} 
                                disabled={isCompleting}
                                className="w-full bg-[#005b57] hover:bg-[#00443e] text-white"
                            >
                                {isCompleting ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                                ) : (
                                    "I've completed my profile"
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
