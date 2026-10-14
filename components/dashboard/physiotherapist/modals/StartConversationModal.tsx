'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Id } from '@/convex/_generated/dataModel';
import { useRouter } from 'next/navigation';

interface StartConversationModalProps {
    isOpen: boolean;
    onClose: () => void;
    preselectedPatientId?: string;
}

export function StartConversationModal({ isOpen, onClose, preselectedPatientId }: StartConversationModalProps) {
    const [newConversationPatientId, setNewConversationPatientId] = useState<string | null>(preselectedPatientId || null);
    const router = useRouter();

    const patients = useQuery(api.patients.getMyPatients, {});
    const getOrCreateConversation = useMutation(api.chat.getOrCreateConversation);

    useEffect(() => {
        if (preselectedPatientId) {
            setNewConversationPatientId(preselectedPatientId);
        }
    }, [preselectedPatientId]);

    const handleStartChat = async () => {
        if (!newConversationPatientId) return;
        try {
            await getOrCreateConversation({ participantId: newConversationPatientId as Id<"users"> });
            onClose();
            // Open Messages with this patient's conversation selected
            router.push(`/dashboard/physiotherapist/messages?with=${newConversationPatientId}`);
        } catch (error) {
            toast.error('Failed to start conversation');
            console.error('Start conversation error:', error);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Start New Conversation</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Select
                        value={newConversationPatientId || ''}
                        onValueChange={(value) => setNewConversationPatientId(value)}
                        disabled={!!preselectedPatientId}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a patient" />
                        </SelectTrigger>
                        <SelectContent>
                            {patients?.filter((patient: { _id: string; firstName?: string; lastName?: string } | null): patient is NonNullable<typeof patient> => patient !== null).map((patient: { _id: string; firstName?: string; lastName?: string }) => (
                                <SelectItem key={patient._id} value={patient._id}>
                                    {patient.firstName || 'Unknown'} {patient.lastName || ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    disabled={!newConversationPatientId}
                    onClick={handleStartChat}
                    className="w-full"
                >
                    Start Chat
                </Button>
            </DialogContent>
        </Dialog>
    );
}
