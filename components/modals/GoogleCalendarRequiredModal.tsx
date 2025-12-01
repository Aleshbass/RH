'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, CheckCircle2, ExternalLink, Video } from 'lucide-react';

interface GoogleCalendarRequiredModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export function GoogleCalendarRequiredModal({
    isOpen,
    onClose,
    onRefresh,
}: GoogleCalendarRequiredModalProps) {
    const handleGoToSettings = () => {
        // Determine user role based on current path
        const isPatient = window.location.pathname.includes('/dashboard/patient');
        const settingsPath = isPatient
            ? '/dashboard/patient/settings?tab=calendar'
            : '/dashboard/physiotherapist/settings?tab=calendar';

        // Open settings in a new tab
        window.open(settingsPath, '_blank');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Connect Google Calendar</DialogTitle>
                            <DialogDescription className="text-sm text-gray-500">
                                Required for Google Meet appointments
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Alert className="bg-blue-50 border-blue-200">
                        <Video className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-sm text-gray-700 ml-2">
                            To automatically generate Google Meet links, you need to connect your Google Calendar first.
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-3">
                        <h4 className="font-medium text-sm text-gray-900">What you'll get:</h4>
                        <ul className="space-y-2">
                            <li className="flex items-start gap-2 text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>Automatic Google Meet links for every appointment</span>
                            </li>
                            <li className="flex items-start gap-2 text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>Appointments synced to your Google Calendar</span>
                            </li>
                            <li className="flex items-start gap-2 text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>Email invitations sent to patients automatically</span>
                            </li>
                        </ul>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-4 border border-gray-200">
                        <h4 className="font-medium text-sm text-gray-900 mb-2">Quick Setup (1 minute)</h4>
                        <ol className="space-y-1.5 text-sm text-gray-600">
                            <li className="flex gap-2">
                                <span className="font-medium text-gray-900">1.</span>
                                <span>Click "Go to Settings" below</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="font-medium text-gray-900">2.</span>
                                <span>Click "Connect Google Calendar"</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="font-medium text-gray-900">3.</span>
                                <span>Authorize access in the popup</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="font-medium text-gray-900">4.</span>
                                <span>Come back and click "I've Connected"</span>
                            </li>
                        </ol>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleGoToSettings}
                        className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                    >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Go to Settings
                    </Button>
                    <Button
                        onClick={onRefresh}
                        variant="default"
                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        I've Connected
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
