'use client';

import { useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Video, Calendar, Clock, Plus, Copy, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Id } from '@/convex/_generated/dataModel';
import VideoCallManager from '@/components/video/VideoCallManager';
// Removed deprecated InferQueryOutput import

// Simple type definition to avoid complex inference
type VideoCall = {
  _id: Id<"videoCalls">;
  roomId: string;
  patientId: Id<"users">;
  physiotherapistId: Id<"users">;
  scheduledAt: number;
  status: "scheduled" | "active" | "completed" | "cancelled";
  duration?: number;
  recordingUrl?: string;
  meetingLink: string;
  platform: string;
  notes?: string;
  patient?: any;
};

export default function VideoCallsPage() {
  const [showNewCall, setShowNewCall] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [title, setTitle] = useState('');
  const [activeCall, setActiveCall] = useState<VideoCall | null>(null);

  const videoCalls = useQuery(api.videoCalls.getMyVideoCalls, {});
  const patients = useQuery(api.patients.getMyPatients, {});
  const currentUser = useQuery(api.users.getMyUser);

  const createVideoCall = useAction(api.videoCalls.createVideoCall);
  const startVideoCall = useMutation(api.videoCalls.startVideoCall);
  const cancelVideoCall = useMutation(api.videoCalls.cancelVideoCall);

  if (!videoCalls || !patients || !currentUser) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          <Skeleton className="h-12 w-[250px]" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
            <Skeleton className="h-[180px]" />
          </div>
        </div>
      </div>
    );
  }

  const handleScheduleCall = async () => {
    if (!selectedPatient || !scheduledAt || !title) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      // Use createVideoCall to integrate with Daily.co
      const result = await createVideoCall({
        participants: [selectedPatient as Id<"users">],
        callType: 'appointment',
        title,
        settings: {
          recordingEnabled: false,
          chatEnabled: true,
          maxParticipants: 2,
          waitingRoomEnabled: false,
          screenShareEnabled: true,
          durationMinutes: 30
        }
      });

      setShowNewCall(false);
      setSelectedPatient('');
      setMeetingNotes('');
      setTitle('');
      setScheduledAt('');
      toast.success('Video call scheduled successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to schedule video call');
    }
  };

  const handleStartCall = async (call: VideoCall) => {
    try {
      await startVideoCall({ callId: call._id });
      
      // For Daily.co calls, use the roomId directly (it should be the Daily room name)
      console.log('Starting Daily.co call with room ID:', call.roomId);
      
      setActiveCall(call);
      
      toast.success('Video call started');
    } catch (error) {
      console.error(error);
      toast.error('Failed to start video call');
    }
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

  const handleEndCall = () => {
    setActiveCall(null);
    toast.success('Video call ended');
  };

  // If there's an active call, show the VideoCallManager
  if (activeCall) {
    return (
      <VideoCallManager
        appointmentId={undefined}
        defaultParticipants={[activeCall.patientId]}
        onCallEnd={handleEndCall}
      />
    );
  }


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Video Calls</h1>
          <p className="text-gray-500">Manage your telehealth sessions</p>
        </div>
        <Button onClick={() => setShowNewCall(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Call
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {videoCalls.map((call: any) => (
          <Card key={call._id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant={call.status === 'scheduled' ? 'default' : 'secondary'}>
                  {call.status}
                </Badge>
                <Badge variant="outline">{call.platform}</Badge>
              </div>
              <CardTitle className="text-lg">{call.patient?.firstName} {call.patient?.lastName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-500">
                  <Calendar className="h-4 w-4 mr-2" />
                  {call.scheduledAt 
                    ? format(new Date(call.scheduledAt), 'PPP')
                    : call.startTime
                      ? format(new Date(call.startTime), 'PPP')
                      : 'No date scheduled'
                  }
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="h-4 w-4 mr-2" />
                  {call.scheduledAt 
                    ? format(new Date(call.scheduledAt), 'p')
                    : call.startTime
                      ? format(new Date(call.startTime), 'p')
                      : 'No time scheduled'
                  }
                </div>
                {call.notes && (
                  <p className="text-sm text-gray-500 mt-2">{call.notes}</p>
                )}
                <div className="flex space-x-2 mt-4">
                  <Button
                    className="flex-1"
                    onClick={() => handleStartCall(call)}
                    disabled={call.status !== 'scheduled'}
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Start
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(call.meetingLink);
                      toast.success('Meeting link copied');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleCancelCall(call._id)}
                    disabled={call.status !== 'scheduled'}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New Call Modal */}
      <Dialog open={showNewCall} onOpenChange={setShowNewCall}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a New Video Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Call Title</Label>
              <Textarea id="title" placeholder="e.g., Follow-up session for John Doe" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="patient">Patient</Label>
              <Select onValueChange={setSelectedPatient} value={selectedPatient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient: any) => (
                    <SelectItem key={patient!._id} value={patient!._id}>
                      {patient!.firstName} {patient!.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="scheduledAt">Date and Time</Label>
              <input type="datetime-local" id="scheduledAt" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Any notes for the call..." value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleScheduleCall} className="w-full">
            Schedule Call
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
} 