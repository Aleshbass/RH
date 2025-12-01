'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Video,
  Calendar,
  Clock,
  Copy,
  Users,
  PlayCircle,
  CheckCircle2,
  ExternalLink,
  Search,
  Filter,
  MoreHorizontal,
  MonitorPlay
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Id } from '@/convex/_generated/dataModel';
import StreamVideoCallManager from '@/components/video/StreamVideoCallManager';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PatientAppointmentBookingModal } from '@/components/patient/PatientAppointmentBookingModal';

// Type definition for video calls
type VideoCall = {
  _id: Id<"videoCalls">;
  roomId: string;
  title?: string;
  patientId?: Id<"users">;
  physiotherapistId?: Id<"users">;
  scheduledAt?: number;
  startTime: number;
  endTime?: number;
  status: "scheduled" | "active" | "ended" | "cancelled" | "missed";
  callType: "appointment" | "consultation" | "emergency";
  duration?: number;
  participants: Id<"users">[];
  physiotherapist?: { firstName?: string; lastName?: string; imageUrl?: string };
  appointmentId?: Id<"appointments">;
  platform?: string;
  meetingLink?: string;
};

export default function PatientVideoCallsPage() {
  const [showVideoManager, setShowVideoManager] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<VideoCall | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch current user data
  const currentUser = useQuery(api.users.getMyUser);

  // Fetch patient's video calls
  const allVideoCalls = useQuery(api.videoCalls.getMyVideoCalls, {});

  if (!currentUser) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-48 rounded-xl" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          <Skeleton className="h-32 w-48 rounded-2xl shrink-0" />
          <Skeleton className="h-32 w-48 rounded-2xl shrink-0" />
          <Skeleton className="h-32 w-48 rounded-2xl shrink-0" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const videoCalls = allVideoCalls || [];

  // Filter video calls based on search and status
  const filteredCalls = videoCalls.filter((call: any) => {
    const matchesSearch = !searchTerm ||
      call.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.physiotherapist?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.physiotherapist?.lastName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || call.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Separate calls by status for better organization
  const upcomingCalls = filteredCalls.filter((call: any) => call.status === 'scheduled');
  const activeCalls = filteredCalls.filter((call: any) => call.status === 'active');
  const pastCalls = filteredCalls.filter((call: any) => ['ended', 'cancelled', 'missed'].includes(call.status));

  const handleJoinCall = (call: VideoCall) => {
    // Check if it's a Google Meet call
    const isGoogleMeet = call.platform === 'google_meet' || (call.meetingLink && call.meetingLink.includes('meet.google.com'));

    if (isGoogleMeet && call.meetingLink) {
      window.open(call.meetingLink, '_blank');
      toast.success('Opening Google Meet in a new tab');
    } else {
      // Default to Stream
      setSelectedCall(call);
      setShowVideoManager(true);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'ended': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      case 'missed': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment': return 'bg-brand/10 text-brand border-brand/20';
      case 'consultation': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'emergency': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Determine if we're within the pre-join window (default: 10 minutes before start)
  const isWithinJoinWindow = (scheduledAt?: number, minutes = 10) => {
    if (!scheduledAt) return false;
    const now = Date.now();
    const windowMs = minutes * 60 * 1000;
    return now >= (scheduledAt - windowMs);
  };

  if (showVideoManager && selectedCall) {
    return (
      <StreamVideoCallManager
        appointmentId={selectedCall.appointmentId}
        defaultParticipants={selectedCall.participants}
        onCallEnd={() => {
          setShowVideoManager(false);
          setSelectedCall(null);
        }}
      />
    );
  }

  const StatCard = ({ title, value, icon: Icon, colorClass, bgClass }: any) => (
    <div className="min-w-[200px] md:min-w-0 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all hover:shadow-md snap-center">
      <div className={cn("h-12 w-12 rounded-full flex items-center justify-center shrink-0", bgClass)}>
        <Icon className={cn("h-6 w-6", colorClass)} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )

  const CallCard = ({ call, isActive = false }: { call: VideoCall, isActive?: boolean }) => {
    const isGoogleMeet = call.platform === 'google_meet' || (call.meetingLink && call.meetingLink.includes('meet.google.com'));

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "bg-white p-5 rounded-2xl border transition-all hover:shadow-lg group relative overflow-hidden",
          isActive ? "border-green-200 shadow-green-100" : "border-gray-100 shadow-sm"
        )}
      >
        {isActive && (
          <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
        )}

        <div className="flex justify-between items-start mb-4 pl-2">
          <div className="flex gap-2">
            <Badge variant="outline" className={cn("capitalize font-medium", getStatusColor(call.status))}>
              {isActive && <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />}
              {call.status}
            </Badge>
            <Badge variant="outline" className={cn("capitalize font-medium", getTypeColor(call.callType))}>
              {call.callType}
            </Badge>
          </div>

          {isGoogleMeet ? (
            <div className="bg-white border border-gray-200 rounded-full p-1.5 shadow-sm" title="Google Meet">
              <Video className="h-4 w-4 text-gray-600" />
            </div>
          ) : (
            <div className="bg-brand/10 rounded-full p-1.5" title="Rehabify Video">
              <MonitorPlay className="h-4 w-4 text-brand" />
            </div>
          )}
        </div>

        <div className="pl-2 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 leading-tight mb-1">
              {call.title || `${call.callType} Call`}
            </h3>
            {call.physiotherapist && (
              <div className="flex items-center text-sm text-gray-500">
                <Users className="h-4 w-4 mr-2" />
                Dr. {call.physiotherapist.firstName} {call.physiotherapist.lastName}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm bg-gray-50 p-3 rounded-xl">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <Calendar className="h-4 w-4 text-gray-400" />
              {call.scheduledAt ? format(new Date(call.scheduledAt), 'MMM d') : 'TBD'}
            </div>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <Clock className="h-4 w-4 text-gray-400" />
              {call.scheduledAt ? format(new Date(call.scheduledAt), 'h:mm a') : 'TBD'}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {(isActive || call.status === 'scheduled') && (
              <Button
                className={cn(
                  "flex-1 rounded-xl font-medium shadow-lg transition-all hover:scale-[1.02]",
                  isActive ? "bg-green-600 hover:bg-green-700 text-white shadow-green-200" : "bg-gray-900 hover:bg-black text-white shadow-gray-200"
                )}
                onClick={() => handleJoinCall(call)}
                disabled={!isActive && !isWithinJoinWindow(call.scheduledAt, 15)}
              >
                {isGoogleMeet ? <ExternalLink className="h-4 w-4 mr-2" /> : <Video className="h-4 w-4 mr-2" />}
                {isActive ? 'Join Now' : isWithinJoinWindow(call.scheduledAt, 15) ? 'Join Call' : 'Not Started'}
              </Button>
            )}

            <Button
              variant="outline"
              size="icon"
              className="rounded-xl border-gray-200 shrink-0"
              onClick={() => {
                const link = call.meetingLink || call.roomId;
                navigator.clipboard.writeText(link);
                toast.success('Link copied to clipboard');
              }}
            >
              <Copy className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Video Sessions</h1>
          <p className="text-gray-500">Join your telehealth appointments</p>
        </div>

        <div className="flex gap-2">
          <Button
            className="bg-[#005b57] hover:bg-[#00443e] rounded-full"
            onClick={() => setIsBookingModalOpen(true)}
          >
            <Video className="h-4 w-4 mr-2" />
            Book Video Call
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 rounded-full bg-white border-gray-200 w-full md:w-64"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full shrink-0">
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>All Calls</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('scheduled')}>Scheduled</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('ended')}>Past</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Section - Horizontal Scroll on Mobile */}
      <div className="flex overflow-x-auto pb-4 -mx-4 px-4 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:mx-0 md:px-0 scrollbar-hide snap-x">
        <div className="snap-center pr-4 md:pr-0">
          <StatCard
            title="Total Calls"
            value={videoCalls.length}
            icon={Video}
            colorClass="text-brand"
            bgClass="bg-brand/10"
          />
        </div>
        <div className="snap-center pr-4 md:pr-0">
          <StatCard
            title="Active Now"
            value={activeCalls.length}
            icon={PlayCircle}
            colorClass="text-green-600"
            bgClass="bg-green-50"
          />
        </div>
        <div className="snap-center pr-4 md:pr-0">
          <StatCard
            title="Upcoming"
            value={upcomingCalls.length}
            icon={Calendar}
            colorClass="text-blue-600"
            bgClass="bg-blue-50"
          />
        </div>
        <div className="snap-center">
          <StatCard
            title="Completed"
            value={pastCalls.length}
            icon={CheckCircle2}
            colorClass="text-gray-600"
            bgClass="bg-gray-100"
          />
        </div>
      </div>

      {/* Active Calls */}
      {activeCalls.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            Live Now
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCalls.map((call: VideoCall) => (
              <CallCard key={call._id} call={call} isActive={true} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Calls */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Upcoming Sessions</h2>
        {upcomingCalls.length === 0 ? (
          <div className="text-center py-12 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
            <div className="bg-white p-4 rounded-full shadow-sm inline-block mb-4">
              <Calendar className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No upcoming calls</h3>
            <p className="text-gray-500 max-w-xs mx-auto mt-2">
              Your scheduled video sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingCalls.map((call: VideoCall) => (
              <CallCard key={call._id} call={call} />
            ))}
          </div>
        )}
      </div>

      {/* Past Calls */}
      {pastCalls.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-gray-100">
          <h2 className="text-lg font-semibold text-gray-500">History</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-80">
            {pastCalls.slice(0, 6).map((call: VideoCall) => (
              <div key={call._id} className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900">{call.title || 'Video Call'}</p>
                  <p className="text-xs text-gray-500">{format(new Date(call.startTime), 'MMM d, yyyy')}</p>
                </div>
                <Badge variant="secondary" className="bg-white text-gray-500 border-gray-200">
                  {call.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Booking Modal */}
      <PatientAppointmentBookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onAppointmentBooked={() => setIsBookingModalOpen(false)}
      />
    </div>
  );
} 