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
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Id } from '@/convex/_generated/dataModel';
import StreamVideoCallManager from '@/components/video/StreamVideoCallManager';
import { PatientProfileMiniCard } from '@/components/dashboard/physiotherapist/PatientProfileMiniCard';
// Removed deprecated InferQueryOutput import

// Simple type definition to avoid complex inference
type Patient = {
  _id: Id<"users">;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type VideoCall = {
  _id: Id<"videoCalls">;
  roomId: string;
  title?: string;
  patientId?: Id<"users">;
  physiotherapistId?: Id<"users">;
  scheduledAt?: number;
  status: "scheduled" | "active" | "completed" | "cancelled";
  startTime?: number;
  duration?: number;
  recordingUrl?: string;
  meetingLink: string;
  platform: string;
  notes?: string;
  patient?: Patient;
  streamCallId?: string;
};

// Friendly status labels for UI
const statusLabel = (status: string) => {
  switch (status) {
    case 'active': return 'Active (In Progress)';
    case 'scheduled': return 'Scheduled';
    case 'ended':
    case 'completed': return 'Completed';
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

export default function VideoCallsPage() {
  const router = useRouter();
  const [showNewCall, setShowNewCall] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Id<'users'> | ''>('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [title, setTitle] = useState('');
  const [activeCall, setActiveCall] = useState<VideoCall | null>(null);
  const [invitePreviewOpen, setInvitePreviewOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState({
    patientEmail: '',
    patientName: '',
    physiotherapistName: '',
    callLink: '',
    callTitle: '',
    scheduledAt: '',
    message: ''
  });
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmData, setConfirmData] = useState<{
    patientName: string;
    patientEmail: string;
    scheduledTime: string;
    title: string;
  } | null>(null);

  const videoCalls = useQuery(api.videoCalls.getMyVideoCalls, {}) as VideoCall[] | undefined;
  const patients = useQuery(api.patients.getMyPatients, {}) as Patient[] | undefined;

  const createVideoCall = useAction(api.videoCalls.createVideoCall);
  const sendVideoCallInvitation = useAction(api["actions/emails/sendVideoCallInvitation"].sendVideoCallInvitation)
  const me = useQuery(api.users.getMyUser)
  const startVideoCall = useMutation(api.videoCalls.startVideoCall);
  const cancelVideoCall = useMutation(api.videoCalls.cancelVideoCall);

  if (!videoCalls || !patients) {
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

    // Show confirmation dialog before creating call
    const patient = (patients || []).find(p => String(p._id) === String(selectedPatient));
    setConfirmData({
      patientName: `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
      patientEmail: patient?.email || 'No email on file',
      scheduledTime: format(new Date(scheduledAt), 'PPP p'),
      title
    });
    setShowConfirmDialog(true);
  };

  const confirmScheduleCall = async () => {
    if (!selectedPatient || !scheduledAt || !title) {
      return;
    }

    setShowConfirmDialog(false);

    try {
      // Create the video call with Stream
      const result = await createVideoCall({
        participants: [selectedPatient as Id<'users'>],
        callType: 'appointment',
        title,
        settings: {
          recordingEnabled: false,
          chatEnabled: true,
          maxParticipants: 10,
          waitingRoomEnabled: false,
          screenShareEnabled: true,
          durationMinutes: 60
        }
      });

      // Compose meeting link for invitations
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://rehabifyhealth.com')
      const callLink = `${baseUrl}/video-call/${result?.streamCallId || result?.roomId}`

      // Auto-send the invitation email (restores previous behavior)
      try {
        const patient = (patients || []).find(p => String(p._id) === String(selectedPatient))
        if (patient?.email) {
          await sendVideoCallInvitation({
            patientEmail: patient.email,
            patientName: `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || undefined,
            physiotherapistName: `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Your physiotherapist',
            callLink,
            callTitle: title,
            scheduledAt: scheduledAt ? new Date(scheduledAt).getTime() : undefined,
            message: undefined,
          } as {
            patientEmail: string;
            patientName?: string;
            physiotherapistName: string;
            callLink: string;
            callTitle?: string;
            scheduledAt?: number;
            message?: string;
          })
          toast.success('Invitation email sent')
        } else {
          toast.warning('Patient has no email on file. Please add an email or send manually.')
        }
      } catch (e) {
        console.error(e)
        toast.error('Failed to send invitation email')
      }

      // Open preview modal to confirm email before sending
      const patient = (patients || []).find(p => String(p._id) === selectedPatient)
      setInviteDraft({
        patientEmail: patient?.email || '',
        patientName: `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
        physiotherapistName: `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Your physiotherapist',
        callLink,
        callTitle: title,
        scheduledAt,
        message: ''
      })
      setInvitePreviewOpen(true)

      setShowNewCall(false);
      setSelectedPatient('');
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
      
      // Route straight into the Stream call page (ignore any legacy Daily links)
      const sanitizedLink = (call.meetingLink && !call.meetingLink.includes('daily.co'))
        ? call.meetingLink
        : `/video-call/${call.streamCallId || call.roomId}`;
      router.push(sanitizedLink);
      
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

  const handleInvite = async (call: VideoCall) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://rehabifyhealth.com')
    const callLink = (call.meetingLink && !call.meetingLink.includes('daily.co'))
      ? call.meetingLink
      : `${baseUrl}/video-call/${call.streamCallId || call.roomId}`

    const patient = call.patient || (patients || []).find(p => String(p._id) === String(call.patientId))
    setInviteDraft({
      patientEmail: patient?.email || '',
      patientName: `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim(),
      physiotherapistName: `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Your physiotherapist',
      callLink,
      callTitle: call?.title || 'Telehealth Session',
      scheduledAt: call.scheduledAt ? new Date(call.scheduledAt).toISOString().slice(0,16) : '',
      message: ''
    })
    setInvitePreviewOpen(true)
  }

  // If there's an active call, show the StreamVideoCallManager
  if (activeCall) {
    return (
      <StreamVideoCallManager
        appointmentId={undefined}
        defaultParticipants={activeCall.patientId ? [activeCall.patientId] : []}
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
        {videoCalls.map((call: VideoCall) => (
          <Card key={call._id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <Badge variant={call.status === 'scheduled' ? 'default' : 'secondary'}>
                  {statusLabel(call.status)}
                </Badge>
                <Badge variant="outline">stream</Badge>
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
                    disabled={!isWithinJoinWindow(call.scheduledAt, 10)}
                  >
                    <Video className="h-4 w-4 mr-2" />
                    {joinCtaLabel(call.scheduledAt)}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInvite(call)}
                  >
                    Invite
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Copy a Stream meeting link (fallback to Stream route if legacy Daily link is present)
                      const computed = (call.meetingLink && !call.meetingLink.includes('daily.co'))
                        ? call.meetingLink
                        : `${window.location.origin}/video-call/${call.streamCallId || call.roomId}`
                      try {
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(computed)
                          toast.success('Meeting link copied')
                        } else {
                          const textArea = document.createElement('textarea')
                          textArea.value = computed
                          document.body.appendChild(textArea)
                          textArea.select()
                          const successful = document.execCommand('copy')
                          document.body.removeChild(textArea)
                          if (successful) {
                            toast.success('Meeting link copied')
                          } else {
                            throw new Error('Fallback copy failed')
                          }
                        }
                      } catch {
                        toast.error('Unable to copy to clipboard. Please copy the link manually.')
                      }
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
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
            <DialogDescription>
              Select a patient and time; after creating the call, we’ll email them a unique join link. They join from their own device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Call Title</Label>
              <Textarea id="title" placeholder="e.g., Follow-up session for John Doe" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="patient">Patient</Label>
              <Select onValueChange={(v) => setSelectedPatient(v as unknown as Id<'users'>)} value={(selectedPatient as unknown as string) || ''}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a patient" />
                </SelectTrigger>
                <SelectContent>
                  {(patients ?? []).map((patient: Patient) => (
                    <SelectItem key={patient!._id} value={patient!._id as unknown as string}>
                      {patient!.firstName} {patient!.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPatient && (
                <div className="mt-3">
                  <PatientProfileMiniCard patientId={selectedPatient as Id<'users'>} />
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="scheduledAt">Date and Time</Label>
              <input type="datetime-local" id="scheduledAt" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full p-2 border rounded-md" />
            </div>
            <div>
              
            </div>
          </div>
          <Button onClick={handleScheduleCall} className="w-full">
            Schedule Call
          </Button>
      </DialogContent>
    </Dialog>

    {/* Confirmation Dialog */}
    <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Video Call</DialogTitle>
          <DialogDescription>
            Please review the call details before scheduling.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="font-medium text-gray-700">Patient:</span>
              <span className="text-gray-900">{confirmData?.patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-gray-700">Email:</span>
              <span className="text-gray-900">{confirmData?.patientEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-gray-700">Time:</span>
              <span className="text-gray-900">{confirmData?.scheduledTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-gray-700">Title:</span>
              <span className="text-gray-900">{confirmData?.title}</span>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            An email invitation with the join link will be automatically sent to the patient.
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={confirmScheduleCall}>
            Confirm & Schedule
          </Button>
          <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Invite Preview Modal */}
    <Dialog open={invitePreviewOpen} onOpenChange={setInvitePreviewOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Video Call Invitation</DialogTitle>
          <DialogDescription>Review and confirm before sending the email invite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input
                value={inviteDraft.patientEmail}
                onChange={(e) => setInviteDraft({ ...inviteDraft, patientEmail: e.target.value })}
                placeholder="patient@example.com"
              />
            </div>
            <div>
              <Label>Patient Name</Label>
              <Input
                value={inviteDraft.patientName}
                onChange={(e) => setInviteDraft({ ...inviteDraft, patientName: e.target.value })}
                placeholder="Patient name"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Call Title</Label>
              <Input
                value={inviteDraft.callTitle}
                onChange={(e) => setInviteDraft({ ...inviteDraft, callTitle: e.target.value })}
                placeholder="Telehealth Session"
              />
            </div>
            <div>
              <Label>Scheduled At</Label>
              <Input
                type="datetime-local"
                value={inviteDraft.scheduledAt}
                onChange={(e) => setInviteDraft({ ...inviteDraft, scheduledAt: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Join Link</Label>
            <Input value={inviteDraft.callLink} readOnly />
          </div>
          <div>
            <Label>Message (optional)</Label>
            <Textarea
              placeholder="Add a short personal message"
              value={inviteDraft.message}
              onChange={(e) => setInviteDraft({ ...inviteDraft, message: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={async () => {
              if (!inviteDraft.patientEmail) {
                toast.error('Patient email is required')
                return
              }
              try {
                await sendVideoCallInvitation({
                  patientEmail: inviteDraft.patientEmail,
                  patientName: inviteDraft.patientName || undefined,
                  physiotherapistName: `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Your physiotherapist',
                  callLink: inviteDraft.callLink,
                  callTitle: inviteDraft.callTitle || undefined,
                  scheduledAt: inviteDraft.scheduledAt || undefined,
                  message: inviteDraft.message || undefined,
                } as {
                  patientEmail: string;
                  patientName?: string;
                  physiotherapistName: string;
                  callLink: string;
                  callTitle?: string;
                  scheduledAt?: number;
                  message?: string;
                })
                setInvitePreviewOpen(false)
                toast.success('Invitation email sent')
              } catch (e) {
                console.error(e)
                toast.error('Failed to send invitation email')
              }
            }}
          >
            Send Invitation
          </Button>
          <Button variant="outline" onClick={() => setInvitePreviewOpen(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
);
}