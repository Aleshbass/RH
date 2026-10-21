'use client';

import { useState } from 'react';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import { Loader2, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CalendarConnectionStatusProps {
    currentUser: any;
}

export function CalendarConnectionStatus({ currentUser }: CalendarConnectionStatusProps) {
    const credentials = useQuery(api.calendar.oauth.getCredentials, currentUser ? { userId: currentUser._id } : 'skip');
    const generateAuthUrl = useAction(api.calendar.oauth.generateAuthUrl);
    const disconnectCalendar = useMutation(api.calendar.oauth.disconnectGoogleCalendar);
    const [isLoading, setIsLoading] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);

    const handleConnect = async () => {
        setIsLoading(true);
        try {
            const { authUrl } = await generateAuthUrl({
                userId: currentUser._id,
                platform: 'google',
                redirectUri: `${window.location.origin}/api/calendar/oauth/callback`,
            });
            window.location.href = authUrl;
        } catch (error) {
            console.error('Failed to generate auth URL:', error);
            setIsLoading(false);
        }
    };

    const handleDisconnect = () => {
        console.log("Disconnect button clicked");
        setShowDisconnectModal(true);
    };

    const confirmDisconnect = async () => {
        setShowDisconnectModal(false);
        setIsDisconnecting(true);
        try {
            await disconnectCalendar({ userId: currentUser._id });
            toast.success('Calendar disconnected successfully');
        } catch (error) {
            console.error('Failed to disconnect calendar:', error);
            toast.error('Failed to disconnect calendar. Please try again.');
        } finally {
            setIsDisconnecting(false);
        }
    };

    if (credentials === undefined) {
        return (
            <div className="flex items-center justify-center p-8 border rounded-lg bg-gray-50 border-dashed">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" />
                <span className="text-sm text-gray-500">Checking calendar status...</span>
            </div>
        );
    }

    return (
        <>
            {credentials ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border rounded-xl bg-white shadow-sm border-gray-200 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-50 p-3 rounded-full border border-blue-100">
                            <svg className="w-8 h-8" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
                            </svg>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-900 text-lg">Google account connected</h4>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                    Coming soon
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Rehabify doesn&apos;t add your visits to Google Calendar yet. Your appointments and video links are in Rehabify and your emails. You can disconnect at any time.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={handleDisconnect}
                        disabled={isDisconnecting}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 transition-colors w-full sm:w-auto"
                    >
                        {isDisconnecting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Disconnecting...
                            </>
                        ) : (
                            'Disconnect Calendar'
                        )}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border rounded-xl bg-white shadow-sm border-gray-200 gap-4 hover:border-blue-300 transition-colors">
                    <div className="flex items-center gap-4">
                        <div className="bg-gray-100 p-3 rounded-full">
                            <Calendar className="w-8 h-8 text-gray-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-gray-900 text-lg">Google Calendar</h4>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                    Coming soon
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Adding your visits to Google Calendar is coming soon. Until then, your appointments and video links are in Rehabify and your emails.
                            </p>
                        </div>
                    </div>
                    {/* Nothing uses a patient's Google connection yet, so connecting is off until it does */}
                    <Button
                        onClick={handleConnect}
                        disabled
                        aria-disabled="true"
                        className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto shadow-sm"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" />
                                    <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="currentColor" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="currentColor" />
                                </svg>
                                Coming soon
                            </>
                        )}
                    </Button>
                </div>
            )}

            {/* Disconnect Confirmation Modal */}
            <AlertDialog open={showDisconnectModal} onOpenChange={setShowDisconnectModal}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="bg-red-100 p-2 rounded-full">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <AlertDialogTitle className="text-xl">Disconnect Calendar?</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="text-base text-gray-600 leading-relaxed">
                            Rehabify will stop holding access to your Google account. Nothing in your Rehabify appointments changes.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-2">
                        <AlertDialogCancel className="m-0">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDisconnect}
                            className="bg-red-600 hover:bg-red-700 text-white m-0"
                        >
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
