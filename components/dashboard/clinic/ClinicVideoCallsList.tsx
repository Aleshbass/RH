'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Video, Calendar, Clock, Plus, Copy, X, Users, Play, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Doc, Id } from '@/convex/_generated/dataModel';
import StreamVideoCallManager from '@/components/video/StreamVideoCallManager';

// Type definition for video calls
type VideoCall = {
    _id: Id<"videoCalls">;
    roomId: string;
    title?: string;
    patientId?: Id<"users">;
    physiotherapistId?: Id<"users">;
    clinicId?: Id<"clinics">;
    scheduledAt?: number;
    startTime: number;
    endTime?: number;
    status: "scheduled" | "active" | "ended" | "cancelled" | "missed";
    callType: "appointment" | "consultation" | "emergency";
    duration?: number;
    participants: Id<"users">[];
    settings?: {
        recordingEnabled: boolean;
        chatEnabled: boolean;
        maxParticipants: number;
        waitingRoomEnabled: boolean;
    };
    patient?: Partial<Doc<"users">> | null;
    physiotherapist?: Partial<Doc<"users">> | null;
};

export default function ClinicVideoCallsList() {
    const [showVideoManager, setShowVideoManager] = useState(false);
    const [selectedCall, setSelectedCall] = useState<VideoCall | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');

    // Fetch current user and clinic data
    const currentUser = useQuery(api.users.getMyUser);
    const clinic = useQuery(api.clinics.getMyClinic);

    // Fetch clinic video calls
    const allVideoCalls = useQuery(api.videoCalls.getClinicVideoCalls,
        clinic?._id ? { clinicId: clinic._id } : "skip"
    );

    // Actions and Mutations
    const cancelVideoCall = useMutation(api.videoCalls.cancelVideoCall);

    if (!currentUser || !clinic) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-[250px]" />
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-[180px]" />
                    <Skeleton className="h-[180px]" />
                    <Skeleton className="h-[180px]" />
                </div>
            </div>
        );
    }

    const videoCalls = allVideoCalls || [];

    // Filter video calls based on search and filters
    const filteredCalls = videoCalls.filter((call: VideoCall) => {
        const matchesSearch = !searchTerm ||
            call.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            call.patient?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            call.patient?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            call.physiotherapist?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            call.physiotherapist?.lastName?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = statusFilter === 'all' || call.status === statusFilter;
        const matchesType = typeFilter === 'all' || call.callType === typeFilter;

        return matchesSearch && matchesStatus && matchesType;
    });

    const handleJoinCall = (call: VideoCall) => {
        setSelectedCall(call);
        setShowVideoManager(true);
    };

    const handleCancelCall = async (callId: Id<"videoCalls">) => {
        const reason = prompt("Please provide a reason for cancellation:");
        if (!reason) {
            toast.info("Cancellation aborted.");
            return;
        }
        try {
            await cancelVideoCall({ callId, reason });
            toast.success('Video call cancelled');
        } catch (error) {
            console.error(error);
            toast.error('Failed to cancel video call');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'scheduled': return 'bg-blue-100 text-blue-800';
            case 'ended': return 'bg-gray-100 text-gray-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            case 'missed': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'appointment': return 'bg-blue-100 text-blue-800';
            case 'consultation': return 'bg-purple-100 text-purple-800';
            case 'emergency': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Friendly status labels for UI
    const statusLabel = (status: string) => {
        switch (status) {
            case 'active': return 'Active (In Progress)';
            case 'scheduled': return 'Scheduled';
            case 'ended': return 'Completed';
            case 'cancelled': return 'Cancelled';
            case 'missed': return 'Missed';
            default: return status;
        }
    };

    // Determine if we're within the pre-join window (default 10 minutes before scheduled time)
    const isWithinJoinWindow = (scheduledAt?: number, minutes = 10) => {
        if (!scheduledAt) return false;
        const now = Date.now();
        const windowMs = minutes * 60 * 1000;
        return now >= (scheduledAt - windowMs);
    };

    // CTA label based on whether we are close to the scheduled time
    const joinCtaLabel = (scheduledAt?: number) => {
        if (!scheduledAt) return 'Starts at TBD';
        return isWithinJoinWindow(scheduledAt) ? 'Join Now' : `Starts at ${format(new Date(scheduledAt), 'p')}`;
    };

    if (showVideoManager && selectedCall) {
        return (
            <StreamVideoCallManager
                defaultParticipants={selectedCall.participants}
                onCallEnd={() => {
                    setShowVideoManager(false);
                    setSelectedCall(null);
                }}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">Video Calls</h2>
                    <p className="text-gray-500">Manage and monitor all video calls</p>
                </div>
                <Button onClick={() => {
                    // Navigate to create new video call - logic might need adjustment depending on where this component is used
                    // For now, we can perhaps open a modal or redirect to a creation flow if one exists
                    toast.info("Create call functionality to be implemented or integrated with appointment creation");
                }}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Call
                </Button>
            </div>



            {/* Video Calls Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredCalls.map((call: VideoCall) => (
                    <Card key={call._id}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                    <Badge className={getStatusColor(call.status)}>
                                        {statusLabel(call.status)}
                                    </Badge>
                                    <Badge className={getTypeColor(call.callType)}>
                                        {call.callType}
                                    </Badge>
                                </div>
                            </div>
                            <CardTitle className="text-lg">
                                {call.title || `${call.callType} Call`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {call.patient && (
                                    <div className="flex items-center text-sm">
                                        <Users className="h-4 w-4 mr-2 text-gray-500" />
                                        Patient: {call.patient.firstName} {call.patient.lastName}
                                    </div>
                                )}
                                {call.physiotherapist && (
                                    <div className="flex items-center text-sm">
                                        <Users className="h-4 w-4 mr-2 text-gray-500" />
                                        Physio: {call.physiotherapist.firstName} {call.physiotherapist.lastName}
                                    </div>
                                )}
                                <div className="flex items-center text-sm text-gray-500">
                                    <Calendar className="h-4 w-4 mr-2" />
                                    {call.scheduledAt ?
                                        format(new Date(call.scheduledAt), 'PPP') :
                                        format(new Date(call.startTime), 'PPP')
                                    }
                                </div>
                                <div className="flex items-center text-sm text-gray-500">
                                    <Clock className="h-4 w-4 mr-2" />
                                    {call.scheduledAt ?
                                        format(new Date(call.scheduledAt), 'p') :
                                        format(new Date(call.startTime), 'p')
                                    }
                                </div>
                                <div className="flex items-center text-sm text-gray-500">
                                    <Users className="h-4 w-4 mr-2" />
                                    {call.participants.length} participants
                                </div>
                                <div className="flex space-x-2 mt-4">
                                    {call.status === 'active' && (
                                        <Button
                                            className="flex-1"
                                            onClick={() => handleJoinCall(call)}
                                        >
                                            <Video className="h-4 w-4 mr-2" />
                                            Join
                                        </Button>
                                    )}
                                    {call.status === 'scheduled' && (
                                        <>
                                            <Button
                                                className="flex-1"
                                                onClick={() => handleJoinCall(call)}
                                                disabled={!isWithinJoinWindow(call.scheduledAt, 10)}
                                            >
                                                <Video className="h-4 w-4 mr-2" />
                                                {joinCtaLabel(call.scheduledAt)}
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                onClick={() => handleCancelCall(call._id)}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                    {(call.status === 'ended' || call.status === 'cancelled') && (
                                        <Button
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => handleJoinCall(call)}
                                        >
                                            <Eye className="h-4 w-4 mr-2" />
                                            View Details
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                            navigator.clipboard.writeText(call.roomId);
                                            toast.success('Room ID copied');
                                        }}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {filteredCalls.length === 0 && (
                <Card>
                    <CardContent className="p-8 text-center">
                        <Video className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No video calls found</h3>
                        <p className="text-gray-500 mb-4">
                            {searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                                ? 'Try adjusting your filters to see more results.'
                                : 'No video calls have been created yet.'}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
