'use client';

import { useState } from 'react';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Video, Calendar, Clock, Plus, Copy, X, Users, Play, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Id } from '@/convex/_generated/dataModel';
import VideoCallManager from '@/components/video/VideoCallManager';

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
  patient?: any;
  physiotherapist?: any;
};

export default function ClinicVideoCallsPage() {
  const [showNewCall, setShowNewCall] = useState(false);
  const [showVideoManager, setShowVideoManager] = useState(false);
  const [selectedCall, setSelectedCall] = useState<VideoCall | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Fetch current user and clinic data
  const currentUser: any = useQuery(api.users.getMyUser);
  const clinic: any = useQuery(api.clinics.getMyClinic);
  
  // Fetch clinic video calls
  const allVideoCalls: any = useQuery(api.videoCalls.getClinicVideoCalls, 
    clinic?._id ? { clinicId: clinic._id } : "skip"
  );

  // Fetch clinic staff for new call creation
  const clinicStaff = useQuery(api.clinics.getClinicStaff, {});

  // Fetch clinic patients for new call creation - using correct function
  const clinicPatients = useQuery(api.clinics.getClinicPatients);

  // Actions and Mutations
  const createVideoCall = useAction(api.videoCalls.createVideoCall);
  const cancelVideoCall = useMutation(api.videoCalls.cancelVideoCall);

  if (!currentUser || !clinic || !clinicStaff) {
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

  const videoCalls = allVideoCalls || [];

  // Filter video calls based on search and filters
  const filteredCalls = videoCalls.filter((call: any) => {
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

  if (showVideoManager && selectedCall) {
    return (
      <VideoCallManager
        defaultParticipants={selectedCall.participants}
        onCallEnd={() => {
          setShowVideoManager(false);
          setSelectedCall(null);
        }}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clinic Video Calls</h1>
          <p className="text-gray-500">Manage and monitor all video calls in your clinic</p>
        </div>
        <Button onClick={() => setShowNewCall(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Call
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search calls..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="consultation">Consultation</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Calls</p>
                <p className="text-2xl font-bold">{videoCalls.length}</p>
              </div>
              <Video className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Now</p>
                <p className="text-2xl font-bold text-green-600">
                  {videoCalls.filter((c: any) => c.status === 'active').length}
                </p>
              </div>
              <Play className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">
                  {videoCalls.filter((c: any) => c.status === 'scheduled').length}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">This Week</p>
                <p className="text-2xl font-bold">
                  {videoCalls.filter((c: any) => {
                    const callDate = new Date(c.startTime);
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return callDate > weekAgo;
                  }).length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Video Calls Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredCalls.map((call: any) => (
          <Card key={call._id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge className={getStatusColor(call.status)}>
                    {call.status}
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
                      >
                        <Video className="h-4 w-4 mr-2" />
                        Start
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
            <Button onClick={() => setShowNewCall(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Call
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}