"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Video, MessageCircle, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface AppointmentQuickActionsProps {
  appointment: {
    _id: string;
    patientId?: string;
    physiotherapistId?: string;
    patient?: {
      _id?: string;
      firstName?: string;
      lastName?: string;
    } | null;
    startTime: number;
    endTime: number;
    appointmentType?: 'in-person' | 'telehealth';
    status?: string;
    googleMeetLink?: string;
    streamMeetingLink?: string;
    videoCallId?: string;
  };
  userRole: 'patient' | 'physiotherapist';
  showVideoCall?: boolean;
}

export function AppointmentQuickActions({ 
  appointment, 
  userRole,
  showVideoCall = true 
}: AppointmentQuickActionsProps) {
  const router = useRouter();
  const [isCreatingVideoCall, setIsCreatingVideoCall] = useState(false);
  const createVideoCall = useAction(api.videoCalls.createVideoCall);

  // Check if appointment is within 30 minutes or in progress
  const now = Date.now();
  const thirtyMinutesBefore = appointment.startTime - (30 * 60 * 1000);
  const canJoinCall = appointment.appointmentType === 'telehealth' && 
                      now >= thirtyMinutesBefore && 
                      now <= appointment.endTime &&
                      (appointment.status === 'scheduled' || appointment.status === 'confirmed');

  const handleStartVideoCall = async () => {
    if (appointment.streamMeetingLink) {
      // Use existing Stream video call
      window.open(appointment.streamMeetingLink, '_blank');
    } else if (appointment.googleMeetLink) {
      // Use Google Meet
      window.open(appointment.googleMeetLink, '_blank');
    } else if (canJoinCall && appointment.appointmentType === 'telehealth') {
      // Create new video call
      setIsCreatingVideoCall(true);
      try {
        const otherUserId = userRole === 'patient' ? appointment.physiotherapistId : appointment.patientId;
        if (!otherUserId) {
          toast.error("Unable to start video call", {
            description: "Participant information is missing"
          });
          return;
        }

        const videoCall = await createVideoCall({
          appointmentId: appointment._id as Id<"appointments">,
          participants: [otherUserId as Id<"users">],
          callType: "appointment",
          title: `Appointment: ${appointment.patient?.firstName || 'Patient'}`,
          settings: {
            recordingEnabled: false,
            chatEnabled: true,
            maxParticipants: 2,
            waitingRoomEnabled: false,
          }
        });

        toast.success("Video call created!");
        window.open(videoCall.meetingLink, '_blank');
      } catch (error: any) {
        console.error("Failed to create video call:", error);
        toast.error("Failed to create video call", {
          description: error.message || "Please try again"
        });
      } finally {
        setIsCreatingVideoCall(false);
      }
    } else {
      // Navigate to video calls page
      const dashboardPath = userRole === 'patient' ? '/dashboard/patient/video-calls' : '/dashboard/physiotherapist/video-calls';
      router.push(dashboardPath);
    }
  };

  const handleOpenChat = () => {
    const otherUserId = userRole === 'patient' ? appointment.physiotherapistId : appointment.patientId;
    const dashboardPath = userRole === 'patient' ? '/dashboard/patient/messages' : '/dashboard/physiotherapist/messages';
    router.push(`${dashboardPath}?userId=${otherUserId}`);
  };

  const handleViewTreatmentPlan = () => {
    if (userRole === 'patient') {
      router.push('/dashboard/patient/treatment-plans');
    } else {
      router.push(`/dashboard/physiotherapist/patients/${appointment.patientId}`);
    }
  };

  return (
    <div className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
      <p className="text-xs font-semibold text-gray-700 mb-2">Quick Actions</p>
      <div className="flex flex-wrap gap-2">
        {/* Video Call Button */}
        {showVideoCall && canJoinCall && (
          <Button 
            onClick={handleStartVideoCall}
            disabled={isCreatingVideoCall}
            className="bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none"
            size="sm"
          >
            <Video className="h-3 w-3 mr-1" />
            {isCreatingVideoCall ? 'Creating...' : (appointment.streamMeetingLink || appointment.googleMeetLink ? 'Join Call' : 'Start Call')}
          </Button>
        )}

        {/* External Video Link */}
        {appointment.googleMeetLink && (
          <Button 
            onClick={() => window.open(appointment.googleMeetLink, '_blank')}
            variant="outline"
            className="border-blue-200 text-blue-700 hover:bg-blue-50 flex-1 sm:flex-none"
            size="sm"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Google Meet
          </Button>
        )}
        
        {/* Message Button */}
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleOpenChat}
          className="border-purple-200 text-purple-700 hover:bg-purple-50 flex-1 sm:flex-none"
        >
          <MessageCircle className="h-3 w-3 mr-1" />
          Message
        </Button>
        
        {/* Treatment Plan Link */}
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleViewTreatmentPlan}
          className="border-green-200 text-green-700 hover:bg-green-50 flex-1 sm:flex-none"
        >
          <FileText className="h-3 w-3 mr-1" />
          Plan
        </Button>
      </div>
    </div>
  );
}
