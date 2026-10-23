'use client';

import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { primaryButtonClass, StatusBadge } from '@/components/physio/ui';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';

function GoogleCalendarMark() {
    return (
        <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
        </svg>
    );
}

export default function CalendarSettingsPage() {
    const user = useQuery(api.users.getMyUser);
    const credentials = useQuery(api.calendar.oauth.getCredentials, user ? { userId: user._id } : 'skip');
    const generateAuthUrl = useAction(api.calendar.oauth.generateAuthUrl);
    const disconnectCalendar = useMutation(api.calendar.oauth.disconnectGoogleCalendar);
    const [connecting, setConnecting] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const connect = async () => {
        if (!user) return;
        setConnecting(true);
        try {
            const { authUrl } = await generateAuthUrl({
                userId: user._id,
                platform: 'google',
                redirectUri: `${window.location.origin}/api/calendar/oauth/callback`,
            });
            window.location.href = authUrl;
        } catch {
            toast.error('Couldn’t start the Google sign-in. Try again.');
            setConnecting(false);
        }
    };

    const disconnect = async () => {
        if (!user) return;
        setConfirmOpen(false);
        setDisconnecting(true);
        try {
            await disconnectCalendar({ userId: user._id });
            toast.success('Google Calendar disconnected');
        } catch {
            toast.error('Couldn’t disconnect. Try again.');
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Calendar sync"
                description="Give your video sessions a Google Meet link and put them in your Google Calendar."
            />

            <SettingsSection>
                {credentials === undefined ? (
                    <Skeleton className="h-14 rounded-lg" />
                ) : (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-700">
                                <GoogleCalendarMark />
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-neutral-900 dark:text-white">Google Calendar</p>
                                    {credentials && <StatusBadge tone="green">Connected</StatusBadge>}
                                </div>
                                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
                                    {credentials
                                        ? 'New video sessions are added to your Google Calendar with a Google Meet link. In-person visits stay in your Rehabify calendar for now.'
                                        : 'Connect so new video sessions get a Google Meet link and appear in your Google Calendar. In-person visits stay in your Rehabify calendar for now.'}
                                </p>
                            </div>
                        </div>
                        {credentials ? (
                            <Button
                                variant="outline"
                                onClick={() => setConfirmOpen(true)}
                                disabled={disconnecting}
                                className="shrink-0"
                            >
                                {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Disconnect
                            </Button>
                        ) : (
                            <Button onClick={connect} disabled={connecting || !user} className={`shrink-0 ${primaryButtonClass}`}>
                                {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Connect
                            </Button>
                        )}
                    </div>
                )}
            </SettingsSection>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect Google Calendar?</AlertDialogTitle>
                        <AlertDialogDescription>
                            New video sessions won’t get Google Meet links or appear in your Google Calendar.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={disconnect} className="bg-red-600 text-white hover:bg-red-700">
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
